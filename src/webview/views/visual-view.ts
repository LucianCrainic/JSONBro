/**
 * The Visual view: the formatted document drawn rather than written.
 *
 * Two shapes of the same thing. The tree is an indented list of rows; the
 * graph is boxes and links. Both render the document the format view produced
 * -- there is no second parser and no second model -- and both read the one
 * fold state, so opening a node in either opens it in the other. Selection,
 * the breadcrumb and the copy actions are shared for the same reason: they are
 * about a node, not about how it happens to be drawn.
 */
import type { Diagnostic } from '../engine/diagnostics';
import { DEFAULT_NODE_BUDGET, depthThatFits, layoutGraph } from '../engine/graph-layout';
import { closerLines } from '../engine/line-index';
import { nodeAt, subtreeText, type NodeView } from '../engine/node-view';
import { pathForLine } from '../engine/path-index';
import { type PrettyDocument } from '../engine/pretty-sink';
import { DocumentPane, type RowContext } from '../ui/document-pane';
import { byId, delegate, escapeHtml, on, qsa } from '../ui/dom';
import { GraphCanvas } from '../ui/graph-canvas';
import { Icons } from '../ui/icons';
import { plural, type StatusModel } from '../ui/status-bar';
import type { Messenger } from '../ui/messaging';
import type { Settings } from '../../shared/messages';

/** How deep "expand to depth" opens the document. */
const DEFAULT_DEPTH = 2;


/** How the document is drawn. */
export type VisualShape = 'tree' | 'graph';

export class VisualView {
    private readonly messenger: Messenger;
    private readonly teardown: Array<() => void> = [];

    private pane: DocumentPane | null = null;
    private graph: GraphCanvas | null = null;
    private shape: VisualShape = 'tree';
    private status: StatusModel = {};
    private nodeCount = 0;
    private repairCount = 0;
    /** Whether the graph has already chosen an opening depth for this document. */
    private graphFramed = false;

    /** Notifies the shell that the status model changed. */
    public onStatusChange: (status: StatusModel) => void = () => undefined;

    constructor(messenger: Messenger) {
        this.messenger = messenger;
        this.setupControls();
        this.setupInteractions();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public applySettings(_settings: Settings): void {
        // Nothing of its own to configure: the tree renders the document the
        // format view produced, so indent and the rest are already applied.
    }

    // ------------------------------------------------------------------ show

    /**
     * Shows a document that has already been formatted.
     *
     * The tree does not parse anything. It is a second renderer over the very
     * document the text view is showing, so switching to it costs nothing and
     * it inherits the worker, the repairs and the size ceiling along with it --
     * re-parsing here put two thirds of a second of work on the UI thread for
     * a document the panel had already finished with.
     */
    public setDocument(doc: PrettyDocument | null, diagnostics: readonly Diagnostic[] = []): void {
        if (!byId('tree-output')) {
            return;
        }

        if (!doc) {
            this.pane?.setDocument(null);
            this.graph?.setDocument(null, null);
            this.nodeCount = 0;
            this.setEmpty(true);
            this.setBreadcrumb([]);
            this.publishStatus({});
            return;
        }

        this.setEmpty(false);
        this.graphFramed = false;
        this.ensurePane().setDocument(doc);
        // Both shapes read the one fold state, so the graph is handed the same
        // object rather than a copy that could drift out of step with it.
        this.ensureGraph().setDocument(doc, this.pane?.foldState ?? null);
        this.setBreadcrumb([]);

        this.nodeCount = doc.lines.lineCount - closerLines(doc.lines).length;
        this.repairCount = diagnostics.length;
        this.publishStatus(this.describe());
    }

    /** What the status bar says about the document, whichever shape is shown. */
    private describe(extra: StatusModel['left'] = []): StatusModel {
        return {
            left: [
                {
                    text: 'Valid JSON',
                    icon: Icons.valid,
                    tone: this.repairCount > 0 ? 'warn' : 'ok'
                },
                { text: plural(this.nodeCount, 'node') },
                ...(this.repairCount > 0
                    ? [
                          {
                              text: plural(this.repairCount, 'repair'),
                              icon: Icons.warning,
                              tone: 'warn' as const
                          }
                      ]
                    : []),
                ...(extra ?? [])
            ]
        };
    }

    /**
     * Says how much of the document the graph is actually showing.
     *
     * A picture of a hundred thousand boxes is not a picture, so the layout
     * stops at a budget -- and saying "2,000 of 250,002" is the difference
     * between a limit and a bug.
     */
    private reportCoverage(drawn: number, truncated: boolean): void {
        if (this.shape !== 'graph') {
            return;
        }

        this.publishStatus(
            this.describe(
                truncated
                    ? [
                          {
                              text: `showing ${drawn.toLocaleString()} — expand fewer nodes to see more`,
                              icon: Icons.warning,
                              tone: 'warn' as const
                          }
                      ]
                    : [{ text: `${drawn.toLocaleString()} drawn` }]
            )
        );
    }

    /** The document the tree is showing, if it has been built. */
    public get document(): PrettyDocument | null {
        return this.pane?.document ?? null;
    }

    public clear(): void {
        this.setDocument(null);
    }

    private ensurePane(): DocumentPane {
        if (!this.pane) {
            this.pane = new DocumentPane({
                viewport: byId('tree-output') as HTMLElement,
                // A `}` on its own is a line of the document but not a node of
                // the tree, so a container is one row with children beneath it.
                alwaysHidden: closerLines,
                renderRow: context => this.renderRow(context),
                // Folding from the tree has to reach the graph, which is laid
                // out from the same state and cannot notice on its own.
                onFoldChange: () => this.graph?.render()
            });
        }
        return this.pane;
    }

    private ensureGraph(): GraphCanvas {
        if (!this.graph) {
            this.graph = new GraphCanvas({
                viewport: byId('graph-output') as HTMLElement,
                onSelect: line => this.select(line),
                onToggle: line => this.toggleFold(line),
                onLayout: layout => this.reportCoverage(layout.nodes.length, layout.truncated)
            });
        }
        return this.graph;
    }

    /** Opens or closes a node, in whichever shape is on screen. */
    private toggleFold(line: number): void {
        // Goes through the pane because it owns the fold state; its change
        // callback then redraws the graph.
        this.pane?.toggleFold(line);
    }

    // --------------------------------------------------------------- shape

    /**
     * Called when the view comes on screen.
     *
     * The graph is laid out against the size of its viewport, and that is zero
     * while the panel belongs to another mode -- so the first layout of a
     * document happens against nothing. Re-applying the shape here lays it out
     * again now that there is something to lay it out in.
     */
    public activate(): void {
        this.setShape(this.shape);
    }

    public setShape(shape: VisualShape): void {
        this.shape = shape;
        byId('visual-panel')?.setAttribute('data-shape', shape);

        for (const button of qsa<HTMLElement>('[data-visual-shape]')) {
            const active = button.dataset.visualShape === shape;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        }

        if (shape === 'graph') {
            this.frameForBudget();
            // The canvas was sized to a hidden element until now.
            this.graph?.render();
            const line = this.pane?.selectedLine ?? -1;
            if (line !== -1) {
                this.graph?.setSelected(line);
                this.graph?.revealLine(line);
            }
        } else {
            this.publishStatus(this.describe());
        }
    }

    public get currentShape(): VisualShape {
        return this.shape;
    }

    /**
     * Opens the graph at the deepest level that fits inside the budget.
     *
     * A tree can show a quarter of a million rows because only the visible ones
     * are rendered; a graph cannot, and drawing two thousand boxes scaled to
     * fit produces a smear rather than a picture. So the first time a document
     * is drawn as a graph it is collapsed to a depth that reads, and the reader
     * expands into it. Only the first time -- undoing their folding every time
     * they switched shape would be worse than the smear.
     */
    private frameForBudget(): void {
        const doc = this.pane?.document;
        const folds = this.pane?.foldState;
        if (this.graphFramed || !doc || !folds) {
            return;
        }
        this.graphFramed = true;

        if (!layoutGraph(doc, folds).truncated) {
            return;
        }

        this.expandToDepth(depthThatFits(doc.lines, DEFAULT_NODE_BUDGET));
    }

    // -------------------------------------------------------------- rendering

    private renderRow(context: RowContext): string {
        const doc = this.pane?.document;
        if (!doc) {
            return '';
        }

        const node = nodeAt(doc, context.line);
        const indent = this.renderIndent(node.depth);

        // Drawn from a rotated triangle rather than a codicon, so a row costs
        // no icon font and reads the same as the text view's fold arrow.
        const twisty = node.expandable
            ? `<span class="tree-row__twisty${
                  context.collapsed ? ' is-collapsed' : ''
              }" data-fold-line="${context.line}" role="button" aria-label="${
                  context.collapsed ? 'Expand' : 'Collapse'
              }"></span>`
            : '<span class="tree-row__twisty tree-row__twisty--leaf" aria-hidden="true"></span>';

        const label = node.key
            ? `<span class="tree-row__key">${escapeHtml(node.key)}</span>`
            : node.indexed
              ? ''
              : '<span class="tree-row__key tree-row__key--root">root</span>';

        const badge = `<span class="tree-row__badge tree-row__badge--${node.type}">${node.type}</span>`;

        const value =
            node.type === 'object' || node.type === 'array'
                ? `<span class="tree-row__count">${escapeHtml(node.preview)}</span>`
                : `<span class="tree-row__value ${node.type}">${escapeHtml(node.preview)}</span>`;

        return `<div class="tree-row${context.selected ? ' is-selected' : ''}" data-tree-line="${
            context.line
        }" role="treeitem" aria-level="${node.depth + 1}"${
            node.expandable ? ` aria-expanded="${!context.collapsed}"` : ''
        }>${indent}${twisty}${label}${badge}${value}</div>`;
    }

    /**
     * The guide rails to the left of a node.
     *
     * Drawn as one element per level rather than as padding, so the vertical
     * lines connecting a container to its children land in the same place at
     * every depth.
     */
    private renderIndent(depth: number): string {
        if (depth === 0) {
            return '';
        }
        return `<span class="tree-row__indent" aria-hidden="true">${'<i></i>'.repeat(depth)}</span>`;
    }

    // ------------------------------------------------------------ interaction

    private setupInteractions(): void {
        const output = byId('tree-output');
        if (!output) {
            return;
        }

        this.teardown.push(
            // Delegated, so it survives the viewport being re-rendered on every
            // scroll. The twisty is handled by the pane itself.
            delegate(output, 'click', '.tree-row', row => {
                const line = Number(row.dataset.treeLine);
                if (Number.isInteger(line)) {
                    this.select(line);
                }
            }),
            delegate(output, 'dblclick', '.tree-row', row => {
                const line = Number(row.dataset.treeLine);
                if (Number.isInteger(line)) {
                    this.pane?.toggleFold(line);
                }
            })
        );
    }

    private setupControls(): void {
        const bind = (id: string, handler: () => void) => {
            const element = byId(id);
            if (element) {
                this.teardown.push(on(element, 'click', handler));
            }
        };

        bind('visual-expand-all', () => this.pane?.expandAll());
        bind('visual-collapse-all', () => this.pane?.collapseAll());
        bind('visual-expand-depth', () => this.expandToDepth(DEFAULT_DEPTH));
        bind('visual-copy-path', () => this.copyPath());
        bind('visual-copy-value', () => this.copyValue());
        bind('visual-copy-subtree', () => this.copySubtree());
        bind('graph-zoom-in', () => this.graph?.zoomBy(1.25));
        bind('graph-zoom-out', () => this.graph?.zoomBy(1 / 1.25));
        bind('graph-zoom-reset', () => this.graph?.resetView());

        for (const button of qsa<HTMLElement>('[data-visual-shape]')) {
            this.teardown.push(
                on(button, 'click', () =>
                    this.setShape(button.dataset.visualShape === 'graph' ? 'graph' : 'tree')
                )
            );
        }
    }

    /** Opens the tree down to `depth` and closes everything below it. */
    public expandToDepth(depth: number): void {
        const doc = this.pane?.document;
        const folds = this.pane?.foldState;
        if (!doc || !folds) {
            return;
        }

        folds.collapseAll();
        for (let line = 0; line < doc.lines.lineCount; line++) {
            if (doc.lines.isFoldable(line) && doc.lines.depth(line) < depth) {
                folds.toggle(line);
            }
        }
        this.pane?.refresh();
        this.graph?.render();
    }

    // -------------------------------------------------------------- selection

    /** Selection is about a node, so both shapes follow it. */
    private select(line: number): void {
        const doc = this.pane?.document;
        if (!doc) {
            return;
        }
        this.pane?.selectLine(line);
        this.graph?.setSelected(line);
        this.setBreadcrumb(pathForLine(doc, line));
    }

    /** Moves the selection to the next or previous visible node. */
    public step(direction: 1 | -1): void {
        const folds = this.pane?.foldState;
        if (!folds) {
            return;
        }

        const current = this.pane?.selectedLine ?? -1;
        const row = current === -1 ? -1 : folds.rowAt(current);
        const next = Math.max(0, Math.min(folds.visibleCount - 1, row + direction));
        this.select(folds.lineAt(next));
    }

    /**
     * Right opens a container, or steps into it when it is already open; left
     * closes it, or steps out to its parent when it is already closed.
     */
    public stepAcross(direction: 1 | -1): void {
        const doc = this.pane?.document;
        const folds = this.pane?.foldState;
        const line = this.pane?.selectedLine ?? -1;
        if (!doc || !folds || line === -1) {
            return;
        }

        const expandable = doc.lines.isFoldable(line);
        const collapsed = folds.isCollapsed(line);

        if (direction === 1) {
            if (expandable && collapsed) {
                this.pane?.toggleFold(line);
            } else if (expandable) {
                this.step(1);
            }
            return;
        }

        if (expandable && !collapsed) {
            this.pane?.toggleFold(line);
            return;
        }

        // Out to the parent: the nearest earlier line one level shallower.
        const target = doc.lines.depth(line) - 1;
        for (let candidate = line - 1; candidate >= 0; candidate--) {
            if (doc.lines.depth(candidate) === target) {
                this.select(candidate);
                return;
            }
        }
    }

    /** Opens or closes whatever is selected. */
    public toggleSelected(): void {
        const line = this.pane?.selectedLine ?? -1;
        if (line !== -1) {
            this.pane?.toggleFold(line);
        }
    }

    private selectedNode(): NodeView | null {
        const doc = this.pane?.document;
        const line = this.pane?.selectedLine ?? -1;
        return doc && line !== -1 ? nodeAt(doc, line) : null;
    }

    // ------------------------------------------------------------------- copy

    public copyPath(): void {
        const doc = this.pane?.document;
        const line = this.pane?.selectedLine ?? -1;
        if (!doc || line === -1) {
            return;
        }
        this.copy(formatPath(pathForLine(doc, line)), 'Path copied');
    }

    public copyValue(): void {
        const node = this.selectedNode();
        const doc = this.pane?.document;
        if (!node || !doc) {
            return;
        }
        // A container's "value" is its whole subtree; a scalar's is its text.
        this.copy(
            node.type === 'object' || node.type === 'array'
                ? valueOfSubtree(subtreeText(doc, node.line))
                : node.preview,
            'Value copied'
        );
    }

    public copySubtree(): void {
        const node = this.selectedNode();
        const doc = this.pane?.document;
        if (node && doc) {
            this.copy(subtreeText(doc, node.line), 'Subtree copied');
        }
    }

    private copy(text: string, message: string): void {
        void navigator.clipboard
            .writeText(text)
            .then(() => this.messenger.post({ command: 'showInfo', text: message }))
            .catch(error => console.error('Failed to copy to clipboard:', error));
    }

    // -------------------------------------------------------------- breadcrumb

    private setBreadcrumb(path: string[]): void {
        const bar = byId('visual-breadcrumb');
        if (!bar) {
            return;
        }

        bar.innerHTML =
            path.length === 0
                ? '<span class="breadcrumb__segment breadcrumb__segment--root">root</span>'
                : ['root', ...path]
                      .map(
                          (segment, index) =>
                              `<span class="breadcrumb__segment${
                                  index === path.length ? ' breadcrumb__segment--leaf' : ''
                              }">${escapeHtml(segment)}</span>`
                      )
                      .join('<span class="breadcrumb__sep" aria-hidden="true">›</span>');
    }

    // ------------------------------------------------------------------ chrome

    private setEmpty(empty: boolean): void {
        byId('visual-panel')?.toggleAttribute('data-empty', empty);
    }

    private publishStatus(status: StatusModel): void {
        this.status = status;
        this.onStatusChange(status);
    }

    public getStatus(): StatusModel {
        return this.status;
    }

    public dispose(): void {
        for (const off of this.teardown) {
            off();
        }
        this.teardown.length = 0;
        this.pane?.dispose();
        this.pane = null;
        this.graph?.dispose();
        this.graph = null;
    }
}

/** `$.users[3].email`, the spelling most tools accept. */
export function formatPath(segments: string[]): string {
    return segments.reduce<string>((path, segment) => {
        if (/^\d+$/.test(segment)) {
            return `${path}[${segment}]`;
        }
        return /^[A-Za-z_$][\w$]*$/.test(segment)
            ? `${path}.${segment}`
            : `${path}[${JSON.stringify(segment)}]`;
    }, '$');
}

/** A subtree slice without the property name that introduced it. */
function valueOfSubtree(text: string): string {
    const match = text.match(/^"(?:[^"\\]|\\.)*":\s/);
    return match ? text.slice(match[0].length) : text;
}

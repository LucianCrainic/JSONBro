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
import { searchDocument, type SearchMatch, type SearchOptions } from '../engine/document-search';
import { DEFAULT_NODE_BUDGET, depthThatFits, layoutGraph } from '../engine/graph-layout';
import { isCloserLine, nodeCount } from '../engine/line-index';
import { nodeAt, subtreeText, type NodeView } from '../engine/node-view';
import { pathForLine } from '../engine/path-index';
import { type PrettyDocument } from '../engine/pretty-sink';
import { JSONFormatter } from '../formatter';
import { DocumentPane, type RowContext } from '../ui/document-pane';
import { byId, delegate, escapeHtml, on, qsa } from '../ui/dom';
import { PaneFlag } from '../ui/pane-flag';
import { setTip } from '../ui/tooltip';
import { GraphCanvas } from '../ui/graph-canvas';
import { Icons } from '../ui/icons';
import type { Searchable } from '../ui/find-widget';
import { plural, type StatusModel } from '../ui/status-bar';
import type { Messenger } from '../ui/messaging';
import type { Settings } from '../../shared/messages';

/** How deep "expand to depth" opens the document. */
const DEFAULT_DEPTH = 2;

/**
 * How long typing pauses before the picture is rebuilt.
 *
 * Long enough that a burst of typing is one rebuild, short enough that the
 * picture feels like it is following what is being typed.
 */
const REBUILD_DELAY_MS = 300;


/** How the document is drawn. */
export type VisualShape = 'tree' | 'graph';

export class VisualView {
    private readonly messenger: Messenger;
    private readonly teardown: Array<() => void> = [];

    private pane: DocumentPane | null = null;
    /** The formatted source beside the picture, read-only in this mode. */
    private source: DocumentPane | null = null;
    private graph: GraphCanvas | null = null;
    private shape: VisualShape = 'tree';
    private status: StatusModel = {};
    private nodeCount = 0;
    private repairCount = 0;
    /** Whether the graph has already chosen an opening depth for this document. */
    private graphFramed = false;

    private matches: SearchMatch[] = [];
    private matchIndex = -1;
    private matchesTruncated = false;
    /** The lines a match falls on, so drawing a row is a lookup, not a scan. */
    private matchLines = new Set<number>();
    private rebuildTimer: number | null = null;
    /** Whether this view is the one on screen. */
    private onScreen = false;
    /**
     * Says so when the picture is older than the input.
     *
     * Typing in this mode rebuilds on its own, so the badge is for the other
     * route: editing in the Format tab and coming back here, where the picture
     * would otherwise sit there describing the previous document with nothing
     * to suggest it.
     */
    private readonly staleness: PaneFlag;

    /**
     * Rebuilds the picture from edited input.
     *
     * Set by the shell, because parsing belongs to the format view: the
     * picture is a second renderer over that document, not a second parser.
     */
    public onRebuildRequested: () => void = () => undefined;

    /** Notifies the shell that the status model changed. */
    public onStatusChange: (status: StatusModel) => void = () => undefined;

    /**
     * What the shell's find widget drives while this view is on screen.
     *
     * The picture is a way of looking at the document, so searching it means
     * searching the same text the formatted view searches -- and then showing
     * where each hit sits, in whichever shape is up.
     */
    public readonly searchable: Searchable = {
        ensureSearchable: () => this.document !== null,
        search: (term, options) => this.runSearch(term, options),
        next: () => this.stepMatch(1),
        previous: () => this.stepMatch(-1),
        clear: () => this.clearMatches(),
        position: () => ({
            current: this.matches.length > 0 ? this.matchIndex + 1 : 0,
            total: this.matches.length,
            truncated: this.matchesTruncated
        })
    };

    // ---------------------------------------------------------------- search

    private runSearch(term: string, options: SearchOptions): number {
        const doc = this.document;
        if (!doc) {
            this.clearMatches();
            return 0;
        }

        // Propagates InvalidPatternError to the widget, which reports it.
        const result = searchDocument(doc, term, options);
        this.matches = [...result.matches];
        this.matchesTruncated = result.truncated;
        this.matchLines = new Set(this.matches.map(match => match.line));
        this.matchIndex = this.matches.length > 0 ? 0 : -1;

        if (this.matchIndex >= 0) {
            this.revealMatch();
        }
        this.pane?.refresh();
        this.markGraphMatches();
        return this.matches.length;
    }

    /** Tells the graph which boxes were found, so it can say so. */
    private markGraphMatches(): void {
        this.graph?.setMatches(this.matchLines, this.matches[this.matchIndex]?.line ?? -1);
    }

    private stepMatch(direction: 1 | -1): void {
        if (this.matches.length === 0) {
            return;
        }
        this.matchIndex =
            (this.matchIndex + direction + this.matches.length) % this.matches.length;
        this.revealMatch();
    }

    /**
     * Shows the node a match falls on.
     *
     * A match is a position in the text, and every node is a line of that
     * text, so selecting its line is what puts it on screen -- in the tree, in
     * the graph, and in the breadcrumb, all at once.
     */
    private revealMatch(): void {
        const match = this.matches[this.matchIndex];
        if (!match) {
            return;
        }
        // Selecting opens whatever folds were hiding the node, which changes
        // what the graph holds -- so it is redrawn before being asked to bring
        // a box into view that did not exist a moment ago. Only then: walking
        // the hits is a keystroke, and redrawing on each one for nothing would
        // be felt on a document of any size.
        const wasHidden = (this.pane?.foldState?.rowAt(match.line) ?? -1) === -1;
        this.select(match.line);
        if (wasHidden) {
            this.graph?.render();
        }
        this.markGraphMatches();
        this.graph?.revealLine(match.line);
        this.pane?.refresh();
    }

    private clearMatches(): void {
        this.matches = [];
        this.matchLines = new Set();
        this.matchIndex = -1;
        this.matchesTruncated = false;
        this.pane?.refresh();
        this.markGraphMatches();
    }

    /** Whether a line carries a search hit, and whether it is the current one. */
    private matchStateOf(line: number): '' | ' is-match' | ' is-match is-current-match' {
        if (!this.matchLines.has(line)) {
            return '';
        }
        return this.matches[this.matchIndex]?.line === line
            ? ' is-match is-current-match'
            : ' is-match';
    }

    constructor(messenger: Messenger) {
        this.messenger = messenger;
        this.staleness = new PaneFlag({
            panelId: 'visual-panel',
            buttonId: 'visual-flag',
            onAct: () => this.onRebuildRequested()
        });
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

        // Whatever it is being handed, it is what the input says right now.
        this.staleness.lower();

        if (!doc) {
            this.pane?.setDocument(null);
            this.source?.setDocument(null);
            this.graph?.setDocument(null, null);
            this.nodeCount = 0;
            this.setEmpty(true);
            this.setBreadcrumb([], false);
            this.publishStatus({});
            // Emptied, so the pane is back to having nothing to read.
            this.offerTheInputBox();
            return;
        }

        this.setEmpty(false);
        this.graphFramed = false;
        this.ensurePane().setDocument(doc);
        // The pane beside the picture shows the formatted document rather than
        // the box it was pasted into: in this mode it is something to read, and
        // editing it here would leave the picture describing older text.
        this.ensureSource().setDocument(doc);
        // Both shapes read the one fold state, so the graph is handed the same
        // object rather than a copy that could drift out of step with it.
        this.ensureGraph().setDocument(doc, this.pane?.foldState ?? null);
        this.setBreadcrumb([], false);

        this.nodeCount = nodeCount(doc.lines);
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
                alwaysHidden: isCloserLine,
                renderRow: context => this.renderRow(context),
                // Folding from the tree has to reach the graph, which is laid
                // out from the same state and cannot notice on its own.
                onFoldChange: () => this.graph?.render()
            });
        }
        return this.pane;
    }

    private ensureSource(): DocumentPane {
        if (!this.source) {
            this.source = new DocumentPane({
                viewport: byId('input-view') as HTMLElement,
                showLineNumbers: () => JSONFormatter.getShowLineNumbers()
            });
        }
        return this.source;
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

    // --------------------------------------------------------------- input

    /**
     * Swaps the pane beside the picture between reading and editing.
     *
     * Reading is the default, since in this mode the document is something to
     * look at -- but making a change should not mean leaving for another tab
     * and coming back.
     */
    public toggleInput(): void {
        this.setInputMode(this.inputMode === 'edit' ? 'source' : 'edit');
    }

    /**
     * Opens the editable box when there is no document to read.
     *
     * Reading is the right default once there is something to read, but on the
     * first visit there is not: the pane showed an empty read-only view, and
     * pasting meant first noticing a pencil in the header and pressing it.
     * Nothing is being displaced, so show the box that can be typed into.
     *
     * Only ever in this direction. Building a document while the reader is
     * editing must not pull the box out from under them.
     */
    private offerTheInputBox(): void {
        if (this.onScreen && !this.document && this.inputMode !== 'edit') {
            this.setInputMode('edit');
        }
    }

    private get inputMode(): 'source' | 'edit' {
        return byId('input-panel')?.dataset.input === 'edit' ? 'edit' : 'source';
    }

    private setInputMode(mode: 'source' | 'edit'): void {
        const panel = byId('input-panel');
        if (!panel) {
            return;
        }
        panel.dataset.input = mode;

        const toggle = byId('edit-input');
        if (toggle) {
            const editing = mode === 'edit';
            toggle.classList.toggle('is-active', editing);
            toggle.querySelector('.codicon')?.classList.toggle('codicon-edit', !editing);
            toggle.querySelector('.codicon')?.classList.toggle('codicon-eye', editing);
            const label = editing ? 'Show the formatted document' : 'Edit the document';
            setTip(toggle, label);
            toggle.setAttribute('aria-label', label);
        }

        if (mode === 'edit') {
            byId<HTMLTextAreaElement>('input')?.focus();
        }
    }

    /**
     * Responds to the input changing.
     *
     * Only while this view is the one on screen. The handler is on the shared
     * input box, so without the guard it also fired while the reader was typing
     * in the Format tab -- quietly reformatting there on every pause, which is
     * exactly the per-keystroke cost the whole design avoids, and which made
     * the Format button look like it did nothing.
     *
     * When the view is not on screen the picture simply falls behind, and says
     * so with the badge when the reader returns to it.
     */
    private onInputChanged(): void {
        if (this.onScreen) {
            this.scheduleRebuild();
        } else if (this.document) {
            this.markStale();
        }
    }

    private markStale(): void {
        this.staleness.raise(
            'Out of date',
            'stale',
            'The input has changed since this was drawn. Build it again.',
            'mod+enter'
        );
    }

    /** Rebuilds after a pause, so a burst of typing is one rebuild. */
    private scheduleRebuild(): void {
        if (this.rebuildTimer !== null) {
            window.clearTimeout(this.rebuildTimer);
        }
        this.rebuildTimer = window.setTimeout(() => {
            this.rebuildTimer = null;
            this.onRebuildRequested();
        }, REBUILD_DELAY_MS);
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
        this.onScreen = true;
        this.offerTheInputBox();
        this.setShape(this.shape);
    }

    /**
     * Called when another mode takes the screen.
     *
     * A rebuild already queued is dropped rather than left to fire from behind
     * another view, where it would reformat the input the reader is now editing
     * in the Format tab.
     */
    public deactivate(): void {
        this.onScreen = false;
        if (this.rebuildTimer !== null) {
            window.clearTimeout(this.rebuildTimer);
            this.rebuildTimer = null;
        }
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
            // Nothing drawn is nothing to describe. Switching shape on an empty
            // pane used to announce "Valid JSON, 0 nodes", which is a verdict on
            // a document that does not exist.
            this.publishStatus(this.document ? this.describe() : {});
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

        // An array element has no property name, so it is named by its position.
        // Leaving it blank made a row of objects inside an array read as a
        // column of unlabelled "3 properties", with nothing to tell them apart
        // or to say which one the reader is looking at.
        const label = node.key
            ? `<span class="tree-row__key">${escapeHtml(node.key)}</span>`
            : node.indexed
              ? `<span class="tree-row__key tree-row__key--index">${node.index}</span>`
              : '<span class="tree-row__key tree-row__key--root">root</span>';

        const badge = `<span class="tree-row__badge tree-row__badge--${node.type}">${node.type}</span>`;

        const value =
            node.type === 'object' || node.type === 'array'
                ? `<span class="tree-row__count">${escapeHtml(node.preview)}</span>`
                : `<span class="tree-row__value ${node.type}">${escapeHtml(node.preview)}</span>`;

        return `<div class="tree-row${context.selected ? ' is-selected' : ''}${this.matchStateOf(
            context.line
        )}" data-tree-line="${
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
        bind('edit-input', () => this.toggleInput());

        // Typing rebuilds the picture rather than leaving it describing older
        // text -- which is what made this mode something to leave in order to
        // change anything.
        const input = byId<HTMLTextAreaElement>('input');
        if (input) {
            this.teardown.push(on(input, 'input', () => this.onInputChanged()));
        }

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

        folds.collapseBelowDepth(depth);
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
        // The formatted source follows the picture, so picking a node in either
        // shape shows the text it came from.
        this.source?.selectLine(line);
        this.setBreadcrumb(pathForLine(doc, line), true);
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

    private setBreadcrumb(path: string[], selected: boolean): void {
        byId('visual-breadcrumb')?.setAttribute('data-selected', String(selected));

        const bar = byId('visual-path');
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
        if (this.rebuildTimer !== null) {
            window.clearTimeout(this.rebuildTimer);
            this.rebuildTimer = null;
        }
        for (const off of this.teardown) {
            off();
        }
        this.teardown.length = 0;
        this.staleness.dispose();
        this.pane?.dispose();
        this.pane = null;
        this.source?.dispose();
        this.source = null;
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

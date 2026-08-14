/**
 * A viewport showing a formatted JSON document.
 *
 * This was the format view's private machinery: a virtual list over a line
 * index, a fold state, and the per-row rendering that ties them together. The
 * diff panes need exactly the same thing -- they were bare textareas with no
 * colour, no gutter and no folding -- so it lives here and both views use it
 * rather than the second one growing a parallel copy.
 *
 * The pane owns no controls and posts no messages. It renders a document and
 * answers questions about what is on screen; deciding what to show is the
 * caller's business.
 */
import { FoldState } from '../engine/line-index';
import { JSONFormatter } from '../formatter';
import { delegate } from './dom';
import { VirtualList } from './virtual-list';
import type { PrettyDocument } from '../engine/pretty-sink';

/** A range within a line to mark, used for search hits. */
export interface LineMark {
    start: number;
    end: number;
    current?: boolean;
}

export interface DocumentPaneOptions {
    /** The scrolling element the rows are rendered into. */
    viewport: HTMLElement;
    /** Whether the gutter is shown; read per render so a toggle takes effect. */
    showLineNumbers?: () => boolean;
    /** Ranges to mark on a line, if any. */
    marksOn?: (line: number) => LineMark[] | undefined;
    /** Called after the user folds or unfolds something. */
    onFoldChange?: () => void;
}

export class DocumentPane {
    private readonly options: DocumentPaneOptions;
    private readonly teardown: Array<() => void> = [];

    private doc: PrettyDocument | null = null;
    private folds: FoldState | null = null;
    private list: VirtualList | null = null;

    /** The line drawn as selected, or -1. Survives scrolling out and back. */
    private highlighted = -1;

    constructor(options: DocumentPaneOptions) {
        this.options = options;

        // Delegated, so it survives every re-render of the viewport -- the
        // window's markup is replaced wholesale on each scroll.
        this.teardown.push(
            delegate(options.viewport, 'click', '.fold-arrow', (arrow, event) => {
                event.stopPropagation();
                const line = Number(arrow.dataset.foldLine);
                if (Number.isInteger(line)) {
                    this.toggleFold(line);
                }
            })
        );
    }

    public get document(): PrettyDocument | null {
        return this.doc;
    }

    public get foldState(): FoldState | null {
        return this.folds;
    }

    public get lineCount(): number {
        return this.doc?.lines.lineCount ?? 0;
    }

    /** Replaces what the pane shows. Passing null empties it. */
    public setDocument(doc: PrettyDocument | null): void {
        this.doc = doc;
        this.folds = doc ? new FoldState(doc.lines) : null;
        this.highlighted = -1;
        this.ensureList().refresh();
    }

    public refresh(): void {
        this.list?.refresh();
    }

    /** The whole document as text, for copying or saving. */
    public text(): string | null {
        return this.doc ? this.doc.text.toString() : null;
    }

    /** The text of one line, without its trailing newline. */
    public lineText(line: number): string {
        if (!this.doc) {
            return '';
        }
        const { text, lines } = this.doc;
        return text.slice(lines.start(line), lines.end(line, text.length));
    }

    // ---------------------------------------------------------------- folding

    public toggleFold(line: number): void {
        this.folds?.toggle(line);
        this.refresh();
        this.options.onFoldChange?.();
    }

    public collapseAll(): void {
        this.folds?.collapseAll();
        this.refresh();
        this.options.onFoldChange?.();
    }

    public expandAll(): void {
        this.folds?.expandAll();
        this.refresh();
        this.options.onFoldChange?.();
    }

    // -------------------------------------------------------------- revealing

    /**
     * Scrolls a line into view, opening whatever folds are hiding it.
     *
     * Folds nest, so opening the innermost one can reveal that another still
     * hides the line; this repeats until nothing does.
     */
    public revealLine(line: number): void {
        if (!this.folds || line < 0 || line >= this.lineCount) {
            return;
        }

        let hiding = this.folds.foldHiding(line);
        while (hiding !== -1) {
            this.folds.toggle(hiding);
            hiding = this.folds.foldHiding(line);
        }

        const row = this.folds.rowAt(line);
        if (row >= 0) {
            this.list?.revealRow(row);
        }
    }

    /** Marks a line as the selected one and brings it into view. */
    public selectLine(line: number): void {
        this.highlighted = line;
        this.revealLine(line);
        this.refresh();
    }

    public clearSelection(): void {
        if (this.highlighted !== -1) {
            this.highlighted = -1;
            this.refresh();
        }
    }

    public get selectedLine(): number {
        return this.highlighted;
    }

    // --------------------------------------------------------------- internals

    private ensureList(): VirtualList {
        if (!this.list) {
            this.list = new VirtualList({
                viewport: this.options.viewport,
                count: () => this.folds?.visibleCount ?? 0,
                renderRows: (from, to) => this.renderRows(from, to)
            });
        }
        return this.list;
    }

    /** Markup for the rows currently on screen. */
    private renderRows(from: number, to: number): string {
        const doc = this.doc;
        const folds = this.folds;
        if (!doc || !folds) {
            return '';
        }

        const showLineNumbers = this.options.showLineNumbers?.() ?? true;
        const total = doc.text.length;
        const out: string[] = [];

        for (let row = from; row < to; row++) {
            const line = folds.lineAt(row);
            if (line >= doc.lines.lineCount) {
                break;
            }

            out.push(
                JSONFormatter.renderLine(
                    doc.text.slice(doc.lines.start(line), doc.lines.end(line, total)),
                    {
                        lineNumber: line + 1,
                        foldable: doc.lines.isFoldable(line),
                        collapsed: folds.isCollapsed(line),
                        showLineNumbers,
                        highlighted: line === this.highlighted,
                        matches: this.options.marksOn?.(line)
                    }
                )
            );
        }

        return out.join('');
    }

    public dispose(): void {
        for (const off of this.teardown) {
            off();
        }
        this.teardown.length = 0;
        this.list?.dispose();
        this.list = null;
    }
}

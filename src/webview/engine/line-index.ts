/**
 * Where the lines of a formatted document are, what each one holds, and which
 * of them are folded.
 *
 * A handful of numbers per line in typed arrays: about twenty bytes, so ten
 * million lines cost roughly 200 MB of index rather than the gigabytes the
 * equivalent DOM would need. Folding is a property of this table, not of the
 * rendered output, so collapsing a node the size of the document is a
 * bookkeeping change rather than a walk over anything.
 *
 * The per-line node columns -- what kind of thing is on the line, how many
 * children it has, and where its property name sits -- were all known while
 * the document was being written and then thrown away. Keeping them is what
 * lets a JSON path be turned back into a line without re-scanning, and what
 * lets the same table be rendered as a tree.
 */

/** No fold opens on this line. Line 0 can never be a fold's last line. */
const NO_FOLD = 0;

/**
 * What sits on a line.
 *
 * `Closer` is the `}` or `]` ending a container that spans several lines. It
 * matters because a closer shares its opener's depth, so without the
 * distinction a walk over a container's children would count each nested
 * container twice.
 */
export const LineKind = {
    Scalar: 0,
    Object: 1,
    Array: 2,
    Closer: 3
} as const;

export type LineKind = (typeof LineKind)[keyof typeof LineKind];

/** A line table reduced to plain buffers, for crossing a thread boundary. */
export interface SerializedLines {
    starts: Uint32Array;
    depths: Uint16Array;
    foldEnds: Uint32Array;
    kinds: Uint8Array;
    childCounts: Uint32Array;
    keyStarts: Uint32Array;
    keyLengths: Uint16Array;
    count: number;
}

export class LineTable {
    private starts: Uint32Array;
    private depths: Uint16Array;
    /** For a line that opens a container, the line its closer sits on. */
    private foldEnds: Uint32Array;
    private kinds: Uint8Array;
    /** For a container, how many direct children it has. */
    private childCounts: Uint32Array;
    /** Offset of the quoted property name on this line; 0 length if none. */
    private keyStarts: Uint32Array;
    private keyLengths: Uint16Array;

    private count = 0;

    constructor(capacity = 1024) {
        this.starts = new Uint32Array(capacity);
        this.depths = new Uint16Array(capacity);
        this.foldEnds = new Uint32Array(capacity);
        this.kinds = new Uint8Array(capacity);
        this.childCounts = new Uint32Array(capacity);
        this.keyStarts = new Uint32Array(capacity);
        this.keyLengths = new Uint16Array(capacity);
    }

    public get lineCount(): number {
        return this.count;
    }

    public push(start: number, depth: number): number {
        if (this.count === this.starts.length) {
            this.grow();
        }
        this.starts[this.count] = start;
        this.depths[this.count] = Math.min(depth, 0xffff);
        this.foldEnds[this.count] = NO_FOLD;
        this.kinds[this.count] = LineKind.Scalar;
        this.childCounts[this.count] = 0;
        this.keyStarts[this.count] = 0;
        this.keyLengths[this.count] = 0;
        return this.count++;
    }

    private grow(): void {
        const next = this.starts.length * 2;

        const starts = new Uint32Array(next);
        starts.set(this.starts);
        this.starts = starts;

        const depths = new Uint16Array(next);
        depths.set(this.depths);
        this.depths = depths;

        const foldEnds = new Uint32Array(next);
        foldEnds.set(this.foldEnds);
        this.foldEnds = foldEnds;

        const kinds = new Uint8Array(next);
        kinds.set(this.kinds);
        this.kinds = kinds;

        const childCounts = new Uint32Array(next);
        childCounts.set(this.childCounts);
        this.childCounts = childCounts;

        const keyStarts = new Uint32Array(next);
        keyStarts.set(this.keyStarts);
        this.keyStarts = keyStarts;

        const keyLengths = new Uint16Array(next);
        keyLengths.set(this.keyLengths);
        this.keyLengths = keyLengths;
    }

    public start(line: number): number {
        return this.starts[line] ?? 0;
    }

    public depth(line: number): number {
        return this.depths[line] ?? 0;
    }

    public kind(line: number): LineKind {
        return (this.kinds[line] ?? LineKind.Scalar) as LineKind;
    }

    public setKind(line: number, kind: LineKind): void {
        this.kinds[line] = kind;
    }

    /** How many direct children the container on this line has. */
    public childCount(line: number): number {
        return this.childCounts[line] ?? 0;
    }

    public setChildCount(line: number, count: number): void {
        this.childCounts[line] = count;
    }

    /**
     * Where this line's property name sits in the document text, as the range
     * of its JSON spelling including the quotes. A zero length means the line
     * holds an array element or the root, which have no name.
     */
    public keyRange(line: number): { start: number; length: number } {
        return { start: this.keyStarts[line] ?? 0, length: this.keyLengths[line] ?? 0 };
    }

    public setKeyRange(line: number, start: number, length: number): void {
        this.keyStarts[line] = start;
        // A property name longer than 64 KB is recorded as having none rather
        // than as a truncated range that would match the wrong text.
        this.keyLengths[line] = length > 0xffff ? 0 : length;
    }

    /** The last line of the container opening on `line`, or 0 if none does. */
    public foldEnd(line: number): number {
        return this.foldEnds[line] ?? NO_FOLD;
    }

    public setFoldEnd(line: number, end: number): void {
        // A container whose contents fit on its own line is not worth folding.
        if (end > line) {
            this.foldEnds[line] = end;
        }
    }

    /**
     * The raw columns, for handing to another thread.
     *
     * The buffers are transferable, so moving an index between the worker and
     * the panel costs no copy.
     */
    public serialize(): SerializedLines {
        return {
            starts: this.starts.slice(0, this.count),
            depths: this.depths.slice(0, this.count),
            foldEnds: this.foldEnds.slice(0, this.count),
            kinds: this.kinds.slice(0, this.count),
            childCounts: this.childCounts.slice(0, this.count),
            keyStarts: this.keyStarts.slice(0, this.count),
            keyLengths: this.keyLengths.slice(0, this.count),
            count: this.count
        };
    }

    public static deserialize(data: SerializedLines): LineTable {
        const table = new LineTable(Math.max(1, data.count));
        table.starts = data.starts;
        table.depths = data.depths;
        table.foldEnds = data.foldEnds;
        table.kinds = data.kinds;
        table.childCounts = data.childCounts;
        table.keyStarts = data.keyStarts;
        table.keyLengths = data.keyLengths;
        table.count = data.count;
        return table;
    }

    public isFoldable(line: number): boolean {
        return this.foldEnds[line] > NO_FOLD;
    }

    /** The end of `line`, exclusive of its newline. */
    public end(line: number, documentLength: number): number {
        return line + 1 < this.count ? this.starts[line + 1] - 1 : documentLength;
    }
}

/**
 * The set of collapsed folds, and the mapping between the lines of the
 * document and the rows actually on screen.
 *
 * Collapsed folds are kept as a sorted, non-overlapping list of hidden ranges.
 * A document with a handful of folds closed therefore costs a handful of
 * entries, whatever its size, and turning a visible row back into a document
 * line is a binary search over them.
 */
/**
 * Whether a line holds nothing but a closing bracket.
 *
 * A container that spans several lines ends with `}` or `]` on its own. That
 * is a line of the formatted document but not a node of the tree, so the tree
 * hides them and a container becomes one row with its children beneath it.
 *
 * A predicate rather than a list: a million-line document has hundreds of
 * thousands of these, and materialising them was an array to build, hold and
 * merge on every fold.
 */
export function isCloserLine(table: LineTable, line: number): boolean {
    return table.kind(line) === LineKind.Closer;
}

/** How many lines of a document are nodes rather than closing brackets. */
export function nodeCount(table: LineTable): number {
    let count = 0;
    for (let line = 0; line < table.lineCount; line++) {
        if (table.kind(line) !== LineKind.Closer) {
            count++;
        }
    }
    return count;
}

export interface FoldStateOptions {
    /**
     * Lines that are never rows, whatever is collapsed.
     *
     * The tree view uses this to drop the closing-bracket lines: `}` on its own
     * is a line of the formatted document but not a node of the tree.
     */
    alwaysHidden?: (table: LineTable, line: number) => boolean;
}

export class FoldState {
    private readonly table: LineTable;
    /**
     * The hidden ranges, as three parallel columns rather than objects.
     *
     * A tree hides every closing bracket, so a million-line document has
     * hundreds of thousands of ranges -- as objects that is megabytes of heap
     * and a matching allocation cost every time a fold changes.
     */
    private hiddenFrom = new Uint32Array(0);
    private hiddenTo = new Uint32Array(0);
    /** Cumulative hidden lines before each range. */
    private hiddenBefore = new Uint32Array(0);
    private rangeCount = 0;
    /** Whether a line is hidden regardless of what is collapsed. */
    private readonly always: (table: LineTable, line: number) => boolean;
    /** Kept rather than recomputed: the virtual list asks on every frame. */
    private visible = 0;

    /**
     * The depth at and below which every container is collapsed, or null.
     *
     * Holding "collapse everything past level two" as a number rather than as
     * a set of several hundred thousand line numbers is what makes the bulk
     * operations cheap: there is nothing to build, sort or hold.
     */
    private collapseDepth: number | null = null;

    /** Lines the reader has toggled away from whatever `collapseDepth` says. */
    private readonly toggled = new Set<number>();

    constructor(table: LineTable, options: FoldStateOptions = {}) {
        this.table = table;
        this.always = options.alwaysHidden ?? (() => false);
        this.reindex();
    }

    public isCollapsed(line: number): boolean {
        const base =
            this.collapseDepth !== null && this.table.depth(line) >= this.collapseDepth;
        return base !== this.toggled.has(line);
    }

    public get visibleCount(): number {
        return this.visible;
    }

    /** How many separate hidden stretches the document currently has. */
    public get hiddenRangeCount(): number {
        return this.rangeCount;
    }

    public toggle(line: number): void {
        if (!this.table.isFoldable(line)) {
            return;
        }
        this.flip(line);
        this.reindex();
    }

    public collapseAll(): void {
        this.collapseBelowDepth(0);
    }

    /**
     * Collapses every container at or below `depth`, opening the rest.
     *
     * Recorded as a number rather than applied line by line: toggling each
     * container in turn rebuilt the range list once per container, which is
     * what made this take the best part of a second on a large document.
     */
    public collapseBelowDepth(depth: number): void {
        this.collapseDepth = depth;
        this.toggled.clear();
        this.reindex();
    }

    public expandAll(): void {
        this.collapseDepth = null;
        this.toggled.clear();
        this.reindex();
    }

    /**
     * Rebuilds the hidden ranges from the collapsed set.
     *
     * A fold inside a collapsed fold hides nothing extra, so overlapping
     * ranges are merged and the inner one simply disappears into the outer.
     */
    /**
     * Rebuilds the hidden ranges.
     *
     * One ascending pass, merging as it goes, so nothing has to be sorted --
     * and a collapsed container is stepped over whole rather than walked into,
     * since everything inside it is hidden anyway. A closing bracket is
     * recognised by asking, rather than by consulting a list of every closer
     * in the document, which on a million lines was hundreds of thousands of
     * entries to build and hold on every fold.
     */
    private reindex(): void {
        let count = 0;
        let capacity = this.hiddenFrom.length;
        let from = this.hiddenFrom;
        let to = this.hiddenTo;

        const add = (rangeFrom: number, rangeTo: number) => {
            // A fold inside a collapsed fold hides nothing extra, so
            // overlapping ranges merge and the inner one disappears.
            if (count > 0 && rangeFrom <= to[count - 1] + 1) {
                to[count - 1] = Math.max(to[count - 1], rangeTo);
                return;
            }
            if (count === capacity) {
                capacity = Math.max(64, capacity * 2);
                const grownFrom = new Uint32Array(capacity);
                grownFrom.set(from.subarray(0, count));
                from = grownFrom;
                const grownTo = new Uint32Array(capacity);
                grownTo.set(to.subarray(0, count));
                to = grownTo;
            }
            from[count] = rangeFrom;
            to[count] = rangeTo;
            count++;
        };

        const total = this.table.lineCount;
        for (let line = 0; line < total; ) {
            if (this.table.isFoldable(line) && this.isCollapsed(line)) {
                const end = this.table.foldEnd(line);
                add(line + 1, end);
                line = end + 1;
                continue;
            }
            if (this.always(this.table, line)) {
                add(line, line);
            }
            line++;
        }

        this.hiddenFrom = from;
        this.hiddenTo = to;
        this.rangeCount = count;

        if (this.hiddenBefore.length < count) {
            this.hiddenBefore = new Uint32Array(capacity);
        }
        let running = 0;
        for (let i = 0; i < count; i++) {
            this.hiddenBefore[i] = running;
            running += to[i] - from[i] + 1;
        }
        this.visible = total - running;
    }

    /** The document line shown at visible row `row`. */
    public lineAt(row: number): number {
        let low = 0;
        let high = this.rangeCount;

        // Find the last range that starts at or before the line this row would
        // be if everything before it were visible.
        while (low < high) {
            const mid = (low + high) >> 1;
            const shifted = this.hiddenFrom[mid] - this.hiddenBefore[mid];
            if (shifted <= row) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        const skipped =
            low === 0
                ? 0
                : this.hiddenBefore[low - 1] + (this.hiddenTo[low - 1] - this.hiddenFrom[low - 1] + 1);
        return row + skipped;
    }

    /**
     * The visible row showing `line`, or -1 when it is hidden.
     *
     * A binary search rather than a walk: the tree hides every closing bracket,
     * so the range list is as long as the document has containers and scanning
     * it on each lookup would be felt.
     */
    public rowAt(line: number): number {
        let low = 0;
        let high = this.rangeCount;

        while (low < high) {
            const mid = (low + high) >> 1;
            if (this.hiddenFrom[mid] <= line) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        if (low === 0) {
            return line;
        }

        const lastTo = this.hiddenTo[low - 1];
        if (line <= lastTo) {
            return -1;
        }
        return line - (this.hiddenBefore[low - 1] + (lastTo - this.hiddenFrom[low - 1] + 1));
    }

    /**
     * The innermost collapsed fold hiding `line`, or -1 when it is visible.
     *
     * Found by descending from the root along the containers whose span covers
     * the line, rather than by searching the collapsed folds: with the
     * collapsed state held as a depth there is no list of them to search, and
     * on a large document there would be hundreds of thousands if there were.
     */
    public foldHiding(line: number): number {
        let innermost = -1;
        for (const ancestor of this.ancestorsOf(line)) {
            if (this.isCollapsed(ancestor)) {
                innermost = ancestor;
            }
        }
        return innermost;
    }

    /**
     * Opens every fold hiding `line`, in one pass. Reports whether any did.
     *
     * Asking which fold hides a line and opening it, over and over, re-walked
     * the document once per level; this walks it once.
     */
    public expose(line: number): boolean {
        let opened = false;
        for (const ancestor of this.ancestorsOf(line)) {
            if (this.isCollapsed(ancestor)) {
                this.flip(ancestor);
                opened = true;
            }
        }
        if (opened) {
            this.reindex();
        }
        return opened;
    }

    /** The containers enclosing a line, outermost first. */
    private ancestorsOf(line: number): number[] {
        const ancestors: number[] = [];
        let current = 0;

        while (current < line) {
            const end = this.table.foldEnd(current);
            if (end <= current || end < line) {
                break;
            }
            ancestors.push(current);

            // Step across siblings a whole subtree at a time; the one whose
            // span contains the line is the next level down.
            let child = current + 1;
            let next = -1;
            while (child < end) {
                const childEnd = this.table.foldEnd(child);
                const span = childEnd > child ? childEnd : child;
                if (line <= span) {
                    next = child;
                    break;
                }
                child = span + 1;
            }

            if (next === -1 || next === line) {
                break;
            }
            current = next;
        }

        return ancestors;
    }

    /** Flips one container's collapsed state without reindexing. */
    private flip(line: number): void {
        if (this.toggled.has(line)) {
            this.toggled.delete(line);
        } else {
            this.toggled.add(line);
        }
    }
}

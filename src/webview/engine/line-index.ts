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
export class FoldState {
    private readonly table: LineTable;
    /** Sorted by `from`, never overlapping. */
    private hidden: Array<{ from: number; to: number }> = [];
    /** Cumulative hidden lines before each range; parallel to `hidden`. */
    private hiddenBefore: number[] = [];

    private collapsed = new Set<number>();

    constructor(table: LineTable) {
        this.table = table;
        this.reindex();
    }

    public isCollapsed(line: number): boolean {
        return this.collapsed.has(line);
    }

    public get visibleCount(): number {
        const hiddenTotal = this.hidden.reduce((sum, range) => sum + (range.to - range.from + 1), 0);
        return this.table.lineCount - hiddenTotal;
    }

    public toggle(line: number): void {
        if (!this.table.isFoldable(line)) {
            return;
        }
        if (this.collapsed.has(line)) {
            this.collapsed.delete(line);
        } else {
            this.collapsed.add(line);
        }
        this.reindex();
    }

    public collapseAll(): void {
        this.collapsed.clear();
        for (let line = 0; line < this.table.lineCount; line++) {
            if (this.table.isFoldable(line)) {
                this.collapsed.add(line);
            }
        }
        this.reindex();
    }

    public expandAll(): void {
        this.collapsed.clear();
        this.reindex();
    }

    /**
     * Rebuilds the hidden ranges from the collapsed set.
     *
     * A fold inside a collapsed fold hides nothing extra, so overlapping
     * ranges are merged and the inner one simply disappears into the outer.
     */
    private reindex(): void {
        const ranges: Array<{ from: number; to: number }> = [];

        for (const line of [...this.collapsed].sort((a, b) => a - b)) {
            const from = line + 1;
            const to = this.table.foldEnd(line);
            if (to < from) {
                continue;
            }

            const last = ranges[ranges.length - 1];
            if (last && from <= last.to + 1) {
                last.to = Math.max(last.to, to);
            } else {
                ranges.push({ from, to });
            }
        }

        this.hidden = ranges;
        this.hiddenBefore = [];
        let running = 0;
        for (const range of ranges) {
            this.hiddenBefore.push(running);
            running += range.to - range.from + 1;
        }
    }

    /** The document line shown at visible row `row`. */
    public lineAt(row: number): number {
        let low = 0;
        let high = this.hidden.length;

        // Find the last range that starts at or before the line this row would
        // be if everything before it were visible.
        while (low < high) {
            const mid = (low + high) >> 1;
            const shifted = this.hidden[mid].from - this.hiddenBefore[mid];
            if (shifted <= row) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        const skipped = low === 0 ? 0 : this.hiddenBefore[low - 1] + (this.hidden[low - 1].to - this.hidden[low - 1].from + 1);
        return row + skipped;
    }

    /** The visible row showing `line`, or -1 when it is hidden. */
    public rowAt(line: number): number {
        let hiddenSoFar = 0;
        for (let i = 0; i < this.hidden.length; i++) {
            const range = this.hidden[i];
            if (line < range.from) {
                break;
            }
            if (line <= range.to) {
                return -1;
            }
            hiddenSoFar += range.to - range.from + 1;
        }
        return line - hiddenSoFar;
    }

    /** The innermost collapsed fold hiding `line`, or -1 when it is visible. */
    public foldHiding(line: number): number {
        for (const candidate of [...this.collapsed].sort((a, b) => b - a)) {
            if (line > candidate && line <= this.table.foldEnd(candidate)) {
                return candidate;
            }
        }
        return -1;
    }
}

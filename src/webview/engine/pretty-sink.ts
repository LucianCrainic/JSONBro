/**
 * Turns a parse into formatted text and a line index, with no value in between.
 *
 * Formatting used to mean parsing into objects, then walking those objects to
 * build one enormous HTML string -- and because each level wrapped every line
 * its children produced, the markup grew with depth as well as length. This
 * emits plain text once, records where each line starts, and leaves rendering
 * to whatever is on screen.
 */
import type { ParseSink } from './parse-sink';
import { LineTable } from './line-index';
import { TextStore } from './text-store';

export interface PrettyDocument {
    text: TextStore;
    lines: LineTable;
}

/** Indent strings by depth, built on demand and reused. */
const INDENTS: string[] = [''];

function indentFor(depth: number, size: number): string {
    const key = depth * size;
    for (let i = INDENTS.length; i <= key; i++) {
        INDENTS[i] = INDENTS[i - 1] + ' ';
    }
    return INDENTS[key];
}

interface Frame {
    /** How many items have been written into this container. */
    count: number;
    /** The line its opening bracket sits on. */
    openLine: number;
    isArray: boolean;
}

export interface PrettyOptions {
    /** Spaces per level. Defaults to 2. */
    indent?: number;
}

export class PrettySink implements ParseSink<PrettyDocument> {
    private readonly out = new TextStore();
    private readonly lines = new LineTable();
    private readonly frames: Frame[] = [];
    private readonly indentSize: number;

    private depth = 0;
    /** True when a property name has been written and its value follows it. */
    private afterKey = false;

    constructor(options: PrettyOptions = {}) {
        this.indentSize = options.indent ?? 2;
        this.lines.push(0, 0);
    }

    public beginObject(): void {
        this.openValue();
        this.frames.push({ count: 0, openLine: this.currentLine, isArray: false });
        this.out.append('{');
        this.depth++;
    }

    public beginArray(): void {
        this.openValue();
        this.frames.push({ count: 0, openLine: this.currentLine, isArray: true });
        this.out.append('[');
        this.depth++;
    }

    public endObject(): void {
        this.closeContainer('}');
    }

    public endArray(): void {
        this.closeContainer(']');
    }

    public key(name: string): void {
        this.openValue();
        this.out.append(`${JSON.stringify(name)}: `);
        this.afterKey = true;
    }

    public scalar(value: string | number | boolean | null): void {
        this.openValue();
        this.out.append(encode(value));
    }

    public finish(): PrettyDocument {
        this.out.seal();
        return { text: this.out, lines: this.lines };
    }

    private get currentLine(): number {
        return this.lines.lineCount - 1;
    }

    /**
     * Writes whatever separates this value from the previous one.
     *
     * A value that follows a property name continues its line; anything else
     * starts a new one, preceded by a comma when it is not the first item.
     */
    private openValue(): void {
        if (this.afterKey) {
            this.afterKey = false;
            return;
        }

        const frame = this.frames[this.frames.length - 1];
        if (!frame) {
            return; // the root value, written at offset zero
        }

        if (frame.count > 0) {
            this.out.append(',');
        }
        frame.count++;
        this.newline();
    }

    private newline(): void {
        this.out.append('\n');
        this.lines.push(this.out.length, this.depth);
        this.out.append(indentFor(this.depth, this.indentSize));
    }

    private closeContainer(bracket: string): void {
        const frame = this.frames.pop();
        this.depth = Math.max(0, this.depth - 1);

        if (!frame) {
            this.out.append(bracket);
            return;
        }

        // An empty container stays on one line: `{}` reads better than a brace
        // pair straddling two, and it is not worth a fold.
        if (frame.count > 0) {
            this.newline();
        }

        this.out.append(bracket);
        this.lines.setFoldEnd(frame.openLine, this.currentLine);
        this.afterKey = false;
    }
}

function encode(value: string | number | boolean | null): string {
    if (typeof value === 'string') {
        return JSON.stringify(value);
    }
    if (value === null) {
        return 'null';
    }
    if (typeof value === 'number') {
        // Infinity and NaN have no JSON spelling; the scanner already reports
        // them, and null is what JSON.stringify would produce.
        return Number.isFinite(value) ? String(value) : 'null';
    }
    return String(value);
}

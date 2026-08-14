/**
 * What a parse produces.
 *
 * The parser reports structure as it goes rather than building a result
 * itself, so the same walk -- including all of its error recovery -- can
 * produce either a JavaScript value or formatted text. That matters at size: a
 * 200 MB document becomes something like a gigabyte of objects, but only about
 * as much text as it started with, plus a few bytes per line of index.
 */
export interface ParseSink<T> {
    beginObject(): void;
    endObject(): void;
    beginArray(): void;
    endArray(): void;
    /** The property name for the value that follows. */
    key(name: string): void;
    scalar(value: string | number | boolean | null): void;
    finish(): T;
}

/** Builds an ordinary JavaScript value, as the parser always used to. */
export class ValueSink implements ParseSink<unknown> {
    private root: unknown = null;
    private assigned = false;

    private readonly stack: Array<{
        array: unknown[] | null;
        object: Record<string, unknown> | null;
        key: string | null;
    }> = [];

    public beginObject(): void {
        this.stack.push({ array: null, object: {}, key: null });
    }

    public beginArray(): void {
        this.stack.push({ array: [], object: null, key: null });
    }

    public endObject(): void {
        this.close();
    }

    public endArray(): void {
        this.close();
    }

    public key(name: string): void {
        const frame = this.top;
        if (frame) {
            frame.key = name;
        }
    }

    public scalar(value: string | number | boolean | null): void {
        this.attach(value);
    }

    public finish(): unknown {
        // Anything still open is closed by the parser before it finishes, so
        // reaching here with a non-empty stack would be a parser bug.
        return this.root;
    }

    private get top() {
        return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
    }

    private close(): void {
        const frame = this.stack.pop();
        if (!frame) {
            return;
        }
        this.attach(frame.array ?? frame.object);
    }

    private attach(value: unknown): void {
        const frame = this.top;

        if (!frame) {
            if (!this.assigned) {
                this.root = value;
                this.assigned = true;
            }
            return;
        }

        if (frame.array) {
            frame.array.push(value);
            return;
        }
        if (frame.object && frame.key !== null) {
            frame.object[frame.key] = value;
            frame.key = null;
        }
    }

    /** True once a value has been delivered at the top level. */
    public get hasValue(): boolean {
        return this.assigned;
    }

    /** Whether the innermost object is waiting for a value. */
    public get awaitingValue(): boolean {
        return this.top?.key !== null && this.top?.key !== undefined;
    }
}

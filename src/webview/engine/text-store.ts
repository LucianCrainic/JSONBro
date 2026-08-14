/**
 * Text held as a list of chunks rather than one string.
 *
 * Formatting a large document by concatenating a single string needs room for
 * the whole result plus whatever the concatenation is building, and runs into
 * the engine's maximum string length long before memory runs out. Chunks avoid
 * both: nothing is ever copied to grow, and the pieces are only joined for the
 * few hundred characters that are actually on screen.
 */
import type { CharSource } from './tokenizer';

/** How much text accumulates before it becomes a chunk. */
const CHUNK_SIZE = 1 << 20; // 1 MB

export class TextStore implements CharSource {
    private readonly chunks: string[] = [];
    /** Offset at which each chunk begins; parallel to `chunks`. */
    private readonly offsets: number[] = [];

    private pending = '';
    private total = 0;

    /** The chunk a previous lookup landed in; reads are almost always local. */
    private cursor = 0;

    public static from(text: string): TextStore {
        const store = new TextStore();
        store.append(text);
        store.seal();
        return store;
    }

    public append(text: string): void {
        if (text.length === 0) {
            return;
        }
        this.pending += text;
        this.total += text.length;

        if (this.pending.length >= CHUNK_SIZE) {
            this.flush();
        }
    }

    /** Commits any buffered text. Call once appending is finished. */
    public seal(): void {
        this.flush();
    }

    private flush(): void {
        if (this.pending.length === 0) {
            return;
        }
        this.offsets.push(this.total - this.pending.length);
        this.chunks.push(this.pending);
        this.pending = '';
    }

    public get length(): number {
        return this.total;
    }

    public get chunkCount(): number {
        return this.chunks.length + (this.pending.length > 0 ? 1 : 0);
    }

    /** The chunk holding `offset`, or -1 when it is out of range. */
    private chunkAt(offset: number): number {
        if (offset < 0 || offset >= this.total) {
            return -1;
        }

        // Sequential reads stay in the same chunk or move to the next one, so
        // check those before paying for a search.
        const near = this.cursor;
        if (near < this.chunks.length) {
            const start = this.offsets[near];
            if (offset >= start && offset < start + this.chunks[near].length) {
                return near;
            }
        }

        let low = 0;
        let high = this.chunks.length - 1;
        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (this.offsets[mid] <= offset) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }

        this.cursor = low;
        return low;
    }

    public charCodeAt(index: number): number {
        this.flushIfPendingCovers(index);
        const chunk = this.chunkAt(index);
        if (chunk === -1) {
            return NaN;
        }
        return this.chunks[chunk].charCodeAt(index - this.offsets[chunk]);
    }

    public slice(start: number, end: number): string {
        this.flushIfPendingCovers(end);

        const from = Math.max(0, start);
        const to = Math.min(this.total, end);
        if (from >= to) {
            return '';
        }

        const first = this.chunkAt(from);
        if (first === -1) {
            return '';
        }

        // The common case: the whole span sits inside one chunk.
        const firstStart = this.offsets[first];
        if (to <= firstStart + this.chunks[first].length) {
            return this.chunks[first].slice(from - firstStart, to - firstStart);
        }

        const parts: string[] = [];
        for (let i = first; i < this.chunks.length; i++) {
            const chunkStart = this.offsets[i];
            const chunkEnd = chunkStart + this.chunks[i].length;
            if (chunkStart >= to) {
                break;
            }
            parts.push(
                this.chunks[i].slice(
                    Math.max(0, from - chunkStart),
                    Math.min(this.chunks[i].length, to - chunkStart)
                )
            );
        }
        return parts.join('');
    }

    /** Reading into unflushed text is rare; commit it rather than special-case it. */
    private flushIfPendingCovers(offset: number): void {
        if (this.pending.length > 0 && offset > this.total - this.pending.length) {
            this.flush();
        }
    }

    /**
     * The chunks themselves, for handing to another thread.
     *
     * Strings are copied rather than transferred, but this is one copy at the
     * end of a long job -- against which the alternative is the panel being
     * unresponsive for the whole of it.
     */
    public toChunks(): string[] {
        this.flush();
        return this.chunks;
    }

    public static fromChunks(chunks: string[]): TextStore {
        const store = new TextStore();
        for (const chunk of chunks) {
            store.offsets.push(store.total);
            store.chunks.push(chunk);
            store.total += chunk.length;
        }
        return store;
    }

    /** The whole document as a string. Only safe when it is known to be small. */
    public toString(): string {
        this.flush();
        return this.chunks.join('');
    }
}

/**
 * Formats a document off the UI thread.
 *
 * Parsing and pretty-printing a few megabytes takes a few hundred
 * milliseconds; a few hundred megabytes takes long enough that doing it on the
 * panel's own thread would lock the window for the duration. Here it costs the
 * panel nothing but the wait.
 *
 * A file is decoded and assembled here too, from the bytes the panel reads and
 * hands over. The panel has to do the reading -- see PanelToWorker -- but it
 * passes one chunk at a time, so the whole text exists only on this side.
 */
import { PrettySink } from '../engine/pretty-sink';
import { parseInto } from '../engine/recovering-parser';
import { TextStore } from '../engine/text-store';
import type { PanelToWorker, WorkerToPanel } from '../../shared/worker-messages';

/**
 * The worker's own global.
 *
 * Typed narrowly here because the webview tsconfig uses the `dom` library, not
 * `webworker`, and the two disagree about what `self` is.
 */
declare const self: {
    addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
    postMessage(message: unknown, transfer?: Transferable[]): void;
};

/** A read in progress, between readStart and readEnd. */
interface Incoming {
    indent: number;
    store: TextStore;
    decoder: TextDecoder;
}

const reads = new Map<number, Incoming>();

self.addEventListener('message', event => {
    handle(event.data as PanelToWorker);
});

function handle(message: PanelToWorker): void {
    switch (message.command) {
        case 'readStart':
            reads.set(message.id, {
                indent: message.indent,
                store: new TextStore(),
                // Decoded as it arrives so the text is never held twice, and
                // `stream: true` holds back a partial character at a chunk
                // boundary rather than emitting a replacement for it.
                decoder: new TextDecoder('utf-8')
            });
            return;

        case 'readChunk': {
            const read = reads.get(message.id);
            read?.store.append(read.decoder.decode(new Uint8Array(message.bytes), { stream: true }));
            return;
        }

        case 'readEnd': {
            const read = reads.get(message.id);
            if (!read) {
                return;
            }
            reads.delete(message.id);
            read.store.append(read.decoder.decode());
            read.store.seal();
            format(message.id, read.store, read.indent);
            return;
        }

        case 'formatText':
            format(message.id, TextStore.from(message.text), message.indent);
            return;
    }
}

function format(id: number, source: TextStore, indent: number): void {
    try {
        post({ id, command: 'progress', stage: 'formatting', bytes: source.length });

        const { value, diagnostics } = parseInto(source, new PrettySink({ indent }));
        const lines = value.lines.serialize();

        post(
            {
                id,
                command: 'done',
                chunks: value.text.toChunks(),
                lines,
                diagnostics: [...diagnostics],
                sourceLength: source.length
            },
            // The index columns move rather than copy; the text cannot,
            // since strings are not transferable.
            [
                lines.starts.buffer,
                lines.depths.buffer,
                lines.foldEnds.buffer,
                lines.kinds.buffer,
                lines.childCounts.buffer,
                lines.keyStarts.buffer,
                lines.keyLengths.buffer,
                lines.ordinals.buffer
            ]
        );
    } catch (error) {
        post({
            id,
            command: 'failed',
            message: error instanceof Error ? error.message : 'Could not read the document'
        });
    }
}

function post(message: WorkerToPanel, transfer: Transferable[] = []): void {
    self.postMessage(message, transfer);
}

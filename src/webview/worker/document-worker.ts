/**
 * Formats a document off the UI thread.
 *
 * Parsing and pretty-printing a few megabytes takes a few hundred
 * milliseconds; a few hundred megabytes takes long enough that doing it on the
 * panel's own thread would lock the window for the duration. Here it costs the
 * panel nothing but the wait.
 *
 * Reading a file happens here too, so its text never travels through a
 * textarea or a postMessage to get in.
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

self.addEventListener('message', event => {
    void handle(event.data as PanelToWorker);
});

async function handle(message: PanelToWorker): Promise<void> {
    try {
        const source =
            message.command === 'formatUrl'
                ? await read(message.url, message.id)
                : TextStore.from(message.text);

        post({ id: message.id, command: 'progress', stage: 'formatting', bytes: source.length });

        const { value, diagnostics } = parseInto(source, new PrettySink({ indent: message.indent }));
        const lines = value.lines.serialize();

        post(
            {
                id: message.id,
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
                lines.keyLengths.buffer
            ]
        );
    } catch (error) {
        post({
            id: message.id,
            command: 'failed',
            message: error instanceof Error ? error.message : 'Could not read the document'
        });
    }
}

/**
 * Streams a document in, reporting progress as it arrives.
 *
 * Decoded a piece at a time so the text is never held twice, and so a large
 * file starts producing output before it has finished downloading.
 */
async function read(url: string, id: number): Promise<TextStore> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Could not read the file (${response.status})`);
    }

    const store = new TextStore();

    if (!response.body) {
        store.append(await response.text());
        store.seal();
        return store;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let bytes = 0;
    let sinceReport = 0;

    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        // `stream: true` holds back a partial character at the end of a chunk
        // rather than emitting a replacement character for it.
        store.append(decoder.decode(value, { stream: true }));
        bytes += value.byteLength;
        sinceReport += value.byteLength;

        if (sinceReport > 4 << 20) {
            sinceReport = 0;
            post({ id, command: 'progress', stage: 'reading', bytes });
        }
    }

    store.append(decoder.decode());
    store.seal();
    return store;
}

function post(message: WorkerToPanel, transfer: Transferable[] = []): void {
    self.postMessage(message, transfer);
}

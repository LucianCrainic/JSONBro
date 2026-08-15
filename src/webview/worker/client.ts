/**
 * The panel's side of the document worker.
 *
 * Wraps postMessage in a promise, and falls back to formatting in place when
 * a worker cannot be started -- the panel should still work if the script
 * fails to load, just without the responsiveness.
 */
import type { Diagnostic } from '../engine/diagnostics';
import { LineTable } from '../engine/line-index';
import { PrettySink, type PrettyDocument } from '../engine/pretty-sink';
import { parseInto } from '../engine/recovering-parser';
import { TextStore } from '../engine/text-store';
import type { PanelToWorker, WorkerToPanel } from '../../shared/worker-messages';

export interface FormatOutcome {
    doc: PrettyDocument;
    diagnostics: Diagnostic[];
    sourceLength: number;
}

/** A formatting request without the id the client assigns to it. */
type Request = Omit<Extract<PanelToWorker, { command: 'formatText' }>, 'id'>;

export interface FormatRequest {
    indent: number;
    onProgress?: (stage: 'reading' | 'formatting', bytes: number) => void;
}

export class DocumentWorkerClient {
    private worker: Worker | null = null;
    /** In flight while the bundle is being fetched, so one start is shared. */
    private starting: Promise<Worker | null> | null = null;
    /** Held until teardown; see startWorker for why it is not revoked sooner. */
    private blobUrl: string | null = null;
    private nextId = 1;
    private readonly pending = new Map<
        number,
        {
            resolve: (outcome: FormatOutcome) => void;
            reject: (error: Error) => void;
            onProgress?: FormatRequest['onProgress'];
        }
    >();

    /** Where the worker script lives, published by the host in the markup. */
    private readonly scriptUrl: string | null;

    constructor(scriptUrl: string | null) {
        this.scriptUrl = scriptUrl;
    }

    public get available(): boolean {
        return this.scriptUrl !== null && typeof Worker !== 'undefined';
    }

    public formatText(text: string, request: FormatRequest): Promise<FormatOutcome> {
        return this.send({ command: 'formatText', text, indent: request.indent }, request);
    }

    /**
     * Reads a file here and formats it in the worker.
     *
     * The reading cannot happen in the worker. Webview resources are served by
     * a service worker, and the document worker is started from a blob: URL,
     * which puts it outside that service worker's scope -- its request for the
     * file is never answered and eventually times out. This document is inside
     * the scope, so it does the fetch and transfers the bytes across a chunk at
     * a time, which keeps the assembled text off this thread.
     */
    public async formatUrl(url: string, request: FormatRequest): Promise<FormatOutcome> {
        const worker = await this.ensureWorker();
        if (!worker) {
            throw new Error('Reading a file needs a worker, which could not be started.');
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Could not read the file (${response.status})`);
        }

        const id = this.nextId++;
        const outcome = new Promise<FormatOutcome>((resolve, reject) => {
            this.pending.set(id, { resolve, reject, onProgress: request.onProgress });
        });

        worker.postMessage({ id, command: 'readStart', indent: request.indent } as PanelToWorker);
        await this.streamTo(worker, id, response, request);
        worker.postMessage({ id, command: 'readEnd' } as PanelToWorker);

        return outcome;
    }

    /** Hands the body over chunk by chunk, reporting how much has arrived. */
    private async streamTo(
        worker: Worker,
        id: number,
        response: Response,
        request: FormatRequest
    ): Promise<void> {
        const send = (bytes: ArrayBuffer) =>
            worker.postMessage({ id, command: 'readChunk', bytes } as PanelToWorker, [bytes]);

        if (!response.body) {
            send(await response.arrayBuffer());
            return;
        }

        const reader = response.body.getReader();
        let total = 0;
        let sinceReport = 0;

        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            total += value.byteLength;
            sinceReport += value.byteLength;
            // Detached by the transfer, so the slice is what gets handed over
            // rather than the reader's own buffer.
            send(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));

            if (sinceReport > 4 << 20) {
                sinceReport = 0;
                request.onProgress?.('reading', total);
            }
        }
    }

    private async send(message: Request, request: FormatRequest): Promise<FormatOutcome> {
        const worker = await this.ensureWorker();

        // No worker: do the work here rather than refusing outright. Only
        // reading a file has nowhere else to run, and that path never gets here.
        if (!worker) {
            return formatHere(message.text, request.indent);
        }

        const id = this.nextId++;
        return new Promise<FormatOutcome>((resolve, reject) => {
            this.pending.set(id, { resolve, reject, onProgress: request.onProgress });
            worker.postMessage({ ...message, id } as PanelToWorker);
        });
    }

    private ensureWorker(): Promise<Worker | null> {
        if (this.worker) {
            return Promise.resolve(this.worker);
        }
        if (!this.available) {
            return Promise.resolve(null);
        }

        // One start, however many requests arrive while it is in flight.
        this.starting ??= this.startWorker();
        return this.starting;
    }

    /**
     * Fetches the worker bundle and starts it from a blob: URL.
     *
     * The obvious `new Worker(scriptUrl)` cannot work here. The panel document
     * is served from `vscode-webview://<id>` while its resources come from
     * `https://<...>.vscode-cdn.net`, and the Worker constructor requires the
     * script to be same-origin with the document -- a rule the content security
     * policy cannot relax, however permissive `worker-src` is. Reading the
     * bundle over `fetch` and handing the constructor a blob: URL makes the
     * script same-origin, which is why the policy now allows blob: there.
     *
     * Failure is not fatal: the caller formats on this thread instead, and only
     * reading a file -- which has nowhere else to run -- reports an error.
     */
    private async startWorker(): Promise<Worker | null> {
        try {
            const response = await fetch(this.scriptUrl as string);
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`);
            }

            const source = await response.text();
            const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
            const worker = new Worker(blobUrl);

            worker.addEventListener('message', event => this.receive(event.data));
            worker.addEventListener('error', event => this.failAll(event.message));

            // Kept rather than revoked here: the script is fetched as the worker
            // starts, and revoking underneath that has been known to race.
            this.blobUrl = blobUrl;
            this.worker = worker;
            return worker;
        } catch (error) {
            console.error('Could not start the document worker:', error);
            this.worker = null;
            return null;
        }
    }

    /** Drops the worker and the blob backing it, so a later send can retry. */
    private teardown(): void {
        this.worker?.terminate();
        this.worker = null;
        this.starting = null;
        if (this.blobUrl) {
            URL.revokeObjectURL(this.blobUrl);
            this.blobUrl = null;
        }
    }

    private receive(message: WorkerToPanel): void {
        const entry = this.pending.get(message.id);
        if (!entry) {
            return;
        }

        switch (message.command) {
            case 'progress':
                entry.onProgress?.(message.stage, message.bytes);
                return;

            case 'done':
                this.pending.delete(message.id);
                entry.resolve({
                    doc: {
                        text: TextStore.fromChunks(message.chunks),
                        lines: LineTable.deserialize(message.lines)
                    },
                    diagnostics: message.diagnostics,
                    sourceLength: message.sourceLength
                });
                return;

            case 'failed':
                this.pending.delete(message.id);
                entry.reject(new Error(message.message));
                return;
        }
    }

    private failAll(reason: string): void {
        for (const [id, entry] of this.pending) {
            this.pending.delete(id);
            entry.reject(new Error(reason));
        }
        this.teardown();
    }

    public dispose(): void {
        this.teardown();
        this.pending.clear();
    }
}

/** The same work, on this thread, for when no worker is available. */
export function formatHere(text: string, indent: number): FormatOutcome {
    const { value, diagnostics } = parseInto(text, new PrettySink({ indent }));
    return { doc: value, diagnostics: [...diagnostics], sourceLength: text.length };
}

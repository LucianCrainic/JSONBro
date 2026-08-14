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

/** A request without the id the client assigns to it. */
type Request = DistributiveOmit<PanelToWorker, 'id'>;

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

export interface FormatRequest {
    indent: number;
    onProgress?: (stage: 'reading' | 'formatting', bytes: number) => void;
}

export class DocumentWorkerClient {
    private worker: Worker | null = null;
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

    public formatUrl(url: string, request: FormatRequest): Promise<FormatOutcome> {
        return this.send({ command: 'formatUrl', url, indent: request.indent }, request);
    }

    private send(message: Request, request: FormatRequest): Promise<FormatOutcome> {
        const worker = this.ensureWorker();

        if (!worker) {
            // No worker: do the work here rather than refusing outright.
            if (message.command === 'formatUrl') {
                return Promise.reject(
                    new Error('Reading a file needs a worker, which could not be started.')
                );
            }
            return Promise.resolve(formatHere(message.text, request.indent));
        }

        const id = this.nextId++;
        return new Promise<FormatOutcome>((resolve, reject) => {
            this.pending.set(id, { resolve, reject, onProgress: request.onProgress });
            worker.postMessage({ ...message, id } as PanelToWorker);
        });
    }

    private ensureWorker(): Worker | null {
        if (this.worker || !this.available) {
            return this.worker;
        }

        try {
            // Loaded from a webview resource URI: the content security policy
            // allows worker-src from that origin but not blob: URLs, which is
            // why the worker has its own bundle rather than being inlined.
            this.worker = new Worker(this.scriptUrl as string);
            this.worker.addEventListener('message', event => this.receive(event.data));
            this.worker.addEventListener('error', event => this.failAll(event.message));
        } catch (error) {
            console.error('Could not start the document worker:', error);
            this.worker = null;
        }

        return this.worker;
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
        this.worker?.terminate();
        this.worker = null;
    }

    public dispose(): void {
        this.worker?.terminate();
        this.worker = null;
        this.pending.clear();
    }
}

/** The same work, on this thread, for when no worker is available. */
export function formatHere(text: string, indent: number): FormatOutcome {
    const { value, diagnostics } = parseInto(text, new PrettySink({ indent }));
    return { doc: value, diagnostics: [...diagnostics], sourceLength: text.length };
}

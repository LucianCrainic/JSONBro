/**
 * Typed transport between the webview and the extension host.
 */
import type { HostToWebview, WebviewToHost } from '../../shared/messages';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

type Handler<K extends HostToWebview['command']> = (
    message: Extract<HostToWebview, { command: K }>
) => void;

/** Erased handler shape used for storage; the public API stays typed. */
type AnyHandler = (message: HostToWebview) => void;

export class Messenger {
    private vscode: ReturnType<typeof acquireVsCodeApi> | undefined;
    private handlers = new Map<string, AnyHandler[]>();

    constructor() {
        if (typeof acquireVsCodeApi !== 'undefined') {
            this.vscode = acquireVsCodeApi();
        }

        window.addEventListener('message', event => {
            const message = event.data as HostToWebview | undefined;
            if (!message || typeof message.command !== 'string') {
                return;
            }
            for (const handler of this.handlers.get(message.command) ?? []) {
                handler(message);
            }
        });
    }

    /** Registers a handler for one inbound command. */
    public on<K extends HostToWebview['command']>(command: K, handler: Handler<K>): void {
        const existing = this.handlers.get(command) ?? [];
        existing.push(handler as AnyHandler);
        this.handlers.set(command, existing);
    }

    public post(message: WebviewToHost): void {
        this.vscode?.postMessage(message);
    }

    /**
     * Tells the host the webview is listening.
     *
     * The host queues anything it wants to send before this arrives, which is
     * what lets "open a panel and immediately load history into it" work
     * without racing the webview's own startup.
     */
    public signalReady(): void {
        this.post({ command: 'ready' });
    }
}

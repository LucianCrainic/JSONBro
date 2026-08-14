/**
 * What the panel remembers across a reload.
 *
 * VS Code throws away a webview's DOM when its tab is hidden or the window
 * reloads, and rebuilds it from the HTML. Without this, everything a user had
 * pasted was simply gone.
 */
import type { PanelState } from '../shared/messages';

/**
 * Input larger than this is not saved.
 *
 * `setState` is serialised into VS Code's own storage on every change, so
 * keeping a very large document there would cost more than reformatting it is
 * worth -- and the panel would stall on every keystroke saving it.
 */
export const MAX_PERSISTED_INPUT = 512 * 1024;

interface VsCodeApi {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

/**
 * The panel's handle on VS Code.
 *
 * `acquireVsCodeApi` may only be called once per webview, so the result is
 * shared rather than acquired per user.
 */
let api: VsCodeApi | null = null;
let acquired = false;

export function vscodeApi(): VsCodeApi | null {
    if (!acquired) {
        acquired = true;
        try {
            api = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
        } catch {
            // Outside a webview -- tests and the preview harness.
            api = null;
        }
    }
    return api;
}

export class PanelStateStore {
    /** Coalesces the writes that a burst of typing would otherwise cause. */
    private pending: ReturnType<typeof setTimeout> | null = null;
    private next: PanelState | null = null;

    public read(): PanelState | null {
        const state = vscodeApi()?.getState();
        if (!state || typeof state !== 'object') {
            return null;
        }
        return state as PanelState;
    }

    public save(state: PanelState): void {
        this.next = trim(state);
        if (this.pending !== null) {
            return;
        }
        this.pending = setTimeout(() => {
            this.pending = null;
            if (this.next) {
                vscodeApi()?.setState(this.next);
                this.next = null;
            }
        }, 250);
    }

    /** Writes immediately, for when the panel is about to go away. */
    public flush(): void {
        if (this.pending !== null) {
            clearTimeout(this.pending);
            this.pending = null;
        }
        if (this.next) {
            vscodeApi()?.setState(this.next);
            this.next = null;
        }
    }

    public dispose(): void {
        this.flush();
    }
}

/** Drops anything too large to be worth carrying through a reload. */
function trim(state: PanelState): PanelState {
    const trimmed: PanelState = { mode: state.mode };

    for (const key of ['input', 'leftJson', 'rightJson'] as const) {
        const value = state[key];
        if (typeof value === 'string' && value.length <= MAX_PERSISTED_INPUT) {
            trimmed[key] = value;
        }
    }

    if (state.strict !== undefined) {
        trimmed.strict = state.strict;
    }
    if (state.showLineNumbers !== undefined) {
        trimmed.showLineNumbers = state.showLineNumbers;
    }

    return trimmed;
}

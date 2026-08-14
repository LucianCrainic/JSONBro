/**
 * Small DOM helpers.
 *
 * The webview does its own rendering with no framework, so these exist to keep
 * lookups and listener wiring terse and consistently typed.
 */

/** Looks up an element by id. Returns null when absent. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

/**
 * Looks up an element by id, throwing when it is missing.
 * Use for elements the markup always contains, so a typo fails loudly instead
 * of silently disabling a control.
 */
export function requireId<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id) as T | null;
    if (!element) {
        throw new Error(`JSONBro: expected an element with id "${id}"`);
    }
    return element;
}

/** Scoped querySelector. */
export function qs<T extends Element = Element>(
    selector: string,
    root: ParentNode = document
): T | null {
    return root.querySelector<T>(selector);
}

/** Scoped querySelectorAll, as a real array. */
export function qsa<T extends Element = Element>(
    selector: string,
    root: ParentNode = document
): T[] {
    return Array.from(root.querySelectorAll<T>(selector));
}

/**
 * Adds a listener and returns a function that removes it, so callers can tear
 * down cleanly rather than cloning nodes to drop handlers.
 */
export function on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Document | Window,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions
): () => void {
    target.addEventListener(type, handler as EventListener, options);
    return () => target.removeEventListener(type, handler as EventListener, options);
}

/**
 * Delegated listener: fires when the event originates inside a descendant
 * matching `selector`, with that descendant passed to the handler.
 */
export function delegate<K extends keyof HTMLElementEventMap>(
    root: HTMLElement,
    type: K,
    selector: string,
    handler: (match: HTMLElement, event: HTMLElementEventMap[K]) => void
): () => void {
    return on(root, type, event => {
        const origin = event.target as Element | null;
        const match = origin?.closest(selector) as HTMLElement | null;
        if (match && root.contains(match)) {
            handler(match, event);
        }
    });
}

/** Escapes a string for safe interpolation into innerHTML. */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

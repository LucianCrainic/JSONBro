/**
 * The message contract between the extension host and the webview.
 *
 * Imported by both bundles, so it must stay free of any node or DOM API --
 * types and plain constants only.
 */

/** Messages the webview sends to the extension host. */
export type WebviewToHost =
    /** Sent once the webview has wired up and can receive messages. */
    | { command: 'ready' }
    | { command: 'addFormatHistory'; json: string }
    | { command: 'addDiffHistory'; leftJson: string; rightJson: string }
    | { command: 'saveFormattedJson'; content: string }
    | { command: 'showError'; text: string }
    | { command: 'showInfo'; text: string };

/** Messages the extension host sends to the webview. */
export type HostToWebview =
    | { command: 'loadJson'; json: string }
    | { command: 'loadDiff'; leftJson: string; rightJson: string };

/** The two things the panel can be doing. */
export type Mode = 'format' | 'diff';

/** Resolution state of a single diff entry. */
export type DiffState = 'pending' | 'applied' | 'rejected';

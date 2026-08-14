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
    | { command: 'loadDiff'; leftJson: string; rightJson: string }
    | { command: 'settings'; settings: Settings };

/** The two things the panel can be doing. */
export type Mode = 'format' | 'diff';

/** Resolution state of a single diff entry. */
export type DiffState = 'pending' | 'applied' | 'rejected';

/** Which part of the document a search covers. */
export type SearchScopeSetting = 'all' | 'keys' | 'values';

/** The user's configuration, as the webview sees it. */
export interface Settings {
    showLineNumbers: boolean;
    indentSize: number;
    strictDiff: boolean;
    defaultPaneRatio: number;
    autoFormatOnPaste: boolean;
    searchScope: SearchScopeSetting;
    /** Above this many characters, the panel stops treating input as pasteable. */
    maxInlineSize: number;
    /** Above this, comparing is refused rather than attempted. */
    diffMaxDocumentSize: number;
    /** Ceiling on the quadratic array alignment pass. */
    diffArrayAlignBudget: number;
}

/**
 * What a panel restores itself to after a reload.
 *
 * Held by VS Code through `setState`, so it must stay small: the input text is
 * the bulk of it and large documents are dropped rather than stored.
 */
export interface PanelState {
    mode: Mode;
    input?: string;
    leftJson?: string;
    rightJson?: string;
    strict?: boolean;
    showLineNumbers?: boolean;
}

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
    /** Asks the host to choose a file to load into one side of the diff. */
    | { command: 'pickDiffFile'; side: DiffSide }
    | { command: 'showError'; text: string }
    | { command: 'showInfo'; text: string };

/** Which document of a comparison something refers to. */
export type DiffSide = 'left' | 'right';

/** Messages the extension host sends to the webview. */
export type HostToWebview =
    | { command: 'loadJson'; json: string }
    | { command: 'loadDiff'; leftJson: string; rightJson: string }
    | { command: 'settings'; settings: Settings }
    /** Format a file the panel's worker should read for itself. */
    | { command: 'openUrl'; url: string; label: string }
    /** Put a document into one side of the comparison. */
    | { command: 'loadDiffSide'; side: DiffSide; json: string; label: string }
    /** JSON syntax colours read from the user's active colour theme. */
    | { command: 'themeColors'; colors: SyntaxColors };

/**
 * The colour of each part of a JSON document, as the active theme paints it.
 *
 * Every field is optional: a theme that says nothing about a role leaves it to
 * the colour JSONBro contributes for it.
 */
export interface SyntaxColors {
    key?: string;
    string?: string;
    number?: string;
    boolean?: string;
    null?: string;
    punctuation?: string;
}

/**
 * The kinds of panel the host can open.
 *
 * Narrower than `Mode`: the tree is a way of looking at a document rather than
 * a panel of its own, so it is reached from inside a format panel.
 */
export type PanelKind = 'format' | 'diff';

/** The three things a panel can be showing. */
export type Mode = PanelKind | 'tree';

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
    /** Colour JSON the way the active theme colours it in the editor. */
    matchEditorTheme: boolean;
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

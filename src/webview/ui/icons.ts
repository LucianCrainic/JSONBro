/**
 * Icon vocabulary.
 *
 * Every icon used in the webview is named here once, so the same glyph is never
 * hand-drawn twice and swapping one is a single-line change. Names are codicon
 * identifiers -- see https://microsoft.github.io/vscode-codicons/dist/codicon.html
 */

export const Icons = {
    // Modes and primary actions
    format: 'json',
    diff: 'git-compare',
    run: 'play',
    strict: 'shield',

    // Toolbar
    search: 'search',
    copy: 'copy',
    save: 'save',
    clear: 'clear-all',
    lineNumbers: 'list-ordered',
    help: 'question',

    // Panes
    maximize: 'screen-full',
    restore: 'screen-normal',

    // Find widget
    matchCase: 'case-sensitive',
    regex: 'regex',
    wholeWord: 'whole-word',
    previous: 'arrow-up',
    next: 'arrow-down',
    close: 'close',

    // Diff results
    added: 'diff-added',
    removed: 'diff-removed',
    modified: 'diff-modified',
    apply: 'check',
    reject: 'close',
    undo: 'discard',
    applyAll: 'check-all',
    expand: 'ellipsis',

    // Status and feedback
    valid: 'pass',
    warning: 'warning',
    error: 'error',
    arrowRight: 'arrow-right',

    // Folding
    chevronDown: 'chevron-down',
    chevronRight: 'chevron-right',
    /** Shown while the document worker is reading or formatting. */
    sync: 'sync'
} as const;

export type IconName = typeof Icons[keyof typeof Icons];

/**
 * Renders an icon as an HTML string.
 *
 * Icons are decorative -- the accessible name belongs on the surrounding
 * control -- so they are hidden from assistive technology by default.
 */
export function icon(name: IconName, extraClass = ''): string {
    const classes = ['codicon', `codicon-${name}`, extraClass].filter(Boolean).join(' ');
    return `<span class="${classes}" aria-hidden="true"></span>`;
}

/** Renders an icon as a live element, for code that builds DOM directly. */
export function iconElement(name: IconName, extraClass = ''): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = ['codicon', `codicon-${name}`, extraClass].filter(Boolean).join(' ');
    span.setAttribute('aria-hidden', 'true');
    return span;
}

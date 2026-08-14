/**
 * Generates webview HTML content.
 *
 * Styles live in media/*.css and are linked as webview resources; this file is
 * responsible only for the document shell, the CSP and the body markup.
 */
import * as vscode from 'vscode';
import * as crypto from 'crypto';

/** Stylesheets, in cascade order. tokens must come first. */
const STYLESHEETS = [
    'tokens.css',
    'base.css',
    'components.css',
    'format.css',
    'diff.css'
];

export class WebviewContentGenerator {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Generates the complete HTML content for the webview
     */
    public getWebviewContent(webview: vscode.Webview, mode: 'format' | 'diff' = 'format'): string {
        const nonce = this.getNonce();
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'main.js')
        );

        const title = mode === 'format' ? 'JSONBro - Format JSON' : 'JSONBro - Diff JSON';

        // No 'unsafe-inline': the markup below carries no style attributes, and
        // mode visibility is driven by data-mode on <body> instead.
        const csp = [
            `default-src 'none'`,
            `style-src ${webview.cspSource}`,
            `font-src ${webview.cspSource}`,
            `img-src ${webview.cspSource} data:`,
            `script-src 'nonce-${nonce}'`
        ].join('; ');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    ${this.getStyleLinks(webview)}
</head>
<body data-mode="${mode}">
    ${this.getBodyContent(mode)}
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * Builds the <link> tags for the codicon font and every JSONBro stylesheet.
     */
    private getStyleLinks(webview: vscode.Webview): string {
        const mediaUri = (...segments: string[]) =>
            webview.asWebviewUri(
                vscode.Uri.joinPath(this.context.extensionUri, 'media', ...segments)
            );

        const links = [
            `<link rel="stylesheet" href="${mediaUri('codicons', 'codicon.css')}">`,
            ...STYLESHEETS.map(name => `<link rel="stylesheet" href="${mediaUri(name)}">`)
        ];

        return links.join('\n    ');
    }

    private getBodyContent(mode: 'format' | 'diff' = 'format'): string {
        return `
            <div id="toolbar">
                <div class="toolbar__group">
                    <div id="mode-switcher" role="tablist" aria-label="View">
                        ${this.modeTab('format-mode', 'json', 'Format', mode === 'format')}
                        ${this.modeTab('diff-mode', 'git-compare', 'Diff', mode === 'diff')}
                    </div>
                    <button id="action-btn" class="btn btn--primary" title="${
                        mode === 'format' ? 'Format JSON' : 'Compare JSON'
                    }">
                        <span class="codicon codicon-play" aria-hidden="true"></span>
                        <span id="action-text">${mode === 'format' ? 'Format' : 'Compare'}</span>
                    </button>
                    ${this.iconButton({
                        id: 'strict-diff-toggle',
                        icon: 'shield',
                        label: 'Strict mode',
                        title: 'Strict diff: only compare keys present in the original',
                        attrs: 'data-mode-only="diff" aria-pressed="false"'
                    })}
                </div>
                <div class="toolbar__group">
                    ${this.iconButton({
                        id: 'search-toggle',
                        icon: 'search',
                        label: 'Find',
                        title: 'Find in formatted JSON (Ctrl/Cmd+F)',
                        attrs: 'data-mode-only="format"'
                    })}
                    ${this.iconButton({ id: 'copy', icon: 'copy', label: 'Copy', title: 'Copy to clipboard' })}
                    ${this.iconButton({
                        id: 'save',
                        icon: 'save',
                        label: 'Save',
                        title: 'Save to a file',
                        attrs: 'data-mode-only="format"'
                    })}
                    ${this.iconButton({ id: 'clear', icon: 'clear-all', label: 'Clear', title: 'Clear (Ctrl/Cmd+K)' })}
                </div>
            </div>

            <div id="format-container" class="mode-container">
                <section id="input-panel" class="pane">
                    ${this.paneHeader('Input', [
                        this.maximizeButton('input-panel')
                    ])}
                    <div class="pane__body">
                        <textarea id="input" spellcheck="false" placeholder="Paste or type JSON here"></textarea>
                    </div>
                </section>
                <div id="splitter" class="splitter" role="separator" aria-orientation="vertical" title="Drag to resize, double-click to reset"></div>
                <section id="output-panel" class="pane" data-empty="true">
                    ${this.paneHeader('Formatted', [
                        this.iconButton({
                            id: 'line-numbers-toggle',
                            icon: 'list-ordered',
                            label: 'Toggle line numbers',
                            title: 'Toggle line numbers',
                            classes: 'is-active',
                            attrs: 'aria-pressed="true"'
                        }),
                        this.maximizeButton('output-panel')
                    ], 'output-meta')}
                    <div class="pane__body">
                        <section id="problems" class="problems" role="status" hidden>
                            <button type="button" id="problems-toggle" class="problems__summary" aria-expanded="false" aria-controls="problems-list">
                                <span class="codicon codicon-chevron-right problems__chevron" aria-hidden="true"></span>
                                <span class="codicon problems__icon" aria-hidden="true"></span>
                                <span id="problems-title" class="problems__title"></span>
                            </button>
                            <ol id="problems-list" class="problems__list" hidden></ol>
                        </section>
                        <div id="find-widget" class="find-widget" role="search" hidden>
                            <div class="find-widget__row">
                                <div class="find-widget__field">
                                    <input type="text" id="find-input" placeholder="Find" spellcheck="false" aria-label="Find in formatted JSON" />
                                    ${this.iconButton({
                                        id: 'find-match-case',
                                        icon: 'case-sensitive',
                                        label: 'Match case',
                                        title: 'Match case',
                                        classes: 'find-option',
                                        attrs: 'data-find-option="matchCase" aria-pressed="false"'
                                    })}
                                    ${this.iconButton({
                                        id: 'find-regex',
                                        icon: 'regex',
                                        label: 'Use regular expression',
                                        title: 'Use regular expression',
                                        classes: 'find-option',
                                        attrs: 'data-find-option="regex" aria-pressed="false"'
                                    })}
                                </div>
                                <span id="find-count" class="find-widget__count" role="status"></span>
                                ${this.iconButton({ id: 'find-prev', icon: 'arrow-up', label: 'Previous match', title: 'Previous match (Shift+Enter)' })}
                                ${this.iconButton({ id: 'find-next', icon: 'arrow-down', label: 'Next match', title: 'Next match (Enter)' })}
                                ${this.iconButton({ id: 'find-close', icon: 'close', label: 'Close find', title: 'Close (Escape)' })}
                            </div>
                            <div class="find-widget__scopes" role="group" aria-label="Search scope">
                                <button type="button" class="find-scope is-active" data-find-scope="all" aria-pressed="true">All</button>
                                <button type="button" class="find-scope" data-find-scope="keys" aria-pressed="false">Keys</button>
                                <button type="button" class="find-scope" data-find-scope="values" aria-pressed="false">Values</button>
                            </div>
                        </div>
                        <div id="output" class="pane__content"></div>
                        <div class="empty-state">
                            <span class="codicon codicon-json empty-state__icon" aria-hidden="true"></span>
                            <span class="empty-state__title">Paste JSON on the left to format it</span>
                            <dl class="empty-state__keys">
                                <dt><kbd data-mod></kbd> <kbd>&#9166;</kbd></dt><dd>Format</dd>
                                <dt><kbd data-mod></kbd> <kbd>F</kbd></dt><dd>Find</dd>
                                <dt><kbd data-mod></kbd> <kbd>M</kbd></dt><dd>Switch to Diff</dd>
                            </dl>
                        </div>
                    </div>
                </section>
            </div>

            <div id="diff-container" class="mode-container">
                <section id="left-json-panel" class="pane">
                    ${this.paneHeader('Original', [
                        this.iconButton({ id: 'copy-left-json', icon: 'copy', label: 'Copy original', title: 'Copy original to clipboard' }),
                        this.iconButton({ id: 'clear-left-json', icon: 'clear-all', label: 'Clear original', title: 'Clear original' }),
                        this.maximizeButton('left-json-panel')
                    ])}
                    <div class="pane__body">
                        <textarea id="left-json" spellcheck="false" placeholder="Paste the original JSON here"></textarea>
                    </div>
                </section>
                <div id="diff-splitter-left" class="splitter" role="separator" aria-orientation="vertical" title="Drag to resize, double-click to reset"></div>
                <section id="diff-result-panel" class="pane">
                    ${this.paneHeader('Changes', [
                        this.iconButton({ id: 'apply-all-diffs', icon: 'check-all', label: 'Apply all changes', title: 'Apply every change to the original', attrs: 'hidden' }),
                        this.iconButton({ id: 'reject-all-diffs', icon: 'close-all', label: 'Reject all changes', title: 'Reject every change', attrs: 'hidden' }),
                        this.maximizeButton('diff-result-panel')
                    ], 'diff-meta')}
                    <div class="pane__body">
                        <div id="diff-filters" class="chips" role="group" aria-label="Filter changes" hidden>
                            ${this.filterChip('all', 'All')}
                            ${this.filterChip('added', 'Added', 'added')}
                            ${this.filterChip('removed', 'Removed', 'removed')}
                            ${this.filterChip('modified', 'Modified', 'modified')}
                        </div>
                        <div id="diff-output" class="pane__content"></div>
                    </div>
                </section>
                <div id="diff-splitter-right" class="splitter" role="separator" aria-orientation="vertical" title="Drag to resize, double-click to reset"></div>
                <section id="right-json-panel" class="pane">
                    ${this.paneHeader('Modified', [
                        this.iconButton({ id: 'clear-right-json', icon: 'clear-all', label: 'Clear modified', title: 'Clear modified' }),
                        this.maximizeButton('right-json-panel')
                    ])}
                    <div class="pane__body">
                        <textarea id="right-json" spellcheck="false" placeholder="Paste the modified JSON here"></textarea>
                    </div>
                </section>
            </div>

            <footer id="status-bar">
                <div class="status__group" id="status-left"></div>
                <div class="status__group" id="status-right"></div>
            </footer>
        `;
    }

    /** A tab in the Format/Diff switcher. */
    private modeTab(id: string, icon: string, label: string, active: boolean): string {
        return `<button id="${id}" class="mode-tab${active ? ' active' : ''}" role="tab" aria-selected="${active}">
                            <span class="codicon codicon-${icon}" aria-hidden="true"></span>
                            ${label}
                        </button>`;
    }

    /**
     * Pane title bar. Actions live here rather than floating over the content,
     * so adding one is appending to a flex row instead of picking a new offset.
     */
    private paneHeader(title: string, actions: string[], metaId?: string): string {
        const meta = metaId ? `<span class="pane__meta" id="${metaId}"></span>` : '';
        return `<header class="pane__header">
                        <span class="pane__title">${title}</span>
                        ${meta}
                        <span class="pane__spacer"></span>
                        <div class="pane__actions">${actions.join('')}</div>
                    </header>`;
    }

    /** A chip that narrows the change list to one kind of change. */
    private filterChip(filter: string, label: string, tone = ''): string {
        const classes = ['chip', tone ? `chip--${tone}` : '', filter === 'all' ? 'is-active' : '']
            .filter(Boolean)
            .join(' ');
        return `<button type="button" class="${classes}" data-diff-filter="${filter}" aria-pressed="${filter === 'all'}">
                                <span class="chip__label">${label}</span><span class="chip__count"></span>
                            </button>`;
    }

    private maximizeButton(panelId: string): string {
        return this.iconButton({
            icon: 'screen-full',
            label: 'Maximize panel',
            title: 'Maximize panel',
            attrs: `data-maximize="${panelId}"`
        });
    }

    /**
     * Icon-only button. The visible label is the icon, so the accessible name
     * comes from aria-label and the icon itself is hidden from assistive tech.
     */
    private iconButton(options: {
        id?: string;
        icon: string;
        label: string;
        title: string;
        classes?: string;
        attrs?: string;
    }): string {
        const id = options.id ? ` id="${options.id}"` : '';
        const classes = ['icon-btn', options.classes].filter(Boolean).join(' ');
        const attrs = options.attrs ? ` ${options.attrs}` : '';
        return `<button${id} class="${classes}" type="button" title="${options.title}" aria-label="${options.label}"${attrs}><span class="codicon codicon-${options.icon}" aria-hidden="true"></span></button>`;
    }

    private getNonce(): string {
        return crypto.randomBytes(24).toString('base64');
    }
}

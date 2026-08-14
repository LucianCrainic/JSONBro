/**
 * Generates webview HTML content.
 *
 * Styles live in media/*.css and are linked as webview resources; this file is
 * responsible only for the document shell, the CSP and the body markup.
 */
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { PanelKind } from './shared/messages';

/** Stylesheets, in cascade order. tokens must come first. */
const STYLESHEETS = [
    'tokens.css',
    'base.css',
    'components.css',
    'format.css',
    'diff.css',
    'visual.css'
];

export class WebviewContentGenerator {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Generates the complete HTML content for the webview
     */
    public getWebviewContent(webview: vscode.Webview, mode: PanelKind = 'format'): string {
        const nonce = this.getNonce();
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'main.js')
        );
        const workerUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'worker.js')
        );

        // Both panels are the same product, and VS Code shows this as the tab
        // name -- a mode suffix there just makes the tab harder to scan.
        const title = 'JSON Bro';

        // No 'unsafe-inline': the markup below carries no style attributes, and
        // mode visibility is driven by data-mode on <body> instead.
        // worker-src and connect-src let the document worker load and read a
        // file the host has made available. Neither allows blob:, which is why
        // the worker is a real bundle rather than an inlined script.
        const csp = [
            `default-src 'none'`,
            `style-src ${webview.cspSource}`,
            `font-src ${webview.cspSource}`,
            `img-src ${webview.cspSource} data:`,
            `script-src 'nonce-${nonce}' ${webview.cspSource}`,
            `worker-src ${webview.cspSource}`,
            `connect-src ${webview.cspSource}`
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
<body data-mode="${mode}" data-worker-src="${workerUri}">
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

    private getBodyContent(mode: PanelKind = 'format'): string {
        return `
            <div id="toolbar">
                <div class="toolbar__group">
                    <div id="mode-switcher" role="tablist" aria-label="View">
                        ${this.modeTab(
                            'format-mode',
                            'json',
                            'Format',
                            mode === 'format',
                            'Format and inspect one document'
                        )}
                        ${this.modeTab(
                            'visual-mode',
                            'type-hierarchy',
                            'Visual',
                            false,
                            'Draw the same document as a tree or a graph'
                        )}
                        ${this.modeTab(
                            'diff-mode',
                            'git-compare',
                            'Diff',
                            mode === 'diff',
                            'Compare two documents'
                        )}
                    </div>
                    <button id="action-btn" class="btn btn--primary"${this.tip(
                        mode === 'format' ? 'Format JSON' : 'Compare JSON',
                        'mod+enter'
                    )}>
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
                        title: 'Find in formatted JSON',
                        key: 'mod+f',
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
                    ${this.iconButton({
                        id: 'clear',
                        icon: 'clear-all',
                        label: 'Clear',
                        title: 'Clear',
                        key: 'mod+k'
                    })}
                </div>
            </div>

            <div id="format-container" class="mode-container">
                <section id="input-panel" class="pane">
                    ${this.paneHeader(
                        'Input',
                        [this.maximizeButton('input-panel')],
                        'input-meta'
                    )}
                    <div class="pane__body">
                        <textarea id="input" spellcheck="false" aria-label="JSON to format" placeholder="Paste or type JSON here" data-mode-only="format"></textarea>
                        <div id="input-view" class="pane__content doc-view" data-mode-only="visual"></div>
                    </div>
                </section>
                <div id="splitter" class="splitter" role="separator" aria-orientation="vertical" data-tip="Drag to resize, double-click to reset"></div>
                <section id="output-panel" class="pane" data-empty="true" data-mode-only="format">
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
                            <button type="button" id="problems-toggle" class="problems__summary" aria-expanded="false" aria-controls="problems-list" data-tip="Show what was repaired while parsing">
                                <span class="codicon codicon-chevron-right problems__chevron" aria-hidden="true"></span>
                                <span class="codicon problems__icon" aria-hidden="true"></span>
                                <span id="problems-title" class="problems__title"></span>
                            </button>
                            <ol id="problems-list" class="problems__list" hidden></ol>
                        </section>
                        <div id="find-widget" class="find-widget" role="search" hidden>
                            <div class="find-widget__row">
                                <div class="find-widget__field">
                                    <input type="text" id="find-input" placeholder="Find" spellcheck="false" aria-label="Find in formatted JSON" data-tip="Search the formatted output" />
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
                                ${this.iconButton({ id: 'find-prev', icon: 'arrow-up', label: 'Previous match', title: 'Previous match', key: 'shift+enter' })}
                                ${this.iconButton({ id: 'find-next', icon: 'arrow-down', label: 'Next match', title: 'Next match', key: 'enter' })}
                                ${this.iconButton({ id: 'find-close', icon: 'close', label: 'Close find', title: 'Close find', key: 'escape' })}
                            </div>
                            <div class="find-widget__scopes" role="group" aria-label="Search scope">
                                ${this.findScope('all', 'All', 'Search keys and values')}
                                ${this.findScope('keys', 'Keys', 'Search property names only')}
                                ${this.findScope('values', 'Values', 'Search values only')}
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
                <section id="visual-panel" class="pane" data-empty data-shape="tree" data-mode-only="visual">
                    ${this.paneHeader(
                        'Visual',
                        [
                            this.shapeButton('tree', 'list-tree', 'Tree', 'Show an indented tree'),
                            this.shapeButton('graph', 'type-hierarchy', 'Graph', 'Show boxes and links'),
                            this.iconButton({
                                id: 'visual-expand-depth',
                                icon: 'list-selection',
                                label: 'Expand two levels',
                                title: 'Collapse everything below the second level'
                            }),
                            this.iconButton({
                                id: 'visual-expand-all',
                                icon: 'expand-all',
                                label: 'Expand all',
                                title: 'Expand every node'
                            }),
                            this.iconButton({
                                id: 'visual-collapse-all',
                                icon: 'collapse-all',
                                label: 'Collapse all',
                                title: 'Collapse every node'
                            }),
                            this.iconButton({
                                id: 'graph-zoom-out',
                                icon: 'zoom-out',
                                label: 'Zoom out',
                                title: 'Zoom out',
                                attrs: 'data-shape-only="graph"'
                            }),
                            this.iconButton({
                                id: 'graph-zoom-reset',
                                icon: 'screen-normal',
                                label: 'Reset the view',
                                title: 'Back to the starting zoom and position',
                                attrs: 'data-shape-only="graph"'
                            }),
                            this.iconButton({
                                id: 'graph-zoom-in',
                                icon: 'zoom-in',
                                label: 'Zoom in',
                                title: 'Zoom in',
                                attrs: 'data-shape-only="graph"'
                            }),
                            this.iconButton({
                                id: 'visual-copy-path',
                                icon: 'symbol-key',
                                label: 'Copy path',
                                title: 'Copy the path of the selected node'
                            }),
                            this.iconButton({
                                id: 'visual-copy-value',
                                icon: 'copy',
                                label: 'Copy value',
                                title: 'Copy the value of the selected node'
                            }),
                            this.iconButton({
                                id: 'visual-copy-subtree',
                                icon: 'list-tree',
                                label: 'Copy subtree',
                                title: 'Copy the selected node and everything under it'
                            }),
                            this.maximizeButton('visual-panel')
                        ],
                        'visual-meta'
                    )}
                    <div class="pane__body">
                        <nav id="visual-breadcrumb" class="breadcrumb" aria-label="Selected node"></nav>
                        <div id="tree-output" class="pane__content" role="tree" tabindex="0"></div>
                        <div id="graph-output" class="graph-viewport" tabindex="0"></div>
                        <div class="empty-state">
                            <span class="codicon codicon-type-hierarchy empty-state__icon" aria-hidden="true"></span>
                            <span class="empty-state__title">Paste JSON on the left to draw it</span>
                            <dl class="empty-state__keys">
                                <dt><kbd data-mod></kbd> <kbd>&#9166;</kbd></dt><dd>Build</dd>
                                <dt><kbd>&#8593;</kbd> <kbd>&#8595;</kbd></dt><dd>Move between nodes</dd>
                                <dt><kbd>&#8592;</kbd> <kbd>&#8594;</kbd></dt><dd>Collapse and expand</dd>
                            </dl>
                        </div>
                    </div>
                </section>
            </div>

            <div id="diff-container" class="mode-container">
                ${this.diffInputPane('left', 'Original', [
                    this.iconButton({ id: 'copy-left-json', icon: 'copy', label: 'Copy original', title: 'Copy original to clipboard' }),
                    this.iconButton({
                        id: 'save-left-json',
                        icon: 'save',
                        label: 'Save original',
                        title: 'Save the original, with every applied change, to a file'
                    }),
                    this.iconButton({ id: 'clear-left-json', icon: 'clear-all', label: 'Clear original', title: 'Clear original' })
                ])}
                <div id="diff-splitter-left" class="splitter" role="separator" aria-orientation="vertical" data-tip="Drag to resize, double-click to reset"></div>
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
                <div id="diff-splitter-right" class="splitter" role="separator" aria-orientation="vertical" data-tip="Drag to resize, double-click to reset"></div>
                ${this.diffInputPane('right', 'Modified', [
                    this.iconButton({ id: 'copy-right-json', icon: 'copy', label: 'Copy modified', title: 'Copy modified to clipboard' }),
                    this.iconButton({ id: 'clear-right-json', icon: 'clear-all', label: 'Clear modified', title: 'Clear modified' })
                ])}
            </div>

            <footer id="status-bar">
                <div class="status__group" id="status-left"></div>
                <div class="status__group" id="status-right"></div>
            </footer>
        `;
    }

    /**
     * One side of the comparison.
     *
     * The pane holds both a textarea and a rendered view of the same document
     * and shows one at a time, chosen by `data-view` on the section. Comparing
     * switches both sides to the rendered view, which is where the syntax
     * colouring, the gutter and folding come from -- the panes used to be bare
     * textareas with none of it.
     */
    private diffInputPane(side: 'left' | 'right', title: string, actions: string[]): string {
        const label = title.toLowerCase();
        const header = this.paneHeader(
            title,
            [
                this.iconButton({
                    id: `format-${side}-json`,
                    icon: 'json',
                    label: `Format ${label}`,
                    title: `Format the ${label} document`
                }),
                this.iconButton({
                    id: `open-${side}-json`,
                    icon: 'go-to-file',
                    label: `Open a file as the ${label}`,
                    title: `Open a file as the ${label}`
                }),
                this.iconButton({
                    id: `edit-${side}-json`,
                    icon: 'edit',
                    label: `Edit ${label}`,
                    title: `Edit the ${label} document`
                }),
                ...actions,
                this.maximizeButton(`${side}-json-panel`)
            ],
            `${side}-json-meta`
        );

        return `<section id="${side}-json-panel" class="pane" data-view="edit">
                    ${header}
                    <div class="pane__body">
                        <textarea id="${side}-json" spellcheck="false" aria-label="${title} JSON" placeholder="Paste the ${label} JSON here"></textarea>
                        <div id="${side}-json-view" class="pane__content doc-view"></div>
                    </div>
                </section>`;
    }

    /** Picks how the visual view draws the document. */
    private shapeButton(shape: string, icon: string, label: string, title: string): string {
        return this.iconButton({
            icon,
            label,
            title,
            classes: `shape-btn${shape === 'tree' ? ' is-active' : ''}`,
            attrs: `data-visual-shape="${shape}" aria-pressed="${shape === 'tree'}"`
        });
    }

    /** A tab in the Format/Diff switcher. */
    private modeTab(
        id: string,
        icon: string,
        label: string,
        active: boolean,
        tip: string
    ): string {
        return `<button id="${id}" class="mode-tab${
            active ? ' active' : ''
        }" role="tab" aria-selected="${active}"${this.tip(tip, 'mod+m')}>
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
        const tip =
            filter === 'all' ? 'Show every change' : `Show only ${label.toLowerCase()} changes`;
        return `<button type="button" class="${classes}" data-diff-filter="${filter}" aria-pressed="${
            filter === 'all'
        }"${this.tip(tip)}>
                                <span class="chip__label">${label}</span><span class="chip__count"></span>
                            </button>`;
    }

    /** A button that narrows the find to keys, values or both. */
    private findScope(scope: string, label: string, tip: string): string {
        const active = scope === 'all';
        return `<button type="button" class="find-scope${
            active ? ' is-active' : ''
        }" data-find-scope="${scope}" aria-pressed="${active}"${this.tip(tip)}>${label}</button>`;
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
     *
     * Hover text is `data-tip`, not `title`: the panel draws its own tooltips
     * so they appear promptly, stay inside the webview's bounds and can show a
     * keyboard shortcut. Emitting both would render two tooltips at once.
     */
    private iconButton(options: {
        id?: string;
        icon: string;
        label: string;
        title: string;
        /** Shortcut spelled as `mod+enter`, `shift+enter`, `escape`. */
        key?: string;
        classes?: string;
        attrs?: string;
    }): string {
        const id = options.id ? ` id="${options.id}"` : '';
        const classes = ['icon-btn', options.classes].filter(Boolean).join(' ');
        const attrs = options.attrs ? ` ${options.attrs}` : '';
        return `<button${id} class="${classes}" type="button"${this.tip(options.title, options.key)} aria-label="${options.label}"${attrs}><span class="codicon codicon-${options.icon}" aria-hidden="true"></span></button>`;
    }

    /** The tooltip attributes for any control. */
    private tip(text: string, key?: string): string {
        return ` data-tip="${text}"${key ? ` data-tip-key="${key}"` : ''}`;
    }

    private getNonce(): string {
        return crypto.randomBytes(24).toString('base64');
    }
}

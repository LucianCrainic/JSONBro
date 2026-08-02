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
                <div id="toolbar-left">
                    <div id="mode-switcher">
                        <button id="format-mode" class="mode-btn ${mode === 'format' ? 'active' : ''}" title="Format JSON">
                            <svg class="icon" viewBox="0 0 24 24">
                                <polyline points="16,18 22,12 16,6"></polyline>
                                <polyline points="8,6 2,12 8,18"></polyline>
                            </svg>
                            Format
                        </button>
                        <button id="diff-mode" class="mode-btn ${mode === 'diff' ? 'active' : ''}" title="Compare JSON">
                            <svg class="icon" viewBox="0 0 24 24">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                                <path d="M9 12h6"></path>
                                <path d="M12 9v6"></path>
                            </svg>
                            Diff
                        </button>
                    </div>
                    <button id="action-btn" title="${mode === 'format' ? 'Format JSON' : 'Compare JSON'}">
                        <svg class="icon" viewBox="0 0 24 24">
                            ${mode === 'format'
                                ? '<polyline points="16,18 22,12 16,6"></polyline><polyline points="8,6 2,12 8,18"></polyline>'
                                : '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M9 12h6"></path><path d="M12 9v6"></path>'
                            }
                        </svg>
                        <span id="action-text">${mode === 'format' ? 'Format' : 'Compare'}</span>
                    </button>
                    <button id="strict-diff-toggle" class="toggle-btn" data-mode-only="diff" title="Strict diff mode: only compare keys from the left JSON, ignoring extra keys in the right JSON">
                        <svg class="icon" viewBox="0 0 24 24">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        </svg>
                        Strict
                    </button>
                </div>
                <div id="toolbar-center">
                    <div id="search-container" hidden>
                        <input type="text" id="search-input" placeholder="Search in JSON..." />
                        <button id="search-prev" title="Previous match">
                            <svg class="icon" viewBox="0 0 24 24">
                                <polyline points="15,18 9,12 15,6"></polyline>
                            </svg>
                        </button>
                        <button id="search-next" title="Next match">
                            <svg class="icon" viewBox="0 0 24 24">
                                <polyline points="9,18 15,12 9,6"></polyline>
                            </svg>
                        </button>
                        <span id="search-info">0 matches</span>
                        <button id="search-close" title="Close search">
                            <svg class="icon" viewBox="0 0 24 24">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <button id="search-toggle" data-mode-only="format" title="Search in formatted JSON">
                        <svg class="icon" viewBox="0 0 24 24">
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.35-4.35"></path>
                        </svg>
                        Search
                    </button>
                    <button id="copy" title="Copy formatted JSON">
                        <svg class="icon" viewBox="0 0 24 24">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="m5,15H4a2,2 0 0,1 -2,-2V4a2,2 0 0,1 2,-2H13a2,2 0 0,1 2,2v1"></path>
                        </svg>
                        Copy
                    </button>
                    <button id="save" data-mode-only="format" title="Save formatted JSON">
                        <svg class="icon" viewBox="0 0 24 24">
                            <path d="m19,21H5a2,2 0 0,1 -2,-2V5a2,2 0 0,1 2,-2H14l5,5v11a2,2 0 0,1 -2,2z"></path>
                            <polyline points="17,21 17,13 7,13 7,21"></polyline>
                            <polyline points="7,3 7,8 15,8"></polyline>
                        </svg>
                        Save
                    </button>
                    <button id="clear" title="Clear input">
                        <svg class="icon" viewBox="0 0 24 24">
                            <polyline points="3,6 5,6 21,6"></polyline>
                            <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                        </svg>
                        Clear
                    </button>
                </div>
            </div>
            <!-- Format Mode Container -->
            <div id="format-container" class="mode-container">
                <div id="input-panel">
                    <button id="maximize-input" class="maximize-btn" data-maximize="input-panel" title="Maximize panel">
                        <svg viewBox="0 0 24 24" width="18" height="18">
                            <path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                        </svg>
                    </button>
                    <textarea id="input" placeholder="Enter your JSON here..."></textarea>
                </div>
                <div id="splitter" title="Drag to resize panes or double-click to reset to 50/50"></div>
                <div id="output-panel">
                    <button id="line-numbers-toggle" class="panel-control-btn active" title="Toggle line numbers">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <line x1="3" y1="6" x2="6" y2="6" stroke="currentColor" stroke-width="2"></line>
                            <line x1="10" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2"></line>
                            <line x1="3" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="2"></line>
                            <line x1="10" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2"></line>
                            <line x1="3" y1="18" x2="6" y2="18" stroke="currentColor" stroke-width="2"></line>
                            <line x1="10" y1="18" x2="21" y2="18" stroke="currentColor" stroke-width="2"></line>
                        </svg>
                    </button>
                    <button id="maximize-output" class="maximize-btn" data-maximize="output-panel" title="Maximize panel">
                        <svg viewBox="0 0 24 24" width="18" height="18">
                            <path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                        </svg>
                    </button>
                    <div id="warning-notification" class="warning-notification" hidden>
                        <svg class="warning-icon" viewBox="0 0 24 24" width="16" height="16">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                        <span class="warning-message">JSON auto-corrected! The input had formatting issues. The corrected version is displayed below.</span>
                        <button id="dismiss-warning" class="dismiss-warning-btn" title="Dismiss">
                            <svg viewBox="0 0 24 24" width="14" height="14">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div id="output"></div>
                </div>
            </div>

            <!-- Diff Mode Container -->
            <div id="diff-container" class="mode-container">
                <div id="left-json-panel">
                    <button id="copy-left-json" class="panel-control-btn" title="Copy left JSON to clipboard">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" fill="none" stroke-width="2"></rect>
                            <path d="m5,15H4a2,2 0 0,1 -2,-2V4a2,2 0 0,1 2,-2H13a2,2 0 0,1 2,2v1" stroke="currentColor" fill="none" stroke-width="2"></path>
                        </svg>
                    </button>
                    <button id="clear-left-json" class="panel-control-btn" title="Clear left JSON">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <polyline points="3,6 5,6 21,6" stroke="currentColor" fill="none" stroke-width="2"></polyline>
                            <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2" stroke="currentColor" fill="none" stroke-width="2"></path>
                        </svg>
                    </button>
                    <button id="maximize-left" class="maximize-btn" data-maximize="left-json-panel" title="Maximize panel">
                        <svg viewBox="0 0 24 24" width="18" height="18">
                            <path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                        </svg>
                    </button>
                    <textarea id="left-json" placeholder="Enter original JSON here..."></textarea>
                </div>
                <div id="diff-result-panel">
                    <button id="apply-all-diffs" class="panel-control-btn apply-all-btn" title="Apply all differences to the left JSON" hidden>
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <polyline points="20 6 9 17 4 12" stroke="currentColor" fill="none" stroke-width="2"></polyline>
                        </svg>
                    </button>
                    <button id="reject-all-diffs" class="panel-control-btn reject-all-btn" title="Reject all differences" hidden>
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" fill="none" stroke-width="2"></line>
                            <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" fill="none" stroke-width="2"></line>
                        </svg>
                    </button>
                    <button id="maximize-diff" class="maximize-btn" data-maximize="diff-result-panel" title="Maximize panel">
                        <svg viewBox="0 0 24 24" width="18" height="18">
                            <path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                        </svg>
                    </button>
                    <div id="diff-output"></div>
                </div>
                <div id="right-json-panel">
                    <button id="clear-right-json" class="panel-control-btn" title="Clear right JSON">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <polyline points="3,6 5,6 21,6" stroke="currentColor" fill="none" stroke-width="2"></polyline>
                            <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2" stroke="currentColor" fill="none" stroke-width="2"></path>
                        </svg>
                    </button>
                    <button id="maximize-right" class="maximize-btn" data-maximize="right-json-panel" title="Maximize panel">
                        <svg viewBox="0 0 24 24" width="18" height="18">
                            <path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                        </svg>
                    </button>
                    <textarea id="right-json" placeholder="Enter modified JSON here..."></textarea>
                </div>
            </div>
        `;
    }

    private getNonce(): string {
        return crypto.randomBytes(24).toString('base64');
    }
}

/**
 * Generates webview HTML content
 */
import * as vscode from 'vscode';

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

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    ${this.getStyles()}
</head>
<body data-initial-mode="${mode}">
    ${this.getBodyContent(mode)}
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private getStyles(): string {
        return `<style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', system-ui;
                margin: 0;
                padding: 0;
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-sideBar-background);
                display: flex;
                flex-direction: column;
                height: 100vh;
                overflow: hidden;
            }

            #toolbar {
                padding: 12px 10px;
                background-color: var(--vscode-editorGroupHeader-tabsBackground);
                border-bottom: 1px solid var(--vscode-editorGroup-border);
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
                min-height: 48px;
                box-sizing: border-box;
            }

            #toolbar-left, #toolbar-center {
                display: flex;
                gap: 8px;
            }

            .mode-container {
                display: flex;
                flex: 1;
                overflow: hidden;
                position: relative;
                padding: 16px;
            }

            #format-container {
                /* Default format mode styles */
            }

            #diff-container {
                /* Three-pane layout for diff mode */
                gap: 8px;
            }

            #input-panel {
                min-width: 200px;
                max-width: calc(100% - 220px);
                width: 50%;
                display: flex;
                flex-direction: column;
            }

            #output-panel {
                flex: 1;
                min-width: 200px;
                display: flex;
                flex-direction: column;
            }

            #input, #output {
                flex: 1;
                padding: 16px;
                border: 1px solid var(--vscode-editorGroup-border);
                border-radius: 8px;
                background-color: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
                font-size: 13px;
                resize: none;
                outline: none;
            }

            #output {
                overflow-y: auto;
                white-space: pre-wrap;
            }

            #splitter {
                width: 8px;
                background-color: transparent;
                cursor: col-resize;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                margin: 0 4px;
            }

            #splitter::before {
                content: '';
                width: 2px;
                height: 40px;
                background-color: var(--vscode-editorGroup-border);
                border-radius: 1px;
                opacity: 0.5;
                transition: opacity 0.2s ease;
            }

            #splitter:hover::before {
                opacity: 1;
                background-color: var(--vscode-focusBorder);
            }

            #splitter.dragging::before {
                opacity: 1;
                background-color: var(--vscode-focusBorder);
            }

            /* Add visual feedback during drag */
            body.dragging {
                cursor: col-resize !important;
            }

            body.dragging * {
                cursor: col-resize !important;
            }

            /* Diff Mode Styles */
            #left-json-panel, #right-json-panel {
                min-width: 200px;
                max-width: 40%;
                width: 30%;
                display: flex;
                flex-direction: column;
            }

            #diff-result-panel {
                flex: 1;
                min-width: 200px;
                display: flex;
                flex-direction: column;
            }

            .panel-header {
                background-color: var(--vscode-editorGroupHeader-tabsBackground);
                border: 1px solid var(--vscode-editorGroup-border);
                border-bottom: none;
                border-radius: 8px 8px 0 0;
                padding: 8px 12px;
            }

            .panel-header h3 {
                margin: 0;
                font-size: 12px;
                font-weight: 600;
                color: var(--vscode-editor-foreground);
            }

            #left-json, #right-json {
                flex: 1;
                padding: 16px;
                border: 1px solid var(--vscode-editorGroup-border);
                border-radius: 0 0 8px 8px;
                background-color: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
                font-size: 13px;
                resize: none;
                outline: none;
            }

            #diff-output {
                flex: 1;
                padding: 0;
                border: 1px solid var(--vscode-editorGroup-border);
                border-radius: 0 0 8px 8px;
                background-color: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
                font-size: 13px;
                overflow-y: auto;
                white-space: pre-wrap;
            }

            #diff-output > * {
                margin-top: 0;
            }

            .diff-splitter {
                width: 6px;
                background-color: transparent;
                cursor: col-resize;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
            }

            .diff-splitter::before {
                content: '';
                width: 1px;
                height: 40px;
                background-color: var(--vscode-editorGroup-border);
                border-radius: 1px;
                opacity: 0.5;
                transition: opacity 0.2s ease;
            }

            .diff-splitter:hover::before, .diff-splitter.dragging::before {
                opacity: 1;
                background-color: var(--vscode-focusBorder);
            }

            /* Diff Result Styles */
            .diff-result {
                font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
                font-size: 11px;
                line-height: 1.3;
                margin: 0;
                padding: 0;
            }

            .diff-result.no-changes {
                text-align: center;
                padding: 16px;
                margin: 0;
                color: var(--vscode-testing-iconPassed);
                font-size: 12px;
            }

            .diff-items {
                margin: 0;
                padding: 0;
            }

            .diff-items > * {
                margin-top: 0;
            }

            .diff-items > *:first-child {
                margin-top: 0 !important;
            }

            .diff-item {
                margin-bottom: 1px;
                padding: 2px 8px;
                border-radius: 2px;
                border-left: 2px solid;
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 3px;
            }

            .diff-item:first-child {
                padding-top: 4px;
            }

            .diff-item.diff-modified {
                flex-direction: column;
                align-items: flex-start;
            }

            .diff-item:first-child {
                margin-top: 0;
            }

            .expandable-value {
                cursor: pointer;
                text-decoration: underline;
                text-decoration-style: dotted;
                opacity: 0.8;
            }

            .expandable-value:hover {
                opacity: 1;
                background-color: var(--vscode-toolbar-hoverBackground);
                padding: 1px 2px;
                border-radius: 2px;
            }

            .diff-item.diff-added {
                background-color: var(--vscode-diffEditor-insertedTextBackground);
                border-left-color: var(--vscode-gitDecoration-addedResourceForeground);
            }

            .diff-item.diff-removed {
                background-color: var(--vscode-diffEditor-removedTextBackground);
                border-left-color: var(--vscode-gitDecoration-deletedResourceForeground);
            }

            .diff-item.diff-modified {
                background-color: var(--vscode-diffEditor-border);
                border-left-color: var(--vscode-gitDecoration-modifiedResourceForeground);
            }

            .diff-path {
                font-weight: 600;
                margin-bottom: 2px;
                font-size: 10px;
                opacity: 0.9;
                color: var(--vscode-descriptionForeground);
            }

            .diff-value {
                font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
                font-size: 10px;
                padding: 1px 3px;
                border-radius: 2px;
                margin: 1px 0;
                word-break: break-all;
            }

            .diff-value.old-value {
                background-color: var(--vscode-diffEditor-removedTextBackground);
                color: var(--vscode-gitDecoration-deletedResourceForeground);
            }

            .diff-value.new-value {
                background-color: var(--vscode-diffEditor-insertedTextBackground);
                color: var(--vscode-gitDecoration-addedResourceForeground);
            }

            .diff-values {
                display: flex;
                flex-direction: column;
                gap: 1px;
            }

            .diff-inline-change {
                margin-top: 1px;
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 10px;
            }

            .diff-inline-change .diff-value {
                margin: 0;
            }

            .diff-error {
                color: var(--vscode-errorForeground);
                padding: 16px;
                text-align: center;
            }

            button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 12px;
                cursor: pointer;
                border-radius: 3px;
                font-size: 12px;
                display: flex;
                align-items: center;
                gap: 4px;
                height: 32px;
                box-sizing: border-box;
            }

            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }

            /* Mode Switcher */
            #mode-switcher {
                display: flex;
                background-color: var(--vscode-editorGroupHeader-tabsBackground);
                border: 1px solid var(--vscode-editorGroup-border);
                border-radius: 3px;
                overflow: hidden;
                margin-right: 8px;
            }

            .mode-btn {
                background-color: transparent;
                color: var(--vscode-tab-inactiveForeground);
                border: none;
                border-right: 1px solid var(--vscode-editorGroup-border);
                padding: 8px 12px;
                cursor: pointer;
                font-size: 12px;
                display: flex;
                align-items: center;
                gap: 4px;
                height: 32px;
                box-sizing: border-box;
                transition: all 0.2s ease;
            }

            .mode-btn:last-child {
                border-right: none;
            }

            .mode-btn:hover {
                background-color: var(--vscode-tab-hoverBackground);
                color: var(--vscode-tab-activeForeground);
            }

            .mode-btn.active {
                background-color: var(--vscode-tab-activeBackground);
                color: var(--vscode-tab-activeForeground);
            }

            /* Inline Search Container */
            #search-container {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 6px 8px;
                background-color: var(--vscode-input-background);
                border: 1px solid var(--vscode-editorGroup-border);
                border-radius: 3px;
                margin-right: 8px;
                height: 32px;
                box-sizing: border-box;
            }

            #search-container #search-input {
                background: none;
                border: none;
                color: var(--vscode-input-foreground);
                font-size: 12px;
                outline: none;
                width: 150px;
                padding: 2px 4px;
            }

            #search-container #search-input::placeholder {
                color: var(--vscode-input-placeholderForeground);
            }

            #search-container button {
                background: none;
                border: none;
                padding: 2px 4px;
                margin: 0;
                border-radius: 2px;
                min-width: auto;
            }

            #search-container button:hover {
                background-color: var(--vscode-toolbar-hoverBackground);
            }

            #search-container button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            #search-container #search-info {
                font-size: 11px;
                color: var(--vscode-descriptionForeground);
                margin: 0 4px;
                white-space: nowrap;
            }

            #search-container .icon {
                width: 12px;
                height: 12px;
            }

            .icon {
                width: 14px;
                height: 14px;
                stroke: currentColor;
                fill: none;
                stroke-width: 2;
            }

            /* JSON Syntax Highlighting */
            .string { color: var(--vscode-debugTokenExpression-string); }
            .number { color: var(--vscode-debugTokenExpression-number); }
            .boolean { color: var(--vscode-debugTokenExpression-boolean); }
            .null { color: var(--vscode-debugTokenExpression-name); }
            .key { color: var(--vscode-debugTokenExpression-name); font-weight: bold; }

            details {
                margin-left: 1em;
            }

            summary {
                cursor: pointer;
                user-select: none;
            }

            ul {
                list-style: none;
                padding-left: 1em;
                margin: 0;
            }

            li {
                margin: 2px 0;
            }

            /* History Panel */
            #history-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                z-index: 1000;
                display: none;
            }

            #history-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 80%;
                max-width: 600px;
                height: 60%;
                background-color: var(--vscode-editor-background);
                border: 1px solid var(--vscode-editorGroup-border);
                border-radius: 4px;
                display: none;
                flex-direction: column;
                z-index: 1001;
            }

            #history-header {
                padding: 12px;
                background-color: var(--vscode-editorGroupHeader-tabsBackground);
                border-bottom: 1px solid var(--vscode-editorGroup-border);
                font-weight: bold;
            }

            #history-content {
                flex: 1;
                overflow-y: auto;
                padding: 8px;
            }

            .history-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px;
                border-bottom: 1px solid var(--vscode-editorGroup-border);
            }

            .history-item pre {
                flex: 1;
                margin: 0;
                font-size: 11px;
                color: var(--vscode-descriptionForeground);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .history-actions {
                display: flex;
                gap: 4px;
                margin-left: 8px;
            }

            .history-actions button {
                padding: 4px;
                min-width: auto;
            }

            /* Diff History Styles */
            .diff-history-item .diff-preview {
                flex: 1;
                font-size: 11px;
            }

            .diff-preview-header {
                font-size: 10px;
                color: var(--vscode-descriptionForeground);
                margin-bottom: 4px;
            }

            .diff-preview-content {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .left-preview, .right-preview {
                font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
                font-size: 10px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .left-preview {
                color: var(--vscode-gitDecoration-modifiedResourceForeground);
            }

            .right-preview {
                color: var(--vscode-gitDecoration-addedResourceForeground);
            }

            /* Search Highlighting */
            .search-highlight {
                background-color: var(--vscode-editor-findMatchBackground);
                border: 1px solid var(--vscode-editor-findMatchBorder);
                border-radius: 2px;
            }

            .search-highlight.current {
                background-color: var(--vscode-editor-findMatchHighlightBackground);
                border-color: var(--vscode-editor-findMatchHighlightBorder);
            }
        </style>`;
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
                </div>
                <div id="toolbar-center">
                    <div id="search-container" style="display: none;">
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
                    <button id="search-toggle" title="Search in formatted JSON" style="display: ${mode === 'format' ? 'flex' : 'none'};">
                        <svg class="icon" viewBox="0 0 24 24">
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.35-4.35"></path>
                        </svg>
                        Search
                    </button>
                    <button id="copy" title="Copy formatted JSON" style="display: ${mode === 'format' ? 'flex' : 'none'};">
                        <svg class="icon" viewBox="0 0 24 24">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="m5,15H4a2,2 0 0,1 -2,-2V4a2,2 0 0,1 2,-2H13a2,2 0 0,1 2,2v1"></path>
                        </svg>
                        Copy
                    </button>
                    <button id="clear" title="Clear input">
                        <svg class="icon" viewBox="0 0 24 24">
                            <polyline points="3,6 5,6 21,6"></polyline>
                            <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                        </svg>
                        Clear
                    </button>
                    <button id="history" title="Show history">
                        <svg class="icon" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12,6 12,12 16,14"></polyline>
                        </svg>
                        History
                    </button>
                </div>
            </div>
            <!-- Format Mode Container -->
            <div id="format-container" class="mode-container" style="display: ${mode === 'format' ? 'flex' : 'none'};">
                <div id="input-panel">
                    <textarea id="input" placeholder="Enter your JSON here..."></textarea>
                </div>
                <div id="splitter" title="Drag to resize panes or double-click to reset to 50/50"></div>
                <div id="output-panel">
                    <div id="output"></div>
                </div>
            </div>

            <!-- Diff Mode Container -->
            <div id="diff-container" class="mode-container" style="display: ${mode === 'diff' ? 'flex' : 'none'};">
                <div id="left-json-panel">
                    <div class="panel-header">
                        <h3>Original JSON</h3>
                    </div>
                    <textarea id="left-json" placeholder="Enter original JSON here..."></textarea>
                </div>
                <div id="diff-splitter-left" class="diff-splitter" title="Drag to resize"></div>
                <div id="diff-result-panel">
                    <div class="panel-header">
                        <h3>Differences</h3>
                    </div>
                    <div id="diff-output"></div>
                </div>
                <div id="diff-splitter-right" class="diff-splitter" title="Drag to resize"></div>
                <div id="right-json-panel">
                    <div class="panel-header">
                        <h3>Modified JSON</h3>
                    </div>
                    <textarea id="right-json" placeholder="Enter modified JSON here..."></textarea>
                </div>
            </div>
            <div id="history-backdrop">
                <div id="history-panel">
                    <div id="history-header">JSON History</div>
                    <div id="history-content"></div>
                </div>
            </div>
        `;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}

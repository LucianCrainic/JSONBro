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
    public getWebviewContent(webview: vscode.Webview): string {
        const nonce = this.getNonce();
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'main.js')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JSONBro - Format JSON</title>
    ${this.getStyles()}
</head>
<body>
    ${this.getBodyContent()}
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
                padding: 6px 10px;
                background-color: var(--vscode-editorGroupHeader-tabsBackground);
                border-bottom: 1px solid var(--vscode-editorGroup-border);
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
            }

            #toolbar-left, #toolbar-center {
                display: flex;
                gap: 8px;
            }

            #container {
                display: flex;
                flex: 1;
                overflow: hidden;
                position: relative;
            }

            #input, #output {
                flex: 1;
                margin: 8px;
                padding: 12px;
                border: 1px solid var(--vscode-editorGroup-border);
                background-color: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
                font-size: 13px;
                resize: none;
                outline: none;
            }

            #input {
                border-right: none;
            }

            #output {
                border-left: none;
                overflow-y: auto;
                white-space: pre-wrap;
            }

            button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 6px 12px;
                cursor: pointer;
                border-radius: 3px;
                font-size: 12px;
                display: flex;
                align-items: center;
                gap: 4px;
            }

            button:hover {
                background-color: var(--vscode-button-hoverBackground);
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
        </style>`;
    }

    private getBodyContent(): string {
        return `
            <div id="toolbar">
                <div id="toolbar-left">
                    <button id="format" title="Format JSON">
                        <svg class="icon" viewBox="0 0 24 24">
                            <polyline points="16,18 22,12 16,6"></polyline>
                            <polyline points="8,6 2,12 8,18"></polyline>
                        </svg>
                        Format
                    </button>
                    <button id="minify" title="Minify JSON">
                        <svg class="icon" viewBox="0 0 24 24">
                            <line x1="5" y1="9" x2="19" y2="9"></line>
                            <line x1="5" y1="15" x2="19" y2="15"></line>
                        </svg>
                        Minify
                    </button>
                </div>
                <div id="toolbar-center">
                    <button id="copy" title="Copy formatted JSON">
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
            <div id="container">
                <textarea id="input" placeholder="Enter your JSON here..."></textarea>
                <div id="output"></div>
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

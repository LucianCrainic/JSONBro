import * as vscode from 'vscode';

export function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.js'));
    const featherIconsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', 'feather-icons', 'dist', 'feather.min.js'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Format JSON</title>
<style>
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
#toolbar-left {
    display: flex;
    gap: 8px;
}
#toolbar-center {
    display: flex;
    gap: 8px;
}
#container {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
}
#history-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.4);
    z-index: 999;
    display: none;
}
#history-backdrop.visible {
    display: block;
}
#history-panel {
    width: 500px;
    max-width: 90vw;
    height: 400px;
    max-height: 80vh;
    overflow: hidden;
    display: none;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: var(--vscode-editor-background);
    z-index: 1000;
    border: 1px solid var(--vscode-editorGroup-border);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
#history-panel.visible {
    display: block;
}
#toggle-history {
    background: none;
    border: none;
    padding: 4px 8px;
    cursor: pointer;
    color: var(--vscode-foreground);
}
#toggle-history:hover {
    background-color: var(--vscode-toolbar-hoverBackground);
}
#history-panel .history-item {
    padding: 8px 12px;
    border-bottom: 1px solid var(--vscode-editorGroup-border);
    border-radius: 4px;
    margin: 4px 8px;
    background-color: var(--vscode-editorWidget-background);
}
#history-panel .history-item:hover {
    background-color: var(--vscode-list-hoverBackground);
}
#history-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--vscode-editorGroup-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: var(--vscode-editorGroupHeader-tabsBackground);
    border-radius: 8px 8px 0 0;
}
#history-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
}
#history-close {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: var(--vscode-foreground);
    border-radius: 4px;
}
#history-close:hover {
    background-color: var(--vscode-toolbar-hoverBackground);
}
#history-content {
    padding: 8px;
    max-height: calc(400px - 60px);
    overflow-y: auto;
}
#history-panel .history-item pre {
    margin: 0 0 8px 0;
    white-space: pre-wrap;
    word-break: break-all;
    font-size: 12px;
    color: var(--vscode-editor-foreground);
}
#history-panel .history-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 8px;
}
#history-panel button {
    padding: 4px 8px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
}
textarea, .json-output {
    flex: 1;
    margin: 0;
    padding: 16px;
    border: none;
    outline: none;
    font-family: monospace;
    font-size: 13px;
    background-color: transparent;
    color: var(--vscode-editor-foreground);
    overflow-y: auto;
    resize: none;
    border-radius: 0;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
}
.json-output details {
    margin-left: 16px;
}
.json-output summary {
    cursor: pointer;
    list-style: none;
}
.json-output ul {
    list-style-type: none;
    padding-left: 16px;
    margin: 0;
}
.string { color: var(--vscode-terminal-ansiGreen); }
.number { color: var(--vscode-terminal-ansiYellow); }
.boolean { color: var(--vscode-terminal-ansiBlue); }
.null { color: var(--vscode-terminal-ansiBlue); }
.key { color: var(--vscode-terminal-ansiCyan); }
button {
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
}
button:hover {
    background-color: var(--vscode-button-hoverBackground);
}
.icon {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
}
#main-content {
    display: flex;
    flex: 1;
    overflow: hidden;
    padding: 12px;
    gap: 12px;
}
.editor-panel {
    flex: 1;
    border-radius: 8px;
    border: 1px solid var(--vscode-editorGroup-border);
    background-color: var(--vscode-editor-background);
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: box-shadow 0.2s ease;
}
.editor-panel:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
</style>
</head>
<body>
<div id="toolbar">
    <div id="toolbar-left">
        <button id="toggle-history" title="History">
            <svg class="icon" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14,2 14,8 20,8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10,9 9,9 8,9"></polyline>
            </svg>
        </button>
    </div>
    <div id="toolbar-center">
        <button id="format">Format</button>
        <button id="copy">Copy</button>
        <button id="clear">Clear</button>
    </div>
</div>
<div id="container">
    <div id="history-backdrop"></div>
    <div id="history-panel">
        <div id="history-header">
            <h3>History</h3>
            <button id="history-close" title="Close">
                <svg class="icon" viewBox="0 0 24 24">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
        <div id="history-content"></div>
    </div>
    <div id="main-content">
        <div class="editor-panel">
            <textarea id="input" placeholder="Paste JSON here"></textarea>
        </div>
        <div class="editor-panel">
            <div id="output" class="json-output"></div>
        </div>
    </div>
</div>
<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
<script nonce="${nonce}" src="${featherIconsUri}"></script>
</body>
</html>`;
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 16; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

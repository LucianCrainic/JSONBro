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
    background-color: var(--vscode-editor-background);
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
#history-panel {
    width: 200px;
    border-right: 1px solid var(--vscode-editorGroup-border);
    overflow-y: auto;
    display: none;
    flex-shrink: 0;
    position: absolute;
    top: 41px;
    left: 0;
    height: calc(100vh - 41px);
    background-color: var(--vscode-editor-background);
    z-index: 10;
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
    padding: 4px;
    border-bottom: 1px solid var(--vscode-editorGroup-border);
}
#history-panel .history-item pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
}
#history-panel .history-actions {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
    margin-top: 4px;
}
#history-panel button {
    padding: 2px 4px;
}
textarea, .json-output {
    flex: 1;
    margin: 0;
    padding: 10px;
    border: none;
    outline: none;
    font-family: monospace;
    font-size: 13px;
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    overflow-y: auto;
}
textarea {
    resize: none;
    border-right: 1px solid var(--vscode-editorGroup-border);
}
.json-output {
    overflow: auto;
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
    <div id="history-panel"></div>
    <div id="main-content">
        <textarea id="input" placeholder="Paste JSON here"></textarea>
        <div id="output" class="json-output"></div>
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

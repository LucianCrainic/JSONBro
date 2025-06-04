import * as vscode from 'vscode';

export function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.js'));
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
    justify-content: center;
    gap: 8px;
}
#container {
    display: flex;
    flex: 1;
    overflow: hidden;
}
#history-panel {
    width: 200px;
    border-right: 1px solid var(--vscode-editorGroup-border);
    overflow-y: auto;
    display: none;
    flex-shrink: 0;
}
#history-panel.visible {
    display: block;
}
#toggle-history {
    width: 30px;
    border-right: 1px solid var(--vscode-editorGroup-border);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}
#toggle-history.visible + #history-panel {
    display: block;
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
</style>
</head>
<body>
<div id="toolbar">
    <button id="format">Format JSON</button>
    <button id="clear">Clear</button>
</div>
<div id="container">
    <button id="toggle-history" title="History">&#x1F4D3;</button>
    <div id="history-panel"></div>
    <textarea id="input" placeholder="Paste JSON here"></textarea>
    <div id="output" class="json-output"></div>
</div>
<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
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

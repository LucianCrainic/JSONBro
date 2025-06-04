import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('jsonbro.formatJson', () => {
        const panel = vscode.window.createWebviewPanel(
            'jsonbro.formatJson',
            'Format JSON',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = getWebviewContent();
    });

    context.subscriptions.push(disposable);
}

function getWebviewContent(): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Format JSON</title>
<style>
body {
    margin: 0;
    padding: 0;
    color: var(--vscode-editor-foreground);
    background-color: var(--vscode-editor-background);
    display: flex;
    height: 100vh;
    font-family: var(--vscode-font-family);
}
.container {
    flex: 1;
    display: flex;
    position: relative;
}
#input, #output {
    flex: 1;
    border: none;
    padding: 1em;
    font-family: monospace;
    font-size: 13px;
    outline: none;
    resize: none;
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
}
#output {
    border-left: 1px solid var(--vscode-editorGroup-border);
    overflow: auto;
    white-space: pre;
}
#toolbar {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
}
button {
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
}
button:hover {
    background-color: var(--vscode-button-hoverBackground);
}
</style>
</head>
<body>
<div class="container">
    <div id="toolbar"><button id="format">Format JSON</button></div>
    <textarea id="input" placeholder="Paste JSON here"></textarea>
    <pre id="output"></pre>
</div>
<script nonce="${nonce}">
function syntaxHighlight(json) {
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json
        .replace(/"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^"\\])*"(?=\s*:)/g, '<span style="color:var(--vscode-terminal-ansiCyan)">$&</span>')
        .replace(/"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^"\\])*"/g, '<span style="color:var(--vscode-terminal-ansiGreen)">$&</span>')
        .replace(/\b(true|false)\b/g, '<span style="color:var(--vscode-terminal-ansiBlue)">$1</span>')
        .replace(/\bnull\b/g, '<span style="color:var(--vscode-terminal-ansiBlue)">$&</span>')
        .replace(/\b(-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)\b/g, '<span style="color:var(--vscode-terminal-ansiYellow)">$1</span>');
}

document.getElementById('format').addEventListener('click', () => {
    const inputEl = document.getElementById('input');
    const outputEl = document.getElementById('output');
    try {
        const obj = JSON.parse(inputEl.value);
        const formatted = JSON.stringify(obj, null, 2);
        outputEl.innerHTML = syntaxHighlight(formatted);
    } catch (err) {
        outputEl.textContent = 'Invalid JSON: ' + err.message;
    }
});
</script>
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

export function deactivate() {}

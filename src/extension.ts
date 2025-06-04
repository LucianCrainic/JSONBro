import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('jsonbro.formatJson', () => {
        const panel = vscode.window.createWebviewPanel(
            'jsonbro.formatJson',
            'Format JSON',
            vscode.ViewColumn.One,
            { enableScripts: true }
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
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', system-ui;
    margin: 0;
    padding: 0;
    color: var(--vscode-editor-foreground);
    background-color: var(--vscode-editor-background);
}
#toolbar {
    padding: 6px 10px;
    background-color: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 1px solid var(--vscode-editorGroup-border);
    text-align: right;
}
#container {
    display: flex;
    height: calc(100vh - 40px);
}
textarea, pre {
    flex: 1;
    margin: 0;
    padding: 10px;
    border: none;
    outline: none;
    font-family: monospace;
    font-size: 13px;
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
}
textarea {
    resize: none;
    border-right: 1px solid var(--vscode-editorGroup-border);
}
pre {
    overflow: auto;
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
<div id="toolbar"><button id="format">Format JSON</button></div>
<div id="container">
    <textarea id="input" placeholder="Paste JSON here"></textarea>
    <pre id="output"></pre>
</div>
<script nonce="${nonce}">
function syntaxHighlight(json) {
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/(\"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\\"])*\"(?=\s*:)|\"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\\"])*\"|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|\b(true|false|null)\b)/g, function(match) {
        let cls = 'number';
        if(/^"/.test(match)) {
            if(/:$/.test(match)) {
                cls = 'key';
            } else {
                cls = 'string';
            }
        } else if(/true|false/.test(match)) {
            cls = 'boolean';
        } else if(/null/.test(match)) {
            cls = 'null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}
document.getElementById('format').addEventListener('click', () => {
    const inputEl = document.getElementById('input');
    const output = document.getElementById('output');
    if (!inputEl || !output) {
        return;
    }
    const input = inputEl.value;
    try {
        const obj = JSON.parse(input);
        const formatted = JSON.stringify(obj, null, 4);
        output.style.color = 'inherit';
        output.innerHTML = syntaxHighlight(formatted);
    } catch (err) {
        output.style.color = 'var(--vscode-errorForeground)';
        output.textContent = 'Invalid JSON: ' + err.message;
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

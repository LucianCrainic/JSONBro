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
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', system-ui;
    margin: 0;
    padding: 0;
    color: var(--vscode-editor-foreground);
    background-color: var(--vscode-editor-background);
    display: flex;
    flex-direction: column;
    height: 100vh;
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
}
#history {
    height: 100px;
    overflow-y: auto;
    border-top: 1px solid var(--vscode-editorGroup-border);
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    padding: 4px;
}
#history .item {
    margin: 2px 0;
    padding: 2px 4px;
    cursor: pointer;
    border-radius: 3px;
}
#history .item:hover {
    background-color: var(--vscode-list-hoverBackground);
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
    <button id="copy">Copy JSON</button>
    <button id="clear">Clear</button>
</div>
<div id="container">
    <textarea id="input" placeholder="Paste JSON here"></textarea>
    <div id="output" class="json-output"></div>
</div>
<div id="history"></div>
<script nonce="${nonce}">
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;');
}

function renderJson(value) {
    if (value === null) {
        return '<span class="null">null</span>';
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return '[ ]';
        }
        const items = value.map(v => '<li>' + renderJson(v) + '</li>').join('');
        return '<details open><summary>[...]</summary><ul>' + items + '</ul></details>';
    }
    switch (typeof value) {
        case 'object':
            const entries = Object.entries(value)
                .map(([k, v]) => '<li><span class="key">"' + escapeHtml(k) + '"</span>: ' + renderJson(v) + '</li>')
                .join('');
            if (!entries) {
                return '{ }';
            }
            return '<details open><summary>{...}</summary><ul>' + entries + '</ul></details>';
        case 'string':
            return '<span class="string">"' + escapeHtml(value) + '"</span>';
        case 'number':
            return '<span class="number">' + value + '</span>';
        case 'boolean':
            return '<span class="boolean">' + value + '</span>';
    }
    return '';
}
const history = [];
let currentFormatted = '';

function renderHistory() {
    const historyEl = document.getElementById('history');
    if (!historyEl) return;
    historyEl.innerHTML = history
        .map((h, i) => '<div class="item" data-index="' + i + '">' + escapeHtml(h.preview) + '</div>')
        .join('');
    Array.from(historyEl.querySelectorAll('.item')).forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.getAttribute('data-index') || '0', 10);
            const item = history[idx];
            const inputEl = document.getElementById('input');
            const output = document.getElementById('output');
            if (!item || !inputEl || !output) return;
            inputEl.value = item.input;
            output.innerHTML = item.html;
            currentFormatted = item.formatted;
        });
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
        const formatted = JSON.stringify(obj, null, 2);
        const html = renderJson(obj);
        currentFormatted = formatted;
        output.style.color = 'inherit';
        output.innerHTML = html;
        history.unshift({ input, formatted, html, preview: formatted.slice(0, 50).replace(/\n/g, ' ') });
        renderHistory();
    } catch (err) {
        output.style.color = 'var(--vscode-errorForeground)';
        output.textContent = 'Invalid JSON: ' + err.message;
    }
});

document.getElementById('copy').addEventListener('click', () => {
    if (!currentFormatted) return;
    navigator.clipboard.writeText(currentFormatted);
});

document.getElementById('clear').addEventListener('click', () => {
    const inputEl = document.getElementById('input');
    const output = document.getElementById('output');
    if (inputEl) inputEl.value = '';
    if (output) output.innerHTML = '';
    currentFormatted = '';
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

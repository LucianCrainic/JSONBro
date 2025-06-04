import { escapeHtml, renderJson } from './format.js';
import { renderJsonDiff } from './diff.js';

const history = [];

document.getElementById('format').addEventListener('click', () => {
    const inputEl = document.getElementById('input');
    const output = document.getElementById('output');
    const historyEl = document.getElementById('history');
    if (!inputEl || !output || !historyEl) {
        return;
    }
    const input = inputEl.value;
    history.unshift(input);
    historyEl.innerHTML = history.map(h => `<pre>${escapeHtml(h)}</pre>`).join('');
    try {
        const obj = JSON.parse(input);
        output.style.color = 'inherit';
        output.innerHTML = renderJson(obj);
    } catch (err) {
        output.style.color = 'var(--vscode-errorForeground)';
        output.textContent = 'Invalid JSON: ' + err.message;
    }
});

document.addEventListener('json-diff', event => {
    const { oldValue, newValue } = event.detail || {};
    const output = document.getElementById('output');
    if (output) {
        output.innerHTML = renderJsonDiff(oldValue, newValue);
    }
});

document.getElementById('clear').addEventListener('click', () => {
    const inputEl = document.getElementById('input');
    const output = document.getElementById('output');
    if (inputEl) inputEl.value = '';
    if (output) output.innerHTML = '';
});

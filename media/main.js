import { escapeHtml, renderJson } from './format.js';
import { renderJsonDiff } from './diff.js';

const history = [];

function updateHistoryPanel(inputEl, output) {
    const panel = document.getElementById('history-panel');
    if (!panel) {
        return;
    }
    panel.innerHTML = history
        .map((h, idx) => {
            const preview = escapeHtml(h).slice(0, 100);
            return `<div class="history-item"><pre>${preview}</pre><div class="history-actions"><button class="show-btn" data-index="${idx}" title="Show">&#x1F441;</button><button class="remove-btn" data-index="${idx}" title="Remove">&#x1F5D1;</button></div></div>`;
        })
        .join('');
    panel.querySelectorAll('button.show-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-index'), 10);
            const value = history[index];
            inputEl.value = value;
            try {
                const obj = JSON.parse(value);
                output.style.color = 'inherit';
                output.innerHTML = renderJson(obj);
            } catch (err) {
                output.style.color = 'var(--vscode-errorForeground)';
                output.textContent = 'Invalid JSON: ' + err.message;
            }
        });
    });
    panel.querySelectorAll('button.remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-index'), 10);
            history.splice(index, 1);
            updateHistoryPanel(inputEl, output);
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
    history.unshift(input);
    updateHistoryPanel(inputEl, output);
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

document.getElementById('toggle-history').addEventListener('click', () => {
    const panel = document.getElementById('history-panel');
    const btn = document.getElementById('toggle-history');
    if (!panel || !btn) {
        return;
    }
    panel.classList.toggle('visible');
    btn.classList.toggle('visible');
});

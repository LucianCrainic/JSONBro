import { escapeHtml, renderJson } from './format.js';
import { renderJsonDiff } from './diff.js';

const history = [];
let currentJsonObject = null;

function updateHistoryPanel(inputEl, output) {
    const panel = document.getElementById('history-content');
    if (!panel) {
        return;
    }
    panel.innerHTML = history
        .map((h, idx) => {
            const preview = escapeHtml(h).slice(0, 100);
            return `<div class="history-item"><pre>${preview}</pre><div class="history-actions"><button class="show-btn" data-index="${idx}" title="Show"><svg class="icon" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button><button class="remove-btn" data-index="${idx}" title="Remove"><svg class="icon" viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6"></polyline><path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path></svg></button></div></div>`;
        })
        .join('');
    panel.querySelectorAll('button.show-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-index'), 10);
            const value = history[index];
            inputEl.value = value;
            try {
                const obj = JSON.parse(value);
                currentJsonObject = obj;
                output.style.color = 'inherit';
                output.innerHTML = renderJson(obj);
            } catch (err) {
                currentJsonObject = null;
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
        currentJsonObject = obj;
        output.style.color = 'inherit';
        output.innerHTML = renderJson(obj);
    } catch (err) {
        currentJsonObject = null;
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

document.getElementById('copy').addEventListener('click', () => {
    if (!currentJsonObject) {
        // Show error feedback if no valid JSON to copy
        const btn = document.getElementById('copy');
        const originalText = btn.textContent;
        btn.textContent = 'No JSON!';
        btn.style.color = 'var(--vscode-errorForeground)';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.color = '';
        }, 1000);
        return;
    }
    
    // Format the JSON with proper indentation
    const formattedJson = JSON.stringify(currentJsonObject, null, 2);
    
    // Copy to clipboard
    navigator.clipboard.writeText(formattedJson).then(() => {
        // Visual feedback
        const btn = document.getElementById('copy');
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.color = 'var(--vscode-terminal-ansiGreen)';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.color = '';
        }, 1000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
        // Show error feedback
        const btn = document.getElementById('copy');
        const originalText = btn.textContent;
        btn.textContent = 'Error!';
        btn.style.color = 'var(--vscode-errorForeground)';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.color = '';
        }, 1000);
    });
});

document.getElementById('clear').addEventListener('click', () => {
    const inputEl = document.getElementById('input');
    const output = document.getElementById('output');
    if (inputEl) inputEl.value = '';
    if (output) output.innerHTML = '';
    currentJsonObject = null;
});

document.getElementById('toggle-history').addEventListener('click', () => {
    const panel = document.getElementById('history-panel');
    const backdrop = document.getElementById('history-backdrop');
    if (!panel || !backdrop) {
        return;
    }
    panel.classList.toggle('visible');
    backdrop.classList.toggle('visible');
});

// Close history modal when clicking backdrop or close button
document.getElementById('history-backdrop').addEventListener('click', () => {
    const panel = document.getElementById('history-panel');
    const backdrop = document.getElementById('history-backdrop');
    if (panel && backdrop) {
        panel.classList.remove('visible');
        backdrop.classList.remove('visible');
    }
});

document.getElementById('history-close').addEventListener('click', () => {
    const panel = document.getElementById('history-panel');
    const backdrop = document.getElementById('history-backdrop');
    if (panel && backdrop) {
        panel.classList.remove('visible');
        backdrop.classList.remove('visible');
    }
});

// Close history panel when clicking on backdrop
document.getElementById('history-backdrop').addEventListener('click', () => {
    const panel = document.getElementById('history-panel');
    const backdrop = document.getElementById('history-backdrop');
    if (!panel || !backdrop) {
        return;
    }
    panel.classList.remove('visible');
    backdrop.classList.remove('visible');
});

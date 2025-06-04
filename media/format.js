export function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function renderJson(value) {
    if (value === null) {
        return '<span class="null">null</span>';
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return '[ ]';
        }
        const items = value.map(v => '<li>' + renderJson(v) + '</li>').join('');
        return `<details open><summary>[...]</summary><ul>${items}</ul></details>`;
    }
    switch (typeof value) {
        case 'object':
            const entries = Object.entries(value)
                .map(([k, v]) => `<li><span class="key">"${escapeHtml(k)}"</span>: ${renderJson(v)}</li>`)
                .join('');
            if (!entries) {
                return '{ }';
            }
            return `<details open><summary>{...}</summary><ul>${entries}</ul></details>`;
        case 'string':
            return `<span class="string">"${escapeHtml(value)}"</span>`;
        case 'number':
            return `<span class="number">${value}</span>`;
        case 'boolean':
            return `<span class="boolean">${value}</span>`;
    }
    return '';
}

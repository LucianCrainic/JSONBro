/**
 * JSON formatting utilities
 */
export class JSONFormatter {
    /**
     * Escapes HTML characters in text
     */
    static escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Renders JSON object as formatted HTML
     */
    static renderJson(value: any): string {
        if (value === null) {
            return '<span class="null">null</span>';
        }
        
        if (Array.isArray(value)) {
            if (value.length === 0) {
                return '[ ]';
            }
            const items = value.map(v => '<li>' + this.renderJson(v) + '</li>').join('');
            return `<details open><summary>[...]</summary><ul>${items}</ul></details>`;
        }

        switch (typeof value) {
            case 'object':
                const entries = Object.entries(value)
                    .map(([k, v]) => `<li><span class="key">"${this.escapeHtml(k)}"</span>: ${this.renderJson(v)}</li>`)
                    .join('');
                if (!entries) {
                    return '{ }';
                }
                return `<details open><summary>{...}</summary><ul>${entries}</ul></details>`;
            case 'string':
                return `<span class="string">"${this.escapeHtml(value)}"</span>`;
            case 'number':
                return `<span class="number">${value}</span>`;
            case 'boolean':
                return `<span class="boolean">${value}</span>`;
        }
        return '';
    }
}

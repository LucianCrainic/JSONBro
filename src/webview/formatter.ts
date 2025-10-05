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
    static renderJson(value: any, indent: number = 0): string {
        if (value === null) {
            return '<span class="null">null</span>';
        }
        
        if (Array.isArray(value)) {
            if (value.length === 0) {
                return '<span class="json-array">[]</span>';
            }
            const items = value.map((v, i) => {
                const comma = i < value.length - 1 ? '<span class="comma">,</span>' : '';
                return `<div class="json-line">${this.renderJson(v, indent + 1)}${comma}</div>`;
            }).join('');
            return `<span class="json-array"><span class="bracket">[</span><details open><summary></summary><div class="json-items">${items}</div></details><span class="bracket">]</span></span>`;
        }

        switch (typeof value) {
            case 'object':
                const entries = Object.entries(value);
                const entryItems = entries.map(([k, v], i) => {
                    const comma = i < entries.length - 1 ? '<span class="comma">,</span>' : '';
                    return `<div class="json-line"><span class="key">"${this.escapeHtml(k)}"</span>: ${this.renderJson(v, indent + 1)}${comma}</div>`;
                }).join('');
                if (!entryItems) {
                    return '<span class="json-object">{}</span>';
                }
                return `<span class="json-object"><span class="brace">{</span><details open><summary></summary><div class="json-items">${entryItems}</div></details><span class="brace">}</span></span>`;
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

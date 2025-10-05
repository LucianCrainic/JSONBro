/**
 * JSON formatting utilities
 */
export class JSONFormatter {
    private static lineNumber: number = 1;
    private static showLineNumbers: boolean = true;

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
     * Sets whether to show line numbers
     */
    static setShowLineNumbers(show: boolean): void {
        this.showLineNumbers = show;
    }

    /**
     * Gets the current line number setting
     */
    static getShowLineNumbers(): boolean {
        return this.showLineNumbers;
    }

    /**
     * Resets the line number counter
     */
    private static resetLineNumber(): void {
        this.lineNumber = 1;
    }

    /**
     * Gets the next line number with proper formatting
     * Only returns line number for content lines (keys/values), not structure-only lines
     */
    private static getLineNumberForContent(hasContent: boolean): string {
        if (!this.showLineNumbers || !hasContent) {
            return '';
        }
        const num = this.lineNumber++;
        return `<span class="line-number">${num}</span>`;
    }

    /**
     * Checks if a value is a primitive (not an object or array)
     */
    private static isPrimitive(value: any): boolean {
        return value === null || 
               typeof value === 'string' || 
               typeof value === 'number' || 
               typeof value === 'boolean';
    }

    /**
     * Renders JSON object as formatted HTML
     */
    static renderJson(value: any, indent: number = 0, resetCounter: boolean = true): string {
        if (resetCounter) {
            this.resetLineNumber();
        }
        if (value === null) {
            return '<span class="null">null</span>';
        }
        
        if (Array.isArray(value)) {
            if (value.length === 0) {
                return '<span class="json-array">[]</span>';
            }
            const items = value.map((v, i) => {
                const comma = i < value.length - 1 ? '<span class="comma">,</span>' : '';
                // Only show line number if the item is a primitive value
                const isPrimitive = this.isPrimitive(v);
                const lineNum = this.getLineNumberForContent(isPrimitive);
                return `<div class="json-line">${lineNum}${this.renderJson(v, indent + 1, false)}${comma}</div>`;
            }).join('');
            return `<span class="json-array"><span class="bracket">[</span><details open><summary></summary><div class="json-items">${items}</div></details><span class="bracket">]</span></span>`;
        }

        switch (typeof value) {
            case 'object':
                const entries = Object.entries(value);
                const entryItems = entries.map(([k, v], i) => {
                    const comma = i < entries.length - 1 ? '<span class="comma">,</span>' : '';
                    // Always show line number for object properties (they have keys)
                    const lineNum = this.getLineNumberForContent(true);
                    return `<div class="json-line">${lineNum}<span class="key">"${this.escapeHtml(k)}"</span>: ${this.renderJson(v, indent + 1, false)}${comma}</div>`;
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

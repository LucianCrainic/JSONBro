/**
 * JSON formatting utilities
 */
export class JSONFormatter {
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
     * Renders JSON object as formatted HTML with line numbers on the left
     */
    static renderJson(value: any): string {
        const lines = this.formatJsonToLines(value, 0);
        
        if (!this.showLineNumbers) {
            // Without line numbers, just render the content
            return `<div class="json-content">${lines.map(line => 
                `<div class="json-line">${line}</div>`
            ).join('')}</div>`;
        }
        
        // With line numbers, create a two-column layout
        const lineNumbersHtml = lines.map((_, i) => 
            `<div class="line-number">${i + 1}</div>`
        ).join('');
        
        const contentHtml = lines.map(line => 
            `<div class="json-line">${line}</div>`
        ).join('');
        
        return `<div class="json-container"><div class="line-numbers">${lineNumbersHtml}</div><div class="json-content">${contentHtml}</div></div>`;
    }

    /**
     * Formats JSON value into an array of line strings
     */
    private static formatJsonToLines(value: any, indent: number = 0): string[] {
        const lines: string[] = [];
        const indentStr = '  '.repeat(indent);
        
        if (value === null) {
            return [`${indentStr}<span class="null">null</span>`];
        }
        
        if (Array.isArray(value)) {
            if (value.length === 0) {
                return [`${indentStr}<span class="bracket">[]</span>`];
            }
            
            lines.push(`${indentStr}<span class="bracket">[</span>`);
            value.forEach((item, i) => {
                const itemLines = this.formatJsonToLines(item, indent + 1);
                const comma = i < value.length - 1 ? '<span class="comma">,</span>' : '';
                
                if (itemLines.length === 1) {
                    lines.push(itemLines[0] + comma);
                } else {
                    itemLines.forEach((line, j) => {
                        if (j === itemLines.length - 1) {
                            lines.push(line + comma);
                        } else {
                            lines.push(line);
                        }
                    });
                }
            });
            lines.push(`${indentStr}<span class="bracket">]</span>`);
            return lines;
        }
        
        if (typeof value === 'object') {
            const entries = Object.entries(value);
            
            if (entries.length === 0) {
                return [`${indentStr}<span class="brace">{}</span>`];
            }
            
            lines.push(`${indentStr}<span class="brace">{</span>`);
            entries.forEach(([key, val], i) => {
                const comma = i < entries.length - 1 ? '<span class="comma">,</span>' : '';
                const valueLines = this.formatJsonToLines(val, indent + 1);
                const keyIndent = '  '.repeat(indent + 1);
                
                if (valueLines.length === 1) {
                    // Single line value
                    const valuePart = valueLines[0].trim();
                    lines.push(`${keyIndent}<span class="key">"${this.escapeHtml(key)}"</span><span class="colon">:</span> ${valuePart}${comma}`);
                } else {
                    // Multi-line value
                    lines.push(`${keyIndent}<span class="key">"${this.escapeHtml(key)}"</span><span class="colon">:</span> ${valueLines[0].trim()}`);
                    for (let j = 1; j < valueLines.length; j++) {
                        if (j === valueLines.length - 1) {
                            lines.push(valueLines[j] + comma);
                        } else {
                            lines.push(valueLines[j]);
                        }
                    }
                }
            });
            lines.push(`${indentStr}<span class="brace">}</span>`);
            return lines;
        }
        
        // Primitive values
        if (typeof value === 'string') {
            return [`${indentStr}<span class="string">"${this.escapeHtml(value)}"</span>`];
        }
        if (typeof value === 'number') {
            return [`${indentStr}<span class="number">${value}</span>`];
        }
        if (typeof value === 'boolean') {
            return [`${indentStr}<span class="boolean">${value}</span>`];
        }
        
        return [`${indentStr}${String(value)}`];
    }
}


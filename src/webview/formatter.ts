/**
 * JSON formatting utilities
 */
export class JSONFormatter {
    private static showLineNumbers: boolean = true;
    private static foldId: number = 0;

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
     * Resets fold ID counter
     */
    private static resetFoldId(): void {
        this.foldId = 0;
    }

    /**
     * Gets next unique fold ID
     */
    private static getNextFoldId(): number {
        return this.foldId++;
    }

    /**
     * Renders JSON object as formatted HTML with line numbers on the left and folding support
     */
    static renderJson(value: any): string {
        this.resetFoldId();
        const lines = this.formatJsonToLines(value, 0);
        
        // data-line lets folding pair a content line with its gutter entry
        // directly, instead of searching the line list for its position.
        const contentHtml = lines.map((line, i) =>
            `<div class="json-line" data-line="${i + 1}">${line}</div>`
        ).join('');

        if (!this.showLineNumbers) {
            // Without line numbers, just render the content
            return `<div class="json-content">${contentHtml}</div>`;
        }

        // With line numbers, create a two-column layout
        const lineNumbersHtml = lines.map((_, i) =>
            `<div class="line-number" data-line="${i + 1}">${i + 1}</div>`
        ).join('');

        return `<div class="json-container"><div class="line-numbers">${lineNumbersHtml}</div><div class="json-content">${contentHtml}</div></div>`;
    }

    /**
     * Formats JSON value into an array of line strings with folding support
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
            
            const foldId = this.getNextFoldId();
            const arrow = `<span class="fold-arrow" data-fold-id="${foldId}">▼</span>`;
            lines.push(`${indentStr}${arrow}<span class="bracket">[</span>`);
            
            value.forEach((item, i) => {
                const itemLines = this.formatJsonToLines(item, indent + 1);
                const comma = i < value.length - 1 ? '<span class="comma">,</span>' : '';
                
                if (itemLines.length === 1) {
                    lines.push(`<span class="foldable-content" data-fold-id="${foldId}">${itemLines[0]}${comma}</span>`);
                } else {
                    itemLines.forEach((line, j) => {
                        if (j === itemLines.length - 1) {
                            lines.push(`<span class="foldable-content" data-fold-id="${foldId}">${line}${comma}</span>`);
                        } else {
                            lines.push(`<span class="foldable-content" data-fold-id="${foldId}">${line}</span>`);
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
            
            const foldId = this.getNextFoldId();
            const arrow = `<span class="fold-arrow" data-fold-id="${foldId}">▼</span>`;
            lines.push(`${indentStr}${arrow}<span class="brace">{</span>`);
            
            entries.forEach(([key, val], i) => {
                const comma = i < entries.length - 1 ? '<span class="comma">,</span>' : '';
                const valueLines = this.formatJsonToLines(val, indent + 1);
                const keyIndent = '  '.repeat(indent + 1);
                
                if (valueLines.length === 1) {
                    // Single line value
                    const valuePart = valueLines[0].trim();
                    lines.push(`<span class="foldable-content" data-fold-id="${foldId}">${keyIndent}<span class="key">"${this.escapeHtml(key)}"</span><span class="colon">:</span> ${valuePart}${comma}</span>`);
                } else {
                    // Multi-line value
                    lines.push(`<span class="foldable-content" data-fold-id="${foldId}">${keyIndent}<span class="key">"${this.escapeHtml(key)}"</span><span class="colon">:</span> ${valueLines[0].trim()}</span>`);
                    for (let j = 1; j < valueLines.length; j++) {
                        if (j === valueLines.length - 1) {
                            lines.push(`<span class="foldable-content" data-fold-id="${foldId}">${valueLines[j]}${comma}</span>`);
                        } else {
                            lines.push(`<span class="foldable-content" data-fold-id="${foldId}">${valueLines[j]}</span>`);
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


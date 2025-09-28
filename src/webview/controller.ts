import { JSONFormatter } from './formatter';
import { JSONDiff } from './diff';
import { JSONSearch } from './search';

/**
 * Main webview controller that handles JSON formatting functionality
 */
export class WebviewController {
    private history: string[] = [];
    private currentJsonObject: any = null;
    private jsonSearch: JSONSearch = new JSONSearch();

    /**
     * Initializes the webview controller
     */
    public initialize(): void {
        this.setupEventListeners();
    }

    /**
     * Attempts to parse JSON with support for single quotes and other common variations
     */
    private parseFlexibleJson(input: string): any {
        // First, try standard JSON parsing
        try {
            return JSON.parse(input);
        } catch (error) {
            // If that fails, try to fix common issues and parse again
            const normalizedInput = this.normalizeJsonString(input);
            return JSON.parse(normalizedInput);
        }
    }

    /**
     * Normalizes a JSON-like string to valid JSON format
     */
    private normalizeJsonString(input: string): string {
        let result = input.trim();
        
        // Convert single quotes to double quotes for property names and string values
        result = this.convertSingleQuotesToDouble(result);
        
        // Handle unquoted property names (common in JavaScript object notation)
        result = this.addQuotesToPropertyNames(result);
        
        return result;
    }

    /**
     * Converts single quotes to double quotes while preserving quotes inside strings
     */
    private convertSingleQuotesToDouble(input: string): string {
        let result = '';
        let inDoubleQuotes = false;
        let inSingleQuotes = false;
        let escaped = false;

        for (let i = 0; i < input.length; i++) {
            const char = input[i];

            if (escaped) {
                result += char;
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                result += char;
                continue;
            }

            if (char === '"' && !inSingleQuotes) {
                inDoubleQuotes = !inDoubleQuotes;
                result += char;
            } else if (char === "'" && !inDoubleQuotes) {
                if (!inSingleQuotes) {
                    // Starting a single-quoted string, convert to double quote
                    inSingleQuotes = true;
                    result += '"';
                } else {
                    // Ending a single-quoted string, convert to double quote
                    inSingleQuotes = false;
                    result += '"';
                }
            } else {
                result += char;
            }
        }

        return result;
    }

    /**
     * Adds quotes to unquoted property names
     */
    private addQuotesToPropertyNames(input: string): string {
        // This regex matches unquoted property names in object notation
        // It looks for word characters followed by a colon, not already in quotes
        return input.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
    }

    /**
     * Gets a descriptive error message for JSON parsing failures
     */
    private getParseErrorMessage(input: string, originalError: Error): string {
        const suggestions: string[] = [];
        
        // Check for common issues
        if (input.includes("'")) {
            suggestions.push("Try using double quotes (\") instead of single quotes (')");
        }
        
        if (/[{,]\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*:/.test(input)) {
            suggestions.push("Property names should be quoted (e.g., \"propertyName\": value)");
        }
        
        if (input.includes('undefined')) {
            suggestions.push("Replace 'undefined' with 'null' or remove the property");
        }
        
        if (/,\s*[}\]]/.test(input)) {
            suggestions.push("Remove trailing commas before closing brackets");
        }

        let message = `Invalid JSON: ${originalError.message}`;
        
        if (suggestions.length > 0) {
            message += '\n\nSuggestions:\n• ' + suggestions.join('\n• ');
        }
        
        return message;
    }

    private setupEventListeners(): void {
        const formatBtn = document.getElementById('format');
        const clearBtn = document.getElementById('clear');
        const historyBtn = document.getElementById('history');
        const copyBtn = document.getElementById('copy');
        const searchToggleBtn = document.getElementById('search-toggle');

        if (formatBtn) {
            formatBtn.addEventListener('click', () => this.formatJson());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearInput());
        }

        if (historyBtn) {
            historyBtn.addEventListener('click', () => this.toggleHistory());
        }

        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyToClipboard());
        }

        if (searchToggleBtn) {
            searchToggleBtn.addEventListener('click', () => this.toggleInlineSearch());
        }

        // Inline search event listeners
        this.setupSearchEventListeners();
    }

    private formatJson(): void {
        const inputEl = document.getElementById('input') as HTMLTextAreaElement;
        const output = document.getElementById('output');
        
        if (!inputEl || !output) {
            return;
        }

        const input = inputEl.value.trim();
        if (!input) {
            output.textContent = 'Please enter JSON data to format.';
            return;
        }

        // Add to history
        this.history.unshift(input);
        if (this.history.length > 50) {
            this.history = this.history.slice(0, 50); // Keep only last 50 items
        }

        try {
            const parsedJson = this.parseFlexibleJson(input);
            this.currentJsonObject = parsedJson;
            output.style.color = 'inherit';
            output.innerHTML = JSONFormatter.renderJson(parsedJson);
            this.updateHistoryPanel(inputEl, output);
        } catch (error) {
            this.currentJsonObject = null;
            output.style.color = 'var(--vscode-errorForeground)';
            const errorMessage = error instanceof Error 
                ? this.getParseErrorMessage(input, error)
                : 'Unknown parsing error';
            output.textContent = errorMessage;
        }
    }

    private clearInput(): void {
        const inputEl = document.getElementById('input') as HTMLTextAreaElement;
        const output = document.getElementById('output');
        
        if (inputEl) inputEl.value = '';
        if (output) output.innerHTML = '';
        
        this.currentJsonObject = null;
    }

    private toggleHistory(): void {
        const backdrop = document.getElementById('history-backdrop');
        const panel = document.getElementById('history-panel');
        
        if (backdrop && panel) {
            const isVisible = backdrop.style.display === 'block';
            backdrop.style.display = isVisible ? 'none' : 'block';
            panel.style.display = isVisible ? 'none' : 'block';
        }
    }

    private copyToClipboard(): void {
        if (this.currentJsonObject) {
            const formatted = JSON.stringify(this.currentJsonObject, null, 2);
            navigator.clipboard.writeText(formatted).then(() => {
                // Could show a toast notification here
                console.log('JSON copied to clipboard');
            }).catch(err => {
                console.error('Failed to copy to clipboard:', err);
            });
        }
    }

    private updateHistoryPanel(inputEl: HTMLTextAreaElement, output: HTMLElement): void {
        const panel = document.getElementById('history-content');
        if (!panel) {
            return;
        }

        panel.innerHTML = this.history
            .map((h, idx) => {
                const preview = JSONFormatter.escapeHtml(h).slice(0, 100);
                return `
                    <div class="history-item">
                        <pre>${preview}</pre>
                        <div class="history-actions">
                            <button class="show-btn" data-index="${idx}" title="Show">
                                <svg class="icon" viewBox="0 0 24 24">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </button>
                            <button class="remove-btn" data-index="${idx}" title="Remove">
                                <svg class="icon" viewBox="0 0 24 24">
                                    <polyline points="3,6 5,6 21,6"></polyline>
                                    <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            })
            .join('');

        // Attach event listeners to history buttons
        panel.querySelectorAll('button.show-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.getAttribute('data-index') || '0', 10);
                const value = this.history[index];
                inputEl.value = value;
                
                try {
                    const obj = this.parseFlexibleJson(value);
                    this.currentJsonObject = obj;
                    output.style.color = 'inherit';
                    output.innerHTML = JSONFormatter.renderJson(obj);
                } catch (err) {
                    this.currentJsonObject = null;
                    output.style.color = 'var(--vscode-errorForeground)';
                    const errorMessage = err instanceof Error 
                        ? this.getParseErrorMessage(value, err)
                        : 'Unknown parsing error';
                    output.textContent = errorMessage;
                }
            });
        });

        panel.querySelectorAll('button.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.getAttribute('data-index') || '0', 10);
                this.history.splice(index, 1);
                this.updateHistoryPanel(inputEl, output);
            });
        });
    }

    private setupSearchEventListeners(): void {
        const searchClose = document.getElementById('search-close');
        const searchInput = document.getElementById('search-input') as HTMLInputElement;
        const searchNext = document.getElementById('search-next');
        const searchPrev = document.getElementById('search-prev');

        if (searchClose) {
            searchClose.addEventListener('click', () => this.closeSearch());
        }

        if (searchInput) {
            searchInput.addEventListener('input', () => this.performSearch());
            searchInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    if (event.shiftKey) {
                        this.searchPrevious();
                    } else {
                        this.searchNext();
                    }
                } else if (event.key === 'Escape') {
                    this.closeSearch();
                }
            });
        }

        if (searchNext) {
            searchNext.addEventListener('click', () => this.searchNext());
        }

        if (searchPrev) {
            searchPrev.addEventListener('click', () => this.searchPrevious());
        }
    }

    private toggleInlineSearch(): void {
        const searchContainer = document.getElementById('search-container');
        const searchToggleBtn = document.getElementById('search-toggle');
        const searchInput = document.getElementById('search-input') as HTMLInputElement;
        
        // Only allow search if there's JSON output
        if (!this.currentJsonObject) {
            return;
        }
        
        if (searchContainer && searchToggleBtn) {
            const isVisible = searchContainer.style.display !== 'none';
            
            if (isVisible) {
                // Hide search
                searchContainer.style.display = 'none';
                searchToggleBtn.style.display = 'flex';
                this.clearSearch();
            } else {
                // Show search
                searchContainer.style.display = 'flex';
                searchToggleBtn.style.display = 'none';
                if (searchInput) {
                    setTimeout(() => searchInput.focus(), 100);
                }
            }
        }
    }

    private closeSearch(): void {
        const searchContainer = document.getElementById('search-container');
        const searchToggleBtn = document.getElementById('search-toggle');
        
        if (searchContainer && searchToggleBtn) {
            searchContainer.style.display = 'none';
            searchToggleBtn.style.display = 'flex';
            this.clearSearch();
        }
    }

    private performSearch(): void {
        try {
            const searchInput = document.getElementById('search-input') as HTMLInputElement;
            const output = document.getElementById('output');
            const searchInfo = document.getElementById('search-info');
            const searchNext = document.getElementById('search-next') as HTMLButtonElement;
            const searchPrev = document.getElementById('search-prev') as HTMLButtonElement;

            if (!searchInput || !output || !searchInfo) {
                return;
            }

            const searchTerm = searchInput.value.trim();
            const matchCount = this.jsonSearch.search(searchTerm, output);
            
            // Update search info
            if (matchCount === 0) {
                searchInfo.textContent = searchTerm ? 'No matches' : '0 matches';
            } else {
                const { current, total } = this.jsonSearch.getCurrentMatchInfo();
                searchInfo.textContent = `${current} of ${total} matches`;
            }

            // Update navigation buttons
            if (searchNext && searchPrev) {
                searchNext.disabled = matchCount === 0;
                searchPrev.disabled = matchCount === 0;
            }
        } catch (error) {
            console.error('Error performing search:', error);
            const searchInfo = document.getElementById('search-info');
            if (searchInfo) {
                searchInfo.textContent = 'Search error';
            }
        }
    }

    private searchNext(): void {
        try {
            this.jsonSearch.nextMatch();
            this.updateSearchInfo();
        } catch (error) {
            console.error('Error navigating to next match:', error);
        }
    }

    private searchPrevious(): void {
        try {
            this.jsonSearch.previousMatch();
            this.updateSearchInfo();
        } catch (error) {
            console.error('Error navigating to previous match:', error);
        }
    }

    private updateSearchInfo(): void {
        const searchInfo = document.getElementById('search-info');
        if (searchInfo) {
            const { current, total } = this.jsonSearch.getCurrentMatchInfo();
            searchInfo.textContent = total > 0 ? `${current} of ${total} matches` : 'No matches';
        }
    }

    private clearSearch(): void {
        try {
            const searchInput = document.getElementById('search-input') as HTMLInputElement;
            const output = document.getElementById('output');
            
            if (searchInput) {
                searchInput.value = '';
            }
            
            if (output) {
                this.jsonSearch.clearHighlights(output);
            }
            
            this.updateSearchInfo();
        } catch (error) {
            console.error('Error clearing search:', error);
        }
    }
}

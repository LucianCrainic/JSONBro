import { JSONFormatter } from './formatter';
import { JSONDiff } from './diff';
import { JSONSearch } from './search';

/**
 * Main webview controller that handles JSON formatting functionality
 */
interface DiffHistoryEntry {
    leftJson: string;
    rightJson: string;
    timestamp: number;
}

export class WebviewController {
    private formatHistory: string[] = [];
    private diffHistory: DiffHistoryEntry[] = [];
    private currentJsonObject: any = null;
    private jsonSearch: JSONSearch = new JSONSearch();
    private currentMode: 'format' | 'diff' = 'format';

    /**
     * Initializes the webview controller
     */
    public initialize(): void {
        this.setupEventListeners();
        this.setupSplitter();
    }

    /**
     * Sets the initial mode based on the command that opened the webview
     */
    public setInitialMode(mode: 'format' | 'diff'): void {
        this.currentMode = mode;
        // The UI is already set correctly via the HTML template based on mode
        // Just need to update any JavaScript state if necessary
        if (mode === 'diff') {
            this.setupDiffSplitters();
        }
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
        // Mode switching
        const formatModeBtn = document.getElementById('format-mode');
        const diffModeBtn = document.getElementById('diff-mode');
        const actionBtn = document.getElementById('action-btn');
        
        // Other controls
        const clearBtn = document.getElementById('clear');
        const historyBtn = document.getElementById('history');
        const copyBtn = document.getElementById('copy');
        const searchToggleBtn = document.getElementById('search-toggle');

        if (formatModeBtn) {
            formatModeBtn.addEventListener('click', () => this.switchMode('format'));
        }

        if (diffModeBtn) {
            diffModeBtn.addEventListener('click', () => this.switchMode('diff'));
        }

        if (actionBtn) {
            actionBtn.addEventListener('click', () => {
                if (this.currentMode === 'format') {
                    this.formatJson();
                } else {
                    this.compareJson();
                }
            });
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

        // Global keyboard shortcuts
        this.setupGlobalKeyboardShortcuts();
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
        this.formatHistory.unshift(input);
        if (this.formatHistory.length > 50) {
            this.formatHistory = this.formatHistory.slice(0, 50); // Keep only last 50 items
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
        if (this.currentMode === 'format') {
            const inputEl = document.getElementById('input') as HTMLTextAreaElement;
            const output = document.getElementById('output');
            
            if (inputEl) inputEl.value = '';
            if (output) output.innerHTML = '';
        } else {
            const leftJsonEl = document.getElementById('left-json') as HTMLTextAreaElement;
            const rightJsonEl = document.getElementById('right-json') as HTMLTextAreaElement;
            const diffOutput = document.getElementById('diff-output');
            
            // Save to diff history if both inputs have content
            if (leftJsonEl && rightJsonEl && leftJsonEl.value.trim() && rightJsonEl.value.trim()) {
                this.diffHistory.unshift({
                    leftJson: leftJsonEl.value.trim(),
                    rightJson: rightJsonEl.value.trim(),
                    timestamp: Date.now()
                });
                if (this.diffHistory.length > 50) {
                    this.diffHistory = this.diffHistory.slice(0, 50);
                }
                // Update the history panel to show the new entry
                this.updateHistoryPanel();
            }
            
            if (leftJsonEl) leftJsonEl.value = '';
            if (rightJsonEl) rightJsonEl.value = '';
            if (diffOutput) diffOutput.innerHTML = '';
        }
        
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
        if (this.currentMode === 'format') {
            if (this.currentJsonObject) {
                const formatted = JSON.stringify(this.currentJsonObject, null, 2);
                navigator.clipboard.writeText(formatted).then(() => {
                    console.log('JSON copied to clipboard');
                }).catch(err => {
                    console.error('Failed to copy to clipboard:', err);
                });
            }
        } else {
            // In diff mode, copy the diff result as text
            const diffOutput = document.getElementById('diff-output');
            if (diffOutput && diffOutput.textContent) {
                navigator.clipboard.writeText(diffOutput.textContent).then(() => {
                    console.log('Diff result copied to clipboard');
                }).catch(err => {
                    console.error('Failed to copy to clipboard:', err);
                });
            }
        }
    }

    private updateHistoryPanel(inputEl?: HTMLTextAreaElement, output?: HTMLElement): void {
        const panel = document.getElementById('history-content');
        if (!panel) {
            return;
        }

        if (this.currentMode === 'format') {
            this.updateFormatHistoryPanel(panel, inputEl!, output!);
        } else {
            this.updateDiffHistoryPanel(panel);
        }
    }

    private updateFormatHistoryPanel(panel: HTMLElement, inputEl: HTMLTextAreaElement, output: HTMLElement): void {
        panel.innerHTML = this.formatHistory
            .map((h: string, idx: number) => {
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

        // Attach event listeners to format history buttons
        panel.querySelectorAll('button.show-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.getAttribute('data-index') || '0', 10);
                const value = this.formatHistory[index];
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
                this.formatHistory.splice(index, 1);
                this.updateHistoryPanel(inputEl, output);
            });
        });
    }

    private updateDiffHistoryPanel(panel: HTMLElement): void {
        panel.innerHTML = this.diffHistory
            .map((entry: DiffHistoryEntry, idx: number) => {
                const leftPreview = JSONFormatter.escapeHtml(entry.leftJson).slice(0, 50);
                const rightPreview = JSONFormatter.escapeHtml(entry.rightJson).slice(0, 50);
                const date = new Date(entry.timestamp).toLocaleString();
                return `
                    <div class="history-item diff-history-item">
                        <div class="diff-preview">
                            <div class="diff-preview-header">${date}</div>
                            <div class="diff-preview-content">
                                <div class="left-preview">L: ${leftPreview}${entry.leftJson.length > 50 ? '...' : ''}</div>
                                <div class="right-preview">R: ${rightPreview}${entry.rightJson.length > 50 ? '...' : ''}</div>
                            </div>
                        </div>
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

        // Attach event listeners to diff history buttons
        panel.querySelectorAll('button.show-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.getAttribute('data-index') || '0', 10);
                const entry = this.diffHistory[index];
                
                const leftJsonEl = document.getElementById('left-json') as HTMLTextAreaElement;
                const rightJsonEl = document.getElementById('right-json') as HTMLTextAreaElement;
                
                if (leftJsonEl && rightJsonEl) {
                    leftJsonEl.value = entry.leftJson;
                    rightJsonEl.value = entry.rightJson;
                    // Automatically run the comparison
                    this.compareJson();
                }
            });
        });

        panel.querySelectorAll('button.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.getAttribute('data-index') || '0', 10);
                this.diffHistory.splice(index, 1);
                this.updateHistoryPanel();
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

    private setupSplitter(): void {
        const splitter = document.getElementById('splitter');
        const container = document.getElementById('container');
        const inputPanel = document.getElementById('input-panel');
        const outputPanel = document.getElementById('output-panel');

        if (!splitter || !container || !inputPanel || !outputPanel) {
            return;
        }

        let isDragging = false;
        let startX = 0;
        let startInputWidth = 0;

        const onMouseDown = (e: MouseEvent) => {
            isDragging = true;
            startX = e.clientX;
            startInputWidth = inputPanel.offsetWidth;
            
            splitter.classList.add('dragging');
            document.body.classList.add('dragging');
            document.body.style.userSelect = 'none';
            
            e.preventDefault();
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const containerWidth = container.offsetWidth;
            const splitterWidth = splitter.offsetWidth;
            const padding = 32; // Container padding (16px on each side)
            const availableWidth = containerWidth - splitterWidth - padding;
            
            let newInputWidth = startInputWidth + deltaX;
            
            // Apply constraints
            const minWidth = 200;
            const maxWidth = availableWidth - minWidth;
            
            newInputWidth = Math.max(minWidth, Math.min(newInputWidth, maxWidth));
            
            // Calculate percentage for input panel
            const inputWidthPercent = (newInputWidth / availableWidth) * 100;
            
            inputPanel.style.width = `${inputWidthPercent}%`;
            
            e.preventDefault();
        };

        const onMouseUp = () => {
            if (!isDragging) return;
            
            isDragging = false;
            splitter.classList.remove('dragging');
            document.body.classList.remove('dragging');
            document.body.style.userSelect = '';
        };

        // Double-click to reset to 50/50
        const onDoubleClick = () => {
            inputPanel.style.width = '50%';
        };

        // Splitter events
        splitter.addEventListener('mousedown', onMouseDown);
        splitter.addEventListener('dblclick', onDoubleClick);
        
        // Global mouse events for dragging
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // Prevent text selection during drag
        splitter.addEventListener('selectstart', (e) => e.preventDefault());

        // Keyboard shortcuts for splitter adjustment (format mode only)
        document.addEventListener('keydown', (e) => {
            if (this.currentMode === 'format') {
                // Ctrl/Cmd + 1: Focus input and set to wider view (70/30)
                if ((e.ctrlKey || e.metaKey) && e.key === '1') {
                    inputPanel.style.width = '70%';
                    const input = document.getElementById('input') as HTMLTextAreaElement;
                    if (input) input.focus();
                    e.preventDefault();
                }
                // Ctrl/Cmd + 2: Focus output and set to wider view (30/70)
                else if ((e.ctrlKey || e.metaKey) && e.key === '2') {
                    inputPanel.style.width = '30%';
                    e.preventDefault();
                }
                // Ctrl/Cmd + 0: Reset to equal view (50/50)
                else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
                    inputPanel.style.width = '50%';
                    e.preventDefault();
                }
            }
        });
    }

    private switchMode(mode: 'format' | 'diff'): void {
        this.currentMode = mode;
        
        const formatModeBtn = document.getElementById('format-mode');
        const diffModeBtn = document.getElementById('diff-mode');
        const formatContainer = document.getElementById('format-container');
        const diffContainer = document.getElementById('diff-container');
        const actionBtn = document.getElementById('action-btn');
        const actionText = document.getElementById('action-text');
        const actionIcon = actionBtn?.querySelector('svg');

        // Update mode button states
        if (formatModeBtn && diffModeBtn) {
            formatModeBtn.classList.toggle('active', mode === 'format');
            diffModeBtn.classList.toggle('active', mode === 'diff');
        }

        // Switch containers
        if (formatContainer && diffContainer) {
            formatContainer.style.display = mode === 'format' ? 'flex' : 'none';
            diffContainer.style.display = mode === 'diff' ? 'flex' : 'none';
        }

        // Update action button
        if (actionText && actionIcon) {
            if (mode === 'format') {
                actionText.textContent = 'Format';
                actionIcon.innerHTML = `
                    <polyline points="16,18 22,12 16,6"></polyline>
                    <polyline points="8,6 2,12 8,18"></polyline>
                `;
                actionBtn?.setAttribute('title', 'Format JSON');
            } else {
                actionText.textContent = 'Compare';
                actionIcon.innerHTML = `
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                    <path d="M9 12h6"></path>
                    <path d="M12 9v6"></path>
                `;
                actionBtn?.setAttribute('title', 'Compare JSON');
            }
        }

        // Show/hide buttons based on mode
        const searchToggleBtn = document.getElementById('search-toggle');
        const copyBtn = document.getElementById('copy');
        
        if (searchToggleBtn && copyBtn) {
            if (mode === 'format') {
                searchToggleBtn.style.display = 'flex';
                copyBtn.style.display = 'flex';
            } else {
                searchToggleBtn.style.display = 'none';
                copyBtn.style.display = 'none';
                // Also hide search container if it's open
                const searchContainer = document.getElementById('search-container');
                if (searchContainer) {
                    searchContainer.style.display = 'none';
                }
            }
        }

        // Setup splitters for diff mode
        if (mode === 'diff') {
            this.setupDiffSplitters();
        }
    }

    private compareJson(): void {
        const leftJsonEl = document.getElementById('left-json') as HTMLTextAreaElement;
        const rightJsonEl = document.getElementById('right-json') as HTMLTextAreaElement;
        const diffOutput = document.getElementById('diff-output');

        if (!leftJsonEl || !rightJsonEl || !diffOutput) {
            return;
        }

        const leftJson = leftJsonEl.value.trim();
        const rightJson = rightJsonEl.value.trim();

        if (!leftJson || !rightJson) {
            diffOutput.innerHTML = '<div class="diff-error">Please enter JSON in both panes to compare.</div>';
            return;
        }

        try {
            const leftParsed = this.parseFlexibleJson(leftJson);
            const rightParsed = this.parseFlexibleJson(rightJson);
            
            // Format both JSON inputs in their respective textareas
            const leftFormatted = JSON.stringify(leftParsed, null, 2);
            const rightFormatted = JSON.stringify(rightParsed, null, 2);
            
            leftJsonEl.value = leftFormatted;
            rightJsonEl.value = rightFormatted;
            
            // Generate and display the diff
            diffOutput.style.color = 'inherit';
            diffOutput.innerHTML = JSONDiff.renderJsonDiff(leftParsed, rightParsed);
            
            // Setup expandable value handlers
            this.setupExpandableValues(diffOutput);
        } catch (error) {
            diffOutput.style.color = 'var(--vscode-errorForeground)';
            const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
            diffOutput.innerHTML = `<div class="diff-error">Error parsing JSON: ${errorMessage}</div>`;
        }
    }

    private setupDiffSplitters(): void {
        this.setupDiffSplitter('diff-splitter-left', 'left-json-panel', 'diff-result-panel');
        this.setupDiffSplitter('diff-splitter-right', 'diff-result-panel', 'right-json-panel');
    }

    private setupDiffSplitter(splitterId: string, leftPanelId: string, rightPanelId: string): void {
        const splitter = document.getElementById(splitterId);
        const leftPanel = document.getElementById(leftPanelId);
        const rightPanel = document.getElementById(rightPanelId);
        const container = document.getElementById('diff-container');

        if (!splitter || !leftPanel || !rightPanel || !container) {
            return;
        }

        let isDragging = false;
        let startX = 0;
        let startLeftWidth = 0;

        const onMouseDown = (e: MouseEvent) => {
            isDragging = true;
            startX = e.clientX;
            startLeftWidth = leftPanel.offsetWidth;
            
            splitter.classList.add('dragging');
            document.body.classList.add('dragging');
            document.body.style.userSelect = 'none';
            
            e.preventDefault();
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const containerWidth = container.offsetWidth;
            const allSplitters = container.querySelectorAll('.diff-splitter');
            const splitterWidth = Array.from(allSplitters).reduce((sum, s) => sum + s.clientWidth, 0);
            const padding = 32;
            const availableWidth = containerWidth - splitterWidth - padding;
            
            let newLeftWidth = startLeftWidth + deltaX;
            
            // Apply constraints
            const minWidth = 200;
            const maxWidth = availableWidth - minWidth * 2;
            
            newLeftWidth = Math.max(minWidth, Math.min(newLeftWidth, maxWidth));
            
            const leftWidthPercent = (newLeftWidth / availableWidth) * 100;
            
            leftPanel.style.width = `${leftWidthPercent}%`;
            
            e.preventDefault();
        };

        const onMouseUp = () => {
            if (!isDragging) return;
            
            isDragging = false;
            splitter.classList.remove('dragging');
            document.body.classList.remove('dragging');
            document.body.style.userSelect = '';
        };

        splitter.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        splitter.addEventListener('selectstart', (e) => e.preventDefault());
    }

    private setupGlobalKeyboardShortcuts(): void {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + M: Switch between format and diff modes
            if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
                this.switchMode(this.currentMode === 'format' ? 'diff' : 'format');
                e.preventDefault();
            }
            // Ctrl/Cmd + Enter: Execute action (format or compare)
            else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                if (this.currentMode === 'format') {
                    this.formatJson();
                } else {
                    this.compareJson();
                }
                e.preventDefault();
            }
            // Ctrl/Cmd + K: Clear inputs
            else if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                this.clearInput();
                e.preventDefault();
            }
        });
    }

    private setupExpandableValues(container: HTMLElement): void {
        const expandableValues = container.querySelectorAll('.expandable-value');
        expandableValues.forEach(element => {
            element.addEventListener('click', () => {
                const fullValue = element.getAttribute('data-full');
                if (fullValue) {
                    element.innerHTML = fullValue;
                    element.classList.remove('expandable-value');
                    element.removeAttribute('data-full');
                    element.removeAttribute('title');
                }
            });
        });
    }
}

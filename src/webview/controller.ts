import { JSONFormatter } from './formatter';
import { JSONDiff } from './diff';
import { JSONSearch } from './search';
import { JSONParser } from './json-parser';

// VS Code API declaration
declare function acquireVsCodeApi(): any;

/**
 * Main webview controller that handles JSON formatting functionality
 */
export class WebviewController {
    private currentJsonObject: any = null;
    private jsonSearch: JSONSearch = new JSONSearch();
    private currentMode: 'format' | 'diff' = 'format';
    private vscode: any;
    private isLoadingFromHistory: boolean = false;

    /**
     * Initializes the webview controller
     */
    public initialize(): void {
        // Acquire VS Code API once during initialization
        if (typeof acquireVsCodeApi !== 'undefined') {
            this.vscode = acquireVsCodeApi();
        }
        
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
            this.setupDiffMaximize();
        }
    }

    /**
     * Attempts to parse JSON with support for single quotes and other common variations
     */
    private parseFlexibleJson(input: string): any {
        return JSONParser.parseFlexible(input);
    }

    private setupEventListeners(): void {
        // Mode switching
        const formatModeBtn = document.getElementById('format-mode');
        const diffModeBtn = document.getElementById('diff-mode');
        const actionBtn = document.getElementById('action-btn');
        
        // Other controls
        const clearBtn = document.getElementById('clear');
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

        // Listen for messages from the extension
        this.setupMessageHandling();
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

        try {
            const parsedJson = this.parseFlexibleJson(input);
            this.currentJsonObject = parsedJson;
            output.style.color = 'inherit';
            output.innerHTML = JSONFormatter.renderJson(parsedJson);
            
            // Only send message to extension to add to history if not loading from history
            if (!this.isLoadingFromHistory) {
                this.postMessage({
                    command: 'addFormatHistory',
                    json: input
                });
            }
        } catch (error) {
            this.currentJsonObject = null;
            output.style.color = 'var(--vscode-errorForeground)';
            const errorMessage = error instanceof Error 
                ? JSONParser.getParseErrorMessage(input, error)
                : 'Unknown parsing error';
            output.textContent = errorMessage;
        }
    }

    /**
     * Sends a message to the VS Code extension
     */
    private postMessage(message: any): void {
        if (this.vscode) {
            this.vscode.postMessage(message);
        }
    }

    /**
     * Sets up message handling from the extension
     */
    private setupMessageHandling(): void {
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'loadJson':
                    this.loadJsonContent(message.json);
                    break;
                case 'loadDiff':
                    this.loadDiffContent(message.leftJson, message.rightJson);
                    break;
            }
        });
    }

    /**
     * Loads JSON content into the format panel
     */
    private loadJsonContent(json: string): void {
        const inputEl = document.getElementById('input') as HTMLTextAreaElement;
        if (inputEl) {
            this.isLoadingFromHistory = true;
            inputEl.value = json;
            this.formatJson();
            this.isLoadingFromHistory = false;
        }
    }

    /**
     * Loads JSON content into the diff panel
     */
    private loadDiffContent(leftJson: string, rightJson: string): void {
        const leftInput = document.getElementById('left-json') as HTMLTextAreaElement;
        const rightInput = document.getElementById('right-json') as HTMLTextAreaElement;
        
        if (leftInput && rightInput) {
            this.isLoadingFromHistory = true;
            leftInput.value = leftJson;
            rightInput.value = rightJson;
            this.compareJson();
            this.isLoadingFromHistory = false;
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
            
            if (leftJsonEl) leftJsonEl.value = '';
            if (rightJsonEl) rightJsonEl.value = '';
            if (diffOutput) diffOutput.innerHTML = '';
        }
        
        this.currentJsonObject = null;
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
        const container = document.getElementById('format-container');
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
            
            // Calculate the remaining width for output panel
            const newOutputWidth = availableWidth - newInputWidth;
            
            // Set both widths explicitly to override flex behavior
            inputPanel.style.width = `${newInputWidth}px`;
            inputPanel.style.flexBasis = `${newInputWidth}px`;
            inputPanel.style.flexGrow = '0';
            inputPanel.style.flexShrink = '0';
            
            outputPanel.style.width = `${newOutputWidth}px`;
            outputPanel.style.flexBasis = `${newOutputWidth}px`;
            outputPanel.style.flexGrow = '0';
            outputPanel.style.flexShrink = '0';
            
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
            const containerWidth = container.offsetWidth;
            const splitterWidth = splitter.offsetWidth;
            const padding = 32;
            const availableWidth = containerWidth - splitterWidth - padding;
            const halfWidth = availableWidth / 2;
            
            inputPanel.style.width = `${halfWidth}px`;
            inputPanel.style.flexBasis = `${halfWidth}px`;
            inputPanel.style.flexGrow = '0';
            inputPanel.style.flexShrink = '0';
            
            outputPanel.style.width = `${halfWidth}px`;
            outputPanel.style.flexBasis = `${halfWidth}px`;
            outputPanel.style.flexGrow = '0';
            outputPanel.style.flexShrink = '0';
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
                const containerWidth = container.offsetWidth;
                const splitterWidth = splitter.offsetWidth;
                const padding = 32;
                const availableWidth = containerWidth - splitterWidth - padding;
                
                // Ctrl/Cmd + 1: Focus input and set to wider view (70/30)
                if ((e.ctrlKey || e.metaKey) && e.key === '1') {
                    const inputWidth = availableWidth * 0.7;
                    const outputWidth = availableWidth * 0.3;
                    
                    inputPanel.style.width = `${inputWidth}px`;
                    inputPanel.style.flexBasis = `${inputWidth}px`;
                    inputPanel.style.flexGrow = '0';
                    inputPanel.style.flexShrink = '0';
                    
                    outputPanel.style.width = `${outputWidth}px`;
                    outputPanel.style.flexBasis = `${outputWidth}px`;
                    outputPanel.style.flexGrow = '0';
                    outputPanel.style.flexShrink = '0';
                    
                    const input = document.getElementById('input') as HTMLTextAreaElement;
                    if (input) input.focus();
                    e.preventDefault();
                }
                // Ctrl/Cmd + 2: Focus output and set to wider view (30/70)
                else if ((e.ctrlKey || e.metaKey) && e.key === '2') {
                    const inputWidth = availableWidth * 0.3;
                    const outputWidth = availableWidth * 0.7;
                    
                    inputPanel.style.width = `${inputWidth}px`;
                    inputPanel.style.flexBasis = `${inputWidth}px`;
                    inputPanel.style.flexGrow = '0';
                    inputPanel.style.flexShrink = '0';
                    
                    outputPanel.style.width = `${outputWidth}px`;
                    outputPanel.style.flexBasis = `${outputWidth}px`;
                    outputPanel.style.flexGrow = '0';
                    outputPanel.style.flexShrink = '0';
                    
                    e.preventDefault();
                }
                // Ctrl/Cmd + 0: Reset to equal view (50/50)
                else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
                    const halfWidth = availableWidth / 2;
                    
                    inputPanel.style.width = `${halfWidth}px`;
                    inputPanel.style.flexBasis = `${halfWidth}px`;
                    inputPanel.style.flexGrow = '0';
                    inputPanel.style.flexShrink = '0';
                    
                    outputPanel.style.width = `${halfWidth}px`;
                    outputPanel.style.flexBasis = `${halfWidth}px`;
                    outputPanel.style.flexGrow = '0';
                    outputPanel.style.flexShrink = '0';
                    
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

        // Setup maximize functionality for diff mode
        if (mode === 'diff') {
            this.setupDiffMaximize();
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
            
            // Only send message to extension to add to history if not loading from history
            if (!this.isLoadingFromHistory) {
                this.postMessage({
                    command: 'addDiffHistory',
                    leftJson: leftJson,
                    rightJson: rightJson
                });
            }
            
            // Setup expandable value handlers
            this.setupExpandableValues(diffOutput);
        } catch (error) {
            diffOutput.style.color = 'var(--vscode-errorForeground)';
            const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
            diffOutput.innerHTML = `<div class="diff-error">Error parsing JSON: ${errorMessage}</div>`;
        }
    }

    private setupDiffMaximize(): void {
        // Setup maximize functionality for all three diff panels
        this.setupMaximizeButton('maximize-left', 'left-json-panel');
        this.setupMaximizeButton('maximize-diff', 'diff-result-panel');
        this.setupMaximizeButton('maximize-right', 'right-json-panel');
    }

    private currentMaximizedPanel: string | null = null;

    private setupMaximizeButton(buttonId: string, panelId: string): void {
        const button = document.getElementById(buttonId);
        const panel = document.getElementById(panelId);

        if (!button || !panel) {
            return;
        }

        button.addEventListener('click', () => {
            this.toggleMaximizePanel(panelId);
        });
    }

    private toggleMaximizePanel(panelId: string): void {
        const leftPanel = document.getElementById('left-json-panel');
        const diffPanel = document.getElementById('diff-result-panel');
        const rightPanel = document.getElementById('right-json-panel');

        if (!leftPanel || !diffPanel || !rightPanel) {
            return;
        }

        const allPanels = [leftPanel, diffPanel, rightPanel];
        const targetPanel = document.getElementById(panelId);

        if (this.currentMaximizedPanel === panelId) {
            // Already maximized, restore to equal sizes
            allPanels.forEach(panel => {
                panel.classList.remove('panel-maximized', 'panel-minimized');
            });
            this.currentMaximizedPanel = null;
            this.updateMaximizeIcons();
        } else {
            // Maximize the target panel and minimize others
            allPanels.forEach(panel => {
                panel.classList.remove('panel-maximized', 'panel-minimized');
                if (panel === targetPanel) {
                    panel.classList.add('panel-maximized');
                } else {
                    panel.classList.add('panel-minimized');
                }
            });
            this.currentMaximizedPanel = panelId;
            this.updateMaximizeIcons();
        }
    }

    private updateMaximizeIcons(): void {
        const buttons = [
            { id: 'maximize-left', panelId: 'left-json-panel' },
            { id: 'maximize-diff', panelId: 'diff-result-panel' },
            { id: 'maximize-right', panelId: 'right-json-panel' }
        ];

        buttons.forEach(({ id, panelId }) => {
            const button = document.getElementById(id);
            const svg = button?.querySelector('svg path');
            
            if (!svg) return;

            if (this.currentMaximizedPanel === panelId) {
                // Show minimize icon
                svg.setAttribute('d', 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z');
                button?.setAttribute('title', 'Restore panel');
            } else {
                // Show maximize icon
                svg.setAttribute('d', 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z');
                button?.setAttribute('title', 'Maximize panel');
            }
        });
    }

    private resetPanelSizes(): void {
        const leftPanel = document.getElementById('left-json-panel');
        const diffPanel = document.getElementById('diff-result-panel');
        const rightPanel = document.getElementById('right-json-panel');

        if (!leftPanel || !diffPanel || !rightPanel) {
            return;
        }

        const allPanels = [leftPanel, diffPanel, rightPanel];
        
        // Remove all maximize/minimize classes
        allPanels.forEach(panel => {
            panel.classList.remove('panel-maximized', 'panel-minimized');
        });
        
        this.currentMaximizedPanel = null;
        this.updateMaximizeIcons();
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
            // Ctrl/Cmd + 0: Reset panel sizes (diff mode only)
            else if ((e.ctrlKey || e.metaKey) && e.key === '0' && this.currentMode === 'diff') {
                this.resetPanelSizes();
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

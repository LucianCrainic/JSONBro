/**
 * JSON search utilities
 */
export class JSONSearch {
    private searchTerm: string = '';
    private matches: HTMLElement[] = [];
    private currentMatchIndex: number = -1;

    /**
     * Searches for a term in the output element and highlights matches
     */
    public search(term: string, outputElement: HTMLElement): number {
        this.clearHighlights(outputElement);
        this.searchTerm = term.toLowerCase();
        this.matches = [];
        this.currentMatchIndex = -1;

        if (!term.trim()) {
            return 0;
        }

        this.findMatches(outputElement);
        this.highlightMatches();

        return this.matches.length;
    }

    /**
     * Navigates to the next match
     */
    public nextMatch(): void {
        if (this.matches.length === 0) return;

        // Remove current highlight
        if (this.currentMatchIndex >= 0) {
            this.matches[this.currentMatchIndex].classList.remove('current');
        }

        // Move to next match
        this.currentMatchIndex = (this.currentMatchIndex + 1) % this.matches.length;
        
        // Highlight current match and scroll to it
        const currentMatch = this.matches[this.currentMatchIndex];
        currentMatch.classList.add('current');
        currentMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /**
     * Navigates to the previous match
     */
    public previousMatch(): void {
        if (this.matches.length === 0) return;

        // Remove current highlight
        if (this.currentMatchIndex >= 0) {
            this.matches[this.currentMatchIndex].classList.remove('current');
        }

        // Move to previous match
        this.currentMatchIndex = this.currentMatchIndex <= 0 
            ? this.matches.length - 1 
            : this.currentMatchIndex - 1;
        
        // Highlight current match and scroll to it
        const currentMatch = this.matches[this.currentMatchIndex];
        currentMatch.classList.add('current');
        currentMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /**
     * Gets the current match index (1-based for display)
     */
    public getCurrentMatchInfo(): { current: number; total: number } {
        return {
            current: this.matches.length > 0 ? this.currentMatchIndex + 1 : 0,
            total: this.matches.length
        };
    }

    /**
     * Clears all search highlights
     */
    public clearHighlights(outputElement: HTMLElement): void {
        const highlights = outputElement.querySelectorAll('.search-highlight');
        highlights.forEach(highlight => {
            const parent = highlight.parentNode;
            if (parent && highlight.textContent) {
                // Replace the highlight span with its text content
                const textNode = document.createTextNode(highlight.textContent);
                parent.replaceChild(textNode, highlight);
            }
        });
        
        // Normalize the DOM to merge adjacent text nodes
        this.normalizeElement(outputElement);
        
        this.matches = [];
        this.currentMatchIndex = -1;
    }

    /**
     * Normalizes an element by merging adjacent text nodes
     */
    private normalizeElement(element: HTMLElement): void {
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_ALL,
            null
        );

        const elementsToNormalize: Element[] = [];
        let node: Node | null;

        while (node = walker.nextNode()) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                elementsToNormalize.push(node as Element);
            }
        }

        elementsToNormalize.forEach(el => {
            try {
                el.normalize();
            } catch (e) {
                // Ignore normalization errors
            }
        });
    }

    /**
     * Finds all text matches in the element tree
     */
    private findMatches(element: HTMLElement): void {
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null
        );

        interface MatchInfo {
            textNode: Text;
            startIndex: number;
            endIndex: number;
        }

        const matchInfos: MatchInfo[] = [];
        let node: Node | null;
        
        // First pass: collect all matches without modifying the DOM
        while (node = walker.nextNode()) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent) {
                const textNode = node as Text;
                const text = textNode.textContent;
                if (!text) continue;
                
                const lowerText = text.toLowerCase();
                let startIndex = 0;
                let matchIndex: number;

                while ((matchIndex = lowerText.indexOf(this.searchTerm, startIndex)) !== -1) {
                    matchInfos.push({
                        textNode,
                        startIndex: matchIndex,
                        endIndex: matchIndex + this.searchTerm.length
                    });
                    startIndex = matchIndex + 1; // Continue searching from next character
                }
            }
        }

        // Second pass: apply highlights in reverse order to avoid index shifting
        matchInfos.reverse().forEach(matchInfo => {
            this.highlightMatch(matchInfo);
        });
    }

    /**
     * Highlights a single match
     */
    private highlightMatch(matchInfo: { textNode: Text; startIndex: number; endIndex: number }): void {
        const { textNode, startIndex, endIndex } = matchInfo;
        const text = textNode.textContent;
        
        if (!text || startIndex >= text.length) {
            return; // Invalid match info
        }

        const parent = textNode.parentNode;
        if (!parent) {
            return;
        }

        const beforeText = text.substring(0, startIndex);
        const matchText = text.substring(startIndex, endIndex);
        const afterText = text.substring(endIndex);

        // Create highlight span
        const highlight = document.createElement('span');
        highlight.className = 'search-highlight';
        highlight.textContent = matchText;
        this.matches.push(highlight);

        // Build the replacement nodes
        const replacementNodes: Node[] = [];
        
        if (beforeText) {
            replacementNodes.push(document.createTextNode(beforeText));
        }
        
        replacementNodes.push(highlight);
        
        if (afterText) {
            replacementNodes.push(document.createTextNode(afterText));
        }

        // Replace the original text node with the new nodes
        if (replacementNodes.length > 0) {
            // Insert all new nodes before the original
            replacementNodes.forEach(newNode => {
                parent.insertBefore(newNode, textNode);
            });
            // Remove the original text node
            parent.removeChild(textNode);
        }
    }

    /**
     * Highlights all matches and sets the first one as current
     */
    private highlightMatches(): void {
        if (this.matches.length > 0) {
            this.currentMatchIndex = 0;
            this.matches[0].classList.add('current');
            this.matches[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

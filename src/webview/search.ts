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

        // Remove current highlight from all parts of the current match
        if (this.currentMatchIndex >= 0) {
            this.highlightMatchGroup(this.currentMatchIndex, false);
        }

        // Move to next match
        this.currentMatchIndex = (this.currentMatchIndex + 1) % this.matches.length;
        
        // Highlight current match group and scroll to it
        this.highlightMatchGroup(this.currentMatchIndex, true);
        const currentMatch = this.matches[this.currentMatchIndex];
        currentMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /**
     * Navigates to the previous match
     */
    public previousMatch(): void {
        if (this.matches.length === 0) return;

        // Remove current highlight from all parts of the current match
        if (this.currentMatchIndex >= 0) {
            this.highlightMatchGroup(this.currentMatchIndex, false);
        }

        // Move to previous match
        this.currentMatchIndex = this.currentMatchIndex <= 0 
            ? this.matches.length - 1 
            : this.currentMatchIndex - 1;
        
        // Highlight current match group and scroll to it
        this.highlightMatchGroup(this.currentMatchIndex, true);
        const currentMatch = this.matches[this.currentMatchIndex];
        currentMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /**
     * Highlights or unhighlights all parts of a match group
     */
    private highlightMatchGroup(matchIndex: number, highlight: boolean): void {
        if (matchIndex < 0 || matchIndex >= this.matches.length) return;

        const matchElement = this.matches[matchIndex];
        const matchId = matchElement.getAttribute('data-match-id');
        if (!matchId) return;

        // Find all highlight elements with the same match ID
        const allHighlights = document.querySelectorAll(`span.search-highlight[data-match-id="${matchId}"]`);
        allHighlights.forEach(element => {
            if (highlight) {
                element.classList.add('current');
            } else {
                element.classList.remove('current');
            }
        });
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
        // Get the complete text content of the element
        const fullText = element.textContent || '';
        const lowerFullText = fullText.toLowerCase();
        
        // Find all non-overlapping match positions in the full text
        const matchPositions: Array<{start: number, end: number}> = [];
        let startIndex = 0;
        let matchIndex: number;

        while ((matchIndex = lowerFullText.indexOf(this.searchTerm, startIndex)) !== -1) {
            const matchStart = matchIndex;
            const matchEnd = matchIndex + this.searchTerm.length;
            
            // Check if this match overlaps with any existing match
            const overlaps = matchPositions.some(existing => 
                (matchStart < existing.end && matchEnd > existing.start)
            );
            
            if (!overlaps) {
                matchPositions.push({
                    start: matchStart,
                    end: matchEnd
                });
            }
            
            // Move past this match to avoid finding the same match again
            startIndex = matchIndex + this.searchTerm.length;
        }

        // If no matches found, return early
        if (matchPositions.length === 0) {
            return;
        }

        // Apply highlights using a more robust approach
        this.applyHighlights(element, matchPositions);
    }



    /**
     * Applies highlights using a more robust tree-walking approach
     */
    private applyHighlights(element: HTMLElement, matchPositions: Array<{start: number, end: number}>): void {
        if (matchPositions.length === 0) return;

        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null
        );

        let currentPos = 0;
        let node: Node | null;
        const nodesToProcess: Array<{node: Text, highlights: Array<{start: number, end: number, matchId: number}>}> = [];

        // First pass: collect all text nodes and determine which highlights apply to each
        while (node = walker.nextNode()) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent) {
                const textNode = node as Text;
                const textLength = node.textContent.length;
                const nodeStart = currentPos;
                const nodeEnd = currentPos + textLength;

                // Find highlights that intersect with this text node
                const nodeHighlights: Array<{start: number, end: number, matchId: number}> = [];
                matchPositions.forEach((match, matchId) => {
                    if (match.start < nodeEnd && match.end > nodeStart) {
                        // Convert global positions to local node positions
                        const localStart = Math.max(0, match.start - nodeStart);
                        const localEnd = Math.min(textLength, match.end - nodeStart);
                        if (localStart < localEnd) {
                            nodeHighlights.push({ start: localStart, end: localEnd, matchId });
                        }
                    }
                });

                if (nodeHighlights.length > 0) {
                    nodesToProcess.push({ node: textNode, highlights: nodeHighlights });
                }

                currentPos += textLength;
            }
        }

        // Second pass: apply highlights to each node (in reverse order to preserve positions)
        nodesToProcess.reverse().forEach(({ node, highlights }) => {
            this.applyHighlightsToNode(node, highlights);
        });
    }

    /**
     * Applies multiple highlights to a single text node
     */
    private applyHighlightsToNode(textNode: Text, highlights: Array<{start: number, end: number, matchId: number}>): void {
        const text = textNode.textContent || '';
        if (!text) return;

        const parent = textNode.parentNode;
        if (!parent) return;

        // Sort highlights by position (reverse order for processing)
        highlights.sort((a, b) => b.start - a.start);

        let currentText = text;
        const fragments: Array<Node> = [];
        let lastEnd = text.length;
        const createdHighlights: Array<{element: HTMLElement, matchId: number}> = [];

        // Process highlights from right to left to maintain positions
        highlights.forEach(({ start, end, matchId }) => {
            if (start >= 0 && end <= text.length && start < end) {
                // Add text after this highlight
                if (lastEnd > end) {
                    const afterText = currentText.substring(end, lastEnd);
                    if (afterText) {
                        fragments.unshift(document.createTextNode(afterText));
                    }
                }

                // Add the highlight
                const highlightText = currentText.substring(start, end);
                const highlight = document.createElement('span');
                highlight.className = 'search-highlight';
                highlight.setAttribute('data-match-id', matchId.toString());
                highlight.textContent = highlightText;
                
                createdHighlights.push({ element: highlight, matchId });
                fragments.unshift(highlight);

                lastEnd = start;
            }
        });

        // Add any remaining text at the beginning
        if (lastEnd > 0) {
            const beforeText = currentText.substring(0, lastEnd);
            if (beforeText) {
                fragments.unshift(document.createTextNode(beforeText));
            }
        }

        // Replace the original text node with all fragments
        if (fragments.length > 0) {
            fragments.forEach(fragment => {
                parent.insertBefore(fragment, textNode);
            });
            parent.removeChild(textNode);
        }

        // Group highlights by matchId and only add one representative per match to this.matches
        const matchGroups = new Map<number, HTMLElement[]>();
        createdHighlights.forEach(({ element, matchId }) => {
            if (!matchGroups.has(matchId)) {
                matchGroups.set(matchId, []);
            }
            matchGroups.get(matchId)!.push(element);
        });

        // Add only the first highlight element from each match group
        matchGroups.forEach((elements, matchId) => {
            if (elements.length > 0) {
                // Only add to matches array if this is the first time we see this matchId
                if (!this.matches.some(m => m.getAttribute('data-match-id') === matchId.toString())) {
                    this.matches.push(elements[0]);
                }
            }
        });
    }

    /**
     * Highlights all matches and sets the first one as current
     */
    private highlightMatches(): void {
        if (this.matches.length > 0) {
            this.currentMatchIndex = 0;
            this.highlightMatchGroup(0, true);
            this.matches[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

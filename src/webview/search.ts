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
        // Get the complete text content of the element
        const fullText = element.textContent || '';
        const lowerFullText = fullText.toLowerCase();
        
        // Find all match positions in the full text
        const matchPositions: Array<{start: number, end: number}> = [];
        let startIndex = 0;
        let matchIndex: number;

        while ((matchIndex = lowerFullText.indexOf(this.searchTerm, startIndex)) !== -1) {
            matchPositions.push({
                start: matchIndex,
                end: matchIndex + this.searchTerm.length
            });
            startIndex = matchIndex + 1;
        }

        // If no matches found, return early
        if (matchPositions.length === 0) {
            return;
        }

        // Create a mapping from text positions to DOM nodes
        const nodeMap = this.createTextToNodeMap(element);

        // Process each match position and highlight it
        matchPositions.reverse().forEach(pos => {
            this.highlightMatchAtPosition(element, pos.start, pos.end, nodeMap, fullText);
        });
    }

    /**
     * Creates a mapping from text positions to their corresponding DOM text nodes
     */
    private createTextToNodeMap(element: HTMLElement): Array<{node: Text, nodeStartPos: number, nodeEndPos: number}> {
        const nodeMap: Array<{node: Text, nodeStartPos: number, nodeEndPos: number}> = [];
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null
        );

        let currentPos = 0;
        let node: Node | null;

        while (node = walker.nextNode()) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent) {
                const textNode = node as Text;
                const textLength = node.textContent.length;
                
                nodeMap.push({
                    node: textNode,
                    nodeStartPos: currentPos,
                    nodeEndPos: currentPos + textLength
                });
                
                currentPos += textLength;
            }
        }

        return nodeMap;
    }

    /**
     * Highlights a match at a specific position in the full text
     */
    private highlightMatchAtPosition(
        element: HTMLElement, 
        startPos: number, 
        endPos: number, 
        nodeMap: Array<{node: Text, nodeStartPos: number, nodeEndPos: number}>,
        fullText: string
    ): void {
        // Find which text nodes contain the start and end of the match
        const startNodeInfo = nodeMap.find(info => startPos >= info.nodeStartPos && startPos < info.nodeEndPos);
        const endNodeInfo = nodeMap.find(info => endPos > info.nodeStartPos && endPos <= info.nodeEndPos);

        if (!startNodeInfo || !endNodeInfo) {
            return;
        }

        // If the match is within a single text node, use the simple highlighting
        if (startNodeInfo === endNodeInfo) {
            const nodeStartOffset = startPos - startNodeInfo.nodeStartPos;
            const nodeEndOffset = endPos - startNodeInfo.nodeStartPos;
            
            this.highlightMatch({
                textNode: startNodeInfo.node,
                startIndex: nodeStartOffset,
                endIndex: nodeEndOffset
            });
        } else {
            // Handle matches that span multiple text nodes
            this.highlightSpanningMatch(startNodeInfo, endNodeInfo, startPos, endPos, nodeMap, fullText);
        }
    }

    /**
     * Highlights matches that span across multiple text nodes
     */
    private highlightSpanningMatch(
        startNodeInfo: {node: Text, nodeStartPos: number, nodeEndPos: number},
        endNodeInfo: {node: Text, nodeStartPos: number, nodeEndPos: number},
        startPos: number,
        endPos: number,
        nodeMap: Array<{node: Text, nodeStartPos: number, nodeEndPos: number}>,
        fullText: string
    ): void {
        // Get all nodes involved in the match
        const involvedNodes = nodeMap.filter(info => 
            (info.nodeStartPos < endPos && info.nodeEndPos > startPos)
        );

        // Process each involved node
        involvedNodes.forEach((nodeInfo, index) => {
            const isFirstNode = nodeInfo === startNodeInfo;
            const isLastNode = nodeInfo === endNodeInfo;
            
            let nodeStartOffset = 0;
            let nodeEndOffset = nodeInfo.node.textContent ? nodeInfo.node.textContent.length : 0;
            
            if (isFirstNode) {
                nodeStartOffset = startPos - nodeInfo.nodeStartPos;
            }
            
            if (isLastNode) {
                nodeEndOffset = endPos - nodeInfo.nodeStartPos;
            }
            
            // Only highlight if there's content to highlight in this node
            if (nodeStartOffset < nodeEndOffset && nodeEndOffset > 0) {
                this.highlightMatch({
                    textNode: nodeInfo.node,
                    startIndex: nodeStartOffset,
                    endIndex: nodeEndOffset
                });
            }
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

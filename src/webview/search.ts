/** Which part of the document to search. */
export type SearchScope = 'all' | 'keys' | 'values';

export interface SearchOptions {
    /** Case-sensitive matching. Defaults to false. */
    matchCase?: boolean;
    /** Treat the term as a regular expression. Defaults to false. */
    regex?: boolean;
    /** Restrict matching to object keys or to values. Defaults to 'all'. */
    scope?: SearchScope;
}

/** Raised when the user's regular expression will not compile. */
export class InvalidPatternError extends Error {}

/** Token classes the formatter emits for values. */
const VALUE_CLASSES = ['string', 'number', 'boolean', 'null'];

/**
 * Never searchable: the gutter is chrome, not content, and folding markers are
 * decoration. Matching them meant a search for "12" lit up line numbers.
 */
const EXCLUDED_CLASSES = ['line-numbers', 'line-number', 'fold-arrow', 'fold-ellipsis'];

/**
 * JSON search utilities
 */
export class JSONSearch {
    private searchTerm: string = '';
    private matches: HTMLElement[] = [];
    private currentMatchIndex: number = -1;
    private options: Required<SearchOptions> = { matchCase: false, regex: false, scope: 'all' };

    /**
     * Searches for a term in the output element and highlights matches.
     *
     * Throws InvalidPatternError when regex is enabled and the term will not
     * compile, so the caller can surface it rather than silently finding zero.
     */
    public search(term: string, outputElement: HTMLElement, options: SearchOptions = {}): number {
        this.clearHighlights(outputElement);
        this.options = {
            matchCase: options.matchCase ?? false,
            regex: options.regex ?? false,
            scope: options.scope ?? 'all'
        };
        // Stored raw: lowercasing a regular expression would turn \S into \s.
        this.searchTerm = term;
        this.matches = [];
        this.currentMatchIndex = -1;

        if (!term.trim()) {
            return 0;
        }

        this.findMatches(outputElement);

        // Just highlight matches without scrolling
        if (this.matches.length > 0) {
            this.currentMatchIndex = 0;
            this.highlightMatchGroup(0, true);
        }

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
        const nodes = this.collectSearchableNodes(element);
        if (nodes.length === 0) {
            return;
        }

        // The haystack is the searchable text only, so offsets computed here
        // map straight back onto the nodes that produced them.
        const haystack = nodes.map(node => node.textContent ?? '').join('');
        const matchPositions = this.locate(haystack);

        if (matchPositions.length === 0) {
            return;
        }

        this.applyHighlights(nodes, matchPositions);
    }

    /** Text nodes eligible for matching under the current scope. */
    private collectSearchableNodes(element: HTMLElement): Text[] {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
            acceptNode: node =>
                this.isSearchable(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
        });

        const nodes: Text[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
            if (node.textContent) {
                nodes.push(node as Text);
            }
        }
        return nodes;
    }

    private isSearchable(node: Node): boolean {
        const parent = node.parentElement;
        if (!parent) {
            return false;
        }

        for (const className of EXCLUDED_CLASSES) {
            if (parent.closest(`.${className}`)) {
                return false;
            }
        }

        // A previous search may have wrapped part of a token in a highlight
        // span; classify by the token it sits inside, not the wrapper.
        const token = parent.classList.contains('search-highlight')
            ? parent.parentElement ?? parent
            : parent;

        switch (this.options.scope) {
            case 'keys':
                return token.classList.contains('key');
            case 'values':
                return VALUE_CLASSES.some(className => token.classList.contains(className));
            default:
                return true;
        }
    }

    /** Match offsets within the haystack, honouring the case and regex options. */
    private locate(haystack: string): Array<{ start: number; end: number }> {
        const positions: Array<{ start: number; end: number }> = [];

        if (this.options.regex) {
            let pattern: RegExp;
            try {
                pattern = new RegExp(this.searchTerm, this.options.matchCase ? 'g' : 'gi');
            } catch (error) {
                throw new InvalidPatternError(
                    error instanceof Error ? error.message : 'Invalid regular expression'
                );
            }

            let match: RegExpExecArray | null;
            while ((match = pattern.exec(haystack)) !== null) {
                // A zero-width match would never advance lastIndex on its own.
                if (match[0].length === 0) {
                    pattern.lastIndex++;
                    continue;
                }
                positions.push({ start: match.index, end: match.index + match[0].length });
            }
            return positions;
        }

        const subject = this.options.matchCase ? haystack : haystack.toLowerCase();
        const needle = this.options.matchCase ? this.searchTerm : this.searchTerm.toLowerCase();

        let from = 0;
        let at: number;
        while ((at = subject.indexOf(needle, from)) !== -1) {
            positions.push({ start: at, end: at + needle.length });
            from = at + needle.length;
        }
        return positions;
    }

    /**
     * Splits the collected text nodes so each match is wrapped in its own span.
     */
    private applyHighlights(
        nodes: Text[],
        matchPositions: Array<{ start: number; end: number }>
    ): void {
        let currentPos = 0;
        const nodesToProcess: Array<{
            node: Text;
            highlights: Array<{ start: number; end: number; matchId: number }>;
        }> = [];

        // First pass: work out which matches land inside each node.
        for (const textNode of nodes) {
            const textLength = textNode.textContent?.length ?? 0;
            const nodeStart = currentPos;
            const nodeEnd = currentPos + textLength;

            const nodeHighlights: Array<{ start: number; end: number; matchId: number }> = [];
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

        // Second pass: rewrite nodes back to front so earlier offsets stay valid.
        nodesToProcess.reverse().forEach(({ node, highlights }) => {
            this.applyHighlightsToNode(node, highlights);
        });

        // Sort matches array to ensure they're in document order (top to bottom)
        this.matches.sort((a, b) => {
            const aId = parseInt(a.getAttribute('data-match-id') || '0');
            const bId = parseInt(b.getAttribute('data-match-id') || '0');
            return aId - bId;
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
}

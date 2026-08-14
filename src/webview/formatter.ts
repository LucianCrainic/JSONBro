/**
 * Renders one line of formatted JSON.
 *
 * This used to build the entire document as a single HTML string, wrapping
 * every line of a container in a `foldable-content` span at each ancestor
 * level -- so the markup grew with depth as well as with length, and a deep
 * document produced far more HTML than text. Rendering a line at a time means
 * only the rows on screen cost anything, and nesting costs nothing at all.
 */

export interface RenderLineOptions {
    /** 1-based line number for the gutter. */
    lineNumber: number;
    /** True when a container opens on this line and can be folded. */
    foldable?: boolean;
    /** True when that fold is currently closed. */
    collapsed?: boolean;
    /** Show the gutter. */
    showLineNumbers?: boolean;
    /** Character ranges within the line to mark as search hits. */
    matches?: ReadonlyArray<{ start: number; end: number; current?: boolean }>;
}

export class JSONFormatter {
    private static showLineNumbers = true;

    static setShowLineNumbers(show: boolean): void {
        this.showLineNumbers = show;
    }

    static getShowLineNumbers(): boolean {
        return this.showLineNumbers;
    }

    static escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Renders one line: gutter, fold control, and the coloured content.
     *
     * The gutter number lives inside the row rather than in a parallel column,
     * so the two cannot drift out of alignment when rows are recycled.
     */
    static renderLine(text: string, options: RenderLineOptions): string {
        const showGutter = options.showLineNumbers ?? this.showLineNumbers;

        const gutter = showGutter
            ? `<span class="line-number" aria-hidden="true">${options.lineNumber}</span>`
            : '';

        const fold = options.foldable
            ? `<span class="fold-arrow${options.collapsed ? ' folded' : ''}" data-fold-line="${
                  options.lineNumber - 1
              }" role="button" aria-label="${
                  options.collapsed ? 'Expand' : 'Collapse'
              }" data-tip="${options.collapsed ? 'Expand' : 'Collapse'} this block"></span>`
            : '<span class="fold-spacer" aria-hidden="true"></span>';

        const content = tokenize(text, options.matches ?? []);
        const ellipsis = options.collapsed ? '<span class="fold-ellipsis">&#8943;</span>' : '';

        return `<div class="json-line" data-line="${options.lineNumber}">${gutter}${fold}<span class="json-line__text">${content}${ellipsis}</span></div>`;
    }
}

export interface Span {
    start: number;
    end: number;
    className: string;
}

const KEYWORDS: ReadonlyArray<readonly [string, string]> = [
    ['true', 'boolean'],
    ['false', 'boolean'],
    ['null', 'null']
];

function tokenize(
    line: string,
    matches: ReadonlyArray<{ start: number; end: number; current?: boolean }>
): string {
    return paint(line, lineSpans(line), matches);
}

/**
 * Classifies the pieces of a formatted JSON line.
 *
 * The line comes from the pretty-printer, so it is always well formed: at most
 * one property name, then one value, then punctuation. That makes a single
 * left-to-right pass enough, with no need to re-parse anything.
 *
 * Search uses this too, so that "match keys only" means the same thing as the
 * colour on screen rather than being decided separately.
 */
export function lineSpans(line: string): Span[] {
    const spans: Span[] = [];
    let i = 0;

    while (i < line.length) {
        const ch = line[i];

        if (ch === '"') {
            const end = endOfString(line, i);
            // A name is a string followed by a colon; anything else is a value.
            const after = line.slice(end).match(/^\s*:/);
            spans.push({ start: i, end, className: after ? 'key' : 'string' });
            i = end;
            continue;
        }

        if (ch === '-' || (ch >= '0' && ch <= '9')) {
            const match = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(line.slice(i));
            if (match) {
                spans.push({ start: i, end: i + match[0].length, className: 'number' });
                i += match[0].length;
                continue;
            }
        }

        const keyword = KEYWORDS.find(([word]) => line.startsWith(word, i));
        if (keyword) {
            spans.push({ start: i, end: i + keyword[0].length, className: keyword[1] });
            i += keyword[0].length;
            continue;
        }

        if (ch === '{' || ch === '}') {
            spans.push({ start: i, end: i + 1, className: 'brace' });
        } else if (ch === '[' || ch === ']') {
            spans.push({ start: i, end: i + 1, className: 'bracket' });
        } else if (ch === ',') {
            spans.push({ start: i, end: i + 1, className: 'comma' });
        } else if (ch === ':') {
            spans.push({ start: i, end: i + 1, className: 'colon' });
        }
        i++;
    }

    return spans;
}

/** The index just past the closing quote of the string starting at `from`. */
function endOfString(line: string, from: number): number {
    let i = from + 1;
    while (i < line.length) {
        if (line[i] === '\\') {
            i += 2;
            continue;
        }
        if (line[i] === '"') {
            return i + 1;
        }
        i++;
    }
    return line.length;
}

/**
 * Emits the line with token classes and search marks applied.
 *
 * Marks are cut against token boundaries so a hit spanning the end of a string
 * and the comma after it still nests correctly instead of producing
 * overlapping elements.
 */
function paint(
    line: string,
    spans: Span[],
    matches: ReadonlyArray<{ start: number; end: number; current?: boolean }>
): string {
    const boundaries = new Set<number>([0, line.length]);
    for (const span of spans) {
        boundaries.add(span.start);
        boundaries.add(span.end);
    }
    for (const match of matches) {
        boundaries.add(Math.max(0, match.start));
        boundaries.add(Math.min(line.length, match.end));
    }

    const points = [...boundaries].sort((a, b) => a - b);
    let out = '';

    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        if (end <= start) {
            continue;
        }

        const text = JSONFormatter.escapeHtml(line.slice(start, end));
        const token = spans.find(span => span.start <= start && span.end >= end);
        const match = matches.find(m => m.start <= start && m.end >= end);

        let piece = token ? `<span class="${token.className}">${text}</span>` : text;
        if (match) {
            piece = `<span class="search-highlight${match.current ? ' current' : ''}">${piece}</span>`;
        }
        out += piece;
    }

    return out;
}

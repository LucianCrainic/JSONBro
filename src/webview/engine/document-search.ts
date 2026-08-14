/**
 * Finding text in a formatted document.
 *
 * The search this replaces walked the rendered DOM: it built one string out of
 * every text node, then, for each node, looped over every match to see which
 * ones landed inside it -- so cost grew as nodes times matches, and 50,000
 * nodes against 5,000 matches meant a quarter of a billion comparisons on
 * every keystroke. It also could not survive virtual rendering, where most of
 * the document has no nodes at all.
 *
 * Searching the text instead is one pass, and the results are line and column
 * numbers, which stay meaningful whether or not a row happens to be on screen.
 */
import { lineSpans } from '../formatter';
import type { LineTable } from './line-index';
import type { TextStore } from './text-store';

/** Which part of the document to search. */
export type SearchScope = 'all' | 'keys' | 'values';

export interface SearchOptions {
    matchCase?: boolean;
    regex?: boolean;
    scope?: SearchScope;
}

export interface SearchMatch {
    /** 0-based line. */
    line: number;
    /** Character offsets within that line. */
    start: number;
    end: number;
}

/** Raised when the user's regular expression will not compile. */
export class InvalidPatternError extends Error {}

/**
 * Above this, matching stops and reports what it found.
 *
 * Every match costs memory and there is no use for a hundred thousand of them
 * beyond knowing there are a lot; stopping keeps a one-character search on a
 * huge document from becoming the slowest thing in the session.
 */
export const MATCH_LIMIT = 50_000;

export interface SearchResult {
    matches: SearchMatch[];
    /** True when matching stopped at the limit rather than at the end. */
    truncated: boolean;
}

export interface SearchableDocument {
    text: TextStore;
    lines: LineTable;
}

/**
 * Finds every occurrence of `term`, line by line.
 *
 * Working a line at a time keeps the slices short, gives each match its line
 * for free, and means a pattern can never match across a line boundary --
 * which for one-value-per-line JSON is what a reader expects anyway.
 */
export function searchDocument(
    document: SearchableDocument,
    term: string,
    options: SearchOptions = {}
): SearchResult {
    const matches: SearchMatch[] = [];
    if (!term) {
        return { matches, truncated: false };
    }

    const { text, lines } = document;
    const matchCase = options.matchCase ?? false;
    const scope = options.scope ?? 'all';

    const pattern = options.regex ? compile(term, matchCase) : null;
    const needle = matchCase ? term : term.toLowerCase();

    for (let line = 0; line < lines.lineCount; line++) {
        const raw = text.slice(lines.start(line), lines.end(line, text.length));
        const found = pattern ? locateRegex(raw, pattern) : locatePlain(raw, needle, matchCase);
        if (found.length === 0) {
            continue;
        }

        const allowed = scope === 'all' ? found : found.filter(range => inScope(raw, range, scope));

        for (const range of allowed) {
            matches.push({ line, start: range.start, end: range.end });
            if (matches.length >= MATCH_LIMIT) {
                return { matches, truncated: true };
            }
        }
    }

    return { matches, truncated: false };
}

function compile(term: string, matchCase: boolean): RegExp {
    try {
        return new RegExp(term, matchCase ? 'g' : 'gi');
    } catch (error) {
        throw new InvalidPatternError(
            error instanceof Error ? error.message : 'Invalid regular expression'
        );
    }
}

interface Range {
    start: number;
    end: number;
}

function locatePlain(line: string, needle: string, matchCase: boolean): Range[] {
    const subject = matchCase ? line : line.toLowerCase();
    const ranges: Range[] = [];

    let from = 0;
    let at: number;
    while ((at = subject.indexOf(needle, from)) !== -1) {
        ranges.push({ start: at, end: at + needle.length });
        from = at + needle.length;
    }
    return ranges;
}

function locateRegex(line: string, pattern: RegExp): Range[] {
    const ranges: Range[] = [];
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
        // A zero-width match would never advance lastIndex on its own.
        if (match[0].length === 0) {
            pattern.lastIndex++;
            continue;
        }
        ranges.push({ start: match.index, end: match.index + match[0].length });
    }
    return ranges;
}

/**
 * Whether a hit sits in a property name or in a value.
 *
 * Decided from the line's own tokens rather than from CSS classes on rendered
 * elements, which is what the old search had to do and which stopped being
 * available once rows were only rendered when visible.
 */
function inScope(line: string, range: Range, scope: SearchScope): boolean {
    const spans = lineSpans(line);
    const span = spans.find(s => s.start <= range.start && s.end >= range.end);
    if (!span) {
        return false;
    }
    return scope === 'keys'
        ? span.className === 'key'
        : span.className === 'string' ||
              span.className === 'number' ||
              span.className === 'boolean' ||
              span.className === 'null';
}

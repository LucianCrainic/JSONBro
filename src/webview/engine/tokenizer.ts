/**
 * A tolerant JSON scanner.
 *
 * The parser this replaces repaired input by running regular expressions over
 * the whole document -- quoting bare property names, rewriting Python
 * literals, stripping trailing commas. None of those passes knew where strings
 * began or ended, so they rewrote string contents too:
 *
 *     {'note': "True story about None"}  ->  {note: "true story about null"}
 *     {a: "x, b: 1"}                     ->  {"a": "x, "b": 1"}
 *
 * Scanning left to right makes that class of damage impossible: a quoted
 * string is consumed as one token and its contents are never examined again.
 */
import { Diagnostic, DiagnosticKind, DiagnosticSeverity, LineMap } from './diagnostics';

export type TokenKind =
    | 'lbrace'
    | 'rbrace'
    | 'lbracket'
    | 'rbracket'
    | 'colon'
    | 'comma'
    | 'string'
    | 'number'
    | 'literal'
    | 'eof';

export interface Token {
    kind: TokenKind;
    start: number;
    end: number;
    /** The decoded value, for strings, numbers and known literals. */
    value?: string | number | boolean | null;
    /** The raw text, for bare words that may turn out to be property names. */
    text?: string;
    /** True when a bare word was read where a quoted string was expected. */
    bare?: boolean;
}

/**
 * The minimum a scanner needs from its input.
 *
 * A plain string satisfies this. Chunked storage will too, which is what lets
 * the same scanner run over a document too large to hold as one string.
 */
export interface CharSource {
    readonly length: number;
    charCodeAt(index: number): number;
    slice(start: number, end: number): string;
}

const enum Ch {
    Tab = 9,
    LF = 10,
    CR = 13,
    Space = 32,
    Quote = 34,
    Apostrophe = 39,
    Plus = 43,
    Comma = 44,
    Minus = 45,
    Dot = 46,
    Slash = 47,
    Zero = 48,
    Nine = 57,
    Colon = 58,
    UpperA = 65,
    UpperE = 69,
    UpperZ = 90,
    LBracket = 91,
    Backslash = 92,
    RBracket = 93,
    Underscore = 95,
    LowerA = 97,
    LowerB = 98,
    LowerE = 101,
    LowerF = 102,
    LowerN = 110,
    LowerR = 114,
    LowerT = 116,
    LowerU = 117,
    LowerZ = 122,
    LBrace = 123,
    RBrace = 125,
    Dollar = 36,
    Star = 42
}

/** Bare words the scanner understands, and what they stand for. */
const KEYWORDS = new Map<string, { value: boolean | null; kind?: DiagnosticKind }>([
    ['true', { value: true }],
    ['false', { value: false }],
    ['null', { value: null }],
    ['True', { value: true, kind: 'python-literal' }],
    ['False', { value: false, kind: 'python-literal' }],
    ['None', { value: null, kind: 'python-literal' }],
    ['undefined', { value: null, kind: 'python-literal' }],
    ['NaN', { value: null, kind: 'number-format' }],
    ['Infinity', { value: null, kind: 'number-format' }]
]);

export class Tokenizer {
    private readonly source: CharSource;
    private readonly diagnostics: Diagnostic[] = [];
    public readonly lines = new LineMap();

    private pos = 0;

    constructor(source: CharSource) {
        this.source = source;
    }

    public getDiagnostics(): readonly Diagnostic[] {
        return this.diagnostics;
    }

    /** How far the scanner has read. */
    public get offset(): number {
        return this.pos;
    }

    public report(
        kind: DiagnosticKind,
        severity: DiagnosticSeverity,
        message: string,
        offset: number,
        length = 1
    ): void {
        const { line, column } = this.lines.positionAt(offset);
        this.diagnostics.push({ kind, severity, message, offset, length, line, column });
    }

    /** Reads the next token, skipping whitespace and comments. */
    public next(): Token {
        this.skipTrivia();

        const start = this.pos;
        if (start >= this.source.length) {
            return { kind: 'eof', start, end: start };
        }

        const code = this.source.charCodeAt(start);

        switch (code) {
            case Ch.LBrace:
                this.pos++;
                return { kind: 'lbrace', start, end: this.pos };
            case Ch.RBrace:
                this.pos++;
                return { kind: 'rbrace', start, end: this.pos };
            case Ch.LBracket:
                this.pos++;
                return { kind: 'lbracket', start, end: this.pos };
            case Ch.RBracket:
                this.pos++;
                return { kind: 'rbracket', start, end: this.pos };
            case Ch.Colon:
                this.pos++;
                return { kind: 'colon', start, end: this.pos };
            case Ch.Comma:
                this.pos++;
                return { kind: 'comma', start, end: this.pos };
            case Ch.Quote:
                return this.readString(Ch.Quote);
            case Ch.Apostrophe:
                this.report(
                    'single-quotes',
                    'info',
                    'Single-quoted string rewritten with double quotes.',
                    start
                );
                return this.readString(Ch.Apostrophe);
            default:
                break;
        }

        if (code === Ch.Minus || code === Ch.Plus || code === Ch.Dot || isDigit(code)) {
            return this.readNumber();
        }

        if (isWordStart(code)) {
            return this.readWord();
        }

        // Nothing recognisable. Consume it so the scan always advances, and
        // let the parser decide how to carry on.
        this.pos++;
        return { kind: 'literal', start, end: this.pos, value: null, text: this.source.slice(start, this.pos) };
    }

    private skipTrivia(): void {
        while (this.pos < this.source.length) {
            const code = this.source.charCodeAt(this.pos);

            if (code === Ch.LF) {
                this.lines.newlineAt(this.pos);
                this.pos++;
                continue;
            }
            if (code === Ch.Space || code === Ch.Tab || code === Ch.CR) {
                this.pos++;
                continue;
            }
            if (code === Ch.Slash && this.pos + 1 < this.source.length) {
                const next = this.source.charCodeAt(this.pos + 1);
                if (next === Ch.Slash) {
                    this.skipLineComment();
                    continue;
                }
                if (next === Ch.Star) {
                    this.skipBlockComment();
                    continue;
                }
            }
            return;
        }
    }

    private skipLineComment(): void {
        const start = this.pos;
        while (this.pos < this.source.length && this.source.charCodeAt(this.pos) !== Ch.LF) {
            this.pos++;
        }
        this.report('comment', 'info', 'Comment removed; JSON has no comments.', start, this.pos - start);
    }

    private skipBlockComment(): void {
        const start = this.pos;
        this.pos += 2;

        while (this.pos < this.source.length) {
            const code = this.source.charCodeAt(this.pos);
            if (code === Ch.LF) {
                this.lines.newlineAt(this.pos);
            }
            if (
                code === Ch.Star &&
                this.pos + 1 < this.source.length &&
                this.source.charCodeAt(this.pos + 1) === Ch.Slash
            ) {
                this.pos += 2;
                this.report('comment', 'info', 'Comment removed; JSON has no comments.', start, this.pos - start);
                return;
            }
            this.pos++;
        }

        this.report('comment', 'info', 'Unterminated comment removed.', start, this.pos - start);
    }

    /**
     * Reads a quoted string.
     *
     * Everything between the quotes is copied through untouched apart from
     * escape sequences. No later pass ever looks at it again.
     */
    private readString(quote: number): Token {
        const start = this.pos;
        this.pos++; // opening quote

        let out = '';
        let chunkStart = this.pos;

        while (this.pos < this.source.length) {
            const code = this.source.charCodeAt(this.pos);

            if (code === quote) {
                out += this.source.slice(chunkStart, this.pos);
                this.pos++;
                return { kind: 'string', start, end: this.pos, value: out };
            }

            if (code === Ch.Backslash) {
                out += this.source.slice(chunkStart, this.pos);
                this.pos++;
                out += this.readEscape(quote);
                chunkStart = this.pos;
                continue;
            }

            // A newline inside a string almost always means the closing quote
            // was forgotten. Ending the string here keeps the rest of the
            // document parseable instead of swallowing all of it.
            if (code === Ch.LF) {
                out += this.source.slice(chunkStart, this.pos);
                this.report(
                    'unterminated-string',
                    'warning',
                    'String was not closed before the end of the line; closed it there.',
                    start,
                    this.pos - start
                );
                return { kind: 'string', start, end: this.pos, value: out };
            }

            this.pos++;
        }

        out += this.source.slice(chunkStart, this.pos);
        this.report(
            'unterminated-string',
            'warning',
            'String was not closed before the end of the document; closed it there.',
            start,
            this.pos - start
        );
        return { kind: 'string', start, end: this.pos, value: out };
    }

    /** Decodes one escape sequence, having already consumed the backslash. */
    private readEscape(quote: number): string {
        if (this.pos >= this.source.length) {
            return '';
        }

        const code = this.source.charCodeAt(this.pos);
        this.pos++;

        switch (code) {
            case Ch.LowerN:
                return '\n';
            case Ch.LowerT:
                return '\t';
            case Ch.LowerR:
                return '\r';
            case Ch.LowerB:
                return '\b';
            case Ch.LowerF:
                return '\f';
            case Ch.Slash:
                return '/';
            case Ch.Backslash:
                return '\\';
            case Ch.Quote:
                return '"';
            case Ch.Apostrophe:
                // Legal inside a single-quoted string, and harmless otherwise.
                return "'";
            case Ch.LowerU: {
                const hex = this.source.slice(this.pos, this.pos + 4);
                if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                    this.pos += 4;
                    return String.fromCharCode(parseInt(hex, 16));
                }
                this.report(
                    'unexpected-token',
                    'warning',
                    'Incomplete \\u escape; kept the characters as written.',
                    this.pos - 2,
                    2
                );
                return 'u';
            }
            default:
                // An unknown escape is far more likely to be a literal
                // backslash the author forgot to double than a typo.
                if (code === Ch.LF) {
                    this.lines.newlineAt(this.pos - 1);
                    return '';
                }
                return String.fromCharCode(code);
        }
    }

    private readNumber(): Token {
        const start = this.pos;
        let repaired = false;

        if (this.source.charCodeAt(this.pos) === Ch.Plus) {
            this.pos++;
            repaired = true;
        } else if (this.source.charCodeAt(this.pos) === Ch.Minus) {
            this.pos++;
        }

        while (this.pos < this.source.length && isNumberBody(this.source.charCodeAt(this.pos))) {
            this.pos++;
        }

        const text = this.source.slice(start, this.pos);
        const value = Number(text);

        if (!Number.isFinite(value)) {
            this.report(
                'number-format',
                'warning',
                `"${text}" is not a valid number; replaced it with null.`,
                start,
                this.pos - start
            );
            return { kind: 'number', start, end: this.pos, value: null as unknown as number };
        }

        // Leading "+", a bare ".5" or a trailing "5." all parse, but none of
        // them are JSON, so the output will differ from the input text.
        if (repaired || /^[.]|[.]$/.test(text.replace(/^-/, ''))) {
            this.report(
                'number-format',
                'info',
                `Number "${text}" rewritten as ${value}.`,
                start,
                this.pos - start
            );
        }

        return { kind: 'number', start, end: this.pos, value };
    }

    /** Reads a bare word: a keyword, or an unquoted name. */
    private readWord(): Token {
        const start = this.pos;
        while (this.pos < this.source.length && isWordPart(this.source.charCodeAt(this.pos))) {
            this.pos++;
        }

        const text = this.source.slice(start, this.pos);
        const keyword = KEYWORDS.get(text);

        if (keyword) {
            if (keyword.kind) {
                this.report(
                    keyword.kind,
                    'info',
                    `"${text}" is not JSON; read it as ${JSON.stringify(keyword.value)}.`,
                    start,
                    text.length
                );
            }
            return { kind: 'literal', start, end: this.pos, value: keyword.value, text };
        }

        // Whether this is a stray property name or a stray string value is the
        // parser's call, so no diagnostic is raised here.
        return { kind: 'literal', start, end: this.pos, value: text, text, bare: true };
    }
}

function isDigit(code: number): boolean {
    return code >= Ch.Zero && code <= Ch.Nine;
}

function isNumberBody(code: number): boolean {
    return (
        isDigit(code) ||
        code === Ch.Dot ||
        code === Ch.Minus ||
        code === Ch.Plus ||
        code === Ch.LowerE ||
        code === Ch.UpperE
    );
}

function isWordStart(code: number): boolean {
    return (
        (code >= Ch.LowerA && code <= Ch.LowerZ) ||
        (code >= Ch.UpperA && code <= Ch.UpperZ) ||
        code === Ch.Underscore ||
        code === Ch.Dollar ||
        code > 127
    );
}

function isWordPart(code: number): boolean {
    return isWordStart(code) || isDigit(code);
}

/**
 * A JSON parser that always produces a document.
 *
 * The parser this replaces was all-or-nothing: it either returned a value or
 * threw, and repairs happened as a fixed sequence of separate passes, so
 * combinations failed that each half handled alone -- `{"a": 1,` has both a
 * trailing comma and a missing brace, and threw. Recovering inside a single
 * parse handles them together, and reports each repair rather than leaving the
 * reader to guess what changed.
 */
import { Diagnostic, LineMap, hasStructuralRepair } from './diagnostics';
import { ParseSink, ValueSink } from './parse-sink';
import { CharSource, Token, Tokenizer } from './tokenizer';

export interface ParseResult<T = unknown> {
    /** Whatever the sink built. For the default sink, the repaired document. */
    value: T;
    diagnostics: Diagnostic[];
    /** True when a repair changed the document's shape, not just its spelling. */
    structurallyRepaired: boolean;
    /** Where each line begins, for reporting positions against the source. */
    lines: LineMap;
}

interface Frame {
    kind: 'array' | 'object';
    /** The key awaiting a value, for object frames. */
    key: string | null;
    /** Where the container opened, so an unclosed one can point at it. */
    start: number;
    seenKeys: Set<string> | null;
}

/** What the parser is looking for next. */
type State = 'value' | 'key' | 'separator';

export function parseJson(source: CharSource): ParseResult {
    return parseInto(source, new ValueSink());
}

/** Parses `source`, reporting structure to `sink` as it goes. */
export function parseInto<T>(source: CharSource, sink: ParseSink<T>): ParseResult<T> {
    return new RecoveringParser(source, sink).parse();
}

class RecoveringParser<T> {
    private readonly tokenizer: Tokenizer;
    private readonly sink: ParseSink<T>;
    private readonly stack: Frame[] = [];

    private rootAssigned = false;
    private state: State = 'value';

    /** One token of lookahead, so a decision can decline to consume it. */
    private lookahead: Token | null = null;

    constructor(source: CharSource, sink: ParseSink<T>) {
        this.tokenizer = new Tokenizer(source);
        this.sink = sink;
    }

    public parse(): ParseResult<T> {
        const first = this.peek();

        if (first.kind === 'eof') {
            this.tokenizer.report(
                'empty-document',
                'error',
                'The document is empty; read it as null.',
                first.start
            );
            this.sink.scalar(null);
            return this.finish();
        }

        this.run();
        return this.finish();
    }

    private finish(): ParseResult<T> {
        const diagnostics = [...this.tokenizer.getDiagnostics()];
        // Reported in the order the scanner met them, which is the order a
        // reader scrolling the document will meet them too.
        diagnostics.sort((a, b) => a.offset - b.offset);

        return {
            value: this.sink.finish(),
            diagnostics,
            structurallyRepaired: hasStructuralRepair(diagnostics),
            lines: this.tokenizer.lines
        };
    }

    private peek(): Token {
        if (this.lookahead === null) {
            this.lookahead = this.tokenizer.next();
        }
        return this.lookahead;
    }

    private take(): Token {
        const token = this.peek();
        this.lookahead = null;
        return token;
    }

    private get top(): Frame | null {
        return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
    }

    private run(): void {
        for (;;) {
            const token = this.peek();

            if (token.kind === 'eof') {
                this.closeAtEof(token);
                return;
            }

            switch (this.state) {
                case 'value':
                    this.onValue(token);
                    break;
                case 'key':
                    this.onKey(token);
                    break;
                case 'separator':
                    if (this.onSeparator(token)) {
                        return;
                    }
                    break;
            }
        }
    }

    // ----------------------------------------------------------------- states

    private onValue(token: Token): void {
        switch (token.kind) {
            case 'lbrace':
                this.take();
                this.push('object', token.start);
                this.state = 'key';
                return;

            case 'lbracket':
                this.take();
                this.push('array', token.start);
                this.state = 'value';
                return;

            case 'rbracket':
            case 'rbrace':
                // Reached from an empty container, or after a trailing comma.
                this.take();
                this.closeContainer(token);
                return;

            case 'string':
            case 'number':
                this.take();
                this.attach(token.value ?? null);
                this.state = 'separator';
                return;

            case 'literal':
                this.take();
                if (token.bare) {
                    this.tokenizer.report(
                        'unquoted-key',
                        'warning',
                        `"${token.text}" is not quoted; read it as a string.`,
                        token.start,
                        token.end - token.start
                    );
                }
                this.attach(token.value === undefined ? null : token.value);
                this.state = 'separator';
                return;

            case 'colon':
            case 'comma':
            default:
                this.take();
                this.tokenizer.report(
                    'unexpected-token',
                    'warning',
                    `Unexpected "${describe(token)}" where a value was expected; skipped it.`,
                    token.start,
                    Math.max(1, token.end - token.start)
                );
                return;
        }
    }

    private onKey(token: Token): void {
        switch (token.kind) {
            case 'rbrace':
            case 'rbracket':
                this.take();
                this.closeContainer(token);
                return;

            case 'string':
            case 'number':
            case 'literal': {
                this.take();
                if (token.bare) {
                    this.tokenizer.report(
                        'unquoted-key',
                        'info',
                        `Property name "${token.text}" was not quoted; quoted it.`,
                        token.start,
                        token.end - token.start
                    );
                } else if (token.kind === 'number') {
                    this.tokenizer.report(
                        'unquoted-key',
                        'info',
                        'Numeric property name quoted.',
                        token.start,
                        token.end - token.start
                    );
                }

                const frame = this.top;
                const key = String(token.value ?? token.text ?? '');
                if (frame) {
                    if (frame.seenKeys?.has(key)) {
                        this.tokenizer.report(
                            'duplicate-key',
                            'warning',
                            `Duplicate property "${key}"; the later value wins.`,
                            token.start,
                            token.end - token.start
                        );
                    }
                    frame.seenKeys?.add(key);
                    frame.key = key;
                    this.sink.key(key);
                }

                this.expectColon();
                this.state = 'value';
                return;
            }

            case 'comma':
                this.take();
                this.tokenizer.report(
                    'unexpected-token',
                    'info',
                    'Extra comma removed.',
                    token.start
                );
                return;

            default:
                this.take();
                this.tokenizer.report(
                    'unexpected-token',
                    'warning',
                    `Unexpected "${describe(token)}" where a property name was expected; skipped it.`,
                    token.start,
                    Math.max(1, token.end - token.start)
                );
                return;
        }
    }

    /**
     * Handles the position between one item and the next.
     *
     * Returns true when the document is complete.
     */
    private onSeparator(token: Token): boolean {
        if (token.kind === 'comma') {
            this.take();
            this.state = this.top?.kind === 'object' ? 'key' : 'value';
            return false;
        }

        if (token.kind === 'rbrace' || token.kind === 'rbracket') {
            this.take();
            this.closeContainer(token);
            return false;
        }

        if (this.stack.length === 0) {
            // The root value is complete but the document is not.
            this.take();
            this.tokenizer.report(
                'trailing-content',
                'error',
                'Ignored extra content after the end of the document.',
                token.start,
                Math.max(1, token.end - token.start)
            );
            return true;
        }

        // Something that starts a new item, with no comma before it. Leave it
        // unconsumed and let the value or key state read it properly.
        this.tokenizer.report(
            'missing-comma',
            'warning',
            'Missing comma between items; inserted one.',
            token.start
        );
        this.state = this.top?.kind === 'object' ? 'key' : 'value';
        return false;
    }

    // ----------------------------------------------------------------- pieces

    private expectColon(): void {
        const token = this.peek();
        if (token.kind === 'colon') {
            this.take();
            return;
        }
        this.tokenizer.report(
            'missing-colon',
            'warning',
            'Missing ":" after a property name; inserted one.',
            token.start
        );
    }

    private push(kind: 'array' | 'object', start: number): void {
        // The container about to open *is* the value for the pending key, so
        // the parent is no longer waiting for one. Leaving it set made every
        // nested container look like a property with a missing value.
        const parent = this.top;
        if (parent) {
            parent.key = null;
        }

        this.stack.push({
            kind,
            key: null,
            start,
            seenKeys: kind === 'object' ? new Set<string>() : null
        });

        if (kind === 'object') {
            this.sink.beginObject();
        } else {
            this.sink.beginArray();
        }
        this.rootAssigned = true;
    }

    /**
     * Closes the innermost container.
     *
     * A closer of the wrong sort still closes it: the alternative is to skip
     * the token and keep collecting, which turns one typo into a document that
     * nests everything that follows inside the unclosed container.
     */
    private closeContainer(token: Token): void {
        const frame = this.stack.pop();

        if (!frame) {
            this.tokenizer.report(
                'unexpected-token',
                'warning',
                `Unmatched "${describe(token)}"; ignored it.`,
                token.start
            );
            return;
        }

        const expected = frame.kind === 'array' ? 'rbracket' : 'rbrace';
        if (token.kind !== expected) {
            this.tokenizer.report(
                'mismatched-bracket',
                'warning',
                `Closed with "${describe(token)}" what was opened as ${
                    frame.kind === 'array' ? 'an array' : 'an object'
                }.`,
                token.start
            );
        }

        // A key with no value: `{"a":}` or `{"a": ,`.
        if (frame.kind === 'object' && frame.key !== null) {
            this.tokenizer.report(
                'missing-value',
                'warning',
                `Property "${frame.key}" had no value; used null.`,
                token.start
            );
            this.sink.scalar(null);
            frame.key = null;
        }

        if (frame.kind === 'array') {
            this.sink.endArray();
        } else {
            this.sink.endObject();
        }
        this.state = 'separator';
    }

    private closeAtEof(token: Token): void {
        while (this.stack.length > 0) {
            const frame = this.stack[this.stack.length - 1];
            const { line } = this.tokenizer.lines.positionAt(frame.start);
            this.tokenizer.report(
                'unclosed-container',
                'warning',
                `${frame.kind === 'array' ? 'Array' : 'Object'} opened on line ${line} was never closed; closed it at the end.`,
                frame.start
            );
            this.closeContainer({
                kind: frame.kind === 'array' ? 'rbracket' : 'rbrace',
                start: token.start,
                end: token.start
            });
        }

        if (!this.rootAssigned) {
            this.tokenizer.report(
                'missing-value',
                'error',
                'The document held no value; read it as null.',
                token.start
            );
            this.sink.scalar(null);
            this.rootAssigned = true;
        }
    }

    /** Reports a scalar to the sink, if it belongs anywhere. */
    private attach(value: string | number | boolean | null): void {
        const frame = this.top;

        if (!frame) {
            if (this.rootAssigned) {
                // A second root-level value; the first one stands.
                return;
            }
            this.sink.scalar(value);
            this.rootAssigned = true;
            return;
        }

        if (frame.kind === 'object' && frame.key === null) {
            // A value where a property name belonged, e.g. `{1, 2}`.
            this.tokenizer.report(
                'unexpected-token',
                'warning',
                'Value without a property name; skipped it.',
                this.tokenizer.offset
            );
            return;
        }

        this.sink.scalar(value);
        frame.key = null;
    }
}

function describe(token: Token): string {
    switch (token.kind) {
        case 'lbrace':
            return '{';
        case 'rbrace':
            return '}';
        case 'lbracket':
            return '[';
        case 'rbracket':
            return ']';
        case 'colon':
            return ':';
        case 'comma':
            return ',';
        case 'eof':
            return 'end of document';
        default:
            return token.text ?? String(token.value ?? '');
    }
}

import { Tokenizer, type Token } from '../engine/tokenizer';
import { LineMap } from '../engine/diagnostics';

function scan(source: string): Token[] {
    const tokenizer = new Tokenizer(source);
    const tokens: Token[] = [];
    for (;;) {
        const token = tokenizer.next();
        if (token.kind === 'eof') {
            return tokens;
        }
        tokens.push(token);
    }
}

function kinds(source: string): string[] {
    return scan(source).map(token => token.kind);
}

function values(source: string): unknown[] {
    return scan(source).map(token => token.value);
}

describe('Tokenizer', () => {
    it('scans the punctuation of a document', () => {
        expect(kinds('{"a":[1]}')).toEqual([
            'lbrace',
            'string',
            'colon',
            'lbracket',
            'number',
            'rbracket',
            'rbrace'
        ]);
    });

    describe('strings', () => {
        it('decodes escapes', () => {
            expect(values(String.raw`"a\nb\t\"c\\d\u0041"`)).toEqual(['a\nb\t"c\\dA']);
        });

        /*
         * The whole point of scanning rather than pattern-matching: once a
         * string is consumed as one token, nothing downstream can rewrite it.
         */
        it('never interprets the contents of a string', () => {
            expect(values('"True None null {} [] , : // /*"')).toEqual([
                'True None null {} [] , : // /*'
            ]);
        });

        it('reads single-quoted strings and says so', () => {
            const tokenizer = new Tokenizer("'hi'");
            expect(tokenizer.next().value).toBe('hi');
            expect(tokenizer.getDiagnostics().map(d => d.kind)).toEqual(['single-quotes']);
        });

        it('keeps a double quote inside a single-quoted string', () => {
            expect(values(`'say "hi"'`)).toEqual(['say "hi"']);
        });

        it('closes an unterminated string at the end of the line', () => {
            const tokenizer = new Tokenizer('"oops\n"next"');
            expect(tokenizer.next().value).toBe('oops');
            expect(tokenizer.getDiagnostics()[0].kind).toBe('unterminated-string');
            // The rest of the document is still readable.
            expect(tokenizer.next().value).toBe('next');
        });

        it('treats an unknown escape as a literal character', () => {
            expect(values(String.raw`"C:\path"`)).toEqual(['C:path']);
        });
    });

    describe('numbers', () => {
        it('reads the forms JSON allows', () => {
            expect(values('1 -2 3.5 1e3 -1.5E-2')).toEqual([1, -2, 3.5, 1000, -0.015]);
        });

        it('accepts and flags the forms it does not', () => {
            const tokenizer = new Tokenizer('+1');
            expect(tokenizer.next().value).toBe(1);
            expect(tokenizer.getDiagnostics().map(d => d.kind)).toEqual(['number-format']);
        });

        it('replaces a number it cannot read with null', () => {
            const tokenizer = new Tokenizer('1.2.3');
            expect(tokenizer.next().value).toBeNull();
            expect(tokenizer.getDiagnostics()[0].kind).toBe('number-format');
        });
    });

    describe('bare words', () => {
        it('resolves the JSON keywords', () => {
            expect(values('true false null')).toEqual([true, false, null]);
        });

        it('resolves Python spellings and flags them', () => {
            const tokenizer = new Tokenizer('True False None');
            expect([tokenizer.next().value, tokenizer.next().value, tokenizer.next().value]).toEqual(
                [true, false, null]
            );
            expect(tokenizer.getDiagnostics().every(d => d.kind === 'python-literal')).toBe(true);
        });

        it('marks anything else as a bare word for the parser to judge', () => {
            const token = scan('name')[0];
            expect(token.bare).toBe(true);
            expect(token.text).toBe('name');
        });
    });

    describe('comments', () => {
        it('skips line and block comments', () => {
            expect(kinds('{ // one\n /* two */ }')).toEqual(['lbrace', 'rbrace']);
        });

        it('does not mistake a slash inside a string for a comment', () => {
            expect(values('"http://x.com/*y*/"')).toEqual(['http://x.com/*y*/']);
        });
    });

    it('records where each token sits in the source', () => {
        const [first, second] = scan('  12  "ab"');

        expect([first.start, first.end]).toEqual([2, 4]);
        expect([second.start, second.end]).toEqual([6, 10]);
    });

    it('tracks line numbers across a document', () => {
        const tokenizer = new Tokenizer('{\n\n  "a"\n}');
        while (tokenizer.next().kind !== 'eof') {
            // Scanning is what builds the line map.
        }

        expect(tokenizer.lines.positionAt(0)).toEqual({ line: 1, column: 1 });
        expect(tokenizer.lines.positionAt(5).line).toBe(3);
    });
});

describe('LineMap', () => {
    it('reports the first line for offset zero', () => {
        expect(new LineMap().positionAt(0)).toEqual({ line: 1, column: 1 });
    });

    it('finds the line containing an offset', () => {
        const map = new LineMap();
        map.newlineAt(5); // line 2 starts at 6
        map.newlineAt(11); // line 3 starts at 12

        expect(map.positionAt(5)).toEqual({ line: 1, column: 6 });
        expect(map.positionAt(6)).toEqual({ line: 2, column: 1 });
        expect(map.positionAt(20)).toEqual({ line: 3, column: 9 });
        expect(map.lineCount).toBe(3);
    });
});

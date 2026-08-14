import { JSONFormatter, lineSpans } from '../formatter';

/** The rendered line stripped of markup, i.e. what a reader sees. */
function textOf(html: string): string {
    return html
        .replace(/<[^>]*>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function classesIn(html: string): string[] {
    return [...html.matchAll(/class="([^"]+)"/g)].map(match => match[1]);
}

function render(line: string, options: Partial<Parameters<typeof JSONFormatter.renderLine>[1]> = {}) {
    return JSONFormatter.renderLine(line, { lineNumber: 1, showLineNumbers: true, ...options });
}

describe('lineSpans', () => {
    it('tells a property name from a string value', () => {
        const spans = lineSpans('  "name": "value",');

        expect(spans.find(s => s.className === 'key')).toEqual({
            start: 2,
            end: 8,
            className: 'key'
        });
        expect(spans.find(s => s.className === 'string')).toEqual({
            start: 10,
            end: 17,
            className: 'string'
        });
    });

    it('classifies the scalar types', () => {
        expect(lineSpans('  42,').some(s => s.className === 'number')).toBe(true);
        expect(lineSpans('  -1.5e3').some(s => s.className === 'number')).toBe(true);
        expect(lineSpans('  true').some(s => s.className === 'boolean')).toBe(true);
        expect(lineSpans('  false').some(s => s.className === 'boolean')).toBe(true);
        expect(lineSpans('  null').some(s => s.className === 'null')).toBe(true);
    });

    it('classifies punctuation', () => {
        const classes = lineSpans('{').concat(lineSpans('[')).map(s => s.className);
        expect(classes).toContain('brace');
        expect(classes).toContain('bracket');
    });

    /*
     * The whole line is one token if it is a string, so punctuation inside it
     * must not be picked out as structure.
     */
    it('does not find structure inside a string', () => {
        const spans = lineSpans('  "a: {b}, [c]"');

        expect(spans).toHaveLength(1);
        expect(spans[0].className).toBe('string');
    });

    it('handles escaped quotes', () => {
        const spans = lineSpans('  "say \\"hi\\"",');

        // Two spaces, then `"say \"hi\""` -- twelve characters including
        // both escapes and both surrounding quotes.
        expect(spans[0].className).toBe('string');
        expect(spans[0].end).toBe(14);
        expect(spans.some(s => s.className === 'comma')).toBe(true);
    });
});

describe('renderLine', () => {
    it('renders the gutter number inside the row', () => {
        const html = render('{', { lineNumber: 7 });

        expect(html).toContain('class="line-number"');
        expect(html).toContain('>7<');
        expect(html).toContain('data-line="7"');
    });

    it('omits the gutter when line numbers are off', () => {
        expect(render('{', { showLineNumbers: false })).not.toContain('line-number');
    });

    it('colours the pieces of a property line', () => {
        const html = render('  "name": "Ada",');
        const classes = classesIn(html);

        expect(classes).toContain('key');
        expect(classes).toContain('string');
        expect(classes).toContain('colon');
        expect(classes).toContain('comma');
    });

    it('preserves the text exactly', () => {
        const line = '  "path": "a/b, c: d",';
        expect(textOf(render(line))).toContain(line);
    });

    it('escapes markup in values', () => {
        const html = render('  "html": "<script>&"');

        expect(html).toContain('&lt;script&gt;&amp;');
        expect(html).not.toContain('<script>');
    });

    describe('folding', () => {
        it('offers a control on a line that opens a container', () => {
            const html = render('  "a": [', { foldable: true, lineNumber: 3 });

            expect(html).toContain('class="fold-arrow"');
            expect(html).toContain('data-fold-line="2"');
        });

        it('marks a closed fold and shows that content is hidden', () => {
            const html = render('  "a": [', { foldable: true, collapsed: true });

            expect(html).toContain('folded');
            expect(html).toContain('fold-ellipsis');
        });

        /* Rows must stay the same width whether or not they fold, or the text
           steps sideways as you scroll past a container. */
        it('reserves the same space when a line does not fold', () => {
            expect(render('  1,')).toContain('fold-spacer');
        });
    });

    describe('search marks', () => {
        it('marks a match inside a value', () => {
            const html = render('  "name": "Ada",', {
                matches: [{ start: 11, end: 14 }]
            });

            expect(html).toContain('search-highlight');
            expect(textOf(html)).toContain('Ada');
        });

        it('distinguishes the current match', () => {
            const html = render('  "a": "xx",', {
                matches: [{ start: 8, end: 10, current: true }]
            });

            expect(html).toContain('search-highlight current');
        });

        it('marks several matches on one line', () => {
            const html = render('  "aa": "aa",', {
                matches: [
                    { start: 3, end: 5 },
                    { start: 9, end: 11 }
                ]
            });

            expect(html.match(/search-highlight/g)).toHaveLength(2);
        });

        /* A hit can run from the end of a string into the comma after it; the
           marks and the token colours have to nest rather than overlap. */
        it('splits a match that crosses a token boundary', () => {
            const html = render('  "a": 12,', { matches: [{ start: 8, end: 10 }] });

            expect(textOf(html)).toBe('1  "a": 12,');
            expect(html).toContain('search-highlight');
            expect(html).toContain('class="number"');
        });
    });

    it('toggles the line-number setting', () => {
        JSONFormatter.setShowLineNumbers(false);
        expect(JSONFormatter.getShowLineNumbers()).toBe(false);
        expect(JSONFormatter.renderLine('{', { lineNumber: 1 })).not.toContain('line-number');

        JSONFormatter.setShowLineNumbers(true);
        expect(JSONFormatter.renderLine('{', { lineNumber: 1 })).toContain('line-number');
    });

    describe('escapeHtml', () => {
        it('escapes the characters that would change the markup', () => {
            expect(JSONFormatter.escapeHtml('<a href="x">&</a>')).toBe(
                '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;'
            );
        });
    });
});

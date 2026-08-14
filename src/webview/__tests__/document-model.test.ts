import { FoldState, isCloserLine, LineTable } from '../engine/line-index';
import { lineForPath } from '../engine/path-index';
import { PrettySink } from '../engine/pretty-sink';
import { parseInto } from '../engine/recovering-parser';
import { TextStore } from '../engine/text-store';

function format(json: string, indent?: number) {
    const { value } = parseInto(json, new PrettySink(indent === undefined ? {} : { indent }));
    return { text: value.text.toString(), lines: value.lines, store: value.text };
}

describe('TextStore', () => {
    it('behaves like the string it holds', () => {
        const store = TextStore.from('hello world');

        expect(store.length).toBe(11);
        expect(store.toString()).toBe('hello world');
        expect(store.slice(0, 5)).toBe('hello');
        expect(store.slice(6, 11)).toBe('world');
        expect(String.fromCharCode(store.charCodeAt(4))).toBe('o');
    });

    it('reads across chunk boundaries', () => {
        const store = new TextStore();
        // Well past the chunk size, so the content is split many times over.
        const piece = 'abcdefghij'.repeat(200_000); // 2 MB
        store.append(piece);
        store.append('TAIL');
        store.seal();

        expect(store.chunkCount).toBeGreaterThan(1);
        expect(store.length).toBe(piece.length + 4);
        expect(store.slice(piece.length, piece.length + 4)).toBe('TAIL');

        // A slice spanning a boundary must still come back in one piece.
        const across = store.slice(piece.length - 5, piece.length + 4);
        expect(across).toBe('fghijTAIL');
    });

    it('handles out-of-range reads', () => {
        const store = TextStore.from('abc');

        expect(store.slice(-5, 2)).toBe('ab');
        expect(store.slice(2, 99)).toBe('c');
        expect(store.slice(5, 9)).toBe('');
        expect(Number.isNaN(store.charCodeAt(99))).toBe(true);
    });

    it('reads text that has not been sealed yet', () => {
        const store = new TextStore();
        store.append('partial');

        expect(store.slice(0, 7)).toBe('partial');
    });
});

describe('PrettySink', () => {
    it('formats a document without building a value for it', () => {
        expect(format('{"a":1,"b":[1,2],"c":{"d":true}}').text).toBe(
            ['{', '  "a": 1,', '  "b": [', '    1,', '    2', '  ],', '  "c": {', '    "d": true', '  }', '}'].join(
                '\n'
            )
        );
    });

    it('matches what JSON.stringify would produce', () => {
        const cases = [
            '{"a":1}',
            '[1,[2,[3,[4]]]]',
            '{"a":{"b":{"c":[]}}}',
            '{"empty":{},"list":[],"n":null,"f":false}',
            '[{"x":1},{"y":2}]',
            '"just a string"',
            '42',
            'null',
            '{"escaped":"line\\nbreak \\"quoted\\" \\\\ tab\\t"}',
            '{"unicode":"\\u00e9\\u4e2d"}'
        ];

        for (const source of cases) {
            expect(format(source).text).toBe(JSON.stringify(JSON.parse(source), null, 2));
        }
    });

    it('honours the indent width', () => {
        expect(format('{"a":{"b":1}}', 4).text).toBe(
            ['{', '    "a": {', '        "b": 1', '    }', '}'].join('\n')
        );
    });

    it('formats repaired input', () => {
        expect(format("{a: 'x', b: True,}").text).toBe(
            ['{', '  "a": "x",', '  "b": true', '}'].join('\n')
        );
    });

    it('keeps empty containers on one line', () => {
        const { text, lines } = format('{"a":{},"b":[]}');

        expect(text).toBe(['{', '  "a": {},', '  "b": []', '}'].join('\n'));
        expect(lines.isFoldable(1)).toBe(false);
    });

    describe('line table', () => {
        it('records where each line starts', () => {
            const { text, lines } = format('{"a":1,"b":2}');

            expect(lines.lineCount).toBe(4);
            for (let i = 0; i < lines.lineCount; i++) {
                const start = lines.start(i);
                const end = lines.end(i, text.length);
                expect(text.slice(start, end)).toBe(text.split('\n')[i]);
            }
        });

        it('records nesting depth', () => {
            const { lines } = format('{"a":{"b":1}}');

            expect(lines.depth(0)).toBe(0); // {
            expect(lines.depth(1)).toBe(1); //   "a": {
            expect(lines.depth(2)).toBe(2); //     "b": 1
            expect(lines.depth(3)).toBe(1); //   }
        });

        it('pairs each container with the line that closes it', () => {
            const { lines } = format('{"a":[1,2],"b":3}');
            // 0 {  1 "a": [  2 1  3 2  4 ]  5 "b": 3  6 }
            expect(lines.foldEnd(0)).toBe(6);
            expect(lines.foldEnd(1)).toBe(4);
            expect(lines.isFoldable(2)).toBe(false);
        });
    });

    describe('scale', () => {
        it('formats a large document in reasonable time and without deep recursion', () => {
            const rows = Array.from({ length: 20_000 }, (_, i) => ({
                id: i,
                name: `row ${i}`,
                tags: ['a', 'b'],
                nested: { value: i * 2 }
            }));
            const source = JSON.stringify({ rows });

            const started = Date.now();
            const { value } = parseInto(source, new PrettySink());
            const elapsed = Date.now() - started;

            expect(value.lines.lineCount).toBeGreaterThan(200_000);
            expect(elapsed).toBeLessThan(10_000);
        });

        it('formats a deeply nested document without overflowing the stack', () => {
            const depth = 20_000;
            const source = '['.repeat(depth) + ']'.repeat(depth);

            const { value } = parseInto(source, new PrettySink());

            // The innermost pair is empty, so it stays on one line: the
            // opening brackets take `depth` lines and the closers `depth - 1`.
            expect(value.lines.lineCount).toBe(depth * 2 - 1);
            expect(value.lines.foldEnd(0)).toBe(depth * 2 - 2);
        });
    });
});

describe('FoldState', () => {
    /** `{ a: [1,2], b: 3 }` formatted: 7 lines, folds at 0 and 1. */
    function sample() {
        const { lines } = format('{"a":[1,2],"b":3}');
        return { lines, folds: new FoldState(lines) };
    }

    it('shows every line when nothing is folded', () => {
        const { lines, folds } = sample();

        expect(folds.visibleCount).toBe(lines.lineCount);
        for (let i = 0; i < lines.lineCount; i++) {
            expect(folds.lineAt(i)).toBe(i);
            expect(folds.rowAt(i)).toBe(i);
        }
    });

    it('hides the body of a collapsed fold', () => {
        const { folds } = sample();
        folds.toggle(1); // "a": [ ... ] hides lines 2..4

        expect(folds.isCollapsed(1)).toBe(true);
        expect(folds.visibleCount).toBe(4); // 0, 1, 5, 6

        expect(folds.lineAt(0)).toBe(0);
        expect(folds.lineAt(1)).toBe(1);
        expect(folds.lineAt(2)).toBe(5);
        expect(folds.lineAt(3)).toBe(6);

        expect(folds.rowAt(3)).toBe(-1);
        expect(folds.rowAt(5)).toBe(2);
    });

    it('reports which fold is hiding a line', () => {
        const { folds } = sample();
        folds.toggle(1);

        expect(folds.foldHiding(3)).toBe(1);
        expect(folds.foldHiding(5)).toBe(-1);
    });

    it('reopens a fold', () => {
        const { lines, folds } = sample();
        folds.toggle(1);
        folds.toggle(1);

        expect(folds.visibleCount).toBe(lines.lineCount);
    });

    it('ignores lines that open nothing', () => {
        const { lines, folds } = sample();
        folds.toggle(2);

        expect(folds.visibleCount).toBe(lines.lineCount);
    });

    /*
     * A fold inside a collapsed fold hides nothing extra. Merging the ranges
     * keeps the visible-row arithmetic a single pass over a short list.
     */
    it('merges a nested fold into the one that already hides it', () => {
        const { folds } = sample();
        folds.toggle(0); // hides 1..6
        folds.toggle(1); // already hidden

        expect(folds.visibleCount).toBe(1);
        expect(folds.lineAt(0)).toBe(0);
    });

    it('collapses and expands everything', () => {
        const { lines, folds } = sample();

        folds.collapseAll();
        expect(folds.visibleCount).toBe(1);

        folds.expandAll();
        expect(folds.visibleCount).toBe(lines.lineCount);
    });

    it('keeps row and line lookups consistent across many folds', () => {
        const { value } = parseInto(
            JSON.stringify({ a: [1, 2, 3], b: [4, 5, 6], c: [7, 8, 9] }),
            new PrettySink()
        );
        const folds = new FoldState(value.lines);

        for (let line = 0; line < value.lines.lineCount; line++) {
            if (value.lines.isFoldable(line) && line > 0) {
                folds.toggle(line);
            }
        }

        for (let row = 0; row < folds.visibleCount; row++) {
            expect(folds.rowAt(folds.lineAt(row))).toBe(row);
        }
    });
});

/*
 * These are the operations the visual view leans on, and on a document with a
 * million nodes each of them used to walk, allocate or sort something the size
 * of the document. What matters is that the cheaper implementation still says
 * exactly what the old one did.
 */
describe('FoldState at scale', () => {
    /** A wide document: one array of `count` small objects. */
    function wide(count: number) {
        const json = JSON.stringify({
            rows: Array.from({ length: count }, (_, i) => ({ id: i, tags: ['a', 'b'] }))
        });
        const doc = parseInto(json, new PrettySink({ indent: 2 })).value;
        return { doc, folds: new FoldState(doc.lines, { alwaysHidden: isCloserLine }) };
    }

    it('hides every closing bracket without listing them', () => {
        const { doc, folds } = wide(200);
        for (let line = 0; line < doc.lines.lineCount; line++) {
            if (isCloserLine(doc.lines, line)) {
                expect(folds.rowAt(line)).toBe(-1);
            }
        }
    });

    it('collapses below a depth in one step', () => {
        const { doc, folds } = wide(50);
        folds.collapseBelowDepth(2);

        for (let row = 0; row < folds.visibleCount; row++) {
            expect(doc.lines.depth(folds.lineAt(row))).toBeLessThanOrEqual(2);
        }
    });

    it('agrees with collapsing each container by hand', () => {
        const byDepth = wide(30);
        byDepth.folds.collapseBelowDepth(1);

        const byHand = wide(30);
        byHand.folds.expandAll();
        for (let line = 0; line < byHand.doc.lines.lineCount; line++) {
            if (byHand.doc.lines.isFoldable(line) && byHand.doc.lines.depth(line) >= 1) {
                byHand.folds.toggle(line);
            }
        }

        expect(byDepth.folds.visibleCount).toBe(byHand.folds.visibleCount);
    });

    it('opens everything hiding a line in one pass', () => {
        const { doc, folds } = wide(40);
        folds.collapseAll();

        const deep = lineForPath(doc, ['rows', '20', 'tags', '1']);
        expect(folds.rowAt(deep)).toBe(-1);

        expect(folds.expose(deep)).toBe(true);
        expect(folds.rowAt(deep)).toBeGreaterThanOrEqual(0);
    });

    it('says nothing changed when the line is already visible', () => {
        const { doc, folds } = wide(10);
        expect(folds.expose(lineForPath(doc, ['rows', '0', 'id']))).toBe(false);
    });

    it('leaves a collapsed document with very few hidden stretches', () => {
        const { folds } = wide(2000);
        folds.collapseAll();

        // Everything below the root is one contiguous block.
        expect(folds.hiddenRangeCount).toBeLessThanOrEqual(2);
        expect(folds.visibleCount).toBe(1);
    });

    it('keeps row and line consistent however wide the document', () => {
        const { folds } = wide(500);
        folds.collapseBelowDepth(2);

        for (let row = 0; row < folds.visibleCount; row += 7) {
            expect(folds.rowAt(folds.lineAt(row))).toBe(row);
        }
    });

    it('stays quick on a document with a million nodes', () => {
        const { folds } = wide(60_000);

        const started = Date.now();
        folds.collapseAll();
        folds.collapseBelowDepth(2);
        folds.expandAll();

        expect(Date.now() - started).toBeLessThan(3000);
    });
});

describe('LineTable', () => {
    it('grows past its initial capacity', () => {
        const table = new LineTable(2);
        for (let i = 0; i < 1000; i++) {
            table.push(i * 10, i % 5);
        }

        expect(table.lineCount).toBe(1000);
        expect(table.start(999)).toBe(9990);
        expect(table.depth(999)).toBe(999 % 5);
    });
});

/**
 * Turning a JSON path into a line, and back.
 *
 * The diff engine has always written a path onto every change row; this is
 * what makes those paths mean something. The cases that matter are the ones
 * where guessing would go wrong: object keys that look like array indices,
 * keys needing escapes, and containers nested inside arrays.
 */
import { LineKind, LineTable } from '../engine/line-index';
import { lineForPath, NOT_FOUND, pathForLine } from '../engine/path-index';
import { PrettySink, type PrettyDocument } from '../engine/pretty-sink';
import { parseInto } from '../engine/recovering-parser';

function format(json: string, indent = 2): PrettyDocument {
    return parseInto(json, new PrettySink({ indent })).value;
}

/** The text of the line a path resolves to, trimmed of its indent. */
function textAt(doc: PrettyDocument, path: string[]): string {
    const line = lineForPath(doc, path);
    if (line === NOT_FOUND) {
        return 'NOT FOUND';
    }
    return doc.text.slice(doc.lines.start(line), doc.lines.end(line, doc.text.length)).trim();
}

describe('lineForPath', () => {
    const doc = format(
        JSON.stringify({
            name: 'root',
            nested: { deep: { value: 42 } },
            items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
            flags: [true, false],
            empty: {},
            after: 'last'
        })
    );

    it('finds a top-level property', () => {
        expect(textAt(doc, ['name'])).toBe('"name": "root",');
    });

    it('finds a property after a container sibling', () => {
        // Only correct if whole subtrees are stepped over rather than walked.
        expect(textAt(doc, ['after'])).toBe('"after": "last"');
    });

    it('finds a deeply nested value', () => {
        expect(textAt(doc, ['nested', 'deep', 'value'])).toBe('"value": 42');
    });

    it('finds an array element by position', () => {
        expect(textAt(doc, ['items', '0', 'id'])).toBe('"id": "a"');
        expect(textAt(doc, ['items', '1', 'id'])).toBe('"id": "b"');
        expect(textAt(doc, ['items', '2', 'id'])).toBe('"id": "c"');
    });

    it('finds a scalar inside an array', () => {
        expect(textAt(doc, ['flags', '1'])).toBe('false');
    });

    it('returns the container line for a container', () => {
        expect(textAt(doc, ['items'])).toBe('"items": [');
    });

    it('resolves the empty path to the root', () => {
        expect(lineForPath(doc, [])).toBe(0);
    });

    describe('paths that lead nowhere', () => {
        it('rejects a missing property', () => {
            expect(lineForPath(doc, ['nope'])).toBe(NOT_FOUND);
        });

        it('rejects an index past the end of an array', () => {
            expect(lineForPath(doc, ['flags', '9'])).toBe(NOT_FOUND);
        });

        it('rejects descending into a scalar', () => {
            expect(lineForPath(doc, ['name', 'x'])).toBe(NOT_FOUND);
        });

        it('rejects descending into an empty container', () => {
            expect(lineForPath(doc, ['empty', 'x'])).toBe(NOT_FOUND);
        });

        it('rejects a non-numeric segment on an array', () => {
            expect(lineForPath(doc, ['flags', 'first'])).toBe(NOT_FOUND);
        });
    });

    /*
     * An object with the key "0" is legal JSON. Deciding array-versus-object
     * from whether a segment looks numeric would resolve it as position zero
     * and quietly land on the wrong property.
     */
    it('treats a numeric key as a name when the container is an object', () => {
        const numeric = format(JSON.stringify({ '0': 'zero', '1': 'one', other: true }));

        expect(textAt(numeric, ['1'])).toBe('"1": "one",');
        expect(textAt(numeric, ['0'])).toBe('"0": "zero",');
    });

    it('matches a key needing escapes', () => {
        const tricky = format(
            JSON.stringify({ 'a "quoted" key': 1, 'tab\there': 2, 'back\\slash': 3 })
        );

        expect(textAt(tricky, ['a "quoted" key'])).toContain('1');
        expect(textAt(tricky, ['tab\there'])).toContain('2');
        expect(textAt(tricky, ['back\\slash'])).toContain('3');
    });

    it('does not confuse a key with a prefix of another', () => {
        const doc = format(JSON.stringify({ id: 1, identifier: 2 }));

        expect(textAt(doc, ['id'])).toBe('"id": 1,');
        expect(textAt(doc, ['identifier'])).toBe('"identifier": 2');
    });

    it('walks arrays of arrays', () => {
        const grid = format(JSON.stringify({ grid: [[1, 2], [3, 4]] }));

        expect(textAt(grid, ['grid', '1', '0'])).toBe('3,');
    });

    it('finds a value under a different indent width', () => {
        const wide = format(JSON.stringify({ a: { b: 7 } }), 8);

        expect(textAt(wide, ['a', 'b'])).toBe('"b": 7');
    });

    it('stays quick on a wide document', () => {
        const wide = format(
            JSON.stringify({
                rows: Array.from({ length: 20_000 }, (_, i) => ({ id: i, name: `row ${i}` }))
            })
        );

        const started = Date.now();
        const line = lineForPath(wide, ['rows', '19999', 'name']);
        expect(line).not.toBe(NOT_FOUND);
        expect(Date.now() - started).toBeLessThan(500);
    });
});

describe('pathForLine', () => {
    const doc = format(
        JSON.stringify({
            name: 'root',
            items: [{ id: 'a' }, { id: 'b' }],
            nested: { deep: [1, 2, 3] }
        })
    );

    it('names a top-level property', () => {
        expect(pathForLine(doc, lineForPath(doc, ['name']))).toEqual(['name']);
    });

    it('numbers an array element', () => {
        expect(pathForLine(doc, lineForPath(doc, ['items', '1', 'id']))).toEqual([
            'items',
            '1',
            'id'
        ]);
    });

    it('round-trips every line of the document', () => {
        for (let line = 1; line < doc.lines.lineCount; line++) {
            if (doc.lines.kind(line) === LineKind.Closer) {
                continue;
            }
            expect(lineForPath(doc, pathForLine(doc, line))).toBe(line);
        }
    });

    it('gives the root an empty path', () => {
        expect(pathForLine(doc, 0)).toEqual([]);
    });
});

describe('the node columns', () => {
    const doc = format(JSON.stringify({ obj: { a: 1, b: 2 }, arr: [1, 2, 3], empty: [], n: 4 }));

    it('records what kind of thing is on each line', () => {
        expect(doc.lines.kind(0)).toBe(LineKind.Object);
        expect(doc.lines.kind(lineForPath(doc, ['obj']))).toBe(LineKind.Object);
        expect(doc.lines.kind(lineForPath(doc, ['arr']))).toBe(LineKind.Array);
        expect(doc.lines.kind(lineForPath(doc, ['n']))).toBe(LineKind.Scalar);
    });

    it('marks the closing bracket of a multi-line container', () => {
        const closer = doc.lines.foldEnd(lineForPath(doc, ['arr']));
        expect(doc.lines.kind(closer)).toBe(LineKind.Closer);
    });

    /* An empty container stays on one line, so that line is still the array. */
    it('leaves a one-line container as its own kind', () => {
        const line = lineForPath(doc, ['empty']);
        expect(doc.lines.kind(line)).toBe(LineKind.Array);
        expect(doc.lines.childCount(line)).toBe(0);
    });

    it('counts direct children', () => {
        expect(doc.lines.childCount(0)).toBe(4);
        expect(doc.lines.childCount(lineForPath(doc, ['obj']))).toBe(2);
        expect(doc.lines.childCount(lineForPath(doc, ['arr']))).toBe(3);
    });

    it('records where a property name sits', () => {
        const line = lineForPath(doc, ['n']);
        const { start, length } = doc.lines.keyRange(line);
        expect(doc.text.slice(start, start + length)).toBe('"n"');
    });

    it('gives an array element no name', () => {
        expect(doc.lines.keyRange(lineForPath(doc, ['arr', '0'])).length).toBe(0);
    });

    /* Formatting happens in the worker, so every column has to survive the
       trip back or the panel would hold an index missing half of itself. */
    it('survives the round trip through a worker message', () => {
        const original = format(JSON.stringify({ a: [1, 2], b: 3 }));
        const restored = {
            text: original.text,
            lines: LineTable.deserialize(original.lines.serialize())
        };

        expect(lineForPath(restored, ['a', '1'])).toBe(lineForPath(original, ['a', '1']));
        expect(restored.lines.childCount(0)).toBe(2);
        expect(restored.lines.kind(lineForPath(restored, ['a']))).toBe(LineKind.Array);
        expect(restored.lines.keyRange(lineForPath(restored, ['b'])).length).toBe(3);
        expect(restored.lines.ordinal(lineForPath(restored, ['a', '1']))).toBe(1);
    });
});

/**
 * Reading a line of the formatted document as a tree node.
 *
 * The tree does not parse anything of its own, so everything a node shows has
 * to be recoverable from the line index and the text beside it.
 */
import { FoldState, isCloserLine, LineKind, nodeCount } from '../engine/line-index';
import { nodeAt, subtreeText } from '../engine/node-view';
import { lineForPath } from '../engine/path-index';
import { PrettySink, type PrettyDocument } from '../engine/pretty-sink';
import { parseInto } from '../engine/recovering-parser';

function format(json: string): PrettyDocument {
    return parseInto(json, new PrettySink({ indent: 2 })).value;
}

const doc = format(
    JSON.stringify({
        name: 'Ada',
        count: 42,
        active: true,
        missing: null,
        tags: ['a', 'b'],
        author: { first: 'Ada', last: 'Lovelace' },
        empty: {},
        none: []
    })
);

const node = (path: string[]) => nodeAt(doc, lineForPath(doc, path));

describe('nodeAt', () => {
    it('names the type of each scalar', () => {
        expect(node(['name']).type).toBe('string');
        expect(node(['count']).type).toBe('number');
        expect(node(['active']).type).toBe('boolean');
        expect(node(['missing']).type).toBe('null');
    });

    it('names the type of each container', () => {
        expect(node(['tags']).type).toBe('array');
        expect(node(['author']).type).toBe('object');
        expect(nodeAt(doc, 0).type).toBe('object');
    });

    it('decodes the property name', () => {
        expect(node(['name']).key).toBe('name');
    });

    it('decodes a name that needed escaping', () => {
        const tricky = format(JSON.stringify({ 'a "quoted" key': 1 }));
        expect(nodeAt(tricky, lineForPath(tricky, ['a "quoted" key'])).key).toBe('a "quoted" key');
    });

    it('gives an array element no name, and marks it as indexed', () => {
        const element = node(['tags', '0']);
        expect(element.key).toBe('');
        expect(element.indexed).toBe(true);
    });

    it('does not mistake the root for an array element', () => {
        expect(nodeAt(doc, 0).indexed).toBe(false);
    });

    /*
     * An element has no property name, so its position is the only thing the
     * tree and the graph can label it with. It comes from the index rather than
     * from counting siblings, which for a long array costs a walk per row.
     */
    describe('the position of an array element', () => {
        it('counts from zero', () => {
            expect(node(['tags', '0']).index).toBe(0);
            expect(node(['tags', '1']).index).toBe(1);
        });

        it('is -1 for anything that has a name of its own', () => {
            expect(node(['name']).index).toBe(-1);
            expect(node(['author', 'first']).index).toBe(-1);
            expect(nodeAt(doc, 0).index).toBe(-1);
        });

        it('keeps counting past the point a walk would start to hurt', () => {
            const long = format(JSON.stringify({ rows: Array.from({ length: 500 }, (_, i) => i) }));
            expect(nodeAt(long, lineForPath(long, ['rows', '499'])).index).toBe(499);
        });

        it('numbers each array from its own start', () => {
            const nested = format(JSON.stringify([['a', 'b'], ['c']]));
            expect(nodeAt(nested, lineForPath(nested, ['1'])).index).toBe(1);
            expect(nodeAt(nested, lineForPath(nested, ['1', '0'])).index).toBe(0);
        });
    });

    describe('the preview', () => {
        it('shows a scalar as it is written, without the trailing comma', () => {
            expect(node(['name']).preview).toBe('"Ada"');
            expect(node(['count']).preview).toBe('42');
            expect(node(['missing']).preview).toBe('null');
        });

        it('shows the last property of an object, which has no comma', () => {
            expect(node(['author', 'last']).preview).toBe('"Lovelace"');
        });

        it('counts what is inside a container rather than dumping it', () => {
            expect(node(['tags']).preview).toBe('2 items');
            expect(node(['author']).preview).toBe('2 properties');
        });

        it('does not say "1 propertys"', () => {
            const one = format(JSON.stringify({ a: { b: 1 }, c: [1] }));
            expect(nodeAt(one, lineForPath(one, ['a'])).preview).toBe('1 property');
            expect(nodeAt(one, lineForPath(one, ['c'])).preview).toBe('1 item');
        });

        it('says an empty container is empty', () => {
            expect(node(['empty']).preview).toBe('no properties');
            expect(node(['none']).preview).toBe('empty');
        });

        it('keeps a value containing a comma intact', () => {
            const commas = format(JSON.stringify({ a: 'x, y, z', b: 1 }));
            expect(nodeAt(commas, lineForPath(commas, ['a'])).preview).toBe('"x, y, z"');
        });
    });

    it('reports whether a node can be opened', () => {
        expect(node(['tags']).expandable).toBe(true);
        expect(node(['name']).expandable).toBe(false);
        // An empty container fits on one line, so there is nothing to open.
        expect(node(['empty']).expandable).toBe(false);
    });

    it('reports how many children a container has', () => {
        expect(node(['tags']).childCount).toBe(2);
        expect(node(['author']).childCount).toBe(2);
        expect(node(['name']).childCount).toBe(0);
    });
});

describe('subtreeText', () => {
    it('returns a scalar as its own line', () => {
        expect(subtreeText(doc, lineForPath(doc, ['name']))).toBe('"name": "Ada"');
    });

    it('returns a container with everything under it', () => {
        expect(subtreeText(doc, lineForPath(doc, ['tags']))).toBe('"tags": [\n  "a",\n  "b"\n]');
    });

    /* A copied subtree should paste cleanly, not carry the indent it had. */
    it('strips the indentation the node was sitting at', () => {
        const nested = format(JSON.stringify({ outer: { inner: { leaf: 1 } } }));
        const text = subtreeText(nested, lineForPath(nested, ['outer', 'inner']));

        expect(text).toBe('"inner": {\n  "leaf": 1\n}');
    });

    it('drops the comma separating the node from its sibling', () => {
        expect(subtreeText(doc, lineForPath(doc, ['count']))).toBe('"count": 42');
    });
});

describe('recognising a closing bracket', () => {
    const closers = () => {
        const lines: number[] = [];
        for (let line = 0; line < doc.lines.lineCount; line++) {
            if (isCloserLine(doc.lines, line)) {
                lines.push(line);
            }
        }
        return lines;
    };

    it('finds every line holding only a closing bracket', () => {
        expect(closers().length).toBeGreaterThan(0);
        for (const line of closers()) {
            expect(doc.lines.kind(line)).toBe(LineKind.Closer);
            expect(doc.text.slice(doc.lines.start(line), doc.lines.end(line, doc.text.length)).trim())
                .toMatch(/^[}\]],?$/);
        }
    });

    /* Three containers span several lines: the root, `tags` and `author`. */
    it('is what turns the line count into a node count', () => {
        expect(closers()).toHaveLength(3);
        expect(nodeCount(doc.lines)).toBe(doc.lines.lineCount - 3);
    });
});

describe('FoldState with always-hidden lines', () => {
    const treeState = () => new FoldState(doc.lines, { alwaysHidden: isCloserLine });

    it('leaves the closing brackets out of the rows', () => {
        expect(treeState().visibleCount).toBe(doc.lines.lineCount - 3);
    });

    it('maps every row back to a line that is not a closer', () => {
        const folds = treeState();
        for (let row = 0; row < folds.visibleCount; row++) {
            expect(doc.lines.kind(folds.lineAt(row))).not.toBe(LineKind.Closer);
        }
    });

    it('round-trips row and line', () => {
        const folds = treeState();
        for (let row = 0; row < folds.visibleCount; row++) {
            expect(folds.rowAt(folds.lineAt(row))).toBe(row);
        }
    });

    it('reports a hidden closer as having no row', () => {
        const folds = treeState();
        for (const closer of [...Array(doc.lines.lineCount).keys()].filter(l =>
            isCloserLine(doc.lines, l)
        )) {
            expect(folds.rowAt(closer)).toBe(-1);
        }
    });

    it('collapses a container to a single row', () => {
        const folds = treeState();
        const before = folds.visibleCount;
        folds.toggle(lineForPath(doc, ['author']));

        // `author` had two children on their own lines, plus its closer, but
        // the closer was already hidden.
        expect(folds.visibleCount).toBe(before - 2);
    });

    it('restores the rows when reopened', () => {
        const folds = treeState();
        const before = folds.visibleCount;
        const line = lineForPath(doc, ['author']);

        folds.toggle(line);
        folds.toggle(line);

        expect(folds.visibleCount).toBe(before);
    });

    it('collapses everything to just the root', () => {
        const folds = treeState();
        folds.collapseAll();

        expect(folds.visibleCount).toBe(1);
        expect(folds.lineAt(0)).toBe(0);
    });
});

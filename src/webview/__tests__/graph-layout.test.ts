/**
 * Placing nodes for the graph.
 *
 * Pure arithmetic over the line index, so these assert positions directly
 * rather than going anywhere near an SVG.
 */
import {
    COLUMN_WIDTH,
    DEFAULT_NODE_BUDGET,
    depthThatFits,
    edgePath,
    layoutGraph,
    NODE_WIDTH,
    ROW_HEIGHT
} from '../engine/graph-layout';
import { closerLines, FoldState } from '../engine/line-index';
import { lineForPath } from '../engine/path-index';
import { PrettySink, type PrettyDocument } from '../engine/pretty-sink';
import { parseInto } from '../engine/recovering-parser';

function build(json: string): { doc: PrettyDocument; folds: FoldState } {
    const doc = parseInto(json, new PrettySink({ indent: 2 })).value;
    return { doc, folds: new FoldState(doc.lines, { alwaysHidden: closerLines }) };
}

const SAMPLE = JSON.stringify({
    a: 1,
    list: [10, 20],
    nested: { deep: { leaf: true } }
});

describe('layoutGraph', () => {
    it('places one node per visible node of the document', () => {
        const { doc, folds } = build(SAMPLE);
        const layout = layoutGraph(doc, folds);

        // root, a, list, 10, 20, nested, deep, leaf
        expect(layout.nodes).toHaveLength(8);
    });

    it('never places a closing bracket', () => {
        const { doc, folds } = build(SAMPLE);
        const closers = new Set(closerLines(doc.lines));

        for (const node of layoutGraph(doc, folds).nodes) {
            expect(closers.has(node.line)).toBe(false);
        }
    });

    it('puts each depth in its own column', () => {
        const { doc, folds } = build(SAMPLE);
        const byLine = new Map(layoutGraph(doc, folds).nodes.map(n => [n.line, n]));

        expect(byLine.get(0)?.x).toBe(0);
        expect(byLine.get(lineForPath(doc, ['a']))?.x).toBe(COLUMN_WIDTH);
        expect(byLine.get(lineForPath(doc, ['nested', 'deep']))?.x).toBe(COLUMN_WIDTH * 2);
    });

    it('gives leaves a row each', () => {
        const { doc, folds } = build(JSON.stringify({ a: 1, b: 2, c: 3 }));
        const nodes = layoutGraph(doc, folds).nodes.filter(n => n.line > 0);

        expect(nodes.map(n => n.y)).toEqual([0, ROW_HEIGHT, ROW_HEIGHT * 2]);
    });

    /*
     * A parent stacked at the top of its children reads as a list; centred on
     * them, the shape of the document is legible at a glance.
     */
    it('centres a parent on the children it has', () => {
        const { doc, folds } = build(JSON.stringify({ a: 1, b: 2, c: 3 }));
        const byLine = new Map(layoutGraph(doc, folds).nodes.map(n => [n.line, n]));

        expect(byLine.get(0)?.y).toBe(ROW_HEIGHT);
    });

    it('links every child to its parent', () => {
        const { doc, folds } = build(JSON.stringify({ a: 1, b: [2] }));
        const layout = layoutGraph(doc, folds);

        // root->a, root->b, b->2
        expect(layout.edges).toHaveLength(3);
        expect(layout.edges.every(edge => edge.from !== edge.to)).toBe(true);
    });

    it('reports a box big enough to hold everything', () => {
        const { doc, folds } = build(SAMPLE);
        const layout = layoutGraph(doc, folds);

        for (const node of layout.nodes) {
            expect(node.x + NODE_WIDTH).toBeLessThanOrEqual(layout.width);
            expect(node.y).toBeLessThanOrEqual(layout.height);
        }
    });

    describe('folding', () => {
        it('drops the children of a collapsed node', () => {
            const { doc, folds } = build(SAMPLE);
            folds.toggle(lineForPath(doc, ['list']));

            const lines = layoutGraph(doc, folds).nodes.map(n => n.line);
            expect(lines).toContain(lineForPath(doc, ['list']));
            expect(lines).not.toContain(lineForPath(doc, ['list', '0']));
        });

        it('marks a collapsed node as such', () => {
            const { doc, folds } = build(SAMPLE);
            const line = lineForPath(doc, ['list']);
            folds.toggle(line);

            const node = layoutGraph(doc, folds).nodes.find(n => n.line === line);
            expect(node?.collapsed).toBe(true);
            expect(node?.expandable).toBe(true);
        });

        it('leaves only the root when everything is collapsed', () => {
            const { doc, folds } = build(SAMPLE);
            folds.collapseAll();

            expect(layoutGraph(doc, folds).nodes).toHaveLength(1);
        });
    });

    /*
     * A picture of a hundred thousand boxes is not a picture. The layout stops
     * and says so, rather than producing something nothing can draw.
     */
    describe('the node budget', () => {
        const wide = () => build(JSON.stringify({ rows: Array.from({ length: 500 }, (_, i) => i) }));

        it('stops at the budget', () => {
            const { doc, folds } = wide();
            const layout = layoutGraph(doc, folds, { budget: 50 });

            expect(layout.nodes.length).toBeLessThanOrEqual(50);
            expect(layout.truncated).toBe(true);
        });

        it('says nothing was cut when everything fits', () => {
            const { doc, folds } = build(SAMPLE);
            expect(layoutGraph(doc, folds).truncated).toBe(false);
        });

        it('has a budget by default', () => {
            expect(DEFAULT_NODE_BUDGET).toBeGreaterThan(0);
        });

        it('produces nothing at all for a budget of zero', () => {
            const { doc, folds } = build(SAMPLE);
            expect(layoutGraph(doc, folds, { budget: 0 }).nodes).toEqual([]);
        });
    });

    it('survives a document nested far past the call stack', () => {
        let json = '1';
        for (let i = 0; i < 20_000; i++) {
            json = `{"n":${json}}`;
        }
        const { doc, folds } = build(json);

        expect(() => layoutGraph(doc, folds, { budget: 100 })).not.toThrow();
    });

    it('lays out an empty document as nothing', () => {
        const { doc, folds } = build('');
        expect(layoutGraph(doc, folds).nodes.length).toBeLessThanOrEqual(1);
    });
});

describe('depthThatFits', () => {
    it('takes the whole document when it fits', () => {
        const { doc } = build(SAMPLE);
        expect(depthThatFits(doc.lines, 1000)).toBeGreaterThanOrEqual(3);
    });

    it('stops one level above the one that overflows', () => {
        // The root plus one wide array: depth 1 fits, depth 2 does not.
        const { doc } = build(JSON.stringify({ rows: Array.from({ length: 500 }, (_, i) => i) }));

        expect(depthThatFits(doc.lines, 50)).toBe(1);
    });

    it('falls back to the root alone when even one level is too much', () => {
        const { doc } = build(JSON.stringify({ rows: Array.from({ length: 500 }, (_, i) => i) }));

        expect(depthThatFits(doc.lines, 1)).toBe(0);
    });

    /* The answer has to match what the layout would actually produce. */
    it('agrees with the layout it is choosing a depth for', () => {
        const { doc, folds } = build(
            JSON.stringify({ a: { b: { c: [1, 2, 3, 4, 5] } }, d: [6, 7], e: 8 })
        );
        const budget = 6;
        const depth = depthThatFits(doc.lines, budget);

        folds.collapseAll();
        for (let line = 0; line < doc.lines.lineCount; line++) {
            if (doc.lines.isFoldable(line) && doc.lines.depth(line) < depth) {
                folds.toggle(line);
            }
        }

        expect(layoutGraph(doc, folds).nodes.length).toBeLessThanOrEqual(budget);
    });
});

describe('edgePath', () => {
    const node = (x: number, y: number) => ({
        line: 0,
        depth: 0,
        x,
        y,
        collapsed: false,
        expandable: false
    });

    it('starts at the parent and ends at the child', () => {
        const path = edgePath(node(0, 0), node(220, 44));

        expect(path.startsWith(`M ${NODE_WIDTH} `)).toBe(true);
        expect(path).toContain('C');
        expect(path.trimEnd().endsWith('220 60')).toBe(true);
    });
});

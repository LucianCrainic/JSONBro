/**
 * Placing the document's nodes as a graph.
 *
 * The same line index the tree renders, arranged as boxes and links instead of
 * rows. Depth becomes a column and siblings stack down a column, with a parent
 * centred on the children it actually has -- which is what makes the shape
 * readable rather than a comb.
 *
 * Pure arithmetic over the index: no DOM, no measurement, nothing to mock.
 */
import { LineKind, type FoldState, type LineTable } from './line-index';
import type { PrettyDocument } from './pretty-sink';

/** Horizontal distance between one depth and the next. */
export const COLUMN_WIDTH = 220;

/** Vertical distance between two nodes in the same column. */
export const ROW_HEIGHT = 44;

export const NODE_WIDTH = 210;
export const NODE_HEIGHT = 32;

/**
 * How many nodes are drawn before the layout stops.
 *
 * A graph is a picture, and a picture of a hundred thousand boxes is not one.
 * Past this the layout stops descending and says so, rather than producing
 * something no browser can draw and no reader can use.
 */
export const DEFAULT_NODE_BUDGET = 2000;

export interface GraphNode {
    line: number;
    depth: number;
    x: number;
    y: number;
    /** True when this node has children that are currently hidden. */
    collapsed: boolean;
    /** True when it has children at all. */
    expandable: boolean;
}

export interface GraphEdge {
    from: number;
    to: number;
}

export interface GraphLayout {
    nodes: GraphNode[];
    edges: GraphEdge[];
    width: number;
    height: number;
    /** Set when the budget stopped the layout short of the whole document. */
    truncated: boolean;
}

export interface LayoutOptions {
    budget?: number;
}

/**
 * Lays out every node currently visible in `folds`.
 *
 * Traversal is a post-order walk with an explicit stack: a parent's position
 * depends on its children's, and a document can nest deeply enough to exhaust
 * the call stack.
 */
export function layoutGraph(
    doc: PrettyDocument,
    folds: FoldState,
    options: LayoutOptions = {}
): GraphLayout {
    const budget = options.budget ?? DEFAULT_NODE_BUDGET;
    const { lines } = doc;

    if (lines.lineCount === 0 || budget <= 0) {
        return { nodes: [], edges: [], width: 0, height: 0, truncated: false };
    }

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const slotOf = new Map<number, number>();
    let nextSlot = 0;
    let truncated = false;
    /** Boxes still allowed, the root having taken one. */
    let remaining = budget - 1;

    interface Frame {
        line: number;
        children: number[];
        visited: boolean;
    }

    const root: Frame = { line: 0, children: [], visited: false };
    const stack: Frame[] = [root];

    while (stack.length > 0) {
        const frame = stack[stack.length - 1];

        if (!frame.visited) {
            frame.visited = true;

            // Budget is spent as children are claimed, not as boxes are
            // finished: a node is placed on the way back up, long after its
            // children were queued, so counting placements would let a single
            // wide container blow straight past the limit.
            const available = childrenOf(lines, folds, frame.line);
            if (available.length > remaining) {
                truncated = true;
            }
            frame.children = available.slice(0, Math.max(0, remaining));
            remaining -= frame.children.length;

            for (const child of frame.children) {
                edges.push({ from: frame.line, to: child });
            }

            // Reversed, so the first child is dealt with first and slots are
            // handed out in document order down the column.
            for (let i = frame.children.length - 1; i >= 0; i--) {
                stack.push({ line: frame.children[i], children: [], visited: false });
            }
            continue;
        }

        stack.pop();

        const slot =
            frame.children.length === 0
                ? nextSlot++
                : midpoint(
                      slotOf.get(frame.children[0]) ?? 0,
                      slotOf.get(frame.children[frame.children.length - 1]) ?? 0
                  );
        slotOf.set(frame.line, slot);

        const depth = lines.depth(frame.line);
        nodes.push({
            line: frame.line,
            depth,
            x: depth * COLUMN_WIDTH,
            y: slot * ROW_HEIGHT,
            collapsed: folds.isCollapsed(frame.line),
            expandable: lines.isFoldable(frame.line)
        });
    }

    // Built bottom-up, so put them back in document order: the reader tabs
    // through them, and a stable order keeps that predictable.
    nodes.sort((a, b) => a.line - b.line);

    const maxDepth = nodes.reduce((deepest, node) => Math.max(deepest, node.depth), 0);
    return {
        nodes,
        edges,
        width: maxDepth * COLUMN_WIDTH + NODE_WIDTH,
        height: Math.max(1, nextSlot) * ROW_HEIGHT,
        truncated
    };
}

/**
 * The deepest level the graph can open to and still fit inside `budget`.
 *
 * A document opened to depth `d` shows exactly its non-closer lines of depth
 * `d` or less, so one pass counting lines by depth answers this -- rather than
 * laying the graph out once per candidate depth, which on a large document
 * means rescanning it several times over.
 */
export function depthThatFits(lines: LineTable, budget: number): number {
    const perDepth: number[] = [];
    for (let line = 0; line < lines.lineCount; line++) {
        if (lines.kind(line) === LineKind.Closer) {
            continue;
        }
        const depth = lines.depth(line);
        perDepth[depth] = (perDepth[depth] ?? 0) + 1;
    }

    let running = 0;
    for (let depth = 0; depth < perDepth.length; depth++) {
        running += perDepth[depth] ?? 0;
        if (running > budget) {
            return Math.max(0, depth - 1);
        }
    }
    return perDepth.length;
}

/**
 * The nodes one level inside a container, skipping whole subtrees.
 *
 * A closing bracket is a line of the document but not a node, and a collapsed
 * container has nothing to show, so neither contributes children.
 */
function childrenOf(lines: LineTable, folds: FoldState, line: number): number[] {
    const end = lines.foldEnd(line);
    if (end <= line || folds.isCollapsed(line)) {
        return [];
    }

    const children: number[] = [];
    for (let child = line + 1; child < end; ) {
        if (lines.kind(child) !== LineKind.Closer) {
            children.push(child);
        }
        const childEnd = lines.foldEnd(child);
        child = childEnd > child ? childEnd + 1 : child + 1;
    }
    return children;
}

function midpoint(first: number, last: number): number {
    return (first + last) / 2;
}

/** The curve joining a parent's right edge to a child's left edge. */
export function edgePath(from: GraphNode, to: GraphNode): string {
    const x1 = from.x + NODE_WIDTH;
    const y1 = from.y + NODE_HEIGHT / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_HEIGHT / 2;
    const bend = Math.max(20, (x2 - x1) / 2);

    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

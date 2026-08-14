/**
 * Reading one line of a formatted document as a tree node.
 *
 * The tree renders the same `PrettyDocument` the text view does -- there is no
 * second parse and no second model. What a node needs beyond the raw line is
 * already on the line index: what kind of thing sits there, how many children
 * it has, and where its property name is. This turns those into the pieces a
 * row is drawn from.
 */
import { LineKind } from './line-index';
import type { PrettyDocument } from './pretty-sink';

export type NodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export interface NodeView {
    line: number;
    depth: number;
    type: NodeType;
    /** The property name, decoded. Empty for array elements and the root. */
    key: string;
    /** True when the node is an element of an array rather than a property. */
    indexed: boolean;
    /** A scalar's text, or a summary like `3 items` for a container. */
    preview: string;
    /** Number of direct children; zero for a scalar. */
    childCount: number;
    /** True when the node has children on lines of their own. */
    expandable: boolean;
}

export function nodeAt(doc: PrettyDocument, line: number): NodeView {
    const { lines } = doc;
    const kind = lines.kind(line);
    const childCount = lines.childCount(line);
    const { start, length } = lines.keyRange(line);

    const container = kind === LineKind.Object || kind === LineKind.Array;
    const type: NodeType = container
        ? kind === LineKind.Array
            ? 'array'
            : 'object'
        : scalarType(valueTextOf(doc, line));

    return {
        line,
        depth: lines.depth(line),
        type,
        key: length === 0 ? '' : decode(doc.text.slice(start, start + length)),
        // The root has no key either, but it is line 0 and nothing else is.
        indexed: length === 0 && line > 0,
        preview: container ? summarise(type, childCount) : valueTextOf(doc, line),
        childCount,
        expandable: container && lines.isFoldable(line)
    };
}

/**
 * The value written on a line, without the property name or trailing comma.
 *
 * The line is pretty-printed output, so it is always indent, then an optional
 * quoted name and colon, then the value -- there is nothing to parse.
 */
function valueTextOf(doc: PrettyDocument, line: number): string {
    const { text, lines } = doc;
    const lineStart = lines.start(line);
    const raw = text.slice(lineStart, lines.end(line, text.length));

    const { start, length } = lines.keyRange(line);
    // `"name": ` -- the two characters after the name are the colon and space.
    const from = length === 0 ? 0 : start - lineStart + length + 2;

    return raw.slice(from).trimStart().replace(/,$/, '');
}

function summarise(type: NodeType, childCount: number): string {
    if (childCount === 0) {
        return type === 'array' ? 'empty' : 'no properties';
    }
    if (type === 'array') {
        return `${childCount} item${childCount === 1 ? '' : 's'}`;
    }
    return `${childCount} ${childCount === 1 ? 'property' : 'properties'}`;
}

function scalarType(text: string): NodeType {
    if (text.startsWith('"')) {
        return 'string';
    }
    if (text === 'true' || text === 'false') {
        return 'boolean';
    }
    if (text === 'null') {
        return 'null';
    }
    return 'number';
}

function decode(encoded: string): string {
    try {
        return JSON.parse(encoded) as string;
    } catch {
        return encoded;
    }
}

/**
 * The whole subtree rooted at a line, as formatted text.
 *
 * A container occupies every line through to its closer, so this is one slice
 * rather than a walk -- copying a subtree of any size costs the same.
 */
export function subtreeText(doc: PrettyDocument, line: number): string {
    const { text, lines } = doc;
    const end = lines.foldEnd(line);
    const last = end > line ? end : line;

    const from = lines.start(line);
    const raw = text.slice(from, lines.end(last, text.length));

    // The slice starts after the line's indent and may end on the comma that
    // separates this node from its sibling; neither belongs to the value.
    return dedent(raw.replace(/,$/, ''), indentWidth(doc, line));
}

/** How far a line is indented, so a copied subtree does not carry it. */
function indentWidth(doc: PrettyDocument, line: number): number {
    const { text, lines } = doc;
    const start = lines.start(line);
    const raw = text.slice(start, lines.end(line, text.length));
    return raw.length - raw.trimStart().length;
}

function dedent(text: string, width: number): string {
    if (width === 0) {
        return text;
    }
    const prefix = ' '.repeat(width);
    return text
        .split('\n')
        .map(line => (line.startsWith(prefix) ? line.slice(width) : line.trimStart()))
        .join('\n');
}

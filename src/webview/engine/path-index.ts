/**
 * Turning a JSON path back into a line of the formatted document.
 *
 * The diff engine describes every change by its path, and the change list has
 * carried that path on each row since it was written -- but nothing could act
 * on it, because the formatted document knew only where its lines started, not
 * what was on them. With the node columns on `LineTable` a path can be walked
 * down from the root, one container at a time.
 *
 * Nothing is precomputed. A lookup costs one pass over the direct children of
 * each container along the path, and subtrees are stepped over whole rather
 * than descended into, so finding a deep node in a large document does not
 * depend on how large the document is.
 */
import { LineKind } from './line-index';
import type { PrettyDocument } from './pretty-sink';

/** Not a line. Returned when a path does not lead anywhere in this document. */
export const NOT_FOUND = -1;

/**
 * The line holding the value at `path`, or `NOT_FOUND`.
 *
 * Segments are matched against property names in objects and against ordinal
 * position in arrays, decided by what the container on the line actually is
 * rather than by whether a segment looks numeric -- an object with the key
 * `"0"` is a real thing, and guessing from the segment gets it wrong.
 */
export function lineForPath(doc: PrettyDocument, path: readonly string[]): number {
    let line = 0;

    for (const segment of path) {
        line = childLine(doc, line, segment);
        if (line === NOT_FOUND) {
            return NOT_FOUND;
        }
    }

    return line;
}

/** The line of one named or indexed child of the container on `parent`. */
function childLine(doc: PrettyDocument, parent: number, segment: string): number {
    const { lines } = doc;
    const kind = lines.kind(parent);

    if (kind !== LineKind.Object && kind !== LineKind.Array) {
        return NOT_FOUND;
    }

    // A container that fits on one line has no children on lines of their own.
    const end = lines.foldEnd(parent);
    if (end <= parent) {
        return NOT_FOUND;
    }

    const wanted = kind === LineKind.Array ? Number(segment) : -1;
    if (kind === LineKind.Array && !Number.isInteger(wanted)) {
        return NOT_FOUND;
    }

    const encoded = kind === LineKind.Object ? JSON.stringify(segment) : '';
    let ordinal = 0;

    for (let line = parent + 1; line < end; line = nextSibling(doc, line)) {
        if (kind === LineKind.Array) {
            if (ordinal === wanted) {
                return line;
            }
        } else if (keyOn(doc, line) === encoded) {
            return line;
        }
        ordinal++;
    }

    return NOT_FOUND;
}

/**
 * The line after everything belonging to the node starting on `line`.
 *
 * A container occupies every line up to its closer, so stepping over it is one
 * lookup instead of a walk -- which is what keeps a path lookup proportional to
 * the width of the containers along it rather than to the size of the document.
 */
function nextSibling(doc: PrettyDocument, line: number): number {
    const end = doc.lines.foldEnd(line);
    return end > line ? end + 1 : line + 1;
}

/** The JSON spelling of the property name on a line, quotes included. */
function keyOn(doc: PrettyDocument, line: number): string {
    const { start, length } = doc.lines.keyRange(line);
    return length === 0 ? '' : doc.text.slice(start, start + length);
}

/**
 * The path of the node on `line`, as segments from the root.
 *
 * Walks upward by depth: the nearest earlier line one level shallower is the
 * parent, and an array's children are numbered by counting siblings.
 */
export function pathForLine(doc: PrettyDocument, line: number): string[] {
    const { lines } = doc;
    if (line <= 0 || line >= lines.lineCount) {
        return [];
    }

    const segments: string[] = [];
    let current = line;

    while (current > 0) {
        const parent = parentOf(doc, current);
        if (parent === NOT_FOUND) {
            break;
        }

        segments.push(
            lines.kind(parent) === LineKind.Array
                ? String(ordinalOf(doc, parent, current))
                : decodeKey(keyOn(doc, current))
        );
        current = parent;
    }

    return segments.reverse();
}

/** The container line one level out from `line`. */
function parentOf(doc: PrettyDocument, line: number): number {
    const target = doc.lines.depth(line) - 1;
    for (let candidate = line - 1; candidate >= 0; candidate--) {
        if (doc.lines.depth(candidate) === target) {
            return candidate;
        }
    }
    return NOT_FOUND;
}

/** How many siblings precede `child` inside the container on `parent`. */
function ordinalOf(doc: PrettyDocument, parent: number, child: number): number {
    let ordinal = 0;
    for (let line = parent + 1; line < child; line = nextSibling(doc, line)) {
        ordinal++;
    }
    return ordinal;
}

function decodeKey(encoded: string): string {
    if (encoded === '') {
        return '';
    }
    try {
        return JSON.parse(encoded) as string;
    } catch {
        return encoded;
    }
}

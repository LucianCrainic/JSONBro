/**
 * What the parser had to do to make sense of the input.
 *
 * The old parser either returned a value or threw, and when it did repair
 * something it said only that "errors were corrected automatically". These
 * records name each repair and where it happened, so the panel can show the
 * reader what changed rather than asking them to take it on faith.
 */

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticKind =
    // Cosmetic: the document meant one thing and spelled it another way.
    | 'single-quotes'
    | 'unquoted-key'
    | 'python-literal'
    | 'trailing-comma'
    | 'comment'
    | 'number-format'
    | 'duplicate-key'
    | 'escaped-quotes'
    // Structural: something was missing or in the wrong place.
    | 'missing-comma'
    | 'missing-colon'
    | 'missing-value'
    | 'unterminated-string'
    | 'unclosed-container'
    | 'mismatched-bracket'
    | 'unexpected-token'
    | 'trailing-content'
    | 'empty-document';

export interface Diagnostic {
    kind: DiagnosticKind;
    severity: DiagnosticSeverity;
    /** Phrased for a reader: what was wrong and what was done about it. */
    message: string;
    /** Byte offset into the source text. */
    offset: number;
    length: number;
    /** 1-based, for display. */
    line: number;
    column: number;
}

/**
 * Repairs that changed the shape of the document rather than its spelling.
 *
 * The distinction drives how loudly the panel reports: rewriting single quotes
 * is worth a note, inventing a closing brace is worth a warning.
 */
const STRUCTURAL_KINDS: ReadonlySet<DiagnosticKind> = new Set<DiagnosticKind>([
    'missing-comma',
    'missing-colon',
    'missing-value',
    'unterminated-string',
    'unclosed-container',
    'mismatched-bracket',
    'unexpected-token',
    'trailing-content',
    'empty-document'
]);

export function isStructural(kind: DiagnosticKind): boolean {
    return STRUCTURAL_KINDS.has(kind);
}

/** True when any repair changed the document's structure. */
export function hasStructuralRepair(diagnostics: readonly Diagnostic[]): boolean {
    return diagnostics.some(diagnostic => isStructural(diagnostic.kind));
}

/**
 * Tracks where lines begin so an offset can be reported as line and column.
 *
 * Built while scanning, since the scanner passes every character anyway and a
 * second pass over a large document just to count newlines would be waste.
 */
export class LineMap {
    private readonly starts: number[] = [0];

    /** Records that a line ends at `offset`, the next beginning after it. */
    public newlineAt(offset: number): void {
        this.starts.push(offset + 1);
    }

    public get lineCount(): number {
        return this.starts.length;
    }

    /** The offset at which 1-based `line` begins. */
    public startOf(line: number): number {
        return this.starts[Math.min(Math.max(line, 1), this.starts.length) - 1];
    }

    /** The 1-based line and column containing `offset`. */
    public positionAt(offset: number): { line: number; column: number } {
        let low = 0;
        let high = this.starts.length - 1;

        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (this.starts[mid] <= offset) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }

        return { line: low + 1, column: offset - this.starts[low] + 1 };
    }

    /** The line starts, for handing to an index that needs them wholesale. */
    public toArray(): readonly number[] {
        return this.starts;
    }
}

/**
 * The parsing entry point used by the views.
 *
 * The repair logic itself lives in `engine/` -- a scanner and a parser that
 * recovers in place. This is the surface the rest of the webview talks to.
 */
import { Diagnostic } from './engine/diagnostics';
import { parseJson } from './engine/recovering-parser';

export interface ParseStatus {
    parsed: any;
    /** True when a repair changed the document's shape, not just its spelling. */
    wasStructurallyFixed: boolean;
    /** Every repair the parser made, in the order they appear in the source. */
    diagnostics: Diagnostic[];
    /** The first structural problem, for callers that want a one-line summary. */
    originalError?: string;
}

export class JSONParser {
    /**
     * Parses JSON, repairing what it can.
     *
     * Always returns a value: input that cannot be made sense of yields the
     * closest reading the parser could recover, and the reasons are available
     * from `parseWithStatus`.
     */
    static parseFlexible(input: string): any {
        return parseJson(input).value;
    }

    /**
     * Parses JSON and reports what had to be repaired to get there.
     */
    static parseWithStatus(input: string): ParseStatus {
        const result = parseJson(input);
        const firstError = result.diagnostics.find(
            diagnostic => diagnostic.severity === 'error' || diagnostic.severity === 'warning'
        );

        return {
            parsed: result.value,
            wasStructurallyFixed: result.structurallyRepaired,
            diagnostics: result.diagnostics,
            originalError: firstError?.message
        };
    }

    /**
     * A readable summary of what was wrong with the input.
     *
     * Kept for callers that only want a single line; the diagnostics from
     * `parseWithStatus` say the same thing with positions attached.
     */
    static getParseErrorMessage(input: string, originalError?: Error): string {
        const { diagnostics } = this.parseWithStatus(input);
        const problems = diagnostics.filter(diagnostic => diagnostic.severity !== 'info');

        if (problems.length === 0) {
            return originalError ? `Invalid JSON: ${originalError.message}` : 'Invalid JSON';
        }

        const lines = problems
            .slice(0, 8)
            .map(diagnostic => `• Line ${diagnostic.line}: ${diagnostic.message}`);

        if (problems.length > lines.length) {
            lines.push(`• ...and ${problems.length - lines.length} more`);
        }

        return `Repaired ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${lines.join('\n')}`;
    }
}

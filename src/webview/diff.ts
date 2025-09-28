/**
 * Diff operation types
 */
export type DiffType = 'added' | 'removed' | 'modified' | 'unchanged';

export interface DiffResult {
    type: DiffType;
    path: string[];
    oldValue?: any;
    newValue?: any;
    children?: DiffResult[];
}

/**
 * JSON diff utilities
 */
export class JSONDiff {
    /**
     * Diff operation types
     */
    static readonly DIFF_TYPES = {
        ADDED: 'added' as const,
        REMOVED: 'removed' as const,
        MODIFIED: 'modified' as const,
        UNCHANGED: 'unchanged' as const
    };

    /**
     * Compares two JSON objects and returns diff results
     */
    static compareJson(oldValue: any, newValue: any, path: string[] = []): DiffResult[] {
        const diffs: DiffResult[] = [];

        // Handle null/undefined cases
        if (oldValue === null || oldValue === undefined) {
            if (newValue === null || newValue === undefined) {
                return diffs; // Both null/undefined, no diff
            }
            diffs.push({
                type: JSONDiff.DIFF_TYPES.ADDED,
                path: [...path],
                newValue: newValue
            });
            return diffs;
        }

        if (newValue === null || newValue === undefined) {
            diffs.push({
                type: JSONDiff.DIFF_TYPES.REMOVED,
                path: [...path],
                oldValue: oldValue
            });
            return diffs;
        }

        // Handle primitive values
        if (typeof oldValue !== 'object' || typeof newValue !== 'object') {
            if (oldValue !== newValue) {
                diffs.push({
                    type: JSONDiff.DIFF_TYPES.MODIFIED,
                    path: [...path],
                    oldValue: oldValue,
                    newValue: newValue
                });
            }
            return diffs;
        }

        // Handle arrays
        if (Array.isArray(oldValue) && Array.isArray(newValue)) {
            return this.compareArrays(oldValue, newValue, path);
        }

        if (Array.isArray(oldValue) || Array.isArray(newValue)) {
            diffs.push({
                type: JSONDiff.DIFF_TYPES.MODIFIED,
                path: [...path],
                oldValue: oldValue,
                newValue: newValue
            });
            return diffs;
        }

        // Handle objects
        return this.compareObjects(oldValue, newValue, path);
    }

    /**
     * Compares two arrays
     */
    private static compareArrays(oldArray: any[], newArray: any[], path: string[]): DiffResult[] {
        const diffs: DiffResult[] = [];
        const maxLength = Math.max(oldArray.length, newArray.length);

        for (let i = 0; i < maxLength; i++) {
            const currentPath = [...path, i.toString()];
            
            if (i >= oldArray.length) {
                // Item added
                diffs.push({
                    type: JSONDiff.DIFF_TYPES.ADDED,
                    path: currentPath,
                    newValue: newArray[i]
                });
            } else if (i >= newArray.length) {
                // Item removed
                diffs.push({
                    type: JSONDiff.DIFF_TYPES.REMOVED,
                    path: currentPath,
                    oldValue: oldArray[i]
                });
            } else {
                // Compare items
                const itemDiffs = this.compareJson(oldArray[i], newArray[i], currentPath);
                diffs.push(...itemDiffs);
            }
        }

        return diffs;
    }

    /**
     * Compares two objects
     */
    private static compareObjects(oldObj: any, newObj: any, path: string[]): DiffResult[] {
        const diffs: DiffResult[] = [];
        const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

        for (const key of allKeys) {
            const currentPath = [...path, key];
            
            if (!(key in oldObj)) {
                // Property added
                diffs.push({
                    type: JSONDiff.DIFF_TYPES.ADDED,
                    path: currentPath,
                    newValue: newObj[key]
                });
            } else if (!(key in newObj)) {
                // Property removed
                diffs.push({
                    type: JSONDiff.DIFF_TYPES.REMOVED,
                    path: currentPath,
                    oldValue: oldObj[key]
                });
            } else {
                // Compare property values
                const propertyDiffs = this.compareJson(oldObj[key], newObj[key], currentPath);
                diffs.push(...propertyDiffs);
            }
        }

        return diffs;
    }

    /**
     * Renders a diff result as HTML
     */
    static renderJsonDiff(oldValue: any, newValue: any): string {
        try {
            const diffs = this.compareJson(oldValue, newValue);
            
            if (diffs.length === 0) {
                return '<div class="diff-result no-changes">✅ No differences found - JSON objects are identical</div>';
            }

            return `<div class="diff-result"><div class="diff-items">${diffs.map(diff => this.renderDiffItem(diff)).join('')}</div></div>`;
        } catch (error) {
            return `<div class="diff-error">Error generating diff: ${error instanceof Error ? error.message : 'Unknown error'}</div>`;
        }
    }

    /**
     * Renders a single diff item
     */
    private static renderDiffItem(diff: DiffResult): string {
        const pathStr = diff.path.length > 0 ? diff.path.join('.') : 'root';
        const diffClass = `diff-item diff-${diff.type}`;

        switch (diff.type) {
            case this.DIFF_TYPES.ADDED:
                const newVal = this.formatValue(diff.newValue);
                return `
                    <div class="${diffClass}">
                        <span class="diff-path">+ ${pathStr}</span> = <span class="diff-value new-value">${newVal}</span>
                    </div>
                `;

            case this.DIFF_TYPES.REMOVED:
                const oldVal = this.formatValue(diff.oldValue);
                return `
                    <div class="${diffClass}">
                        <span class="diff-path">- ${pathStr}</span> = <span class="diff-value old-value">${oldVal}</span>
                    </div>
                `;

            case this.DIFF_TYPES.MODIFIED:
                const oldModVal = this.formatValue(diff.oldValue);
                const newModVal = this.formatValue(diff.newValue);
                return `
                    <div class="${diffClass}">
                        <div class="diff-path">~ ${pathStr}</div>
                        <div class="diff-inline-change">
                            <span class="diff-value old-value">${oldModVal}</span> → <span class="diff-value new-value">${newModVal}</span>
                        </div>
                    </div>
                `;

            default:
                return '';
        }
    }

    /**
     * Formats a value for display in diff
     */
    private static formatValue(value: any, isExpanded = false): string {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (typeof value === 'string') {
            const escaped = this.escapeHtml(value);
            // Truncate long strings for compact display
            if (!isExpanded && escaped.length > 60) {
                const fullValue = this.escapeHtml(JSON.stringify(value));
                return `<span class="expandable-value" data-full="${fullValue}" title="Click to expand">"${escaped.substring(0, 57)}..."</span>`;
            }
            return `"${escaped}"`;
        }
        if (typeof value === 'object') {
            try {
                const jsonStr = JSON.stringify(value);
                // For compact display, use single line for small objects
                if (jsonStr.length <= 80 || isExpanded) {
                    return this.escapeHtml(jsonStr);
                }
                // For larger objects, show a summary
                const fullValue = this.escapeHtml(JSON.stringify(value, null, 2));
                if (Array.isArray(value)) {
                    return `<span class="expandable-value" data-full="${fullValue}" title="Click to expand">[Array with ${value.length} items]</span>`;
                } else {
                    const keys = Object.keys(value);
                    return `<span class="expandable-value" data-full="${fullValue}" title="Click to expand">{Object with ${keys.length} properties}</span>`;
                }
            } catch {
                return '[Object]';
            }
        }
        return String(value);
    }

    /**
     * Escapes HTML characters
     */
    private static escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

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
     * Wildcard character that matches any value
     */
    static readonly WILDCARD = '*';

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
     * Checks if a value is a wildcard
     */
    private static isWildcard(value: any): boolean {
        return value === this.WILDCARD;
    }

    /**
     * Compares two JSON objects and returns diff results
     * @param oldValue The original/expected JSON value
     * @param newValue The new/actual JSON value
     * @param path The current path in the JSON structure
     * @param strictMode If true, only compare keys that exist in oldValue (ignore added keys in newValue)
     */
    static compareJson(oldValue: any, newValue: any, path: string[] = [], strictMode: boolean = false): DiffResult[] {
        const diffs: DiffResult[] = [];

        // Check for wildcard in oldValue (template/expected JSON)
        if (this.isWildcard(oldValue)) {
            // Wildcard matches any value, no diff
            return diffs;
        }

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
            return this.compareArrays(oldValue, newValue, path, strictMode);
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
        return this.compareObjects(oldValue, newValue, path, strictMode);
    }

    /**
     * Compares two arrays
     */
    private static compareArrays(oldArray: any[], newArray: any[], path: string[], strictMode: boolean = false): DiffResult[] {
        const diffs: DiffResult[] = [];
        const maxLength = strictMode ? oldArray.length : Math.max(oldArray.length, newArray.length);

        for (let i = 0; i < maxLength; i++) {
            const currentPath = [...path, i.toString()];
            
            if (i >= oldArray.length) {
                // Item added (only report if not in strict mode)
                if (!strictMode) {
                    diffs.push({
                        type: JSONDiff.DIFF_TYPES.ADDED,
                        path: currentPath,
                        newValue: newArray[i]
                    });
                }
            } else if (i >= newArray.length) {
                // Item removed
                diffs.push({
                    type: JSONDiff.DIFF_TYPES.REMOVED,
                    path: currentPath,
                    oldValue: oldArray[i]
                });
            } else {
                // Compare items
                const itemDiffs = this.compareJson(oldArray[i], newArray[i], currentPath, strictMode);
                diffs.push(...itemDiffs);
            }
        }

        return diffs;
    }

    /**
     * Compares two objects
     */
    private static compareObjects(oldObj: any, newObj: any, path: string[], strictMode: boolean = false): DiffResult[] {
        const diffs: DiffResult[] = [];
        
        // Check if oldObj has wildcard key
        const hasWildcard = this.WILDCARD in oldObj;
        
        if (hasWildcard) {
            // When wildcard is present in expected (oldObj), 
            // match it with any single key in actual (newObj)
            const oldKeys = Object.keys(oldObj);
            const newKeys = Object.keys(newObj);
            
            // Get non-wildcard keys from oldObj
            const oldNonWildcardKeys = oldKeys.filter(k => k !== this.WILDCARD);
            
            // First, handle all non-wildcard keys from oldObj
            for (const key of oldNonWildcardKeys) {
                const currentPath = [...path, key];
                
                if (!(key in newObj)) {
                    // Property removed
                    diffs.push({
                        type: JSONDiff.DIFF_TYPES.REMOVED,
                        path: currentPath,
                        oldValue: oldObj[key]
                    });
                } else {
                    // Compare property values
                    const propertyDiffs = this.compareJson(oldObj[key], newObj[key], currentPath, strictMode);
                    diffs.push(...propertyDiffs);
                }
            }
            
            // Now handle the wildcard key
            // The wildcard should match keys in newObj that aren't in oldNonWildcardKeys
            const wildcardValue = oldObj[this.WILDCARD];
            const newKeysNotInOld = newKeys.filter(k => !oldNonWildcardKeys.includes(k));
            
            for (const newKey of newKeysNotInOld) {
                const currentPath = [...path, newKey];
                // Compare the wildcard template value with the actual value
                const propertyDiffs = this.compareJson(wildcardValue, newObj[newKey], currentPath, strictMode);
                diffs.push(...propertyDiffs);
            }
            
            // Check if there are any keys in oldObj that don't exist in newObj
            // (excluding wildcard and keys already processed)
            // This is already handled in the first loop above
            
        } else {
            // Normal object comparison
            const allKeys = strictMode 
                ? new Set(Object.keys(oldObj))  // In strict mode, only check keys from oldObj
                : new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

            for (const key of allKeys) {
                const currentPath = [...path, key];
                
                if (!(key in oldObj)) {
                    // Property added (only report if not in strict mode)
                    if (!strictMode) {
                        diffs.push({
                            type: JSONDiff.DIFF_TYPES.ADDED,
                            path: currentPath,
                            newValue: newObj[key]
                        });
                    }
                } else if (!(key in newObj)) {
                    // Property removed
                    diffs.push({
                        type: JSONDiff.DIFF_TYPES.REMOVED,
                        path: currentPath,
                        oldValue: oldObj[key]
                    });
                } else {
                    // Compare property values
                    const propertyDiffs = this.compareJson(oldObj[key], newObj[key], currentPath, strictMode);
                    diffs.push(...propertyDiffs);
                }
            }
        }

        return diffs;
    }

    /**
     * Renders a diff result as HTML
     */
    static renderJsonDiff(oldValue: any, newValue: any, strictMode: boolean = false): string {
        try {
            const diffs = this.compareJson(oldValue, newValue, [], strictMode);
            
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

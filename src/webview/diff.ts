/**
 * Diff operation types
 */
export type DiffType = 'added' | 'removed' | 'modified' | 'unchanged';

/**
 * Diff application state
 */
export type DiffApplicationState = 'pending' | 'applied' | 'rejected';

export interface DiffResult {
    type: DiffType;
    path: string[];
    oldValue?: any;
    newValue?: any;
    children?: DiffResult[];
}

/**
 * Extended diff result with application state
 */
export interface ApplicableDiffResult extends DiffResult {
    id: string;
    state: DiffApplicationState;
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
                return `<div class="diff-result no-changes">
                    <span class="codicon codicon-check-all" aria-hidden="true"></span>
                    <span>No differences — the documents are identical.</span>
                </div>`;
            }

            return `<div class="diff-result"><div class="diff-items">${diffs.map((diff, index) => this.renderDiffItem(diff, index)).join('')}</div></div>`;
        } catch (error) {
            return `<div class="diff-error">Error generating diff: ${error instanceof Error ? error.message : 'Unknown error'}</div>`;
        }
    }

    /**
     * The apply/reject/undo controls attached to a change.
     */
    private static renderDiffActions(applyTitle: string): string {
        const button = (cls: string, icon: string, title: string, hidden = false) =>
            `<button class="diff-action-btn ${cls}" type="button" title="${title}" aria-label="${title}"${
                hidden ? ' hidden' : ''
            }><span class="codicon codicon-${icon}" aria-hidden="true"></span></button>`;

        return `<div class="diff-item-actions">
                                ${button('apply-diff-btn', 'check', applyTitle)}
                                ${button('reject-diff-btn', 'close', 'Reject this change')}
                                ${button('undo-diff-btn', 'discard', 'Undo', true)}
                            </div>`;
    }

    /**
     * Renders a single change.
     *
     * The data-* attributes are the contract the view reads back when the user
     * applies or reverts a change, so they belong on the outer element.
     */
    private static renderDiffItem(diff: DiffResult, index: number): string {
        const attrs = [
            `data-diff-id="diff-${index}"`,
            `data-diff-type="${diff.type}"`,
            `data-state="pending"`,
            `data-diff-path="${this.escapeHtml(JSON.stringify(diff.path))}"`
        ];
        if (diff.newValue !== undefined) {
            attrs.push(`data-diff-value="${this.escapeHtml(JSON.stringify(diff.newValue))}"`);
        }
        if (diff.oldValue !== undefined) {
            attrs.push(`data-diff-old-value="${this.escapeHtml(JSON.stringify(diff.oldValue))}"`);
        }

        const glyphs: Record<string, string> = {
            [this.DIFF_TYPES.ADDED]: 'diff-added',
            [this.DIFF_TYPES.REMOVED]: 'diff-removed',
            [this.DIFF_TYPES.MODIFIED]: 'diff-modified'
        };
        const glyph = glyphs[diff.type] ?? 'circle-filled';

        const applyTitle =
            diff.type === this.DIFF_TYPES.REMOVED
                ? 'Apply this change (remove the property)'
                : 'Apply this change to the original';

        return `<div class="diff-item diff-${diff.type}" ${attrs.join(' ')}>
                    <span class="codicon codicon-${glyph} diff-item__glyph" aria-hidden="true"></span>
                    <div class="diff-item-header">
                        ${this.renderPath(diff.path)}
                        ${this.renderChange(diff)}
                    </div>
                    ${this.renderDiffActions(applyTitle)}
                </div>`;
    }

    /**
     * The path as breadcrumb segments with the leaf emphasised.
     *
     * A dotted path became unreadable once nesting got deep, and array indices
     * were indistinguishable from object keys.
     */
    private static renderPath(path: string[]): string {
        if (path.length === 0) {
            return '<span class="diff-path"><span class="diff-path__leaf">root</span></span>';
        }

        const separator = '<span class="diff-path__sep" aria-hidden="true">›</span>';
        const parts = path.map((segment, i) => {
            const isIndex = /^\d+$/.test(segment);
            const classes = [
                i === path.length - 1 ? 'diff-path__leaf' : 'diff-path__segment',
                isIndex ? 'diff-path__index' : ''
            ]
                .filter(Boolean)
                .join(' ');
            const text = isIndex ? `[${segment}]` : this.escapeHtml(segment);
            return `<span class="${classes}">${text}</span>`;
        });

        return `<span class="diff-path">${parts.join(separator)}</span>`;
    }

    /** The old and/or new value carried by a change. */
    private static renderChange(diff: DiffResult): string {
        const oldValue = `<span class="diff-value old-value">${this.formatValue(diff.oldValue)}</span>`;
        const newValue = `<span class="diff-value new-value">${this.formatValue(diff.newValue)}</span>`;

        switch (diff.type) {
            case this.DIFF_TYPES.ADDED:
                return `<span class="diff-inline-change">${newValue}</span>`;
            case this.DIFF_TYPES.REMOVED:
                return `<span class="diff-inline-change">${oldValue}</span>`;
            default:
                return `<span class="diff-inline-change">${oldValue}<span class="codicon codicon-arrow-right diff-arrow" aria-hidden="true"></span>${newValue}</span>`;
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

    /**
     * Applies a single diff to a JSON object
     * @param json The JSON object to modify
     * @param diff The diff to apply
     * @returns The modified JSON object
     */
    static applyDiff(json: any, diff: DiffResult): any {
        // Create a deep copy to avoid mutating the original
        const result = JSON.parse(JSON.stringify(json));
        
        if (diff.path.length === 0) {
            // Root level change
            return diff.newValue !== undefined ? diff.newValue : undefined;
        }

        this.applyDiffAtPath(result, diff.path, diff);
        return result;
    }

    /**
     * Applies multiple diffs to a JSON object
     * @param json The JSON object to modify
     * @param diffs The diffs to apply
     * @returns The modified JSON object
     */
    static applyDiffs(json: any, diffs: DiffResult[]): any {
        let result = JSON.parse(JSON.stringify(json));
        
        // Sort diffs to apply removals last and additions/modifications first
        // This prevents issues with array index shifts
        const sortedDiffs = [...diffs].sort((a, b) => {
            if (a.type === 'removed' && b.type !== 'removed') return 1;
            if (a.type !== 'removed' && b.type === 'removed') return -1;
            return 0;
        });

        for (const diff of sortedDiffs) {
            result = this.applyDiff(result, diff);
        }

        return result;
    }

    /**
     * Applies a diff at a specific path in the JSON object
     */
    private static applyDiffAtPath(obj: any, path: string[], diff: DiffResult): void {
        if (path.length === 0) return;

        // Navigate to the parent object
        let current = obj;
        for (let i = 0; i < path.length - 1; i++) {
            const key = path[i];
            
            // Create intermediate objects/arrays if they don't exist
            if (current[key] === undefined || current[key] === null) {
                // Determine if next key is array index
                const nextKey = path[i + 1];
                const isArrayIndex = /^\d+$/.test(nextKey);
                current[key] = isArrayIndex ? [] : {};
            }
            
            current = current[key];
        }

        const lastKey = path[path.length - 1];

        // Apply the change based on diff type
        switch (diff.type) {
            case 'added':
            case 'modified':
                if (diff.newValue !== undefined) {
                    current[lastKey] = diff.newValue;
                }
                break;
            
            case 'removed':
                if (Array.isArray(current)) {
                    // For arrays, use splice to maintain indices
                    const index = parseInt(lastKey, 10);
                    if (!isNaN(index)) {
                        current.splice(index, 1);
                    }
                } else {
                    // For objects, delete the property
                    delete current[lastKey];
                }
                break;
        }
    }

    /**
     * Reverts a diff from a JSON object (opposite of applyDiff)
     * @param json The JSON object to modify
     * @param diff The diff to revert
     * @returns The modified JSON object
     */
    static revertDiff(json: any, diff: DiffResult): any {
        const result = JSON.parse(JSON.stringify(json));
        
        if (diff.path.length === 0) {
            return diff.oldValue !== undefined ? diff.oldValue : undefined;
        }

        this.revertDiffAtPath(result, diff.path, diff);
        return result;
    }

    /**
     * Reverts a diff at a specific path in the JSON object
     */
    private static revertDiffAtPath(obj: any, path: string[], diff: DiffResult): void {
        if (path.length === 0) return;

        let current = obj;
        for (let i = 0; i < path.length - 1; i++) {
            const key = path[i];
            if (current[key] === undefined || current[key] === null) {
                const nextKey = path[i + 1];
                const isArrayIndex = /^\d+$/.test(nextKey);
                current[key] = isArrayIndex ? [] : {};
            }
            current = current[key];
        }

        const lastKey = path[path.length - 1];

        switch (diff.type) {
            case 'added':
                // Revert added: remove the property
                if (Array.isArray(current)) {
                    const index = parseInt(lastKey, 10);
                    if (!isNaN(index)) {
                        current.splice(index, 1);
                    }
                } else {
                    delete current[lastKey];
                }
                break;
            
            case 'removed':
            case 'modified':
                // Revert removed/modified: restore old value
                if (diff.oldValue !== undefined) {
                    current[lastKey] = diff.oldValue;
                }
                break;
        }
    }
}

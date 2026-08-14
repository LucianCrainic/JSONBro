import { alignArrays, DEFAULT_ALIGN_BUDGET } from './array-align';

/**
 * Diff operation types
 */
export type DiffType = 'added' | 'removed' | 'modified' | 'unchanged';

/**
 * Diff application state
 */
export type DiffApplicationState = 'pending' | 'applied' | 'rejected';

/**
 * Whether a path segment indexes an array or names an object property.
 *
 * A path is just strings, so `"0"` is ambiguous: it is an array index in
 * `[{...}]` and a property name in `{"0": ...}`. Recording which one it was
 * stops the apply step from turning an object into an array.
 */
export type PathSegmentKind = 'key' | 'index';

export interface DiffResult {
    type: DiffType;
    path: string[];
    /** Parallel to `path`. Absent on hand-built diffs, which fall back to a guess. */
    kinds?: PathSegmentKind[];
    oldValue?: any;
    newValue?: any;
    /**
     * For an element added to an array: the position in the *old* array it
     * belongs before. `path` carries the position in the new array, which is
     * what the reader wants to see but not what insertion needs.
     */
    arrayAnchor?: number;
    children?: DiffResult[];
}

export interface CompareOptions {
    strictMode?: boolean;
    /** Ceiling on the quadratic array alignment pass. */
    alignBudget?: number;
}

/**
 * A path built by sharing its prefix with its parent.
 *
 * Carrying paths as arrays meant copying the whole thing at every level, which
 * made a traversal cost O(nodes x depth) -- 50,000 levels of nesting took
 * seconds. Descending now costs one small object, and the array is built only
 * for the handful of nodes that turn out to differ.
 */
interface PathNode {
    readonly parent: PathNode | null;
    readonly segment: string;
    readonly kind: PathSegmentKind;
    readonly depth: number;
}

function descend(parent: PathNode | null, segment: string, kind: PathSegmentKind): PathNode {
    return { parent, segment, kind, depth: (parent?.depth ?? 0) + 1 };
}

function materialize(node: PathNode | null): { path: string[]; kinds: PathSegmentKind[] } {
    const depth = node?.depth ?? 0;
    const path = new Array<string>(depth);
    const kinds = new Array<PathSegmentKind>(depth);

    let current = node;
    for (let i = depth - 1; i >= 0 && current !== null; i--) {
        path[i] = current.segment;
        kinds[i] = current.kind;
        current = current.parent;
    }

    return { path, kinds };
}

/**
 * One item of pending work while comparing.
 *
 * `emit` frames let a finished result queue behind comparisons that have not
 * expanded yet, which is what keeps the output in document order even though
 * the traversal runs off a stack.
 */
type CompareFrame =
    | {
          kind: 'compare';
          oldValue: any;
          newValue: any;
          node: PathNode | null;
      }
    | { kind: 'emit'; diff: DiffResult };

/** Builds a result frame, expanding the shared path chain into arrays. */
function emit(node: PathNode | null, diff: Omit<DiffResult, 'path' | 'kinds'>): CompareFrame {
    const { path, kinds } = materialize(node);
    return { kind: 'emit', diff: { ...diff, path, kinds } };
}

/** True for objects and arrays; notably false for `null`. */
function isContainer(value: any): boolean {
    return typeof value === 'object' && value !== null;
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
     * Diff operation types
     */
    static readonly DIFF_TYPES = {
        ADDED: 'added' as const,
        REMOVED: 'removed' as const,
        MODIFIED: 'modified' as const,
        UNCHANGED: 'unchanged' as const
    };

    /**
     * Compares two JSON values and returns the differences between them.
     *
     * Walks an explicit stack rather than recursing, so a deeply nested
     * document cannot overflow the call stack.
     *
     * @param oldValue The original/expected JSON value
     * @param newValue The new/actual JSON value
     * @param path The current path in the JSON structure
     * @param strictMode If true, only compare keys that exist in oldValue (ignore added keys in newValue)
     */
    static compareJson(
        oldValue: any,
        newValue: any,
        path: string[] = [],
        strictMode: boolean = false,
        options: CompareOptions = {}
    ): DiffResult[] {
        const alignBudget = options.alignBudget ?? DEFAULT_ALIGN_BUDGET;
        const diffs: DiffResult[] = [];

        let root: PathNode | null = null;
        for (const segment of path) {
            root = descend(root, segment, 'key');
        }

        const stack: CompareFrame[] = [{ kind: 'compare', oldValue, newValue, node: root }];

        while (stack.length > 0) {
            const frame = stack.pop()!;

            if (frame.kind === 'emit') {
                diffs.push(frame.diff);
                continue;
            }

            const produced = this.expand(frame, strictMode, alignBudget);
            // Pushed in reverse so popping replays them in document order.
            for (let i = produced.length - 1; i >= 0; i--) {
                stack.push(produced[i]);
            }
        }

        return diffs;
    }

    /** Expands one comparison into the frames it implies, in document order. */
    private static expand(
        frame: Extract<CompareFrame, { kind: 'compare' }>,
        strictMode: boolean,
        alignBudget: number
    ): CompareFrame[] {
        const { oldValue, newValue, node } = frame;

        if (oldValue === undefined && newValue === undefined) {
            return [];
        }
        if (oldValue === undefined) {
            return [emit(node, { type: this.DIFF_TYPES.ADDED, newValue })];
        }
        if (newValue === undefined) {
            return [emit(node, { type: this.DIFF_TYPES.REMOVED, oldValue })];
        }

        const oldIsContainer = isContainer(oldValue);
        const newIsContainer = isContainer(newValue);

        // `null` is a value, not an absence. Treating it as one meant a change
        // from null to a number reported as "added", and a change to null
        // reported as "removed" -- so applying it deleted the key outright.
        if (!oldIsContainer && !newIsContainer) {
            return oldValue === newValue
                ? []
                : [emit(node, { type: this.DIFF_TYPES.MODIFIED, oldValue, newValue })];
        }

        if (oldIsContainer !== newIsContainer || Array.isArray(oldValue) !== Array.isArray(newValue)) {
            return [emit(node, { type: this.DIFF_TYPES.MODIFIED, oldValue, newValue })];
        }

        return Array.isArray(oldValue)
            ? this.expandArray(oldValue, newValue, node, strictMode, alignBudget)
            : this.expandObject(oldValue, newValue, node, strictMode);
    }

    private static expandObject(
        oldObj: any,
        newObj: any,
        node: PathNode | null,
        strictMode: boolean
    ): CompareFrame[] {
        const allKeys = strictMode
            ? new Set(Object.keys(oldObj))  // In strict mode, only check keys from oldObj
            : new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

        const frames: CompareFrame[] = [];

        for (const key of allKeys) {
            const child = descend(node, key, 'key');

            if (!(key in oldObj)) {
                if (!strictMode) {
                    frames.push(emit(child, { type: this.DIFF_TYPES.ADDED, newValue: newObj[key] }));
                }
            } else if (!(key in newObj)) {
                frames.push(emit(child, { type: this.DIFF_TYPES.REMOVED, oldValue: oldObj[key] }));
            } else {
                frames.push({
                    kind: 'compare',
                    oldValue: oldObj[key],
                    newValue: newObj[key],
                    node: child
                });
            }
        }

        return frames;
    }

    /**
     * Expands an array comparison over the aligned edit script.
     *
     * Every path uses *old*-array coordinates, so several changes to one array
     * can be applied in any order without their indices shifting under each
     * other. The exception is an addition, whose path shows where the element
     * lands in the new array because that is the useful thing to read; the
     * insertion point travels separately in `arrayAnchor`.
     */
    private static expandArray(
        oldArray: any[],
        newArray: any[],
        node: PathNode | null,
        strictMode: boolean,
        alignBudget: number
    ): CompareFrame[] {
        const steps = alignArrays(oldArray, newArray, { budget: alignBudget });
        const frames: CompareFrame[] = [];

        for (const step of steps) {
            if (step.kind === 'pair') {
                frames.push({
                    kind: 'compare',
                    oldValue: oldArray[step.oldIndex],
                    newValue: newArray[step.newIndex],
                    node: descend(node, String(step.oldIndex), 'index')
                });
            } else if (step.kind === 'remove') {
                frames.push(
                    emit(descend(node, String(step.oldIndex), 'index'), {
                        type: this.DIFF_TYPES.REMOVED,
                        oldValue: oldArray[step.oldIndex]
                    })
                );
            } else if (!strictMode) {
                frames.push(
                    emit(descend(node, String(step.newIndex), 'index'), {
                        type: this.DIFF_TYPES.ADDED,
                        newValue: newArray[step.newIndex],
                        arrayAnchor: step.anchor
                    })
                );
            }
        }

        return frames;
    }

    /**
     * Compares two documents and renders the result as HTML.
     *
     * Callers that already hold the comparison should use `renderDiffs`
     * instead; this overload exists for the ones that do not.
     */
    static renderJsonDiff(oldValue: any, newValue: any, strictMode: boolean = false): string {
        return this.renderDiffs(this.compareJson(oldValue, newValue, [], strictMode));
    }

    /**
     * Renders an already-computed diff as HTML.
     */
    static renderDiffs(diffs: DiffResult[]): string {
        try {
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
            `<button class="diff-action-btn ${cls}" type="button" data-tip="${title}" aria-label="${title}"${
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
        // Carried through the DOM because the view reads changes back off it
        // when applying them, and both are needed to target the right slot.
        if (diff.kinds) {
            attrs.push(`data-diff-kinds="${this.escapeHtml(JSON.stringify(diff.kinds))}"`);
        }
        if (diff.arrayAnchor !== undefined) {
            attrs.push(`data-diff-anchor="${diff.arrayAnchor}"`);
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
                return `<span class="expandable-value" data-full="${fullValue}" data-tip="Click to expand">"${escaped.substring(0, 57)}..."</span>`;
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
                    return `<span class="expandable-value" data-full="${fullValue}" data-tip="Click to expand">[Array with ${value.length} items]</span>`;
                } else {
                    const keys = Object.keys(value);
                    return `<span class="expandable-value" data-full="${fullValue}" data-tip="Click to expand">{Object with ${keys.length} properties}</span>`;
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
        return this.applyDiffs(json, [diff]);
    }

    /**
     * Applies diffs to the document they were computed against.
     *
     * Every diff is interpreted against `json`, never against the result of
     * its predecessors, so the outcome does not depend on the order they are
     * given in. That matters most for arrays: the previous implementation
     * spliced them one at a time, and each splice shifted the indices the
     * remaining diffs still referred to.
     *
     * @param json The JSON object to modify
     * @param diffs The diffs to apply
     * @returns The modified JSON object
     */
    static applyDiffs(json: any, diffs: DiffResult[]): any {
        const root = diffs.find(diff => diff.path.length === 0);
        if (root) {
            return root.type === this.DIFF_TYPES.REMOVED ? undefined : root.newValue;
        }

        // One clone for the whole batch. Cloning per diff made applying a
        // large change set quadratic in the size of the document.
        const result = JSON.parse(JSON.stringify(json));

        const structural: DiffResult[] = [];

        // Value updates first, in old coordinates, so that a change nested
        // inside an array element lands before the array is restructured.
        for (const diff of diffs) {
            if (this.isArrayStructural(result, diff)) {
                structural.push(diff);
            } else {
                this.applyValueChange(result, diff);
            }
        }

        // Deepest arrays first: rebuilding an inner array must not be undone
        // by its container being rebuilt around it afterwards.
        const groups = new Map<string, { parent: string[]; diffs: DiffResult[] }>();
        for (const diff of structural) {
            const parent = diff.path.slice(0, -1);
            const groupKey = JSON.stringify(parent);
            const group = groups.get(groupKey) ?? { parent, diffs: [] };
            group.diffs.push(diff);
            groups.set(groupKey, group);
        }

        const ordered = [...groups.values()].sort((a, b) => b.parent.length - a.parent.length);
        for (const group of ordered) {
            const array = this.resolve(result, group.parent);
            if (Array.isArray(array)) {
                this.rebuildArray(array, group.diffs);
            }
        }

        return result;
    }

    /** Walks to the value at `path`, or undefined if the route does not exist. */
    private static resolve(root: any, path: string[]): any {
        let current = root;
        for (const segment of path) {
            if (current === null || typeof current !== 'object') {
                return undefined;
            }
            current = current[segment];
        }
        return current;
    }

    /** True when the diff inserts into or deletes from an array. */
    private static isArrayStructural(root: any, diff: DiffResult): boolean {
        if (diff.type !== this.DIFF_TYPES.ADDED && diff.type !== this.DIFF_TYPES.REMOVED) {
            return false;
        }
        if (diff.path.length === 0) {
            return false;
        }
        const kind = diff.kinds?.[diff.path.length - 1];
        if (kind === 'key') {
            return false;
        }
        // Without recorded kinds -- hand-built diffs -- fall back to asking the
        // document what the container actually is.
        return Array.isArray(this.resolve(root, diff.path.slice(0, -1)));
    }

    /**
     * Rewrites an array so that every insertion and deletion in `diffs` takes
     * effect at once, reading their positions in the array's original
     * coordinates.
     */
    private static rebuildArray(array: any[], diffs: DiffResult[]): void {
        const removed = new Set<number>();
        const insertions = new Map<number, any[]>();

        for (const diff of diffs) {
            const last = diff.path[diff.path.length - 1];
            const index = Number(last);

            if (diff.type === this.DIFF_TYPES.REMOVED) {
                if (Number.isInteger(index)) {
                    removed.add(index);
                }
                continue;
            }

            // `arrayAnchor` is the old-array position; without it -- a
            // hand-built diff -- the path segment is the best available guess.
            const anchor = Math.min(
                diff.arrayAnchor ?? (Number.isInteger(index) ? index : array.length),
                array.length
            );
            const bucket = insertions.get(anchor) ?? [];
            bucket.push(diff.newValue);
            insertions.set(anchor, bucket);
        }

        const rebuilt: any[] = [];
        for (let i = 0; i <= array.length; i++) {
            for (const value of insertions.get(i) ?? []) {
                rebuilt.push(value);
            }
            if (i < array.length && !removed.has(i)) {
                rebuilt.push(array[i]);
            }
        }

        // In place: the parent holds a reference to this array. Assigned in a
        // loop rather than spread, which overflows the stack on long arrays.
        array.length = 0;
        for (const value of rebuilt) {
            array.push(value);
        }
    }

    /** Sets or deletes the value at a path, creating containers on the way. */
    private static applyValueChange(root: any, diff: DiffResult): void {
        const { path } = diff;
        if (path.length === 0) {
            return;
        }

        const parent = this.ensureParent(root, diff);
        if (parent === undefined) {
            return;
        }

        const lastKey = path[path.length - 1];

        switch (diff.type) {
            case this.DIFF_TYPES.ADDED:
            case this.DIFF_TYPES.MODIFIED:
                parent[lastKey] = diff.newValue;
                break;

            case this.DIFF_TYPES.REMOVED:
                if (Array.isArray(parent)) {
                    const index = Number(lastKey);
                    if (Number.isInteger(index)) {
                        parent.splice(index, 1);
                    }
                } else {
                    delete parent[lastKey];
                }
                break;
        }
    }

    /**
     * Walks to a diff's parent container, creating anything missing.
     *
     * Whether a missing level becomes an array or an object comes from the
     * recorded segment kind. Guessing from a numeric-looking segment turned
     * an object with the key "0" into an array.
     */
    private static ensureParent(root: any, diff: DiffResult): any {
        const { path, kinds } = diff;
        let current = root;

        for (let i = 0; i < path.length - 1; i++) {
            const key = path[i];
            if (current[key] === undefined || current[key] === null) {
                const nextKind = kinds?.[i + 1];
                const isIndex =
                    nextKind !== undefined ? nextKind === 'index' : /^\d+$/.test(path[i + 1]);
                current[key] = isIndex ? [] : {};
            }
            current = current[key];
            if (current === null || typeof current !== 'object') {
                return undefined;
            }
        }

        return current;
    }

    /**
     * Undoes a single change (the opposite of `applyDiff`).
     *
     * This works on one change at a time. Undoing several in sequence is not
     * sound where arrays are restructured, because each path is expressed in
     * the coordinates of the document the comparison ran against, and an
     * insertion or deletion moves everything after it. To back changes out in
     * bulk, re-derive the document instead: `applyDiffs(original, keep)` with
     * the unwanted changes left out of `keep`, which is what the diff view
     * does when a row is undone.
     *
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

        const current = this.ensureParent(obj, diff);
        if (current === undefined) {
            return;
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
                // Putting an array element back is an insertion, not an
                // assignment -- assigning would overwrite whatever took its
                // place and leave the array a element short.
                if (Array.isArray(current)) {
                    const index = parseInt(lastKey, 10);
                    if (!isNaN(index)) {
                        current.splice(index, 0, diff.oldValue);
                    }
                } else {
                    current[lastKey] = diff.oldValue;
                }
                break;

            case 'modified':
                // Revert modified: restore old value
                if (diff.oldValue !== undefined) {
                    current[lastKey] = diff.oldValue;
                }
                break;
        }
    }
}

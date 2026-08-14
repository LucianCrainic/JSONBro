/**
 * Array alignment for the diff engine.
 *
 * Comparing arrays strictly by index makes a single insertion at the head of a
 * hundred-element array read as a hundred modifications. Aligning the two
 * sides first means an insertion reports as one addition and everything after
 * it stays matched.
 */

/** Keys tried, in order, when matching arrays of objects by identity. */
const IDENTITY_KEYS = ['id', '_id', 'uuid', 'key', 'name'];

/**
 * Ceiling on `oldLength * newLength` for the quadratic alignment pass. Above
 * it the arrays are compared by index instead, which is O(n) and never worse
 * than the behaviour this replaced.
 */
export const DEFAULT_ALIGN_BUDGET = 1_000_000;

/** One step of the edit script that turns the old array into the new one. */
export type AlignStep =
    /** The two elements correspond; compare them for inner differences. */
    | { kind: 'pair'; oldIndex: number; newIndex: number }
    /** The element is gone. `oldIndex` is its position in the old array. */
    | { kind: 'remove'; oldIndex: number }
    /** A new element belongs before old index `anchor`. */
    | { kind: 'add'; newIndex: number; anchor: number };

export interface AlignOptions {
    budget?: number;
}

/**
 * A canonical string for a value, used to test elements for equality.
 *
 * Object keys are sorted so that two structurally equal objects compare equal
 * regardless of the order their keys happened to be written in.
 */
export function stableKey(value: any): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value) ?? 'undefined';
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableKey).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${stableKey(value[key])}`).join(',')}}`;
}

/**
 * Produces the edit script aligning `oldArr` to `newArr`.
 *
 * Tries identity-key matching first, since arrays of records reorder and
 * mutate far more often than they are rewritten wholesale, then falls back to
 * a longest-common-subsequence pass, then to index comparison when the arrays
 * are too large for that to be affordable.
 */
export function alignArrays(oldArr: any[], newArr: any[], options: AlignOptions = {}): AlignStep[] {
    const keyed = alignByIdentity(oldArr, newArr);
    if (keyed) {
        return keyed;
    }

    const budget = options.budget ?? DEFAULT_ALIGN_BUDGET;
    const oldKeys = oldArr.map(stableKey);
    const newKeys = newArr.map(stableKey);

    // Matching heads and tails are the common case and cost nothing to strip,
    // which usually shrinks the quadratic core to almost nothing.
    let prefix = 0;
    while (prefix < oldKeys.length && prefix < newKeys.length && oldKeys[prefix] === newKeys[prefix]) {
        prefix++;
    }

    let suffix = 0;
    while (
        suffix < oldKeys.length - prefix &&
        suffix < newKeys.length - prefix &&
        oldKeys[oldKeys.length - 1 - suffix] === newKeys[newKeys.length - 1 - suffix]
    ) {
        suffix++;
    }

    const steps: AlignStep[] = [];
    for (let i = 0; i < prefix; i++) {
        steps.push({ kind: 'pair', oldIndex: i, newIndex: i });
    }

    const oldCore = oldArr.slice(prefix, oldArr.length - suffix);
    const newCore = newArr.slice(prefix, newArr.length - suffix);

    const core =
        oldCore.length * newCore.length > budget
            ? alignByIndex(oldCore, newCore)
            : alignByLcs(oldKeys.slice(prefix, oldKeys.length - suffix), newKeys.slice(prefix, newKeys.length - suffix));

    for (const step of core) {
        steps.push(shiftStep(step, prefix));
    }

    for (let i = 0; i < suffix; i++) {
        steps.push({
            kind: 'pair',
            oldIndex: oldArr.length - suffix + i,
            newIndex: newArr.length - suffix + i
        });
    }

    return steps;
}

function shiftStep(step: AlignStep, by: number): AlignStep {
    switch (step.kind) {
        case 'pair':
            return { kind: 'pair', oldIndex: step.oldIndex + by, newIndex: step.newIndex + by };
        case 'remove':
            return { kind: 'remove', oldIndex: step.oldIndex + by };
        default:
            return { kind: 'add', newIndex: step.newIndex + by, anchor: step.anchor + by };
    }
}

/**
 * Matches records by a shared identity key.
 *
 * Returns null unless both sides are non-empty arrays of plain objects that
 * share a key whose values are present and unique throughout -- anything less
 * and the match would be guesswork.
 *
 * Elements matched this way are paired wherever they sit, so reordering a
 * list is not reported as a change; only the contents of the records are.
 */
function alignByIdentity(oldArr: any[], newArr: any[]): AlignStep[] | null {
    if (oldArr.length === 0 || newArr.length === 0) {
        return null;
    }
    if (!oldArr.every(isPlainObject) || !newArr.every(isPlainObject)) {
        return null;
    }

    const identity = IDENTITY_KEYS.find(key => hasUniqueValues(oldArr, key) && hasUniqueValues(newArr, key));
    if (!identity) {
        return null;
    }

    const newIndexByKey = new Map<string, number>();
    newArr.forEach((item, index) => newIndexByKey.set(stableKey(item[identity]), index));

    const steps: AlignStep[] = [];
    const matchedNew = new Set<number>();

    oldArr.forEach((item, oldIndex) => {
        const newIndex = newIndexByKey.get(stableKey(item[identity]));
        if (newIndex === undefined) {
            steps.push({ kind: 'remove', oldIndex });
        } else {
            matchedNew.add(newIndex);
            steps.push({ kind: 'pair', oldIndex, newIndex });
        }
    });

    newArr.forEach((_, newIndex) => {
        if (!matchedNew.has(newIndex)) {
            steps.push({ kind: 'add', newIndex, anchor: oldArr.length });
        }
    });

    return steps;
}

function isPlainObject(value: any): boolean {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when every element carries `key` and no two share a value. */
function hasUniqueValues(items: any[], key: string): boolean {
    const seen = new Set<string>();
    for (const item of items) {
        const value = item[key];
        if (value === undefined || value === null || typeof value === 'object') {
            return false;
        }
        const encoded = stableKey(value);
        if (seen.has(encoded)) {
            return false;
        }
        seen.add(encoded);
    }
    return true;
}

/** The positional comparison used when alignment would cost too much. */
function alignByIndex(oldArr: any[], newArr: any[]): AlignStep[] {
    const steps: AlignStep[] = [];
    const shared = Math.min(oldArr.length, newArr.length);

    for (let i = 0; i < shared; i++) {
        steps.push({ kind: 'pair', oldIndex: i, newIndex: i });
    }
    for (let i = shared; i < oldArr.length; i++) {
        steps.push({ kind: 'remove', oldIndex: i });
    }
    for (let i = shared; i < newArr.length; i++) {
        steps.push({ kind: 'add', newIndex: i, anchor: oldArr.length });
    }
    return steps;
}

/**
 * Longest-common-subsequence alignment over pre-computed element keys.
 *
 * Runs of removals immediately followed by runs of additions are zipped into
 * pairs, so replacing one element in place reads as a modification rather
 * than as an unrelated delete and insert.
 */
function alignByLcs(oldKeys: string[], newKeys: string[]): AlignStep[] {
    const n = oldKeys.length;
    const m = newKeys.length;

    if (n === 0 || m === 0) {
        return alignByIndex(new Array(n), new Array(m));
    }

    // table[i][j] = LCS length of oldKeys[i..] and newKeys[j..], flattened.
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);

    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            table[i * width + j] =
                oldKeys[i] === newKeys[j]
                    ? table[(i + 1) * width + (j + 1)] + 1
                    : Math.max(table[(i + 1) * width + j], table[i * width + (j + 1)]);
        }
    }

    const raw: AlignStep[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (oldKeys[i] === newKeys[j]) {
            raw.push({ kind: 'pair', oldIndex: i, newIndex: j });
            i++;
            j++;
        } else if (table[(i + 1) * width + j] >= table[i * width + (j + 1)]) {
            raw.push({ kind: 'remove', oldIndex: i });
            i++;
        } else {
            raw.push({ kind: 'add', newIndex: j, anchor: i });
            j++;
        }
    }
    while (i < n) {
        raw.push({ kind: 'remove', oldIndex: i });
        i++;
    }
    while (j < m) {
        raw.push({ kind: 'add', newIndex: j, anchor: n });
        j++;
    }

    return zipChangeBlocks(raw);
}

/**
 * Turns each block of consecutive removals and additions into as many
 * one-for-one pairs as it can, leaving the surplus as plain adds or removes.
 */
function zipChangeBlocks(steps: AlignStep[]): AlignStep[] {
    const result: AlignStep[] = [];
    let index = 0;

    while (index < steps.length) {
        const step = steps[index];
        if (step.kind === 'pair') {
            result.push(step);
            index++;
            continue;
        }

        const removes: Array<Extract<AlignStep, { kind: 'remove' }>> = [];
        const adds: Array<Extract<AlignStep, { kind: 'add' }>> = [];
        while (index < steps.length && steps[index].kind !== 'pair') {
            const current = steps[index];
            if (current.kind === 'remove') {
                removes.push(current);
            } else if (current.kind === 'add') {
                adds.push(current);
            }
            index++;
        }

        const paired = Math.min(removes.length, adds.length);
        for (let k = 0; k < paired; k++) {
            result.push({ kind: 'pair', oldIndex: removes[k].oldIndex, newIndex: adds[k].newIndex });
        }
        for (let k = paired; k < removes.length; k++) {
            result.push(removes[k]);
        }
        // Surplus additions land after the last element the block consumed, so
        // they stay in old-array coordinates like every other step.
        const anchor = removes.length > 0 ? removes[removes.length - 1].oldIndex + 1 : adds[0]?.anchor ?? 0;
        for (let k = paired; k < adds.length; k++) {
            result.push({ kind: 'add', newIndex: adds[k].newIndex, anchor });
        }
    }

    return result;
}

import { alignArrays, stableKey, type AlignStep } from '../array-align';

/** A compact rendering of a script, for readable assertions. */
function describeSteps(steps: AlignStep[]): string[] {
    return steps.map(step => {
        switch (step.kind) {
            case 'pair':
                return `pair ${step.oldIndex}->${step.newIndex}`;
            case 'remove':
                return `remove ${step.oldIndex}`;
            default:
                return `add ${step.newIndex}@${step.anchor}`;
        }
    });
}

describe('stableKey', () => {
    it('ignores the order object keys were written in', () => {
        expect(stableKey({ a: 1, b: 2 })).toBe(stableKey({ b: 2, a: 1 }));
    });

    it('separates values that stringify alike', () => {
        expect(stableKey('1')).not.toBe(stableKey(1));
        expect(stableKey(null)).not.toBe(stableKey('null'));
    });

    it('respects array order', () => {
        expect(stableKey([1, 2])).not.toBe(stableKey([2, 1]));
    });
});

describe('alignArrays', () => {
    describe('longest common subsequence', () => {
        it('reports a head insertion as one addition', () => {
            const steps = alignArrays(['b', 'c', 'd'], ['a', 'b', 'c', 'd']);

            expect(describeSteps(steps)).toEqual([
                'add 0@0',
                'pair 0->1',
                'pair 1->2',
                'pair 2->3'
            ]);
        });

        it('reports a middle deletion as one removal', () => {
            const steps = alignArrays(['a', 'b', 'c'], ['a', 'c']);

            expect(describeSteps(steps)).toEqual(['pair 0->0', 'remove 1', 'pair 2->1']);
        });

        it('pairs a one-for-one replacement instead of splitting it', () => {
            const steps = alignArrays([1, 2, 3], [1, 99, 3]);

            expect(describeSteps(steps)).toEqual(['pair 0->0', 'pair 1->1', 'pair 2->2']);
        });

        it('pairs what it can and leaves the surplus', () => {
            const steps = alignArrays(['a', 'x', 'y', 'b'], ['a', 'z', 'b']);

            // x pairs with z; y has no counterpart and is removed.
            expect(describeSteps(steps)).toEqual([
                'pair 0->0',
                'pair 1->1',
                'remove 2',
                'pair 3->2'
            ]);
        });

        it('anchors surplus additions in old-array coordinates', () => {
            const steps = alignArrays(['a', 'b'], ['a', 'x', 'y', 'b']);
            const adds = steps.filter(step => step.kind === 'add');

            expect(adds).toEqual([
                { kind: 'add', newIndex: 1, anchor: 1 },
                { kind: 'add', newIndex: 2, anchor: 1 }
            ]);
        });

        it('handles an empty side', () => {
            expect(describeSteps(alignArrays([], ['a']))).toEqual(['add 0@0']);
            expect(describeSteps(alignArrays(['a'], []))).toEqual(['remove 0']);
            expect(alignArrays([], [])).toEqual([]);
        });

        it('pairs everything when the arrays are equal', () => {
            const steps = alignArrays([1, 2, 3], [1, 2, 3]);

            expect(steps.every(step => step.kind === 'pair')).toBe(true);
            expect(steps).toHaveLength(3);
        });
    });

    describe('identity matching', () => {
        it('matches records by id rather than by position', () => {
            const oldArr = [{ id: 1, v: 'a' }, { id: 2, v: 'b' }];
            const newArr = [{ id: 2, v: 'B' }, { id: 1, v: 'a' }];

            const steps = alignArrays(oldArr, newArr);

            // Reordering alone is not a change; only the contents are compared.
            expect(describeSteps(steps)).toEqual(['pair 0->1', 'pair 1->0']);
        });

        it('reports records that appear and disappear', () => {
            const oldArr = [{ id: 1 }, { id: 2 }];
            const newArr = [{ id: 2 }, { id: 3 }];

            expect(describeSteps(alignArrays(oldArr, newArr))).toEqual([
                'remove 0',
                'pair 1->0',
                'add 1@2'
            ]);
        });

        it('falls back when the identity key repeats', () => {
            const oldArr = [{ id: 1, v: 'a' }, { id: 1, v: 'b' }];
            const newArr = [{ id: 1, v: 'a' }, { id: 1, v: 'b' }];

            // Ambiguous ids are no basis for matching, so this goes through
            // the subsequence path -- which still pairs them all.
            expect(describeSteps(alignArrays(oldArr, newArr))).toEqual([
                'pair 0->0',
                'pair 1->1'
            ]);
        });

        it('falls back when the key is missing from some records', () => {
            const oldArr = [{ id: 1 }, { name: 'x' }];
            const newArr = [{ id: 1 }, { name: 'y' }];

            const steps = alignArrays(oldArr, newArr);
            expect(steps.filter(step => step.kind === 'pair')).toHaveLength(2);
        });

        it('prefers id over the later candidate keys', () => {
            const oldArr = [{ id: 1, name: 'x' }, { id: 2, name: 'y' }];
            const newArr = [{ id: 1, name: 'renamed' }, { id: 2, name: 'y' }];

            // Matching on name would report both as replaced; id keeps them paired.
            expect(describeSteps(alignArrays(oldArr, newArr))).toEqual([
                'pair 0->0',
                'pair 1->1'
            ]);
        });
    });

    describe('budget', () => {
        it('degrades to index comparison rather than running out of memory', () => {
            // Wrapped on both sides so neither the prefix nor the suffix scan
            // can shrink the core away before the budget is consulted.
            const oldArr = Array.from({ length: 30 }, (_, i) => `a${i}`);
            const newArr = ['head', ...oldArr, 'tail'];

            const aligned = alignArrays(oldArr, newArr);
            const capped = alignArrays(oldArr, newArr, { budget: 1 });

            // With room to align, every original element stays matched to
            // itself, one position further along.
            expect(aligned.filter(step => step.kind === 'add')).toHaveLength(2);
            expect(aligned.filter(step => step.kind === 'remove')).toHaveLength(0);
            expect(aligned.find(step => step.kind === 'pair')).toEqual({
                kind: 'pair',
                oldIndex: 0,
                newIndex: 1
            });

            // Without it, position is all there is, so a0 lines up against
            // 'head' -- less useful, but linear.
            expect(capped[0]).toEqual({ kind: 'pair', oldIndex: 0, newIndex: 0 });
        });

        it('still strips matching heads and tails under a tight budget', () => {
            const oldArr = ['a', 'b', 'c', 'd'];
            const newArr = ['a', 'b', 'X', 'd'];

            const steps = alignArrays(oldArr, newArr, { budget: 0 });

            expect(describeSteps(steps)).toEqual([
                'pair 0->0',
                'pair 1->1',
                'pair 2->2',
                'pair 3->3'
            ]);
        });
    });

    describe('scale', () => {
        it('aligns a long array with a head insertion quickly', () => {
            const oldArr = Array.from({ length: 20_000 }, (_, i) => ({ id: i, v: i }));
            const newArr = [{ id: -1, v: -1 }, ...oldArr];

            const started = Date.now();
            const steps = alignArrays(oldArr, newArr);
            const elapsed = Date.now() - started;

            expect(steps.filter(step => step.kind === 'add')).toHaveLength(1);
            expect(steps.filter(step => step.kind === 'remove')).toHaveLength(0);
            expect(elapsed).toBeLessThan(2000);
        });
    });
});

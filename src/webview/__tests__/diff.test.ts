import { JSONDiff } from '../diff';

describe('JSONDiff', () => {
    describe('Object and array comparison', () => {
        it('should detect added properties', () => {
            const expected = { "a": 1 };
            const received = { "a": 1, "b": 2 };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].type).toBe('added');
        });

        it('should detect removed properties', () => {
            const expected = { "a": 1, "b": 2 };
            const received = { "a": 1 };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].type).toBe('removed');
        });

        it('should detect modified properties', () => {
            const expected = { "a": 1 };
            const received = { "a": 2 };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].type).toBe('modified');
        });

        it('should handle identical objects', () => {
            const expected = { "a": 1, "b": "test" };
            const received = { "a": 1, "b": "test" };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should handle nested object differences', () => {
            const expected = { 
                "user": { 
                    "name": "John",
                    "age": 30 
                } 
            };
            const received = { 
                "user": { 
                    "name": "John",
                    "age": 31 
                } 
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['user', 'age']);
        });

        it('should handle array differences', () => {
            const expected = [1, 2, 3];
            const received = [1, 2, 4];
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['2']);
        });

        it('should handle array length differences', () => {
            const expected = [1, 2, 3];
            const received = [1, 2];
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].type).toBe('removed');
        });

        it('should handle complex nested structures', () => {
            const expected = {
                "data": {
                    "items": [
                        { "id": 1, "name": "Item 1" },
                        { "id": 2, "name": "Item 2" }
                    ]
                }
            };
            const received = {
                "data": {
                    "items": [
                        { "id": 1, "name": "Item 1" },
                        { "id": 2, "name": "Item 2 Modified" }
                    ]
                }
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['data', 'items', '1', 'name']);
        });

        it('should handle type changes', () => {
            const expected = { "value": "123" };
            const received = { "value": 123 };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].type).toBe('modified');
        });

        it('should handle undefined as removed', () => {
            const expected = { "a": 1, "b": 2 };
            const received = { "a": 1 };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].type).toBe('removed');
            expect(diffs[0].path).toEqual(['b']);
        });

        it('should handle both null values as equal', () => {
            const expected = { "a": null };
            const received = { "a": null };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });
    });

    describe('Strict Diff Mode', () => {
        it('should ignore added keys in strict mode', () => {
            const expected = { "a": 1, "b": 2 };
            const received = { "a": 1, "b": 2, "c": 3 };
            
            const diffs = JSONDiff.compareJson(expected, received, [], true);
            
            expect(diffs).toEqual([]);
        });

        it('should still detect removed keys in strict mode', () => {
            const expected = { "a": 1, "b": 2, "c": 3 };
            const received = { "a": 1, "b": 2 };
            
            const diffs = JSONDiff.compareJson(expected, received, [], true);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].type).toBe('removed');
            expect(diffs[0].path).toEqual(['c']);
        });

        it('should still detect modified keys in strict mode', () => {
            const expected = { "a": 1, "b": 2 };
            const received = { "a": 1, "b": 3, "c": 4 };
            
            const diffs = JSONDiff.compareJson(expected, received, [], true);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].type).toBe('modified');
            expect(diffs[0].path).toEqual(['b']);
        });

        it('should ignore added nested properties in strict mode', () => {
            const expected = {
                "user": {
                    "name": "John",
                    "age": 30
                }
            };
            const received = {
                "user": {
                    "name": "John",
                    "age": 30,
                    "email": "john@example.com",
                    "phone": "123-456-7890"
                }
            };
            
            const diffs = JSONDiff.compareJson(expected, received, [], true);
            
            expect(diffs).toEqual([]);
        });

        it('should detect nested property changes in strict mode', () => {
            const expected = {
                "user": {
                    "name": "John",
                    "age": 30
                }
            };
            const received = {
                "user": {
                    "name": "John",
                    "age": 31,
                    "email": "john@example.com"
                }
            };
            
            const diffs = JSONDiff.compareJson(expected, received, [], true);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['user', 'age']);
        });

        it('should ignore added array elements in strict mode', () => {
            const expected = [1, 2, 3];
            const received = [1, 2, 3, 4, 5];
            
            const diffs = JSONDiff.compareJson(expected, received, [], true);
            
            expect(diffs).toEqual([]);
        });

        it('should detect removed array elements in strict mode', () => {
            const expected = [1, 2, 3, 4, 5];
            const received = [1, 2, 3];
            
            const diffs = JSONDiff.compareJson(expected, received, [], true);
            
            expect(diffs).toHaveLength(2);
            expect(diffs[0].type).toBe('removed');
            expect(diffs[1].type).toBe('removed');
        });

        it('should detect modified array elements in strict mode', () => {
            const expected = [1, 2, 3];
            const received = [1, 99, 3, 4, 5];
            
            const diffs = JSONDiff.compareJson(expected, received, [], true);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['1']);
            expect(diffs[0].oldValue).toBe(2);
            expect(diffs[0].newValue).toBe(99);
        });

        it('should handle complex nested structure in strict mode', () => {
            const expected = {
                "config": {
                    "database": {
                        "host": "localhost",
                        "port": 5432
                    },
                    "cache": {
                        "ttl": 3600
                    }
                }
            };
            const received = {
                "config": {
                    "database": {
                        "host": "localhost",
                        "port": 5432,
                        "username": "admin",
                        "password": "secret"
                    },
                    "cache": {
                        "ttl": 3600,
                        "maxSize": "100MB"
                    },
                    "logging": {
                        "level": "info"
                    }
                },
                "version": "1.0.0"
            };
            
            const diffs = JSONDiff.compareJson(expected, received, [], true);
            
            expect(diffs).toEqual([]);
        });

        it('should detect all differences in non-strict mode (default)', () => {
            const expected = { "a": 1, "b": 2 };
            const received = { "a": 1, "b": 2, "c": 3 };
            
            const diffs = JSONDiff.compareJson(expected, received, [], false);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].type).toBe('added');
        });

        it('should handle array of objects in strict mode', () => {
            const expected = [
                { "id": 1, "name": "Item 1" },
                { "id": 2, "name": "Item 2" }
            ];
            const received = [
                { "id": 1, "name": "Item 1", "extra": "field" },
                { "id": 2, "name": "Item 2 Modified", "extra": "field" }
            ];
            
            const diffs = JSONDiff.compareJson(expected, received, [], true);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['1', 'name']);
        });

        it('should handle deeply nested strict diff', () => {
            const expected = {
                "level1": {
                    "level2": {
                        "level3": {
                            "value": 1
                        }
                    }
                }
            };
            const received = {
                "level1": {
                    "level2": {
                        "level3": {
                            "value": 2,
                            "extra1": "ignored"
                        },
                        "extra2": "ignored"
                    },
                    "extra3": "ignored"
                },
                "extra4": "ignored"
            };
            
            const diffs = JSONDiff.compareJson(expected, received, [], true);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['level1', 'level2', 'level3', 'value']);
        });
    });
});

describe('Diff Application', () => {
    describe('applyDiff', () => {
        it('should apply an added property', () => {
            const json = { "a": 1 };
            const diff = {
                type: 'added' as const,
                path: ['b'],
                newValue: 2
            };

            const result = JSONDiff.applyDiff(json, diff);

            expect(result).toEqual({ "a": 1, "b": 2 });
        });

        it('should apply a modified property', () => {
            const json = { "a": 1, "b": 2 };
            const diff = {
                type: 'modified' as const,
                path: ['a'],
                oldValue: 1,
                newValue: 10
            };

            const result = JSONDiff.applyDiff(json, diff);

            expect(result).toEqual({ "a": 10, "b": 2 });
        });

        it('should apply a removed property', () => {
            const json = { "a": 1, "b": 2 };
            const diff = {
                type: 'removed' as const,
                path: ['b'],
                oldValue: 2
            };

            const result = JSONDiff.applyDiff(json, diff);

            expect(result).toEqual({ "a": 1 });
        });

        it('should apply nested property additions', () => {
            const json = { "user": { "name": "John" } };
            const diff = {
                type: 'added' as const,
                path: ['user', 'age'],
                newValue: 30
            };

            const result = JSONDiff.applyDiff(json, diff);

            expect(result).toEqual({ "user": { "name": "John", "age": 30 } });
        });

        it('should apply nested property modifications', () => {
            const json = { "user": { "name": "John", "age": 30 } };
            const diff = {
                type: 'modified' as const,
                path: ['user', 'age'],
                oldValue: 30,
                newValue: 31
            };

            const result = JSONDiff.applyDiff(json, diff);

            expect(result).toEqual({ "user": { "name": "John", "age": 31 } });
        });

        it('should apply array element modifications', () => {
            const json = { "items": [1, 2, 3] };
            const diff = {
                type: 'modified' as const,
                path: ['items', '1'],
                oldValue: 2,
                newValue: 20
            };

            const result = JSONDiff.applyDiff(json, diff);

            expect(result).toEqual({ "items": [1, 20, 3] });
        });

        it('should apply array element additions', () => {
            const json = { "items": [1, 2] };
            const diff = {
                type: 'added' as const,
                path: ['items', '2'],
                newValue: 3
            };

            const result = JSONDiff.applyDiff(json, diff);

            expect(result).toEqual({ "items": [1, 2, 3] });
        });

        it('should apply array element removals', () => {
            const json = { "items": [1, 2, 3] };
            const diff = {
                type: 'removed' as const,
                path: ['items', '1'],
                oldValue: 2
            };

            const result = JSONDiff.applyDiff(json, diff);

            expect(result).toEqual({ "items": [1, 3] });
        });

        it('should create intermediate objects when needed', () => {
            const json = { "a": 1 };
            const diff = {
                type: 'added' as const,
                path: ['user', 'profile', 'name'],
                newValue: 'John'
            };

            const result = JSONDiff.applyDiff(json, diff);

            expect(result).toEqual({ 
                "a": 1, 
                "user": { 
                    "profile": { 
                        "name": "John" 
                    } 
                } 
            });
        });

        it('should not mutate the original object', () => {
            const json = { "a": 1 };
            const diff = {
                type: 'added' as const,
                path: ['b'],
                newValue: 2
            };

            JSONDiff.applyDiff(json, diff);

            expect(json).toEqual({ "a": 1 });
        });
    });

    describe('applyDiffs', () => {
        it('should apply multiple diffs', () => {
            const json = { "a": 1, "b": 2 };
            const diffs = [
                {
                    type: 'modified' as const,
                    path: ['a'],
                    oldValue: 1,
                    newValue: 10
                },
                {
                    type: 'added' as const,
                    path: ['c'],
                    newValue: 3
                }
            ];

            const result = JSONDiff.applyDiffs(json, diffs);

            expect(result).toEqual({ "a": 10, "b": 2, "c": 3 });
        });

        it('should handle complex diff scenarios', () => {
            const json = { 
                "user": { "name": "John", "age": 30 },
                "items": [1, 2, 3]
            };
            const diffs = [
                {
                    type: 'modified' as const,
                    path: ['user', 'age'],
                    oldValue: 30,
                    newValue: 31
                },
                {
                    type: 'added' as const,
                    path: ['user', 'email'],
                    newValue: 'john@example.com'
                },
                {
                    type: 'modified' as const,
                    path: ['items', '1'],
                    oldValue: 2,
                    newValue: 20
                }
            ];

            const result = JSONDiff.applyDiffs(json, diffs);

            expect(result).toEqual({ 
                "user": { 
                    "name": "John", 
                    "age": 31,
                    "email": "john@example.com"
                },
                "items": [1, 20, 3]
            });
        });

        it('should apply diffs in correct order to avoid array index issues', () => {
            const json = { "items": [1, 2, 3, 4, 5] };
            const diffs = [
                {
                    type: 'removed' as const,
                    path: ['items', '1'],
                    oldValue: 2
                },
                {
                    type: 'modified' as const,
                    path: ['items', '0'],
                    oldValue: 1,
                    newValue: 10
                }
            ];

            const result = JSONDiff.applyDiffs(json, diffs);

            expect(result).toEqual({ "items": [10, 3, 4, 5] });
        });
    });

    describe('revertDiff', () => {
        it('should revert an added property', () => {
            const json = { "a": 1, "b": 2 };
            const diff = {
                type: 'added' as const,
                path: ['b'],
                newValue: 2
            };

            const result = JSONDiff.revertDiff(json, diff);

            expect(result).toEqual({ "a": 1 });
        });

        it('should revert a modified property', () => {
            const json = { "a": 10, "b": 2 };
            const diff = {
                type: 'modified' as const,
                path: ['a'],
                oldValue: 1,
                newValue: 10
            };

            const result = JSONDiff.revertDiff(json, diff);

            expect(result).toEqual({ "a": 1, "b": 2 });
        });

        it('should revert a removed property', () => {
            const json = { "a": 1 };
            const diff = {
                type: 'removed' as const,
                path: ['b'],
                oldValue: 2
            };

            const result = JSONDiff.revertDiff(json, diff);

            expect(result).toEqual({ "a": 1, "b": 2 });
        });

        it('should revert nested property changes', () => {
            const json = { "user": { "name": "John", "age": 31 } };
            const diff = {
                type: 'modified' as const,
                path: ['user', 'age'],
                oldValue: 30,
                newValue: 31
            };

            const result = JSONDiff.revertDiff(json, diff);

            expect(result).toEqual({ "user": { "name": "John", "age": 30 } });
        });

        it('should not mutate the original object', () => {
            const json = { "a": 1, "b": 2 };
            const diff = {
                type: 'added' as const,
                path: ['b'],
                newValue: 2
            };

            JSONDiff.revertDiff(json, diff);

            expect(json).toEqual({ "a": 1, "b": 2 });
        });
    });
});

/*
 * `null` used to be conflated with absence: a value changing to or from null
 * was reported as an addition or a removal, so applying the change deleted the
 * key rather than setting it. That silently dropped data.
 */
describe('null as a value', () => {
    it('reports a change from null to a value as modified', () => {
        const diffs = JSONDiff.compareJson({ a: null }, { a: 1 });

        expect(diffs).toHaveLength(1);
        expect(diffs[0].type).toBe('modified');
        expect(diffs[0].oldValue).toBeNull();
        expect(diffs[0].newValue).toBe(1);
    });

    it('reports a change from a value to null as modified', () => {
        const diffs = JSONDiff.compareJson({ a: 1 }, { a: null });

        expect(diffs).toHaveLength(1);
        expect(diffs[0].type).toBe('modified');
    });

    it('keeps the key when a change to null is applied', () => {
        const original = { a: 1, b: 2 };
        const diffs = JSONDiff.compareJson(original, { a: null, b: 2 });

        const result = JSONDiff.applyDiffs(original, diffs);

        expect(result).toEqual({ a: null, b: 2 });
        expect('a' in result).toBe(true);
    });

    it('still treats a missing key as removed', () => {
        const diffs = JSONDiff.compareJson({ a: 1 }, {});

        expect(diffs).toHaveLength(1);
        expect(diffs[0].type).toBe('removed');
    });

    it('reports a null replaced by an object as modified, not added', () => {
        const diffs = JSONDiff.compareJson({ a: null }, { a: { b: 1 } });

        expect(diffs).toHaveLength(1);
        expect(diffs[0].type).toBe('modified');
    });
});

describe('array alignment through compareJson', () => {
    it('reports a head insertion as a single addition', () => {
        const oldArr = Array.from({ length: 50 }, (_, i) => i);
        const diffs = JSONDiff.compareJson(oldArr, [999, ...oldArr]);

        expect(diffs).toHaveLength(1);
        expect(diffs[0].type).toBe('added');
        expect(diffs[0].newValue).toBe(999);
    });

    it('numbers an addition by its place in the new document', () => {
        const diffs = JSONDiff.compareJson(['a', 'b'], ['a', 'x', 'b']);

        expect(diffs[0].path).toEqual(['1']);
        // ...but insertion happens before old index 1.
        expect(diffs[0].arrayAnchor).toBe(1);
    });

    it('descends into elements matched by identity', () => {
        const diffs = JSONDiff.compareJson(
            { rows: [{ id: 'a', v: 1 }, { id: 'b', v: 2 }] },
            { rows: [{ id: 'b', v: 2 }, { id: 'a', v: 99 }] }
        );

        expect(diffs).toHaveLength(1);
        expect(diffs[0].path).toEqual(['rows', '0', 'v']);
        expect(diffs[0].newValue).toBe(99);
    });

    it('marks index segments distinctly from key segments', () => {
        const diffs = JSONDiff.compareJson({ list: ['a'] }, { list: ['b'] });

        expect(diffs[0].path).toEqual(['list', '0']);
        expect(diffs[0].kinds).toEqual(['key', 'index']);
    });
});

describe('applying changes to arrays', () => {
    it('removes the right elements when several are dropped at once', () => {
        const original = { items: [0, 1, 2, 3, 4, 5] };
        const diffs = JSONDiff.compareJson(original, { items: [0, 2, 4] });

        expect(JSONDiff.applyDiffs(original, diffs)).toEqual({ items: [0, 2, 4] });
    });

    it('does not depend on the order the changes are given in', () => {
        const original = { items: ['a', 'b', 'c', 'd'] };
        const diffs = JSONDiff.compareJson(original, { items: ['a', 'x', 'd', 'e'] });

        const forwards = JSONDiff.applyDiffs(original, diffs);
        const backwards = JSONDiff.applyDiffs(original, [...diffs].reverse());

        expect(forwards).toEqual({ items: ['a', 'x', 'd', 'e'] });
        expect(backwards).toEqual(forwards);
    });

    it('inserts a run of elements in order at one position', () => {
        const original = { items: ['a', 'z'] };
        const diffs = JSONDiff.compareJson(original, { items: ['a', 'p', 'q', 'r', 'z'] });

        expect(JSONDiff.applyDiffs(original, diffs)).toEqual({
            items: ['a', 'p', 'q', 'r', 'z']
        });
    });

    it('handles insertions and deletions in the same array', () => {
        const original = { items: [1, 2, 3, 4, 5] };
        const target = { items: [0, 1, 3, 5, 6] };
        const diffs = JSONDiff.compareJson(original, target);

        expect(JSONDiff.applyDiffs(original, diffs)).toEqual(target);
    });

    it('leaves the original untouched', () => {
        const original = { items: [1, 2, 3] };
        const snapshot = JSON.stringify(original);
        JSONDiff.applyDiffs(original, JSONDiff.compareJson(original, { items: [3, 2, 1] }));

        expect(JSON.stringify(original)).toBe(snapshot);
    });

    it('applies a change nested inside an element that later shifts', () => {
        const original = { rows: [{ n: 1 }, { n: 2 }, { n: 3 }] };
        const target = { rows: [{ n: 2 }, { n: 30 }] };
        const diffs = JSONDiff.compareJson(original, target);

        expect(JSONDiff.applyDiffs(original, diffs)).toEqual(target);
    });
});

/*
 * Paths are plain strings, so "0" reads as an array index. Deciding container
 * types from that guess turned an object keyed by digits into an array.
 */
describe('objects with numeric keys', () => {
    it('does not turn a digit-keyed object into an array', () => {
        const original = { counts: { '0': 'zero' } };
        const diffs = JSONDiff.compareJson(original, { counts: { '0': 'zero', '1': 'one' } });

        const result = JSONDiff.applyDiffs(original, diffs);

        expect(Array.isArray(result.counts)).toBe(false);
        expect(result.counts).toEqual({ '0': 'zero', '1': 'one' });
    });

    it('creates a digit-keyed object when the path says so', () => {
        const diffs = JSONDiff.compareJson({}, { outer: { '0': 'x' } });
        const result = JSONDiff.applyDiffs({}, diffs);

        expect(Array.isArray(result.outer)).toBe(false);
        expect(result.outer).toEqual({ '0': 'x' });
    });

    it('removes a digit key without collapsing its container', () => {
        const original = { counts: { '0': 'zero', '1': 'one' } };
        const diffs = JSONDiff.compareJson(original, { counts: { '0': 'zero' } });

        const result = JSONDiff.applyDiffs(original, diffs);

        expect(Array.isArray(result.counts)).toBe(false);
        expect(result.counts).toEqual({ '0': 'zero' });
    });
});

describe('round tripping', () => {
    const cases: Array<[string, any, any]> = [
        ['scalars', { a: 1, b: 'x', c: true, d: null }, { a: 2, b: 'y', c: false, d: 0 }],
        ['nesting', { a: { b: { c: [1, 2] } } }, { a: { b: { c: [1, 2, 3], d: 'new' } } }],
        ['arrays reordered', { l: [1, 2, 3, 4] }, { l: [4, 3, 2, 1] }],
        ['records', { r: [{ id: 1, v: 'a' }] }, { r: [{ id: 1, v: 'b' }, { id: 2, v: 'c' }] }],
        ['emptied', { a: [1, 2], b: { c: 1 } }, { a: [], b: {} }],
        ['grown from empty', { a: [], b: {} }, { a: [1, 2], b: { c: 1 } }],
        ['type changes', { a: [1] }, { a: { '0': 1 } }]
    ];

    it.each(cases)('applying every change reaches the target: %s', (_name, left, right) => {
        const diffs = JSONDiff.compareJson(left, right);

        expect(JSONDiff.applyDiffs(left, diffs)).toEqual(right);
    });

    /*
     * Undoing a row re-derives the document from the original with that change
     * left out, rather than un-mutating in place -- so these are the
     * properties the diff view actually leans on.
     */
    it.each(cases)('applying nothing returns the original: %s', (_name, left, right) => {
        const diffs = JSONDiff.compareJson(left, right);

        expect(JSONDiff.applyDiffs(left, [])).toEqual(left);
        expect(diffs.length).toBeGreaterThan(0);
    });

    it.each(cases)('a subset applies the same in any order: %s', (_name, left, right) => {
        const diffs = JSONDiff.compareJson(left, right);
        const subset = diffs.filter((_, index) => index % 2 === 0);

        expect(JSONDiff.applyDiffs(left, subset)).toEqual(
            JSONDiff.applyDiffs(left, [...subset].reverse())
        );
    });

    it.each(cases)('dropping one change then restoring it round trips: %s', (_name, left, right) => {
        const diffs = JSONDiff.compareJson(left, right);
        const withoutFirst = diffs.slice(1);

        // Undo of the first row, then redo of it.
        JSONDiff.applyDiffs(left, withoutFirst);

        expect(JSONDiff.applyDiffs(left, diffs)).toEqual(right);
    });
});

describe('pathological input', () => {
    /** A chain of `depth` nested objects ending in `leaf`. */
    function deepChain(depth: number, leaf: any): any {
        let node: any = leaf;
        for (let i = 0; i < depth; i++) {
            node = { next: node };
        }
        return node;
    }

    it('compares deeply nested documents without overflowing the stack', () => {
        const left = deepChain(50_000, { value: 1 });
        const right = deepChain(50_000, { value: 2 });

        const diffs = JSONDiff.compareJson(left, right);

        expect(diffs).toHaveLength(1);
        expect(diffs[0].type).toBe('modified');
        expect(diffs[0].path).toHaveLength(50_001);
    });

    it('compares wide documents in reasonable time', () => {
        const left: Record<string, number> = {};
        const right: Record<string, number> = {};
        for (let i = 0; i < 50_000; i++) {
            left[`k${i}`] = i;
            right[`k${i}`] = i % 2 === 0 ? i : i + 1;
        }

        const started = Date.now();
        const diffs = JSONDiff.compareJson(left, right);

        expect(diffs).toHaveLength(25_000);
        expect(Date.now() - started).toBeLessThan(5000);
    });

    it('applies a large change set without cloning per change', () => {
        const left: Record<string, number> = {};
        const right: Record<string, number> = {};
        for (let i = 0; i < 5_000; i++) {
            left[`k${i}`] = i;
            right[`k${i}`] = i + 1;
        }

        const started = Date.now();
        const result = JSONDiff.applyDiffs(left, JSONDiff.compareJson(left, right));

        expect(result).toEqual(right);
        expect(Date.now() - started).toBeLessThan(5000);
    });
});

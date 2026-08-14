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

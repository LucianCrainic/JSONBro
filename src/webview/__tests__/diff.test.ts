import { JSONDiff } from '../diff';

describe('JSONDiff', () => {
    describe('Basic Wildcard Key Matching', () => {
        it('should match wildcard key with any key in received JSON', () => {
            const expected = { "*": ["a", "b", "c"] };
            const received = { "24": ["a", "b", "c"] };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should show differences in values when wildcard key matches', () => {
            const expected = { "*": ["a", "b", "c"] };
            const received = { "24": ["a", "b", "d"] };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0]).toEqual({
                type: 'modified',
                path: ['24', '2'],
                oldValue: 'c',
                newValue: 'd'
            });
        });

        it('should match wildcard with numeric keys', () => {
            const expected = { "*": "value" };
            const received = { "123": "value" };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should match wildcard with UUID keys', () => {
            const expected = { "*": { "status": "active" } };
            const received = { "550e8400-e29b-41d4-a716-446655440000": { "status": "active" } };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should match wildcard with special character keys', () => {
            const expected = { "*": "data" };
            const received = { "key-with-dashes": "data", "key_with_underscores": "data" };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });
    });

    describe('Multiple Wildcard Keys', () => {
        it('should handle wildcard matching multiple keys with same value', () => {
            const expected = { "*": "value" };
            const received = { 
                "key1": "value",
                "key2": "value",
                "key3": "value"
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should find differences in multiple keys matched by wildcard', () => {
            const expected = { "*": "expected" };
            const received = { 
                "key1": "expected",
                "key2": "different",
                "key3": "expected",
                "key4": "also-different"
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(2);
            expect(diffs.map(d => d.path[0])).toEqual(['key2', 'key4']);
        });

        it('should handle wildcard with arrays in multiple keys', () => {
            const expected = { "*": [1, 2, 3] };
            const received = { 
                "a": [1, 2, 3],
                "b": [1, 2, 4],
                "c": [1, 2, 3]
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['b', '2']);
        });

        it('should handle wildcard with objects in multiple keys', () => {
            const expected = { 
                "*": { 
                    "status": "pending",
                    "priority": 1 
                } 
            };
            const received = { 
                "task1": { "status": "pending", "priority": 1 },
                "task2": { "status": "completed", "priority": 1 },
                "task3": { "status": "pending", "priority": 2 }
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(2);
            expect(diffs[0].path).toEqual(['task2', 'status']);
            expect(diffs[1].path).toEqual(['task3', 'priority']);
        });
    });

    describe('Nested Wildcards', () => {
        it('should handle wildcard at multiple nesting levels', () => {
            const expected = {
                "users": {
                    "*": {
                        "profile": {
                            "*": "default"
                        }
                    }
                }
            };
            const received = {
                "users": {
                    "user1": {
                        "profile": {
                            "theme": "default",
                            "language": "default"
                        }
                    }
                }
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should find differences in nested wildcard structures', () => {
            const expected = {
                "database": {
                    "*": {
                        "tables": {
                            "*": {
                                "columns": 5
                            }
                        }
                    }
                }
            };
            const received = {
                "database": {
                    "db1": {
                        "tables": {
                            "users": { "columns": 5 },
                            "posts": { "columns": 8 }
                        }
                    }
                }
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['database', 'db1', 'tables', 'posts', 'columns']);
            expect(diffs[0].oldValue).toBe(5);
            expect(diffs[0].newValue).toBe(8);
        });

        it('should handle three levels of nested wildcards', () => {
            const expected = {
                "*": {
                    "*": {
                        "*": "value"
                    }
                }
            };
            const received = {
                "level1": {
                    "level2a": {
                        "level3a": "value",
                        "level3b": "value"
                    },
                    "level2b": {
                        "level3c": "different"
                    }
                }
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['level1', 'level2b', 'level3c']);
        });

        it('should handle wildcard with nested arrays and objects', () => {
            const expected = {
                "*": [
                    {
                        "*": "item"
                    }
                ]
            };
            const received = {
                "list1": [
                    {
                        "a": "item",
                        "b": "item"
                    }
                ],
                "list2": [
                    {
                        "c": "different"
                    }
                ]
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['list2', '0', 'c']);
        });
    });

    describe('Wildcard Combined with Specific Keys', () => {
        it('should handle wildcard with specific keys - wildcard matches remaining keys', () => {
            const expected = { 
                "id": 1,
                "*": "wildcard-value"
            };
            const received = { 
                "id": 1,
                "name": "wildcard-value",
                "type": "wildcard-value"
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should find differences in wildcard when specific keys match', () => {
            const expected = { 
                "id": 1,
                "name": "test",
                "*": "default"
            };
            const received = { 
                "id": 1,
                "name": "test",
                "type": "custom",
                "category": "default"
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['type']);
            expect(diffs[0].oldValue).toBe('default');
            expect(diffs[0].newValue).toBe('custom');
        });

        it('should report removed specific key even with wildcard present', () => {
            const expected = { 
                "required": "value",
                "*": "optional"
            };
            const received = { 
                "other": "optional"
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].type).toBe('removed');
            expect(diffs[0].path).toEqual(['required']);
        });

        it('should handle multiple specific keys with wildcard', () => {
            const expected = {
                "id": 100,
                "name": "entity",
                "created": "2024-01-01",
                "*": null
            };
            const received = {
                "id": 100,
                "name": "entity",
                "created": "2024-01-01",
                "optional1": null,
                "optional2": null,
                "optional3": "non-null"
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['optional3']);
        });

        it('should handle nested objects with both specific and wildcard keys', () => {
            const expected = {
                "config": {
                    "version": "1.0",
                    "*": {
                        "enabled": true
                    }
                }
            };
            const received = {
                "config": {
                    "version": "1.0",
                    "feature1": { "enabled": true },
                    "feature2": { "enabled": false },
                    "feature3": { "enabled": true }
                }
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['config', 'feature2', 'enabled']);
        });
    });

    describe('Wildcard Value Matching', () => {
        it('should match wildcard value with string', () => {
            const expected = { "key": "*" };
            const received = { "key": "any-value" };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should match wildcard value with number', () => {
            const expected = { "key": "*" };
            const received = { "key": 12345 };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should match wildcard value with boolean', () => {
            const expected = { "key": "*" };
            const received = { "key": true };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should match wildcard value with null', () => {
            const expected = { "key": "*" };
            const received = { "key": null };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should match wildcard value with array', () => {
            const expected = { "key": "*" };
            const received = { "key": [1, 2, 3] };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should match wildcard value with object', () => {
            const expected = { "key": "*" };
            const received = { "key": { "nested": "object" } };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should handle multiple wildcard values', () => {
            const expected = { 
                "a": "*",
                "b": "*",
                "c": "*"
            };
            const received = { 
                "a": 123,
                "b": "string",
                "c": { "obj": true }
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should handle wildcard values in arrays', () => {
            const expected = ["*", "*", "*"];
            const received = [1, "two", { "three": 3 }];
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should mix wildcard and specific values in array', () => {
            const expected = [1, "*", 3, "*"];
            const received = [1, 999, 3, "anything"];
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });
    });

    describe('Complex Wildcard Scenarios', () => {
        it('should handle API response with dynamic timestamps', () => {
            const expected = {
                "status": "success",
                "data": {
                    "*": {
                        "id": "*",
                        "timestamp": "*",
                        "value": 100
                    }
                }
            };
            const received = {
                "status": "success",
                "data": {
                    "record1": {
                        "id": "abc123",
                        "timestamp": 1609459200000,
                        "value": 100
                    },
                    "record2": {
                        "id": "def456",
                        "timestamp": 1609545600000,
                        "value": 200
                    }
                }
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['data', 'record2', 'value']);
        });

        it('should handle database records with auto-generated IDs', () => {
            const expected = {
                "users": [
                    { "id": "*", "name": "Alice", "role": "admin" },
                    { "id": "*", "name": "Bob", "role": "user" }
                ]
            };
            const received = {
                "users": [
                    { "id": "user_001", "name": "Alice", "role": "admin" },
                    { "id": "user_002", "name": "Bob", "role": "moderator" }
                ]
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['users', '1', 'role']);
            expect(diffs[0].oldValue).toBe('user');
            expect(diffs[0].newValue).toBe('moderator');
        });

        it('should handle configuration with dynamic service names', () => {
            const expected = {
                "services": {
                    "*": {
                        "port": "*",
                        "protocol": "http",
                        "timeout": 30000
                    }
                }
            };
            const received = {
                "services": {
                    "api-gateway": {
                        "port": 8080,
                        "protocol": "http",
                        "timeout": 30000
                    },
                    "auth-service": {
                        "port": 8081,
                        "protocol": "https",
                        "timeout": 30000
                    }
                }
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['services', 'auth-service', 'protocol']);
        });

        it('should handle deeply nested wildcard hierarchy', () => {
            const expected = {
                "organizations": {
                    "*": {
                        "departments": {
                            "*": {
                                "teams": {
                                    "*": {
                                        "members": {
                                            "*": {
                                                "role": "member"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            };
            const received = {
                "organizations": {
                    "org1": {
                        "departments": {
                            "engineering": {
                                "teams": {
                                    "backend": {
                                        "members": {
                                            "emp1": { "role": "member" },
                                            "emp2": { "role": "lead" }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['organizations', 'org1', 'departments', 'engineering', 'teams', 'backend', 'members', 'emp2', 'role']);
        });

        it('should handle metrics with dynamic labels', () => {
            const expected = {
                "metrics": {
                    "*": {
                        "value": "*",
                        "unit": "ms",
                        "tags": {
                            "*": "*"
                        }
                    }
                }
            };
            const received = {
                "metrics": {
                    "response_time": {
                        "value": 150,
                        "unit": "ms",
                        "tags": {
                            "env": "prod",
                            "region": "us-east"
                        }
                    },
                    "error_rate": {
                        "value": 0.02,
                        "unit": "percent",
                        "tags": {
                            "env": "prod"
                        }
                    }
                }
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['metrics', 'error_rate', 'unit']);
        });
    });

    describe('Edge Cases and Corner Cases', () => {
        it('should handle empty object with wildcard in expected', () => {
            const expected = { "*": "value" };
            const received = {};
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should handle wildcard matching empty array', () => {
            const expected = { "*": [] };
            const received = { "key": [] };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should handle wildcard matching empty object', () => {
            const expected = { "*": {} };
            const received = { "key": {} };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should handle literal asterisk in received not matching wildcard key pattern', () => {
            const expected = { "id": 1 };
            const received = { "id": 1, "*": "literal" };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].type).toBe('added');
        });

        it('should handle mixed array lengths with wildcards', () => {
            const expected = { "*": [1, 2] };
            const received = { 
                "a": [1, 2],
                "b": [1, 2, 3]
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toHaveLength(1);
            expect(diffs[0].type).toBe('added');
            expect(diffs[0].path).toEqual(['b', '2']);
        });

        it('should handle null vs undefined with wildcards', () => {
            const expected = { "*": null };
            const received = { "key": null };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });

        it('should handle very long wildcard chain', () => {
            const expected = {
                "a": { "*": { "b": { "*": { "c": { "*": "value" } } } } }
            };
            const received = {
                "a": { 
                    "x": { 
                        "b": { 
                            "y": { 
                                "c": { 
                                    "z": "value" 
                                } 
                            } 
                        } 
                    } 
                }
            };
            
            const diffs = JSONDiff.compareJson(expected, received);
            
            expect(diffs).toEqual([]);
        });
    });

    describe('Normal diff behavior (no wildcards)', () => {
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

        it('should work with wildcards in strict mode', () => {
            const expected = {
                "*": {
                    "status": "active",
                    "priority": 1
                }
            };
            const received = {
                "task1": {
                    "status": "active",
                    "priority": 1,
                    "description": "Extra field"
                },
                "task2": {
                    "status": "completed",
                    "priority": 2,
                    "assignee": "John"
                }
            };
            
            const diffs = JSONDiff.compareJson(expected, received, [], true);
            
            // Should only show differences in expected keys, not added keys
            expect(diffs).toHaveLength(2);
            expect(diffs[0].path).toEqual(['task2', 'status']);
            expect(diffs[1].path).toEqual(['task2', 'priority']);
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

        it('should handle mixed scenario with wildcards and specific keys in strict mode', () => {
            const expected = {
                "id": 100,
                "*": {
                    "enabled": true
                }
            };
            const received = {
                "id": 100,
                "feature1": {
                    "enabled": true,
                    "config": "extra"
                },
                "feature2": {
                    "enabled": false,
                    "settings": "more extras"
                }
            };
            
            const diffs = JSONDiff.compareJson(expected, received, [], true);
            
            // Should only detect the enabled difference, not the extra fields
            expect(diffs).toHaveLength(1);
            expect(diffs[0].path).toEqual(['feature2', 'enabled']);
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

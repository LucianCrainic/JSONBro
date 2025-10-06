import { JSONParser } from '../json-parser';

describe('JSONParser', () => {
    describe('parseFlexible - Valid JSON (no fixes needed)', () => {
        it('should parse valid simple object without modification', () => {
            const input = '{"name": "John", "age": 30}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ name: "John", age: 30 });
        });

        it('should parse valid array without modification', () => {
            const input = '[1, 2, 3, "test"]';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual([1, 2, 3, "test"]);
        });

        it('should parse valid nested structure without modification', () => {
            const input = '{"user": {"name": "John", "roles": ["admin", "user"]}}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ user: { name: "John", roles: ["admin", "user"] } });
        });

        it('should parse valid JSON with whitespace without modification', () => {
            const input = `{
                "name": "John",
                "age": 30,
                "active": true
            }`;
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ name: "John", age: 30, active: true });
        });

        it('should parse empty object without modification', () => {
            const input = '{}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({});
        });

        it('should parse empty array without modification', () => {
            const input = '[]';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual([]);
        });

        it('should parse null without modification', () => {
            const input = 'null';
            const result = JSONParser.parseFlexible(input);
            expect(result).toBeNull();
        });

        it('should parse boolean values without modification', () => {
            expect(JSONParser.parseFlexible('true')).toBe(true);
            expect(JSONParser.parseFlexible('false')).toBe(false);
        });

        it('should parse numbers without modification', () => {
            expect(JSONParser.parseFlexible('42')).toBe(42);
            expect(JSONParser.parseFlexible('3.14')).toBe(3.14);
            expect(JSONParser.parseFlexible('-10')).toBe(-10);
        });

        it('should parse strings without modification', () => {
            const input = '"hello world"';
            const result = JSONParser.parseFlexible(input);
            expect(result).toBe("hello world");
        });
    });

    describe('parseFlexible - Single quotes (needs fixing)', () => {
        it('should convert single quotes to double quotes in simple object', () => {
            const input = "{'name': 'John'}";
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ name: "John" });
        });

        it('should convert single quotes in nested structures', () => {
            const input = "{'user': {'name': 'John', 'age': 30}}";
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ user: { name: "John", age: 30 } });
        });

        it('should handle mixed quotes', () => {
            const input = '{"name": \'John\', "age": 30}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ name: "John", age: 30 });
        });

        it('should handle single quotes in arrays', () => {
            const input = "['apple', 'banana', 'cherry']";
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual(['apple', 'banana', 'cherry']);
        });

        it('preserves escaped quotes inside strings when normalizing', () => {
            const input = "{'quote': 'He said \\'Hello\\''}";
            expect(JSONParser.parseFlexible(input)).toEqual({
                quote: "He said 'Hello'",
            });
        });
    });

    describe('parseFlexible - Unquoted property names (needs fixing)', () => {
        it('should add quotes to unquoted property names', () => {
            const input = '{name: "John", age: 30}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ name: "John", age: 30 });
        });

        it('should handle unquoted properties in nested objects', () => {
            const input = '{user: {name: "John", age: 30}}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ user: { name: "John", age: 30 } });
        });

        it('should handle properties with underscores and dollar signs', () => {
            const input = '{_private: "value", $special: "test", user_name: "John"}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ _private: "value", $special: "test", user_name: "John" });
        });
    });

    describe('parseFlexible - Python-style values (needs fixing)', () => {
        it('should convert Python True to true', () => {
            const input = '{"active": True}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ active: true });
        });

        it('should convert Python False to false', () => {
            const input = '{"active": False}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ active: false });
        });

        it('should convert Python None to null', () => {
            const input = '{"value": None}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ value: null });
        });

        it('should convert multiple Python values', () => {
            const input = '{"active": True, "deleted": False, "metadata": None}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ active: true, deleted: false, metadata: null });
        });

        it('handles mixed Python and JavaScript-style values', () => {
            const input = "{'name': 'Bob', 'active': True, 'count': None, 'valid': false}";
            expect(JSONParser.parseFlexible(input)).toEqual({
                name: 'Bob',
                active: true,
                count: null,
                valid: false,
            });
        });
    });

    describe('parseFlexible - Trailing commas (needs fixing)', () => {
        it('should remove trailing comma in object', () => {
            const input = '{"name": "John", "age": 30,}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ name: "John", age: 30 });
        });

        it('should remove trailing comma in array', () => {
            const input = '[1, 2, 3,]';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual([1, 2, 3]);
        });

        it('should remove multiple trailing commas in nested structures', () => {
            const input = '{"user": {"name": "John",}, "roles": ["admin",],}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ user: { name: "John" }, roles: ["admin"] });
        });

        it('should handle trailing comma with whitespace', () => {
            const input = '{"name": "John"  ,  }';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ name: "John" });
        });
    });

    describe('parseFlexible - Missing brackets (structural fixes)', () => {
        it('should add missing closing brace', () => {
            const input = '{"name": "John"';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ name: "John" });
        });

        it('should add missing closing bracket', () => {
            const input = '[1, 2, 3';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual([1, 2, 3]);
        });

        it('should add multiple missing closing braces', () => {
            const input = '{"user": {"name": "John"';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ user: { name: "John" } });
        });

        it('should add multiple missing closing brackets', () => {
            const input = '[[1, 2], [3, 4';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual([[1, 2], [3, 4]]);
        });

        it('should add mixed missing brackets and braces', () => {
            const input = '{"items": [1, 2, 3';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ items: [1, 2, 3] });
        });

        it('should add deeply nested missing brackets', () => {
            const input = '{"a": {"b": {"c": [1, 2';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ a: { b: { c: [1, 2] } } });
        });
    });

    describe('parseFlexible - Missing commas (structural fixes)', () => {
        it('should add missing comma between array elements', () => {
            const input = '[1 2 3]';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual([1, 2, 3]);
        });

        it('should add missing comma between string array elements', () => {
            const input = '["apple" "banana" "cherry"]';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual(["apple", "banana", "cherry"]);
        });

        it('should add missing comma between objects in array', () => {
            const input = '[{"id": 1} {"id": 2}]';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual([{ id: 1 }, { id: 2 }]);
        });

        it('should add missing comma in nested array', () => {
            const input = '{"items": [1 2 3]}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ items: [1, 2, 3] });
        });

        it('should add missing commas in deeply nested structure', () => {
            const input = '{"users": [{"name": "John" "age": 30} {"name": "Jane"}]}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ 
                users: [
                    { name: "John", age: 30 }, 
                    { name: "Jane" }
                ] 
            });
        });

        it('should add missing commas between array of arrays', () => {
            const input = '[[1, 2] [3, 4] [5, 6]]';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual([[1, 2], [3, 4], [5, 6]]);
        });

        it('should handle mixed missing commas and quotes', () => {
            const input = "[{name: 'John'} {name: 'Jane'}]";
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual([{ name: "John" }, { name: "Jane" }]);
        });

        it('should add missing comma after nested object', () => {
            const input = '{"user": {"name": "John"} "active": true}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ user: { name: "John" }, active: true });
        });

        it('should add missing comma after nested array', () => {
            const input = '{"items": [1, 2] "count": 2}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ items: [1, 2], count: 2 });
        });
    });

    describe('parseFlexible - Excess brackets (structural fixes)', () => {
        it('should remove excess closing brace', () => {
            const input = '{"name": "John"}}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ name: "John" });
        });

        it('should remove excess closing bracket', () => {
            const input = '[1, 2, 3]]';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual([1, 2, 3]);
        });

        it('should remove multiple excess closing braces', () => {
            const input = '{"user": {"name": "John"}}}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ user: { name: "John" } });
        });
    });

    describe('parseFlexible - Complex combined errors', () => {
        it('should fix single quotes, unquoted props, and trailing commas', () => {
            const input = "{name: 'John', age: 30,}";
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ name: "John", age: 30 });
        });

        it('should fix Python values, single quotes, and trailing commas', () => {
            const input = "{'active': True, 'deleted': False, 'value': None,}";
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ active: true, deleted: false, value: null });
        });

        it('should fix unquoted props, missing brackets, and trailing commas', () => {
            const input = '{users: [{name: "John",}, {name: "Jane"}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ users: [{ name: "John" }, { name: "Jane" }] });
        });

        it('should fix complex nested structure with multiple errors', () => {
            const input = `{
                users: [
                    {name: 'John', active: True,},
                    {name: 'Jane', active: False}
                ],
                metadata: None
            `;
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({
                users: [
                    { name: "John", active: true },
                    { name: "Jane", active: false }
                ],
                metadata: null
            });
        });

        it('should handle deeply nested structure with all error types', () => {
            const input = `{
                level1: {
                    level2: {
                        items: ['a', 'b',],
                        active: True,
                        config: {
                            enabled: False,
                            value: None
                        }
                    }
                }
            `;
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({
                level1: {
                    level2: {
                        items: ['a', 'b'],
                        active: true,
                        config: {
                            enabled: false,
                            value: null
                        }
                    }
                }
            });
        });
    });

    describe('parseFlexible - Edge cases', () => {
        it('should handle empty string values', () => {
            const input = '{"name": ""}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ name: "" });
        });

        it('should handle escaped characters in strings', () => {
            const input = '{"message": "Hello \\"world\\""}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ message: 'Hello "world"' });
        });

        it('should handle newlines in strings', () => {
            const input = '{"message": "line1\\nline2"}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ message: "line1\nline2" });
        });

        it('should handle unicode characters', () => {
            const input = '{"emoji": "😀", "chinese": "你好"}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ emoji: "😀", chinese: "你好" });
        });

        it('should handle large numbers', () => {
            const input = '{"bigNumber": 9007199254740991}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ bigNumber: 9007199254740991 });
        });

        it('should handle scientific notation', () => {
            const input = '{"value": 1.23e10}';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual({ value: 1.23e10 });
        });

        it('should handle arrays with mixed types', () => {
            const input = '[1, "two", true, null, {"key": "value"}]';
            const result = JSONParser.parseFlexible(input);
            expect(result).toEqual([1, "two", true, null, { key: "value" }]);
        });
    });

    describe('parseFlexible - Should throw errors for unfixable JSON', () => {
        it('should throw for completely invalid syntax', () => {
            const input = 'this is not json at all';
            expect(() => JSONParser.parseFlexible(input)).toThrow();
        });

        it('should throw for unmatched quotes inside strings', () => {
            const input = '{"name": "John}';
            expect(() => JSONParser.parseFlexible(input)).toThrow();
        });

        it('throws descriptive error when parsing invalid JSON fails twice', () => {
            const malformed = "{'name': 'Dana', 'invalid': +++}";
            expect(() => JSONParser.parseFlexible(malformed)).toThrow(SyntaxError);
        });
    });

    describe('getParseErrorMessage', () => {
        it('should suggest fixing single quotes', () => {
            const input = "{'name': 'John'}";
            const error = new Error('Unexpected token');
            const message = JSONParser.getParseErrorMessage(input, error);
            expect(message).toContain('double quotes');
            expect(message).toContain('single quotes');
        });

        it('should suggest quoting property names', () => {
            const input = '{name: "John"}';
            const error = new Error('Unexpected token');
            const message = JSONParser.getParseErrorMessage(input, error);
            expect(message).toContain('Property names should be quoted');
        });

        it('should suggest fixing Python booleans', () => {
            const input = '{"active": True}';
            const error = new Error('Unexpected token');
            const message = JSONParser.getParseErrorMessage(input, error);
            expect(message).toContain('lowercase boolean');
        });

        it('should suggest fixing None', () => {
            const input = '{"value": None}';
            const error = new Error('Unexpected token');
            const message = JSONParser.getParseErrorMessage(input, error);
            expect(message).toContain("Replace 'None' with 'null'");
        });

        it('should suggest removing trailing commas', () => {
            const input = '{"name": "John",}';
            const error = new Error('Unexpected token');
            const message = JSONParser.getParseErrorMessage(input, error);
            expect(message).toContain('trailing commas');
        });

        it('should detect mismatched braces', () => {
            const input = '{"name": "John"';
            const error = new Error('Unexpected end');
            const message = JSONParser.getParseErrorMessage(input, error);
            expect(message).toContain('Mismatched braces');
        });

        it('should detect mismatched brackets', () => {
            const input = '[1, 2, 3';
            const error = new Error('Unexpected end');
            const message = JSONParser.getParseErrorMessage(input, error);
            expect(message).toContain('Mismatched brackets');
        });

        it('suggests fixes for common mistakes', () => {
            const malformed = "{'name': Dana, trailing: true,}";
            let parseError: Error;
            try {
                JSON.parse(malformed);
            } catch (error) {
                parseError = error as Error;
            }
            const message = JSONParser.getParseErrorMessage(malformed, parseError!);
            expect(message).toContain('Invalid JSON');
            expect(message).toContain('Try using double quotes');
            expect(message).toContain('Property names should be quoted');
            expect(message).toContain('Remove trailing commas');
        });
    });
    
    describe('parseWithStatus - Determines when warnings are needed', () => {
        it('should NOT set wasStructurallyFixed for valid JSON', () => {
            const input = '{"name": "John", "age": 30}';
            const result = JSONParser.parseWithStatus(input);
            expect(result.parsed).toEqual({ name: "John", age: 30 });
            expect(result.wasStructurallyFixed).toBe(false);
        });

        it('should NOT set wasStructurallyFixed for single quote fixes', () => {
            const input = "{'name': 'John', 'age': 30}";
            const result = JSONParser.parseWithStatus(input);
            expect(result.parsed).toEqual({ name: "John", age: 30 });
            expect(result.wasStructurallyFixed).toBe(false);
        });

        it('should NOT set wasStructurallyFixed for unquoted property fixes', () => {
            const input = '{name: "John", age: 30}';
            const result = JSONParser.parseWithStatus(input);
            expect(result.parsed).toEqual({ name: "John", age: 30 });
            expect(result.wasStructurallyFixed).toBe(false);
        });

        it('should NOT set wasStructurallyFixed for Python value fixes', () => {
            const input = '{"active": True, "deleted": False, "value": None}';
            const result = JSONParser.parseWithStatus(input);
            expect(result.parsed).toEqual({ active: true, deleted: false, value: null });
            expect(result.wasStructurallyFixed).toBe(false);
        });

        it('should NOT set wasStructurallyFixed for trailing comma fixes', () => {
            const input = '{"name": "John", "age": 30,}';
            const result = JSONParser.parseWithStatus(input);
            expect(result.parsed).toEqual({ name: "John", age: 30 });
            expect(result.wasStructurallyFixed).toBe(false);
        });

        it('should NOT set wasStructurallyFixed for combined cosmetic fixes', () => {
            const input = "{name: 'John', active: True, value: None,}";
            const result = JSONParser.parseWithStatus(input);
            expect(result.parsed).toEqual({ name: "John", active: true, value: null });
            expect(result.wasStructurallyFixed).toBe(false);
        });

        it('should set wasStructurallyFixed for missing brackets', () => {
            const input = '{"name": "John"';
            const result = JSONParser.parseWithStatus(input);
            expect(result.parsed).toEqual({ name: "John" });
            expect(result.wasStructurallyFixed).toBe(true);
            expect(result.originalError).toBeDefined();
        });

        it('should set wasStructurallyFixed for excess brackets', () => {
            const input = '{"name": "John"}}';
            const result = JSONParser.parseWithStatus(input);
            expect(result.parsed).toEqual({ name: "John" });
            expect(result.wasStructurallyFixed).toBe(true);
        });

        it('should set wasStructurallyFixed for deeply nested missing brackets', () => {
            const input = '{"a": {"b": [1, 2';
            const result = JSONParser.parseWithStatus(input);
            expect(result.parsed).toEqual({ a: { b: [1, 2] } });
            expect(result.wasStructurallyFixed).toBe(true);
        });

        it('should NOT set wasStructurallyFixed for cosmetic fixes even with nested data', () => {
            const input = "{'user': {'name': 'John', 'roles': ['admin', 'user',]}}";
            const result = JSONParser.parseWithStatus(input);
            expect(result.parsed).toEqual({ user: { name: "John", roles: ["admin", "user"] } });
            expect(result.wasStructurallyFixed).toBe(false);
        });

        it('should set wasStructurallyFixed for missing commas', () => {
            const input = '["apple" "banana"]';
            const result = JSONParser.parseWithStatus(input);
            expect(result.parsed).toEqual(["apple", "banana"]);
            expect(result.wasStructurallyFixed).toBe(true);
        });

        it('should set wasStructurallyFixed for missing commas in objects', () => {
            const input = '[{"id": 1} {"id": 2}]';
            const result = JSONParser.parseWithStatus(input);
            expect(result.parsed).toEqual([{ id: 1 }, { id: 2 }]);
            expect(result.wasStructurallyFixed).toBe(true);
        });

        it('should set wasStructurallyFixed for combined structural issues', () => {
            const input = '{"items": [1 2 3';
            const result = JSONParser.parseWithStatus(input);
            expect(result.parsed).toEqual({ items: [1, 2, 3] });
            expect(result.wasStructurallyFixed).toBe(true);
        });
    });
});

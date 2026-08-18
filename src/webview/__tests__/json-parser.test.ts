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

    /*
     * Input that cannot be made sense of no longer throws. The parser recovers
     * as far as it can and reports what it did, so the panel can still show
     * something and say why it looks the way it does.
     */
    describe('parseFlexible - Unfixable input still yields a document', () => {
        it('reads bare prose as a string rather than throwing', () => {
            expect(JSONParser.parseFlexible('this is not json at all')).toBe('this');
        });

        it('closes a string that was never closed', () => {
            expect(JSONParser.parseFlexible('{"name": "John}')).toEqual({ name: 'John}' });
        });

        it('recovers from a run of stray punctuation', () => {
            const parsed = JSONParser.parseFlexible("{'name': 'Dana', 'invalid': +++}");
            expect(parsed).toEqual({ name: 'Dana', invalid: null });
        });

        it('returns null for an empty document', () => {
            expect(JSONParser.parseFlexible('')).toBeNull();
            expect(JSONParser.parseFlexible('   \n  ')).toBeNull();
        });
    });

    /*
     * The repair passes this replaced ran regular expressions over the whole
     * document, so they rewrote the insides of strings as readily as the
     * syntax around them. These are the exact inputs that used to be
     * corrupted; the values must come through untouched.
     */
    describe('parseFlexible - String contents are never rewritten', () => {
        it('leaves Python-looking words inside a string alone', () => {
            const parsed = JSONParser.parseFlexible(`{'note': "True story about None"}`);
            expect(parsed).toEqual({ note: 'True story about None' });
        });

        it('leaves a colon inside a string alone', () => {
            expect(JSONParser.parseFlexible('{a: "x, b: 1"}')).toEqual({ a: 'x, b: 1' });
        });

        it('leaves a comma before a bracket inside a string alone', () => {
            expect(JSONParser.parseFlexible('{a: "ends with , ]"}')).toEqual({
                a: 'ends with , ]'
            });
        });

        it('keeps braces and quotes that live inside string values', () => {
            const parsed = JSONParser.parseFlexible(`{key: '{"nested": "json"}'}`);
            expect(parsed).toEqual({ key: '{"nested": "json"}' });
        });

        it('keeps a lone apostrophe in a double-quoted string', () => {
            expect(JSONParser.parseFlexible(`{"t": "it's fine",}`)).toEqual({ t: "it's fine" });
        });
    });

    /*
     * JSON copied out of a string literal -- a log line, a database column, a
     * Java or Kotlin source file -- arrives with every quote escaped. The whole
     * document reads as a quoted string body, so the parser decodes it before
     * doing anything else. A document that already parses is left alone even
     * when it contains backslashes: `{"r": "\\\""}` and its escaped form both
     * parse, and they mean different things.
     */
    describe('parseFlexible - Backslash-escaped quotes', () => {
        it('unescapes a document whose quotes are all escaped', () => {
            const escaped = '{\\"id\\":112,\\"name\\":\\"F16-T101\\",\\"cloned\\":false}';
            expect(JSONParser.parseFlexible(escaped)).toEqual({
                id: 112,
                name: 'F16-T101',
                cloned: false
            });
        });

        it('unescapes nested containers and array items', () => {
            const escaped =
                '[{\\"a\\":1},{\\"b\\":[\\"x\\",\\"y\\"]}]';
            expect(JSONParser.parseFlexible(escaped)).toEqual([
                { a: 1 },
                { b: ['x', 'y'] }
            ]);
        });

        it('decodes the escapes a string value itself used', () => {
            const escaped = '{\\"note\\":\\"He said \\\\\\"hi\\\\\\"\\"}';
            expect(JSONParser.parseFlexible(escaped)).toEqual({
                note: 'He said "hi"'
            });
        });

        it('decodes a backslash in a value to the JSON escape it was hiding', () => {
            const escaped = '{\\"path\\":\\"C:\\\\\\\\temp\\"}';
            expect(JSONParser.parseFlexible(escaped)).toEqual({
                path: 'C:\\temp'
            });
        });

        it('leaves valid JSON alone, even with backslashes in it', () => {
            expect(JSONParser.parseFlexible('{"r": "\\\\\\""}')).toEqual({ r: '\\"' });
            expect(JSONParser.parseFlexible('{"a": "x\\"y"}')).toEqual({ a: 'x"y' });
        });

        it('does not touch a document whose unescaped form is not JSON', () => {
            const result = JSONParser.parseWithStatus('{"a": \\"x\\", broken');
            expect(result.parsed).toBeDefined();
            expect(result.diagnostics.map(d => d.kind)).not.toContain('escaped-quotes');
        });

        it('reports the unescaping as a cosmetic repair', () => {
            const status = JSONParser.parseWithStatus('{\\"a\\":1}');
            expect(status.diagnostics.map(d => d.kind)).toContain('escaped-quotes');
            expect(status.wasStructurallyFixed).toBe(false);
        });
    });

    /*
     * Repairs used to run as separate sequential passes, so a document with
     * two different problems could fail even though each one alone was
     * handled. Recovering inside a single parse fixes that.
     */
    describe('parseFlexible - Combined problems in one document', () => {
        it('handles a trailing comma and a missing brace together', () => {
            expect(JSONParser.parseFlexible('{"a": 1,')).toEqual({ a: 1 });
        });

        it('handles a missing comma and a missing bracket together', () => {
            expect(JSONParser.parseFlexible('[1 2 3')).toEqual([1, 2, 3]);
        });

        it('handles a missing colon', () => {
            expect(JSONParser.parseFlexible('{"a" 1}')).toEqual({ a: 1 });
        });

        it('fills in a property that has no value', () => {
            expect(JSONParser.parseFlexible('{"a": }')).toEqual({ a: null });
        });

        it('strips comments', () => {
            const input = `{
                // the name
                "a": 1, /* inline */ "b": 2
            }`;
            expect(JSONParser.parseFlexible(input)).toEqual({ a: 1, b: 2 });
        });
    });

    describe('diagnostics', () => {
        const kinds = (input: string) =>
            JSONParser.parseWithStatus(input).diagnostics.map(d => d.kind);

        it('names each repair', () => {
            expect(kinds("{'a': 1}")).toContain('single-quotes');
            expect(kinds('{a: 1}')).toContain('unquoted-key');
            expect(kinds('{"a": True}')).toContain('python-literal');
            expect(kinds('["a" "b"]')).toContain('missing-comma');
            expect(kinds('{"a": 1')).toContain('unclosed-container');
            expect(kinds('{"a" 1}')).toContain('missing-colon');
            expect(kinds('{"a": "x}')).toContain('unterminated-string');
            expect(kinds('// hi\n{}')).toContain('comment');
        });

        it('says nothing about JSON that needs no repair', () => {
            expect(kinds('{"a": [1, 2], "b": null}')).toEqual([]);
        });

        it('points at the line the problem is on', () => {
            const input = '{\n  "a": 1\n  "b": 2\n}';
            const missing = JSONParser.parseWithStatus(input).diagnostics.find(
                d => d.kind === 'missing-comma'
            );

            expect(missing?.line).toBe(3);
        });

        it('reports repairs in the order they appear in the source', () => {
            const { diagnostics } = JSONParser.parseWithStatus("{a: 1, 'b': True,}");
            const offsets = diagnostics.map(d => d.offset);

            expect(offsets).toEqual([...offsets].sort((x, y) => x - y));
            expect(diagnostics.length).toBeGreaterThan(1);
        });

        it('flags a duplicate property without dropping the later value', () => {
            const { parsed, diagnostics } = JSONParser.parseWithStatus('{"a": 1, "a": 2}');

            expect(parsed).toEqual({ a: 2 });
            expect(diagnostics.map(d => d.kind)).toContain('duplicate-key');
        });

        it('separates cosmetic repairs from structural ones', () => {
            expect(JSONParser.parseWithStatus("{'a': 1}").wasStructurallyFixed).toBe(false);
            expect(JSONParser.parseWithStatus('{"a": 1').wasStructurallyFixed).toBe(true);
        });
    });

    describe('getParseErrorMessage', () => {
        it('lists what was repaired, with line numbers', () => {
            const message = JSONParser.getParseErrorMessage('{\n  "a": 1\n  "b": 2');

            expect(message).toContain('Line 3');
            expect(message).toContain('comma');
        });

        it('falls back to the underlying error when nothing was repaired', () => {
            const message = JSONParser.getParseErrorMessage('{"a": 1}', new Error('boom'));

            expect(message).toContain('boom');
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

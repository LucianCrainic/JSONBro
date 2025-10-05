import { JSONParser } from '../json-parser';

describe('JSONParser.parseFlexible', () => {
    it('parses standard JSON strings', () => {
        const input = '{"name":"Alice","age":30,"isMember":true}';
        expect(JSONParser.parseFlexible(input)).toEqual({
            name: 'Alice',
            age: 30,
            isMember: true,
        });
    });

    it('parses JSON with single quotes for strings and property names', () => {
        const input = "{'name': 'Bob', 'city': 'Paris'}";
        expect(JSONParser.parseFlexible(input)).toEqual({
            name: 'Bob',
            city: 'Paris',
        });
    });

    it('parses JSON with unquoted property names', () => {
        const input = '{name: "Charlie", age: 25}';
        expect(JSONParser.parseFlexible(input)).toEqual({
            name: 'Charlie',
            age: 25,
        });
    });

    it('preserves escaped quotes inside strings when normalizing', () => {
        const input = "{'quote': 'He said \\'Hello\\''}";
        const normalized = (JSONParser as any).normalizeJsonString(input);
        expect(normalized).toBe('{"quote": "He said \'Hello\'"}');
        expect(JSONParser.parseFlexible(input)).toEqual({
            quote: "He said 'Hello'",
        });
    });

    it('throws descriptive error when parsing invalid JSON fails twice', () => {
        const malformed = "{'name': 'Dana', 'invalid': +++}";
        expect(() => JSONParser.parseFlexible(malformed)).toThrow(SyntaxError);
    });

    it('parses JSON with Python-style booleans and None', () => {
        const input = '{"flag": True, "enabled": False, "value": None}';
        expect(JSONParser.parseFlexible(input)).toEqual({
            flag: true,
            enabled: false,
            value: null,
        });
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

    it('removes trailing commas', () => {
        const input = '{"name": "Alice", "age": 30,}';
        expect(JSONParser.parseFlexible(input)).toEqual({
            name: 'Alice',
            age: 30,
        });
    });
});

describe('JSONParser.getParseErrorMessage', () => {
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

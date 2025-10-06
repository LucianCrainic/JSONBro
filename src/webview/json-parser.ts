/**
 * Enhanced JSON parsing utilities that handle various JSON-like formats
 */
export class JSONParser {
    /**
     * Attempts to parse JSON with support for single quotes and other common variations
     * Returns the parsed result and whether structural (not cosmetic) fixes were needed
     */
    static parseFlexible(input: string): any {
        // First, try standard JSON parsing
        try {
            return JSON.parse(input);
        } catch (error) {
            // If that fails, try to fix common issues and parse again
            const normalizedInput = this.normalizeJsonString(input);
            try {
                return JSON.parse(normalizedInput);
            } catch (normalizedError) {
                // Try to fix structural issues like missing brackets
                const fixedInput = this.fixStructuralIssues(normalizedInput);
                return JSON.parse(fixedInput);
            }
        }
    }
    
    /**
     * Attempts to parse JSON and returns both the result and whether structural fixes were needed
     * Cosmetic fixes (quotes, trailing commas, Python syntax) don't count as "fixes" for warning purposes
     */
    static parseWithStatus(input: string): { parsed: any; wasStructurallyFixed: boolean; originalError?: string } {
        // First, try standard JSON parsing
        try {
            const parsed = JSON.parse(input);
            return { parsed, wasStructurallyFixed: false };
        } catch (standardError) {
            // Try cosmetic fixes (quotes, trailing commas, Python syntax)
            const normalizedInput = this.normalizeJsonString(input);
            try {
                const parsed = JSON.parse(normalizedInput);
                // Cosmetic fix succeeded - no warning needed
                return { parsed, wasStructurallyFixed: false };
            } catch (normalizedError) {
                // Cosmetic fixes didn't work, try structural fixes
                try {
                    const fixedInput = this.fixStructuralIssues(normalizedInput);
                    const parsed = JSON.parse(fixedInput);
                    const originalError = standardError instanceof Error ? standardError.message : 'Unknown error';
                    // Structural fix was needed - show warning
                    return { parsed, wasStructurallyFixed: true, originalError };
                } catch (structuralError) {
                    // All fixes failed, throw the original error
                    throw standardError;
                }
            }
        }
    }

    /**
     * Attempts to fix structural issues like missing brackets and commas
     */
    private static fixStructuralIssues(input: string): string {
        let result = input.trim();
        
        // First pass: Fix missing commas between elements
        result = this.addMissingCommas(result);
        
        // Second pass: Fix bracket/brace mismatches
        result = this.fixBracketMismatches(result);
        
        return result;
    }
    
    /**
     * Adds missing commas between array elements and object properties
     */
    private static addMissingCommas(input: string): string {
        let result = '';
        let inString = false;
        let escaped = false;
        let i = 0;
        
        while (i < input.length) {
            const char = input[i];
            
            if (escaped) {
                result += char;
                escaped = false;
                i++;
                continue;
            }
            
            if (char === '\\') {
                result += char;
                escaped = true;
                i++;
                continue;
            }
            
            if (char === '"' && !escaped) {
                inString = !inString;
                result += char;
                
                // If we just closed a string, check if we need a comma
                if (!inString) {
                    const nextInfo = this.getNextNonWhitespace(input, i + 1);
                    if (nextInfo) {
                        // Need comma if next non-whitespace is: ", {, [, or digit/letter (start of value)
                        if (nextInfo.char === '"' || nextInfo.char === '{' || nextInfo.char === '[' ||
                            /[0-9a-zA-Z\-]/.test(nextInfo.char)) {
                            // Check what came before to determine context
                            const prevInfo = this.getPrevNonWhitespace(result, result.length - 2);
                            // Add comma if we're after a value and before another value
                            // (not after : or [ or {)
                            if (prevInfo && prevInfo.char !== ':' && prevInfo.char !== '[' && 
                                prevInfo.char !== '{' && prevInfo.char !== ',') {
                                result += ',';
                            }
                        }
                    }
                }
                i++;
                continue;
            }
            
            if (!inString) {
                // Handle closing brackets/braces - may need comma after
                if (char === '}' || char === ']') {
                    result += char;
                    const nextInfo = this.getNextNonWhitespace(input, i + 1);
                    if (nextInfo) {
                        // Need comma before next value
                        if (nextInfo.char === '"' || nextInfo.char === '{' || nextInfo.char === '[' ||
                            /[0-9\-]/.test(nextInfo.char)) {
                            const prevInfo = this.getPrevNonWhitespace(result, result.length - 2);
                            if (prevInfo && prevInfo.char !== '[' && prevInfo.char !== '{' && 
                                prevInfo.char !== ':' && prevInfo.char !== ',') {
                                result += ',';
                            }
                        }
                    }
                    i++;
                    continue;
                }
                
                // Handle numbers and other primitives
                if (/[0-9\-]/.test(char) || (char === 't' && input.substring(i, i + 4) === 'true') ||
                    (char === 'f' && input.substring(i, i + 5) === 'false') ||
                    (char === 'n' && input.substring(i, i + 4) === 'null')) {
                    
                    // Find the end of this value
                    let valueEnd = i;
                    if (char === 't' || char === 'f' || char === 'n') {
                        // Boolean or null
                        if (char === 't') valueEnd = i + 4;
                        else if (char === 'f') valueEnd = i + 5;
                        else valueEnd = i + 4;
                        result += input.substring(i, valueEnd);
                    } else {
                        // Number
                        while (valueEnd < input.length && /[0-9.\-eE+]/.test(input[valueEnd])) {
                            valueEnd++;
                        }
                        result += input.substring(i, valueEnd);
                    }
                    
                    // Check if we need a comma after this value
                    const nextInfo = this.getNextNonWhitespace(input, valueEnd);
                    if (nextInfo) {
                        if (nextInfo.char === '"' || nextInfo.char === '{' || nextInfo.char === '[' ||
                            /[0-9\-ttnf]/.test(nextInfo.char)) {
                            result += ',';
                        }
                    }
                    
                    i = valueEnd;
                    continue;
                }
                
                result += char;
            } else {
                result += char;
            }
            
            i++;
        }
        
        return result;
    }
    
    /**
     * Helper to get next non-whitespace character
     */
    private static getNextNonWhitespace(str: string, start: number): { char: string; index: number } | null {
        for (let i = start; i < str.length; i++) {
            if (!/\s/.test(str[i])) {
                return { char: str[i], index: i };
            }
        }
        return null;
    }
    
    /**
     * Helper to get previous non-whitespace character
     */
    private static getPrevNonWhitespace(str: string, start: number): { char: string; index: number } | null {
        for (let i = start; i >= 0; i--) {
            if (!/\s/.test(str[i])) {
                return { char: str[i], index: i };
            }
        }
        return null;
    }
    
    /**
     * Fixes bracket and brace mismatches
     */
    private static fixBracketMismatches(input: string): string {
        let result = input;
        
        // Track the bracket/brace stack to determine proper order
        const stack: string[] = [];
        let inString = false;
        let escaped = false;
        
        // Parse through to find what's opened and not closed
        for (let i = 0; i < result.length; i++) {
            const char = result[i];
            
            if (escaped) {
                escaped = false;
                continue;
            }
            
            if (char === '\\') {
                escaped = true;
                continue;
            }
            
            if (char === '"' && !escaped) {
                inString = !inString;
                continue;
            }
            
            if (!inString) {
                if (char === '{') {
                    stack.push('}');
                } else if (char === '[') {
                    stack.push(']');
                } else if (char === '}') {
                    if (stack.length > 0 && stack[stack.length - 1] === '}') {
                        stack.pop();
                    } else {
                        // Excess closing brace - mark for removal
                        result = result.substring(0, i) + result.substring(i + 1);
                        i--;
                    }
                } else if (char === ']') {
                    if (stack.length > 0 && stack[stack.length - 1] === ']') {
                        stack.pop();
                    } else {
                        // Excess closing bracket - mark for removal
                        result = result.substring(0, i) + result.substring(i + 1);
                        i--;
                    }
                }
            }
        }
        
        // Add missing closing brackets/braces in the correct order (LIFO)
        while (stack.length > 0) {
            const closing = stack.pop();
            result += '\n' + closing;
        }
        
        return result;
    }

    /**
     * Normalizes a JSON-like string to valid JSON format
     */
    private static normalizeJsonString(input: string): string {
        let result = input.trim();
        
        // Convert single quotes to double quotes for property names and string values
        // This is a simplified approach that handles most common cases
        result = this.convertSingleQuotesToDouble(result);
        
        // Handle unquoted property names (common in JavaScript object notation)
        result = this.addQuotesToPropertyNames(result);
        
        // Convert Python-style booleans and None to JSON equivalents
        result = this.convertPythonValues(result);
        
        // Remove trailing commas
        result = this.removeTrailingCommas(result);
        
        return result;
    }

    /**
     * Converts single quotes to double quotes while preserving quotes inside strings
     */
    private static convertSingleQuotesToDouble(input: string): string {
        let result = '';
        let inDoubleQuotes = false;
        let inSingleQuotes = false;
        let escaped = false;

        for (let i = 0; i < input.length; i++) {
            const char = input[i];
            const nextChar = i + 1 < input.length ? input[i + 1] : '';

            if (escaped) {
                result += char;
                escaped = false;
                continue;
            }

            if (char === '\\') {
                if (inSingleQuotes && nextChar === "'") {
                    // Unescape single quotes inside single-quoted strings
                    result += "'";
                    i++; // Skip the next quote character
                    continue;
                }
                escaped = true;
                result += char;
                continue;
            }

            if (char === '"' && !inSingleQuotes) {
                inDoubleQuotes = !inDoubleQuotes;
                result += char;
            } else if (char === "'" && !inDoubleQuotes) {
                if (!inSingleQuotes) {
                    // Starting a single-quoted string, convert to double quote
                    inSingleQuotes = true;
                    result += '"';
                } else {
                    // Ending a single-quoted string, convert to double quote
                    inSingleQuotes = false;
                    result += '"';
                }
            } else {
                result += char;
            }
        }

        return result;
    }

    /**
     * Adds quotes to unquoted property names
     */
    private static addQuotesToPropertyNames(input: string): string {
        // This regex matches unquoted property names in object notation
        // It looks for word characters followed by a colon, not already in quotes
        return input.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
    }

    /**
     * Converts Python-style values to JSON equivalents
     */
    private static convertPythonValues(input: string): string {
        let result = input;
        
        // Convert Python booleans to lowercase (but not inside strings)
        result = result.replace(/\bTrue\b/g, 'true');
        result = result.replace(/\bFalse\b/g, 'false');
        
        // Convert Python None to null
        result = result.replace(/\bNone\b/g, 'null');
        
        return result;
    }

    /**
     * Removes trailing commas before closing brackets
     */
    private static removeTrailingCommas(input: string): string {
        // Remove trailing commas before closing braces or brackets
        return input.replace(/,(\s*[}\]])/g, '$1');
    }

    /**
     * Gets a descriptive error message for JSON parsing failures
     */
    static getParseErrorMessage(input: string, originalError: Error): string {
        const suggestions: string[] = [];
        
        // Check for common issues
        if (input.includes("'")) {
            suggestions.push("Try using double quotes (\") instead of single quotes (')");
        }
        
        if (/[{,]\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*:/.test(input)) {
            suggestions.push("Property names should be quoted (e.g., \"propertyName\": value)");
        }
        
        if (input.includes('True') || input.includes('False')) {
            suggestions.push("Use lowercase boolean values: 'true' and 'false' instead of 'True' and 'False'");
        }
        
        if (input.includes('None')) {
            suggestions.push("Replace 'None' with 'null'");
        }
        
        if (input.includes('undefined')) {
            suggestions.push("Replace 'undefined' with 'null' or remove the property");
        }
        
        if (/,\s*[}\]]/.test(input)) {
            suggestions.push("Remove trailing commas before closing brackets");
        }
        
        // Check for bracket mismatches
        const openBraces = (input.match(/\{/g) || []).length;
        const closeBraces = (input.match(/\}/g) || []).length;
        const openBrackets = (input.match(/\[/g) || []).length;
        const closeBrackets = (input.match(/\]/g) || []).length;
        
        if (openBraces !== closeBraces) {
            suggestions.push(`Mismatched braces: ${openBraces} opening '{' but ${closeBraces} closing '}'`);
        }
        
        if (openBrackets !== closeBrackets) {
            suggestions.push(`Mismatched brackets: ${openBrackets} opening '[' but ${closeBrackets} closing ']'`);
        }

        let message = `Invalid JSON: ${originalError.message}`;
        
        if (suggestions.length > 0) {
            message += '\n\nSuggestions:\n• ' + suggestions.join('\n• ');
        }
        
        return message;
    }
}

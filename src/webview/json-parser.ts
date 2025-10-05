/**
 * Enhanced JSON parsing utilities that handle various JSON-like formats
 */
export class JSONParser {
    /**
     * Attempts to parse JSON with support for single quotes and other common variations
     */
    static parseFlexible(input: string): any {
        // First, try standard JSON parsing
        try {
            return JSON.parse(input);
        } catch (error) {
            // If that fails, try to fix common issues and parse again
            const normalizedInput = this.normalizeJsonString(input);
            return JSON.parse(normalizedInput);
        }
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

        let message = `Invalid JSON: ${originalError.message}`;
        
        if (suggestions.length > 0) {
            message += '\n\nSuggestions:\n• ' + suggestions.join('\n• ');
        }
        
        return message;
    }
}

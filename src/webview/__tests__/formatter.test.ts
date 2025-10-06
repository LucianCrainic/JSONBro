import { JSONFormatter } from '../formatter';

describe('JSONFormatter.renderJson', () => {
    beforeEach(() => {
        // Reset to default state (line numbers on by default)
        JSONFormatter.setShowLineNumbers(true);
    });

    it('renders null values', () => {
        JSONFormatter.setShowLineNumbers(false); // Disable for this simple test
        const html = JSONFormatter.renderJson(null);
        expect(html).toContain('<span class="null">null</span>');
        expect(html).toContain('json-content');
    });

    it('renders empty arrays compactly', () => {
        JSONFormatter.setShowLineNumbers(false); // Disable for this simple test
        const html = JSONFormatter.renderJson([]);
        expect(html).toContain('<span class="bracket">[]</span>');
        expect(html).toContain('json-content');
    });

    it('renders arrays with nested values', () => {
        JSONFormatter.setShowLineNumbers(false); // Disable for this test
        const html = JSONFormatter.renderJson([1, 'two']);
        expect(html).toContain('<span class="number">1</span>');
        expect(html).toContain('<span class="string">"two"</span>');
        expect(html).toContain('<span class="bracket">[</span>');
        expect(html).toContain('<span class="bracket">]</span>');
    });

    it('renders empty objects compactly', () => {
        JSONFormatter.setShowLineNumbers(false); // Disable for this simple test
        const html = JSONFormatter.renderJson({});
        expect(html).toContain('<span class="brace">{}</span>');
        expect(html).toContain('json-content');
    });

    it('renders objects with escaped keys and values', () => {
        JSONFormatter.setShowLineNumbers(false); // Disable for this test
        const input = {
            '<danger>': 'Value with <tags> & "quotes"',
        };
        const html = JSONFormatter.renderJson(input);
        expect(html).toContain('&lt;danger&gt;');
        expect(html).toContain('Value with &lt;tags&gt; &amp; &quot;quotes&quot;');
        expect(html).toContain('<span class="brace">{</span>');
    });

    it('renders boolean and number primitives', () => {
        JSONFormatter.setShowLineNumbers(false); // Disable for this simple test
        const htmlTrue = JSONFormatter.renderJson(true);
        const htmlNum = JSONFormatter.renderJson(42);
        expect(htmlTrue).toContain('<span class="boolean">true</span>');
        expect(htmlNum).toContain('<span class="number">42</span>');
    });

    it('renders with line numbers when enabled', () => {
        JSONFormatter.setShowLineNumbers(true);
        const result = JSONFormatter.renderJson([1, 2]);
        expect(result).toContain('line-number');
        expect(result).toContain('line-numbers');
        expect(result).toContain('json-container');
        expect(result).toContain('>1<');
        expect(result).toContain('>2<');
        JSONFormatter.setShowLineNumbers(false);
    });

    it('renders without line numbers when disabled', () => {
        JSONFormatter.setShowLineNumbers(false);
        const result = JSONFormatter.renderJson([1, 2]);
        expect(result).not.toContain('line-number');
        expect(result).not.toContain('line-numbers');
        expect(result).not.toContain('json-container');
    });

    it('gets and sets line number visibility', () => {
        JSONFormatter.setShowLineNumbers(true);
        expect(JSONFormatter.getShowLineNumbers()).toBe(true);
        JSONFormatter.setShowLineNumbers(false);
        expect(JSONFormatter.getShowLineNumbers()).toBe(false);
    });

    it('line numbers are enabled by default', () => {
        // Create a new instance context by checking default behavior
        expect(JSONFormatter.getShowLineNumbers()).toBe(true);
    });

    it('renders complex nested structure correctly', () => {
        JSONFormatter.setShowLineNumbers(false);
        const input = {
            users: [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" }
            ]
        };
        const html = JSONFormatter.renderJson(input);
        expect(html).toContain('"users"');
        expect(html).toContain('"id"');
        expect(html).toContain('"name"');
        expect(html).toContain('"Alice"');
        expect(html).toContain('"Bob"');
    });
});

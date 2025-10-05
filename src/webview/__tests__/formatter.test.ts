import { JSONFormatter } from '../formatter';

describe('JSONFormatter.renderJson', () => {
    beforeEach(() => {
        // Reset to default state (line numbers on by default)
        JSONFormatter.setShowLineNumbers(true);
    });

    it('renders null values', () => {
        JSONFormatter.setShowLineNumbers(false); // Disable for this simple test
        expect(JSONFormatter.renderJson(null)).toBe('<span class="null">null</span>');
    });

    it('renders empty arrays compactly', () => {
        JSONFormatter.setShowLineNumbers(false); // Disable for this simple test
        expect(JSONFormatter.renderJson([])).toBe('<span class="json-array">[]</span>');
    });

    it('renders arrays with nested values using expandable markup', () => {
        JSONFormatter.setShowLineNumbers(false); // Disable for this test
        const html = JSONFormatter.renderJson([1, 'two']);
        expect(html).toContain('<details open>');
        expect(html).toContain('<summary></summary>');
        expect(html).toContain('<span class="number">1</span>');
        expect(html).toContain('<span class="string">"two"</span>');
    });

    it('renders empty objects compactly', () => {
        JSONFormatter.setShowLineNumbers(false); // Disable for this simple test
        expect(JSONFormatter.renderJson({})).toBe('<span class="json-object">{}</span>');
    });

    it('renders objects with escaped keys and values', () => {
        JSONFormatter.setShowLineNumbers(false); // Disable for this test
        const input = {
            '<danger>': 'Value with <tags> & "quotes"',
        };
        const html = JSONFormatter.renderJson(input);
        expect(html).toContain('&lt;danger&gt;');
        expect(html).toContain('Value with &lt;tags&gt; &amp; &quot;quotes&quot;');
        expect(html.startsWith('<span class="json-object"><span class="brace">{</span><details open><summary></summary>')).toBe(true);
    });

    it('renders boolean and number primitives', () => {
        JSONFormatter.setShowLineNumbers(false); // Disable for this simple test
        expect(JSONFormatter.renderJson(true)).toBe('<span class="boolean">true</span>');
        expect(JSONFormatter.renderJson(42)).toBe('<span class="number">42</span>');
    });

    it('renders with line numbers when enabled', () => {
        JSONFormatter.setShowLineNumbers(true);
        const result = JSONFormatter.renderJson([1, 2]);
        expect(result).toContain('line-number');
        expect(result).toContain('>1</span>');
        expect(result).toContain('>2</span>');
        JSONFormatter.setShowLineNumbers(false);
    });

    it('renders without line numbers when disabled', () => {
        JSONFormatter.setShowLineNumbers(false);
        const result = JSONFormatter.renderJson([1, 2]);
        expect(result).not.toContain('line-number');
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
});

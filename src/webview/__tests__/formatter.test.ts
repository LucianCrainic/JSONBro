import { JSONFormatter } from '../formatter';

describe('JSONFormatter.renderJson', () => {
    it('renders null values', () => {
        expect(JSONFormatter.renderJson(null)).toBe('<span class="null">null</span>');
    });

    it('renders empty arrays compactly', () => {
        expect(JSONFormatter.renderJson([])).toBe('[ ]');
    });

    it('renders arrays with nested values using expandable markup', () => {
        const html = JSONFormatter.renderJson([1, 'two']);
        expect(html).toContain('<details open>');
        expect(html).toContain('<summary>[...]</summary>');
        expect(html).toContain('<span class="number">1</span>');
        expect(html).toContain('<span class="string">"two"</span>');
    });

    it('renders empty objects compactly', () => {
        expect(JSONFormatter.renderJson({})).toBe('{ }');
    });

    it('renders objects with escaped keys and values', () => {
        const input = {
            '<danger>': 'Value with <tags> & "quotes"',
        };
        const html = JSONFormatter.renderJson(input);
        expect(html).toContain('&lt;danger&gt;');
        expect(html).toContain('Value with &lt;tags&gt; &amp; &quot;quotes&quot;');
        expect(html.startsWith('<details open><summary>{...}</summary>')).toBe(true);
    });

    it('renders boolean and number primitives', () => {
        expect(JSONFormatter.renderJson(true)).toBe('<span class="boolean">true</span>');
        expect(JSONFormatter.renderJson(42)).toBe('<span class="number">42</span>');
    });
});

import { FormatView } from '../../views/format-view';
import { Messenger } from '../../ui/messaging';
import { mountPanel } from './helpers/fixture';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

function rows(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('.problems__row'));
}

function format(json: string): void {
    el<HTMLTextAreaElement>('input').value = json;
}

describe('problems list', () => {
    let view: FormatView;

    beforeEach(() => {
        mountPanel('format');
        view = new FormatView(new Messenger());
    });

    afterEach(() => {
        view.dispose();
    });

    it('stays hidden when nothing needed repairing', () => {
        format('{"a": 1}');
        view.format();

        expect(el('problems').hidden).toBe(true);
    });

    it('lists one row per repair, with a position', () => {
        format('{\n  a: 1\n  "b": True\n}');
        view.format();

        expect(el('problems').hidden).toBe(false);

        const listed = rows();
        expect(listed.length).toBeGreaterThanOrEqual(3);
        expect(listed[0].textContent).toContain('Line 2');
    });

    it('starts collapsed and opens on click', () => {
        format("{'a': 1}");
        view.format();

        expect(el('problems-list').hidden).toBe(true);
        expect(el('problems-toggle').getAttribute('aria-expanded')).toBe('false');

        el('problems-toggle').click();

        expect(el('problems-list').hidden).toBe(false);
        expect(el('problems-toggle').getAttribute('aria-expanded')).toBe('true');
    });

    /*
     * Rewriting quotes changes how the document is spelled, not what it says,
     * so it should not be announced with the same weight as a missing brace.
     */
    it('separates cosmetic changes from real problems', () => {
        format("{'a': 1}");
        view.format();
        expect(el('problems').dataset.severity).toBe('info');
        expect(el('problems-title').textContent).toContain('change');

        format('{"a": 1');
        view.format();
        expect(el('problems').dataset.severity).toBe('warning');
        expect(el('problems-title').textContent).toContain('repaired');
    });

    it('moves the caret to the offending line when a row is chosen', () => {
        format('{\n  "a": 1\n  "b": 2\n}');
        view.format();
        el('problems-toggle').click();

        const missingComma = rows().find(row => row.textContent?.includes('comma'));
        missingComma?.querySelector<HTMLElement>('.problems__link')?.click();

        const input = el<HTMLTextAreaElement>('input');
        // Line 3 begins after `{\n  "a": 1\n`.
        expect(input.selectionStart).toBe('{\n  "a": 1\n'.length);
    });

    it('clears when the input is emptied', () => {
        format("{'a': 1}");
        view.format();
        expect(el('problems').hidden).toBe(false);

        format('');
        view.format();
        expect(el('problems').hidden).toBe(true);
    });

    it('clears when the view is cleared', () => {
        format("{'a': 1}");
        view.format();

        view.clear();

        expect(el('problems').hidden).toBe(true);
    });
});

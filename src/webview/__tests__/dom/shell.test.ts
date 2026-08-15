import { Shell } from '../../shell';
import { mountPanel } from './helpers/fixture';

function start(mode: 'format' | 'diff'): Shell {
    mountPanel(mode);
    const shell = new Shell();
    shell.start();
    return shell;
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

function type(id: string, value: string): void {
    const field = el<HTMLTextAreaElement>(id);
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
}

function statusText(side: 'left' | 'right'): string {
    return el(`status-${side}`).textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('Shell', () => {
    /*
     * The host renders <body data-mode="diff"> for the Diff command. Reading
     * the wrong attribute here silently opened every panel in Format mode.
     */
    it.each(['format', 'diff'] as const)('adopts the initial mode from the body (%s)', mode => {
        start(mode);

        expect(document.body.dataset.mode).toBe(mode);
        expect(el('format-mode').classList.contains('active')).toBe(mode === 'format');
        expect(el('diff-mode').classList.contains('active')).toBe(mode === 'diff');
        expect(el('format-mode').getAttribute('aria-selected')).toBe(String(mode === 'format'));
    });

    it('labels the primary action for the active mode', () => {
        start('format');
        expect(el('action-text').textContent).toBe('Format');

        start('diff');
        expect(el('action-text').textContent).toBe('Compare');
    });

    it('switches mode from the toolbar', () => {
        start('format');
        el('diff-mode').click();

        expect(document.body.dataset.mode).toBe('diff');
        expect(el('diff-mode').classList.contains('active')).toBe(true);
        expect(el('format-mode').classList.contains('active')).toBe(false);
        expect(el('action-text').textContent).toBe('Compare');
    });

    /*
     * The visual view is a third way of looking at the same document, so it
     * shares the input box with Format rather than living in a container of
     * its own.
     */
    describe('visual mode', () => {
        it('shows the tree beside the input, in place of the formatted text', () => {
            start('format');
            type('input', '{"a":1,"b":[1,2]}');
            el('action-btn').click();
            el('visual-mode').click();

            expect(document.body.dataset.mode).toBe('visual');
            expect(document.querySelectorAll('.tree-row').length).toBeGreaterThan(1);
            expect(el('visual-mode').classList.contains('active')).toBe(true);
        });

        it('builds from the input when nothing has been formatted yet', () => {
            start('format');
            type('input', '{"a":1}');
            el('visual-mode').click();

            expect(document.querySelectorAll('.tree-row').length).toBeGreaterThan(0);
        });

        /* One parse feeds both renderers, so formatting fills the tree too. */
        it('follows the format view rather than parsing again', () => {
            start('format');
            type('input', '{"a":1}');
            el('action-btn').click();
            el('visual-mode').click();
            const before = document.querySelectorAll('.tree-row').length;

            el('format-mode').click();
            type('input', '{"a":1,"b":2,"c":3}');
            el('action-btn').click();
            el('visual-mode').click();

            expect(document.querySelectorAll('.tree-row').length).toBeGreaterThan(before);
        });

        /*
         * The picture and the formatted output share one row and one maximize
         * control. Maximizing the picture hid every other pane in that row, and
         * nothing gave that up on the way back -- so Format opened with the
         * input pane and the output pane both still hidden, showing nothing at
         * all. The group also listed a pane id that does not exist, so the
         * picture was never marked maximized in the first place.
         */
        it('gives the panes back after the picture was maximized', () => {
            start('format');
            type('input', '{"a":1}');
            el('visual-mode').click();

            document.querySelector<HTMLElement>('#visual-panel [data-maximize]')?.click();
            expect(el('input-panel').classList.contains('panel-minimized')).toBe(true);
            expect(el('visual-panel').classList.contains('panel-maximized')).toBe(true);

            el('format-mode').click();

            expect(el('input-panel').classList.contains('panel-minimized')).toBe(false);
            expect(el('output-panel').classList.contains('panel-minimized')).toBe(false);
            expect(el('output').querySelector('.json-line')).not.toBeNull();
        });

        it('empties the picture when the input is cleared', () => {
            start('format');
            type('input', '{"a":1}');
            el('action-btn').click();
            el('visual-mode').click();
            el('clear').click();

            expect(document.querySelectorAll('.tree-row')).toHaveLength(0);
        });
    });

    it('switches mode with the keyboard', () => {
        start('format');
        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'm', metaKey: true, bubbles: true, cancelable: true })
        );
        expect(document.body.dataset.mode).toBe('diff');
    });

    it('runs the action for the active mode', () => {
        start('format');
        el<HTMLTextAreaElement>('input').value = '{"a":1}';
        el('action-btn').click();

        expect(el('output').querySelector('.json-line')).not.toBeNull();
    });

    it('compares when the action runs in diff mode', () => {
        start('diff');
        el<HTMLTextAreaElement>('left-json').value = '{"a":1}';
        el<HTMLTextAreaElement>('right-json').value = '{"a":2}';
        el('action-btn').click();

        expect(document.querySelectorAll('.diff-item')).toHaveLength(1);
    });

    it('clears only the active mode', () => {
        start('format');
        el<HTMLTextAreaElement>('input').value = '{"a":1}';
        el<HTMLTextAreaElement>('left-json').value = '{"untouched":true}';

        el('clear').click();

        expect(el<HTMLTextAreaElement>('input').value).toBe('');
        expect(el<HTMLTextAreaElement>('left-json').value).toBe('{"untouched":true}');
    });

    it('closes the find widget when leaving format mode', () => {
        start('format');
        el<HTMLTextAreaElement>('input').value = '{"a":1}';
        el('action-btn').click();

        el('search-toggle').click();
        expect(el('find-widget').hidden).toBe(false);

        el('diff-mode').click();
        expect(el('find-widget').hidden).toBe(true);
    });

    /*
     * The old search control returned early when nothing had been formatted,
     * so the button appeared dead on a fresh panel with JSON already pasted.
     */
    it('formats first when opening find on unformatted input', () => {
        start('format');
        el<HTMLTextAreaElement>('input').value = '{"a":1}';

        el('search-toggle').click();

        expect(el('find-widget').hidden).toBe(false);
        expect(el('output').querySelector('.json-line')).not.toBeNull();
    });

    it('stays closed when there is nothing at all to search', () => {
        start('format');
        el('search-toggle').click();
        expect(el('find-widget').hidden).toBe(true);
    });

    describe('empty state', () => {
        it('covers the output pane until something is formatted', () => {
            start('format');
            expect(el('output-panel').dataset.empty).toBe('true');

            el<HTMLTextAreaElement>('input').value = '{"a":1}';
            el('action-btn').click();
            expect(el('output-panel').dataset.empty).toBe('false');

            el('clear').click();
            expect(el('output-panel').dataset.empty).toBe('true');
        });
    });

    describe('status bar', () => {
        it('reports validity, line count and size after formatting', () => {
            start('format');
            el<HTMLTextAreaElement>('input').value = '{"a":1,"b":[1,2]}';
            el('action-btn').click();

            expect(statusText('left')).toContain('Valid JSON');
            expect(statusText('left')).toMatch(/\d+ lines/);
            expect(statusText('left')).toMatch(/\d+ B/);
        });

        /*
         * Broken input is repaired and shown rather than rejected, so there is
         * no "invalid" state left to report -- only what had to be fixed.
         */
        it('formats broken input instead of refusing it', () => {
            start('format');
            el<HTMLTextAreaElement>('input').value = '{"a": }';
            el('action-btn').click();

            expect(statusText('left')).toContain('Repaired');
            expect(el('output').textContent).toContain('"a"');
            expect(el('output-panel').dataset.empty).toBe('false');
        });

        it('flags structurally repaired input', () => {
            start('format');
            // Missing comma between properties: a structural repair, unlike
            // single quotes or a trailing comma, which are merely cosmetic.
            el<HTMLTextAreaElement>('input').value = '{"a":1 "b":2}';
            el('action-btn').click();

            expect(statusText('left')).toContain('Repaired');
            expect(statusText('right')).toMatch(/\d+ fix/);
            expect(el('problems').hidden).toBe(false);
            expect(el('problems-title').textContent).toContain('repaired');
        });

        it('reports a cosmetic fix without calling it a problem', () => {
            start('format');
            el<HTMLTextAreaElement>('input').value = "{'a':1}";
            el('action-btn').click();

            // Still valid: rewriting quotes did not change what the document says.
            expect(statusText('left')).toContain('Valid JSON');
            expect(el('problems').hidden).toBe(false);
            expect(el('problems-title').textContent).toContain('change');
        });

        it('says nothing at all when the input needed no repair', () => {
            start('format');
            el<HTMLTextAreaElement>('input').value = '{"a":1}';
            el('action-btn').click();

            expect(statusText('right')).toBe('');
            expect(el('problems').hidden).toBe(true);
        });

        it('counts changes by kind in diff mode', () => {
            start('diff');
            el<HTMLTextAreaElement>('left-json').value = '{"same":1,"changed":"a","gone":true}';
            el<HTMLTextAreaElement>('right-json').value = '{"same":1,"changed":"b","new":2}';
            el('action-btn').click();

            const status = statusText('left');
            expect(status).toContain('3 differences');
            expect(status).toContain('+1');
            expect(status).toContain('−1');
            expect(status).toContain('~1');
        });

        it('says so when the documents match', () => {
            start('diff');
            el<HTMLTextAreaElement>('left-json').value = '{"a":1}';
            el<HTMLTextAreaElement>('right-json').value = '{"a":1}';
            el('action-btn').click();

            expect(statusText('left')).toContain('No differences');
        });

        it('keeps each mode its own status when switching', () => {
            start('format');
            el<HTMLTextAreaElement>('input').value = '{"a":1}';
            el('action-btn').click();
            expect(statusText('left')).toContain('Valid JSON');

            el('diff-mode').click();
            expect(statusText('left')).toBe('');

            el('format-mode').click();
            expect(statusText('left')).toContain('Valid JSON');
        });
    });
});

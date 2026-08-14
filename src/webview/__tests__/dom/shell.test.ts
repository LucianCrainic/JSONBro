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

        it('reports a parse failure', () => {
            start('format');
            el<HTMLTextAreaElement>('input').value = '{"a": }';
            el('action-btn').click();

            expect(statusText('left')).toContain('Invalid JSON');
        });

        it('flags structurally repaired input', () => {
            start('format');
            // Missing comma between properties: a structural repair, unlike
            // single quotes or a trailing comma, which are merely cosmetic.
            el<HTMLTextAreaElement>('input').value = '{"a":1 "b":2}';
            el('action-btn').click();

            expect(statusText('right')).toContain('Auto-corrected');
            expect(el('warning-notification').hidden).toBe(false);
        });

        it('stays quiet for cosmetic fixes', () => {
            start('format');
            el<HTMLTextAreaElement>('input').value = "{'a':1}";
            el('action-btn').click();

            expect(statusText('right')).toBe('');
            expect(el('warning-notification').hidden).toBe(true);
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

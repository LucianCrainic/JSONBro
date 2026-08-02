import { Shell } from '../../shell';

/** Mirrors the structure WebviewContentGenerator emits. */
function buildLayout(mode: 'format' | 'diff'): void {
    document.body.dataset.mode = mode;
    document.body.innerHTML = `
        <div id="toolbar">
            <div id="mode-switcher">
                <button id="format-mode" class="mode-btn"></button>
                <button id="diff-mode" class="mode-btn"></button>
            </div>
            <button id="action-btn"><svg></svg><span id="action-text"></span></button>
            <button id="strict-diff-toggle" data-mode-only="diff"></button>
            <div id="search-container" hidden>
                <input type="text" id="search-input" />
                <button id="search-prev"></button>
                <button id="search-next"></button>
                <span id="search-info"></span>
                <button id="search-close"></button>
            </div>
            <button id="search-toggle" data-mode-only="format"></button>
            <button id="copy"></button>
            <button id="save" data-mode-only="format"></button>
            <button id="clear"></button>
        </div>
        <div id="format-container" class="mode-container">
            <div id="input-panel">
                <button class="maximize-btn" data-maximize="input-panel"><svg><path/></svg></button>
                <textarea id="input"></textarea>
            </div>
            <div id="splitter"></div>
            <div id="output-panel">
                <button id="line-numbers-toggle"></button>
                <button class="maximize-btn" data-maximize="output-panel"><svg><path/></svg></button>
                <div id="warning-notification" hidden>
                    <span class="warning-message"></span>
                    <button id="dismiss-warning"></button>
                </div>
                <div id="output"></div>
            </div>
        </div>
        <div id="diff-container" class="mode-container">
            <div id="left-json-panel">
                <button id="copy-left-json"></button>
                <button id="clear-left-json"></button>
                <textarea id="left-json"></textarea>
            </div>
            <div id="diff-result-panel">
                <button id="apply-all-diffs" hidden></button>
                <button id="reject-all-diffs" hidden></button>
                <div id="diff-output"></div>
            </div>
            <div id="right-json-panel">
                <button id="clear-right-json"></button>
                <textarea id="right-json"></textarea>
            </div>
        </div>`;
    // innerHTML on body would drop the dataset set above in some engines.
    document.body.dataset.mode = mode;
}

function start(mode: 'format' | 'diff'): Shell {
    buildLayout(mode);
    const shell = new Shell();
    shell.start();
    return shell;
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
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
    });

    it('labels the primary action for the active mode', () => {
        start('format');
        expect(el('action-text').textContent).toBe('Format');
        expect(el('action-btn').getAttribute('title')).toBe('Format JSON');

        start('diff');
        expect(el('action-text').textContent).toBe('Compare');
        expect(el('action-btn').getAttribute('title')).toBe('Compare JSON');
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

    it('closes the search bar when leaving format mode', () => {
        start('format');
        el<HTMLTextAreaElement>('input').value = '{"a":1}';
        el('action-btn').click();

        el('search-toggle').click();
        expect(el('search-container').hidden).toBe(false);

        el('diff-mode').click();
        expect(el('search-container').hidden).toBe(true);
    });

    it('refuses to open search before anything has been formatted', () => {
        start('format');
        el('search-toggle').click();
        expect(el('search-container').hidden).toBe(true);
    });
});

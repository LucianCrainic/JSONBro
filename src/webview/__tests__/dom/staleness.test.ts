/**
 * Saying so when a pane has fallen behind the input.
 *
 * Formatting, drawing and comparing are all things you ask for rather than
 * things that happen as you type, because running them per keystroke is
 * unaffordable on a large document. The cost of that choice is a pane quietly
 * showing a document one edit out of date, with nothing to say so -- and no way
 * to tell "this is what your JSON looks like" from "this is what it looked
 * like". These are the cases where it now says so.
 */
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

/** Whether a pane is currently admitting to a problem, and which. */
const flagOn = (panelId: string) => el(panelId).dataset.flag ?? null;
const badge = (id: string) => el<HTMLButtonElement>(id);
const badgeText = (id: string) => badge(id).querySelector('.pane__flag-text')?.textContent;

describe('the formatted output', () => {
    let shell: Shell;

    beforeEach(() => {
        jest.useFakeTimers();
        shell = start('format');
    });

    afterEach(() => jest.useRealTimers());

    it('says nothing before anything has been formatted', () => {
        type('input', '{"a":1}');

        expect(badge('output-flag').hidden).toBe(true);
        expect(flagOn('output-panel')).toBeNull();
    });

    it('admits it is behind once the input changes under it', () => {
        type('input', '{"a":1}');
        el('action-btn').click();
        expect(badge('output-flag').hidden).toBe(true);

        type('input', '{"a":2}');

        expect(badge('output-flag').hidden).toBe(false);
        expect(badgeText('output-flag')).toBe('Out of date');
        expect(flagOn('output-panel')).toBe('stale');
    });

    it('explains what to do about it, and how to do it from the keyboard', () => {
        type('input', '{"a":1}');
        el('action-btn').click();
        type('input', '{"a":2}');

        expect(badge('output-flag').dataset.tip).toContain('Format it again');
        expect(badge('output-flag').dataset.tipKey).toBe('mod+enter');
    });

    /* The badge is the remedy, not just the diagnosis. */
    it('formats when the badge itself is pressed', () => {
        type('input', '{"a":1}');
        el('action-btn').click();
        type('input', '{"second":2}');

        badge('output-flag').click();

        expect(el('output').textContent).toContain('second');
        expect(badge('output-flag').hidden).toBe(true);
    });

    it('comes down when the output is brought up to date the usual way', () => {
        type('input', '{"a":1}');
        el('action-btn').click();
        type('input', '{"a":2}');
        el('action-btn').click();

        expect(badge('output-flag').hidden).toBe(true);
        expect(flagOn('output-panel')).toBeNull();
    });

    /*
     * The input box is shared with the visual view, whose own rebuild listener
     * used to fire here too -- quietly reformatting on every pause in typing,
     * which is exactly the per-keystroke cost the design avoids, and which made
     * the Format button look like it did nothing.
     */
    it('does not reformat itself while the reader types', () => {
        type('input', '{"a":1}');
        el('action-btn').click();

        type('input', '{"different":true}');
        jest.advanceTimersByTime(2000);

        expect(el('output').textContent).not.toContain('different');
        expect(badge('output-flag').hidden).toBe(false);
    });
});

describe('the picture', () => {
    let shell: Shell;

    beforeEach(() => {
        jest.useFakeTimers();
        shell = start('format');
    });

    afterEach(() => jest.useRealTimers());

    /*
     * The case that prompted this: edit in the Format tab, switch to Visual,
     * and the picture is of the previous document. It used to say nothing.
     */
    it('admits it is behind after the document is edited in another tab', () => {
        type('input', '{"a":1}');
        el('action-btn').click();
        el('visual-mode').click();
        expect(badge('visual-flag').hidden).toBe(true);

        el('format-mode').click();
        type('input', '{"a":2}');
        el('visual-mode').click();

        expect(badge('visual-flag').hidden).toBe(false);
        expect(badgeText('visual-flag')).toBe('Out of date');
        expect(flagOn('visual-panel')).toBe('stale');
    });

    it('redraws when the badge is pressed, and takes it down', () => {
        type('input', '{"a":1}');
        el('action-btn').click();
        el('visual-mode').click();
        el('format-mode').click();
        type('input', '{"second":2}');
        el('visual-mode').click();

        badge('visual-flag').click();

        expect(document.querySelector('#tree-output')?.textContent).toContain('second');
        expect(badge('visual-flag').hidden).toBe(true);
    });

    /* Typing in this mode rebuilds on its own, so there is nothing to admit. */
    it('stays quiet while it is the view being typed into', () => {
        type('input', '{"a":1}');
        el('action-btn').click();
        el('visual-mode').click();

        type('input', '{"a":2}');
        jest.advanceTimersByTime(1000);

        expect(badge('visual-flag').hidden).toBe(true);
        expect(document.querySelector('#tree-output')?.textContent).toContain('a');
    });
});

describe('the list of changes', () => {
    beforeEach(() => start('diff'));

    it('says nothing before anything has been compared', () => {
        type('left-json', '{"a":1}');

        expect(badge('diff-flag').hidden).toBe(true);
    });

    it('admits it is behind once either side is edited', () => {
        type('left-json', '{"a":1}');
        type('right-json', '{"a":2}');
        el('action-btn').click();
        expect(badge('diff-flag').hidden).toBe(true);

        type('right-json', '{"a":3}');

        expect(badge('diff-flag').hidden).toBe(false);
        expect(flagOn('diff-result-panel')).toBe('stale');
        expect(badge('diff-flag').dataset.tip).toContain('Compare them again');
    });

    it('compares again when the badge is pressed', () => {
        type('left-json', '{"a":1}');
        type('right-json', '{"a":2}');
        el('action-btn').click();
        type('right-json', '{"a":3}');

        badge('diff-flag').click();

        expect(badge('diff-flag').hidden).toBe(true);
        expect(el('diff-output').textContent).toContain('3');
    });
});

describe('the original, once changes have been applied to it', () => {
    beforeEach(() => start('diff'));

    const applyOne = () => {
        const apply = document.querySelector<HTMLElement>('.diff-item .apply-diff-btn');
        apply?.click();
        return apply !== null;
    };

    it('says nothing while every change is still pending', () => {
        type('left-json', '{"a":1}');
        type('right-json', '{"a":2}');
        el('action-btn').click();

        expect(badge('left-json-flag').hidden).toBe(true);
    });

    /*
     * Applying rewrites the original pane in place. Until it is saved, that
     * rewritten document exists nowhere but this panel.
     */
    it('says the original now holds changes that are saved nowhere', () => {
        type('left-json', '{"a":1}');
        type('right-json', '{"a":2}');
        el('action-btn').click();

        expect(applyOne()).toBe(true);

        expect(badge('left-json-flag').hidden).toBe(false);
        expect(badgeText('left-json-flag')).toBe('Unsaved');
        expect(flagOn('left-json-panel')).toBe('unsaved');
    });

    it('takes it back when the change is undone', () => {
        type('left-json', '{"a":1}');
        type('right-json', '{"a":2}');
        el('action-btn').click();
        applyOne();

        document.querySelector<HTMLElement>('.diff-item .undo-diff-btn')?.click();

        expect(badge('left-json-flag').hidden).toBe(true);
    });

    it('says it after applying every change at once', () => {
        type('left-json', '{"a":1,"b":1}');
        type('right-json', '{"a":2,"b":2}');
        el('action-btn').click();
        el('apply-all-diffs').click();

        expect(badge('left-json-flag').hidden).toBe(false);
        expect(flagOn('left-json-panel')).toBe('unsaved');
    });

    it('forgets it when the original is replaced outright', () => {
        type('left-json', '{"a":1}');
        type('right-json', '{"a":2}');
        el('action-btn').click();
        applyOne();

        el('clear-left-json').click();

        expect(badge('left-json-flag').hidden).toBe(true);
    });
});

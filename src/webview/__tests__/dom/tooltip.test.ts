/**
 * The panel draws its own tooltips, so these cover the timing, the dismissal
 * paths and the promise that every control actually carries hover text.
 */
import { formatShortcut, setTip, SHOW_DELAY_MS, TooltipHost } from '../../ui/tooltip';
import { mountPanel } from './helpers/fixture';

/** Fires a mouseover the way a real pointer entering an element would. */
function hover(element: Element, from: Element | null = null): void {
    element.dispatchEvent(
        new MouseEvent('mouseover', { bubbles: true, relatedTarget: from ?? undefined })
    );
}

function unhover(element: Element, to: Element | null = null): void {
    element.dispatchEvent(
        new MouseEvent('mouseout', { bubbles: true, relatedTarget: to ?? undefined })
    );
}

const tip = () => document.querySelector<HTMLElement>('.tooltip');

describe('TooltipHost', () => {
    let host: TooltipHost;

    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = '<button id="a" data-tip="Do the thing"><span id="glyph"></span></button><button id="b" data-tip="Other"></button><button id="plain"></button>';
        host = new TooltipHost();
        host.start();
    });

    afterEach(() => {
        host.dispose();
        jest.useRealTimers();
    });

    it('waits before showing, then shows the control text', () => {
        hover(document.getElementById('a')!);
        expect(tip()!.hidden).toBe(true);

        jest.advanceTimersByTime(SHOW_DELAY_MS);
        expect(tip()!.hidden).toBe(false);
        expect(tip()!.textContent).toContain('Do the thing');
    });

    it('does not wait again while a tooltip is already up', () => {
        hover(document.getElementById('a')!);
        jest.advanceTimersByTime(SHOW_DELAY_MS);

        hover(document.getElementById('b')!);
        expect(tip()!.textContent).toContain('Other');
    });

    it('ignores the pointer moving between a control and its own icon', () => {
        const button = document.getElementById('a')!;
        const glyph = document.getElementById('glyph')!;

        hover(button);
        jest.advanceTimersByTime(SHOW_DELAY_MS);

        unhover(button, glyph);
        hover(glyph, button);

        expect(tip()!.hidden).toBe(false);
        expect(host.current).toBe(button);
    });

    it('hides when the pointer leaves for something else', () => {
        const button = document.getElementById('a')!;
        hover(button);
        jest.advanceTimersByTime(SHOW_DELAY_MS);

        unhover(button, document.getElementById('plain'));
        expect(tip()!.hidden).toBe(true);
    });

    it('hides on Escape and on click', () => {
        const button = document.getElementById('a')!;

        hover(button);
        jest.advanceTimersByTime(SHOW_DELAY_MS);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(tip()!.hidden).toBe(true);

        hover(button);
        jest.advanceTimersByTime(SHOW_DELAY_MS);
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(tip()!.hidden).toBe(true);
    });

    it('shows nothing for a control without hover text', () => {
        hover(document.getElementById('plain')!);
        jest.advanceTimersByTime(SHOW_DELAY_MS);
        expect(tip()!.hidden).toBe(true);
    });

    it('cancels a pending tooltip when the pointer leaves first', () => {
        const button = document.getElementById('a')!;
        hover(button);
        unhover(button, document.getElementById('plain'));

        jest.advanceTimersByTime(SHOW_DELAY_MS * 4);
        expect(tip()!.hidden).toBe(true);
    });

    it('renders a shortcut as separate keys', () => {
        const button = document.getElementById('a') as HTMLElement;
        setTip(button, 'Format JSON', 'mod+enter');

        hover(button);
        jest.advanceTimersByTime(SHOW_DELAY_MS);

        const keys = tip()!.querySelectorAll('kbd');
        expect(keys).toHaveLength(2);
        expect(keys[1].textContent).toMatch(/Enter|⏎/);
    });

    it('setTip clears a shortcut that no longer applies', () => {
        const button = document.getElementById('a') as HTMLElement;
        setTip(button, 'Format JSON', 'mod+enter');
        setTip(button, 'Compare JSON');

        expect(button.dataset.tipKey).toBeUndefined();
        expect(button.dataset.tip).toBe('Compare JSON');
    });
});

describe('formatShortcut', () => {
    it('splits a spec into one entry per key', () => {
        expect(formatShortcut('mod+shift+f')).toHaveLength(3);
    });

    it('upper-cases a bare letter', () => {
        expect(formatShortcut('k')).toEqual(['K']);
    });

    it('keeps an unknown word intact', () => {
        expect(formatShortcut('space')).toEqual(['space']);
    });
});

describe('control coverage', () => {
    /**
     * The complaint that started this work was hovering a button and learning
     * nothing, so the guarantee is checked rather than assumed. Visible text is
     * deliberately not accepted as a substitute: a label says what a control is
     * called, not what pressing it does.
     */
    it.each(['format', 'diff'] as const)('every %s control has hover text', mode => {
        mountPanel(mode);

        const buttons = Array.from(document.querySelectorAll('button'));
        const unexplained = buttons
            .filter(button => !button.dataset.tip)
            .map(button => button.id || button.className);

        expect(unexplained).toEqual([]);
        expect(buttons.length).toBeGreaterThan(20);
    });

    it('no control still relies on the native title tooltip', () => {
        mountPanel('diff');
        expect(document.querySelectorAll('[title]')).toHaveLength(0);
    });
});

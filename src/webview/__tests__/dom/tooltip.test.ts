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

    /*
     * A real pointer leaving one button for the next fires mouseout before the
     * neighbour's mouseover. Hiding on that mouseout would restart the delay for
     * every button in a row, because "already showing" is what suppresses it.
     */
    it('does not wait again when the pointer leaves one control for another', () => {
        const a = document.getElementById('a')!;
        const b = document.getElementById('b')!;

        hover(a);
        jest.advanceTimersByTime(SHOW_DELAY_MS);

        unhover(a, b);
        hover(b, a);

        expect(tip()!.hidden).toBe(false);
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

    /*
     * The pointer lands on a button's padding and slides onto its icon a few
     * milliseconds later -- which is what happens every time anyone points at
     * one. This used to cancel the tooltip outright and never reschedule it, and
     * is why hover text seemed to work on some buttons but not others.
     */
    it('still shows when the pointer reaches the icon during the delay', () => {
        const button = document.getElementById('a')!;
        const glyph = document.getElementById('glyph')!;

        hover(button);
        jest.advanceTimersByTime(SHOW_DELAY_MS / 3);
        unhover(button, glyph);
        hover(glyph, button);

        jest.advanceTimersByTime(SHOW_DELAY_MS);
        expect(tip()!.hidden).toBe(false);
        expect(host.current).toBe(button);
    });

    it('does not restart the delay when the pointer settles inside a control', () => {
        const button = document.getElementById('a')!;
        const glyph = document.getElementById('glyph')!;

        hover(button);
        // Two thirds of the way through, the pointer reaches the icon.
        jest.advanceTimersByTime((SHOW_DELAY_MS * 2) / 3);
        unhover(button, glyph);
        hover(glyph, button);

        // The remaining third is all it should still owe.
        jest.advanceTimersByTime(SHOW_DELAY_MS / 3);
        expect(tip()!.hidden).toBe(false);
    });

    it('switches to a neighbour reached during the delay', () => {
        const a = document.getElementById('a')!;
        const b = document.getElementById('b')!;

        hover(a);
        jest.advanceTimersByTime(SHOW_DELAY_MS / 2);
        unhover(a, b);
        hover(b, a);

        jest.advanceTimersByTime(SHOW_DELAY_MS);
        expect(tip()!.textContent).toContain('Other');
        expect(host.current).toBe(b);
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

    /*
     * A fixed box with `left` set is laid out inside the space remaining to its
     * right, so measuring it where the previous tooltip sat reports the width it
     * would have *there*. Every pane action button is at the right-hand edge of
     * a header, so the second tooltip in a row came out a few characters wide
     * and wrapped to one word per line. It has to be measured from the corner.
     */
    it('measures itself from the corner, not from where it last sat', () => {
        const a = document.getElementById('a') as HTMLElement;
        const b = document.getElementById('b') as HTMLElement;
        const box = tip() as HTMLElement;

        // The far right of a wide viewport, where a pane action button lives.
        b.getBoundingClientRect = () =>
            ({ left: 1240, right: 1264, top: 8, bottom: 32, width: 24, height: 24 }) as DOMRect;

        const measured: string[] = [];
        box.getBoundingClientRect = function () {
            measured.push(this.style.left);
            return { left: 0, right: 220, top: 0, bottom: 28, width: 220, height: 28 } as DOMRect;
        };

        hover(a);
        jest.advanceTimersByTime(SHOW_DELAY_MS);
        hover(b);

        expect(measured[measured.length - 1]).toBe('0px');
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
     * nothing, so the guarantee is checked rather than assumed.
     *
     * The guarantee is about controls that show only an icon. A menu item spells
     * out what it does in words, which is the whole reason the crowded pane
     * headers could shed buttons into menus; demanding hover text there as well
     * would be demanding that the label be repeated back.
     */
    it.each(['format', 'diff'] as const)('every %s icon control has hover text', mode => {
        mountPanel(mode);

        const buttons = Array.from(document.querySelectorAll('button'));
        const iconOnly = buttons.filter(button => (button.textContent ?? '').trim() === '');
        const unexplained = iconOnly
            .filter(button => !button.dataset.tip)
            .map(button => button.id || button.className);

        expect(unexplained).toEqual([]);
        expect(iconOnly.length).toBeGreaterThan(15);
    });

    /** A control that says what it does in words does not need to whisper it. */
    it.each(['format', 'diff'] as const)('every %s menu item is named', mode => {
        mountPanel(mode);

        const unnamed = Array.from(document.querySelectorAll<HTMLElement>('.menu__item'))
            .filter(item => !item.querySelector('.menu__label')?.textContent?.trim())
            .map(item => item.id);

        expect(unnamed).toEqual([]);
        expect(document.querySelectorAll('.menu__item').length).toBeGreaterThan(0);
    });

    it('no control still relies on the native title tooltip', () => {
        mountPanel('diff');
        expect(document.querySelectorAll('[title]')).toHaveLength(0);
    });
});

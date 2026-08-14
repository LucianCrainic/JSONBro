/**
 * The overflow menus that took the pane headers apart.
 *
 * The visual pane used to carry twelve icon buttons in a row. The frequent ones
 * stayed; the rest moved behind a `⋯`, which only works if opening it, choosing
 * from it and dismissing it are all unremarkable.
 */
import { MenuHost } from '../../ui/menu';
import { mountPanel } from './helpers/fixture';

const menu = () => document.getElementById('m') as HTMLElement;
const opener = () => document.getElementById('open') as HTMLButtonElement;
const item = (id: string) => document.getElementById(id) as HTMLButtonElement;

function mount(): void {
    document.body.innerHTML = `
        <div class="menu-anchor">
            <button id="open" data-menu="m" aria-expanded="false"></button>
            <div class="menu" id="m" role="menu" hidden>
                <button id="one" class="menu__item"><span class="menu__label">One</span></button>
                <button id="two" class="menu__item"><span class="menu__label">Two</span></button>
            </div>
        </div>
        <button id="outside"></button>`;
}

describe('MenuHost', () => {
    let host: MenuHost;

    beforeEach(() => {
        mount();
        host = new MenuHost();
        host.start();
    });

    afterEach(() => host.dispose());

    it('opens on its button and says so', () => {
        opener().click();

        expect(menu().hidden).toBe(false);
        expect(opener().getAttribute('aria-expanded')).toBe('true');
        expect(host.current).toBe(menu());
    });

    it('closes when its button is pressed again', () => {
        opener().click();
        opener().click();

        expect(menu().hidden).toBe(true);
        expect(opener().getAttribute('aria-expanded')).toBe('false');
    });

    it('closes on a click anywhere else', () => {
        opener().click();
        item('outside').click();

        expect(menu().hidden).toBe(true);
    });

    /*
     * Choosing an action ends the interaction. The item's own handler is bound
     * by id elsewhere and runs regardless -- which is what let a header button
     * move into a menu without its view changing at all.
     */
    it('closes when an item is chosen, without swallowing the choice', () => {
        const chosen = jest.fn();
        item('one').addEventListener('click', chosen);

        opener().click();
        item('one').click();

        expect(chosen).toHaveBeenCalledTimes(1);
        expect(menu().hidden).toBe(true);
    });

    it('closes on Escape and hands focus back', () => {
        opener().click();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(menu().hidden).toBe(true);
        expect(document.activeElement).toBe(opener());
    });

    it('puts focus on the first item so the keyboard can drive it', () => {
        opener().click();
        expect(document.activeElement).toBe(item('one'));
    });

    it('walks the items with the arrow keys, wrapping round', () => {
        opener().click();

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(document.activeElement).toBe(item('two'));

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(document.activeElement).toBe(item('one'));

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        expect(document.activeElement).toBe(item('two'));
    });

    it('ignores the arrow keys while nothing is open', () => {
        item('outside').focus();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

        expect(document.activeElement).toBe(item('outside'));
    });

    it('opens one menu at a time', () => {
        document.body.insertAdjacentHTML(
            'beforeend',
            `<div class="menu-anchor">
                <button id="open2" data-menu="m2" aria-expanded="false"></button>
                <div class="menu" id="m2" role="menu" hidden>
                    <button id="three" class="menu__item"><span class="menu__label">Three</span></button>
                </div>
            </div>`
        );

        opener().click();
        item('open2').click();

        expect(menu().hidden).toBe(true);
        expect(document.getElementById('m2')?.hidden).toBe(false);
    });
});

describe('the panel it was built for', () => {
    let host: MenuHost;

    afterEach(() => host.dispose());

    /*
     * The complaint was being overwhelmed by buttons. The visual pane header
     * was the worst of it, and this is the number that has to stay small.
     */
    it('leaves the visual header a handful of controls, not a dozen', () => {
        mountPanel('format');
        host = new MenuHost();
        host.start();

        const header = document.querySelector('#visual-panel .pane__actions') as HTMLElement;
        const onDisplay = header.querySelectorAll('button:not(.menu__item)');

        expect(onDisplay.length).toBeLessThanOrEqual(7);
        expect(header.querySelectorAll('.menu__item').length).toBeGreaterThan(0);
    });

    /* Every action that left the header is still reachable, by the same id. */
    it('keeps every action that moved into a menu', () => {
        mountPanel('format');
        host = new MenuHost();
        host.start();

        for (const id of ['visual-expand-depth', 'graph-zoom-in', 'graph-zoom-out']) {
            expect(document.getElementById(id)?.classList.contains('menu__item')).toBe(true);
        }
    });

    it('spells a menu shortcut in the keys of this platform', () => {
        document.body.innerHTML = `
            <div class="menu" id="m" role="menu" hidden>
                <button class="menu__item">
                    <span class="menu__label">Copy path</span>
                    <span class="menu__keys" data-keys="mod+shift+c"></span>
                </button>
            </div>`;
        host = new MenuHost();
        host.start();

        const keys = document.querySelectorAll('.menu__keys kbd');
        expect(keys).toHaveLength(3);
        expect(keys[2].textContent).toBe('C');
    });
});

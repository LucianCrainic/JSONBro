/**
 * Overflow menus for the pane headers.
 *
 * A pane header used to be a flat row of every action it could perform -- the
 * visual pane carried twelve icon buttons side by side, which reads as noise
 * rather than as a set of choices. The frequent actions stay on the header and
 * the rest move behind a `⋯` button, which is what this opens.
 *
 * The menu items are ordinary buttons carrying ordinary ids, so a view still
 * binds them exactly as it bound the header buttons they replaced. Moving an
 * action into a menu is a change to the markup and nothing else; this module
 * only opens, places, closes and keyboard-drives the popup.
 */
import { on, qsa } from './dom';
import { formatShortcut } from './tooltip';

/** Gap between the button and the menu it opens. */
const OFFSET = 4;

/** Kept away from the very edge so the menu never looks clipped. */
const MARGIN = 6;

/**
 * The items of a menu that are actually available right now.
 *
 * A menu shared between shapes or modes carries items that CSS is currently
 * hiding -- the graph's zoom entries while the tree is up -- and the arrow keys
 * must step past those rather than into them. Asked of the cascade rather than
 * of `offsetParent`, which reports nothing useful for an element inside a
 * `display: none` ancestor, and nothing at all outside a real browser.
 */
function itemsOf(menu: HTMLElement): HTMLElement[] {
    return qsa<HTMLElement>('.menu__item', menu).filter(
        item => !item.hidden && getComputedStyle(item).display !== 'none'
    );
}

export class MenuHost {
    private readonly teardown: Array<() => void> = [];
    private open: HTMLElement | null = null;
    private opener: HTMLElement | null = null;

    constructor(private readonly root: Document = document) {}

    public start(): void {
        this.labelShortcuts();

        const body = this.root.body;
        this.teardown.push(
            on(body, 'click', event => this.onClick(event)),
            on(this.root, 'keydown', event => this.onKeyDown(event)),
            // Resizing moves the button the menu was placed against, and the
            // menu is positioned in viewport coordinates rather than beneath it.
            on(window, 'resize', () => this.close())
        );
    }

    public dispose(): void {
        this.close();
        for (const off of this.teardown) {
            off();
        }
        this.teardown.length = 0;
    }

    /** The menu currently open, for tests. */
    public get current(): HTMLElement | null {
        return this.open;
    }

    /** Spells every menu item's shortcut the way this platform writes it. */
    private labelShortcuts(): void {
        for (const slot of qsa<HTMLElement>('.menu__keys[data-keys]', this.root.body)) {
            slot.replaceChildren(
                ...formatShortcut(slot.dataset.keys ?? '').map(key => {
                    const kbd = this.root.createElement('kbd');
                    kbd.textContent = key;
                    return kbd;
                })
            );
        }
    }

    private onClick(event: MouseEvent): void {
        const target = event.target as Element | null;
        const opener = target?.closest<HTMLElement>('[data-menu]') ?? null;

        if (opener) {
            event.stopPropagation();
            const menu = this.root.getElementById(opener.dataset.menu ?? '');
            if (menu === this.open) {
                this.close();
            } else if (menu) {
                this.show(menu, opener);
            }
            return;
        }

        // Anywhere else closes, including on an item: choosing an action is the
        // end of the interaction, and the item's own handler runs regardless.
        this.close();
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.open) {
            return;
        }

        if (event.key === 'Escape') {
            const opener = this.opener;
            this.close();
            opener?.focus();
            event.preventDefault();
            return;
        }

        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
            return;
        }

        const items = itemsOf(this.open);
        if (items.length === 0) {
            return;
        }

        const at = items.indexOf(this.root.activeElement as HTMLElement);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next = at === -1 ? (step === 1 ? 0 : items.length - 1) : at + step;
        items[(next + items.length) % items.length].focus();
        event.preventDefault();
    }

    private show(menu: HTMLElement, opener: HTMLElement): void {
        this.close();

        this.open = menu;
        this.opener = opener;
        menu.hidden = false;
        opener.setAttribute('aria-expanded', 'true');

        this.place(menu, opener);
        itemsOf(menu)[0]?.focus();
    }

    /**
     * Places the menu under its button in viewport coordinates.
     *
     * Laid out relative to the page rather than to the header so that no
     * ancestor's overflow can clip it, and flipped above when there is no room
     * below -- a pane header near the bottom of a short panel has none.
     */
    private place(menu: HTMLElement, opener: HTMLElement): void {
        const button = opener.getBoundingClientRect();

        // Measured from the corner: a fixed box with `left` set shrink-to-fits
        // into whatever space remains to its right, so measuring it where the
        // last menu was left reports the size it would have had there.
        menu.style.left = '0px';
        menu.style.top = '0px';

        const box = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth || this.root.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || this.root.documentElement.clientHeight;

        const below = button.bottom + OFFSET;
        const above = button.top - box.height - OFFSET;
        const top = below + box.height > viewportHeight - MARGIN && above >= MARGIN ? above : below;

        // Right-aligned with the button: these sit at the right-hand end of a
        // header, so growing leftwards is what keeps them on screen.
        const right = button.right - box.width;
        const left = Math.max(MARGIN, Math.min(right, viewportWidth - box.width - MARGIN));

        menu.style.top = `${Math.round(top)}px`;
        menu.style.left = `${Math.round(left)}px`;
    }

    public close(): void {
        if (!this.open) {
            return;
        }
        this.open.hidden = true;
        this.opener?.setAttribute('aria-expanded', 'false');
        this.open = null;
        this.opener = null;
    }
}

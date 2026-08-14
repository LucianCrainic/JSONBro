/**
 * Hover and focus tooltips for the whole panel.
 *
 * The native `title` attribute was doing this job badly: it waits about a
 * second, it is clipped by the webview's iframe so controls near an edge show
 * nothing at all, and it cannot render a keyboard shortcut. Controls therefore
 * carry `data-tip` (and optionally `data-tip-key`) and this module draws them.
 *
 * One listener on the document covers every control, including the ones inside
 * virtualised rows that are replaced on every scroll.
 */
import { escapeHtml, on } from './dom';

/** How long the pointer must rest on a control before its tip appears. */
export const SHOW_DELAY_MS = 150;

/** Gap between the control and the tooltip. */
const OFFSET = 6;

/** Kept away from the very edge so the tooltip never looks clipped. */
const MARGIN = 4;

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** How a shortcut token is spelled on this platform. */
const KEY_NAMES: Record<string, [mac: string, other: string]> = {
    mod: ['⌘', 'Ctrl'],
    shift: ['⇧', 'Shift'],
    alt: ['⌥', 'Alt'],
    enter: ['⏎', 'Enter'],
    escape: ['Esc', 'Esc'],
    up: ['↑', '↑'],
    down: ['↓', '↓']
};

/** Renders `mod+enter` as the keys this platform actually uses. */
export function formatShortcut(spec: string): string[] {
    return spec
        .split('+')
        .map(part => part.trim().toLowerCase())
        .filter(Boolean)
        .map(part => {
            const known = KEY_NAMES[part];
            if (known) {
                return IS_MAC ? known[0] : known[1];
            }
            return part.length === 1 ? part.toUpperCase() : part;
        });
}

/** Sets or clears a control's tooltip after it has been rendered. */
export function setTip(element: HTMLElement, text: string, shortcut?: string): void {
    element.dataset.tip = text;
    if (shortcut) {
        element.dataset.tipKey = shortcut;
    } else {
        delete element.dataset.tipKey;
    }
}

export class TooltipHost {
    private readonly element: HTMLElement;
    private readonly teardown: Array<() => void> = [];
    private anchor: HTMLElement | null = null;
    private timer: number | null = null;

    constructor(private readonly root: Document = document) {
        this.element = this.root.createElement('div');
        this.element.className = 'tooltip';
        this.element.setAttribute('role', 'tooltip');
        this.element.hidden = true;
        this.root.body.appendChild(this.element);
    }

    public start(): void {
        const body = this.root.body;

        this.teardown.push(
            on(body, 'mouseover', event => this.onEnter(event.target)),
            on(body, 'mouseout', event => this.onLeave(event.relatedTarget)),
            on(body, 'focusin', event => this.onEnter(event.target, true)),
            on(body, 'focusout', () => this.hide()),
            // Any of these can move the anchor out from under the tooltip.
            on(body, 'click', () => this.hide()),
            on(this.root, 'keydown', event => {
                if (event.key === 'Escape') {
                    this.hide();
                }
            }),
            on(body, 'scroll', () => this.hide(), { capture: true })
        );
    }

    public dispose(): void {
        this.cancel();
        for (const off of this.teardown) {
            off();
        }
        this.teardown.length = 0;
        this.element.remove();
    }

    /** The control the tooltip is currently describing, for tests. */
    public get current(): HTMLElement | null {
        return this.anchor;
    }

    /**
     * Starts describing a control.
     *
     * The anchor is recorded the moment the pointer arrives rather than when
     * the tooltip finally appears. Recording it only on show meant that during
     * the delay nothing was anchored, so the pointer crossing from a button's
     * padding onto its own icon read as leaving the control: it cancelled the
     * pending tooltip, and the immediately following re-entry was then dismissed
     * as movement *within* a control and never rescheduled. Hovering a button
     * and moving even slightly silenced it until the pointer left and came back,
     * which is why hover text appeared for some buttons and not others.
     */
    private onEnter(target: EventTarget | null, immediate = false): void {
        const anchor = (target as Element | null)?.closest<HTMLElement>('[data-tip]') ?? null;
        // No anchor means the pointer is over ordinary content; leaving is the
        // business of mouseout, which knows where the pointer actually went.
        // The same anchor means it moved between a control's own children.
        if (!anchor || anchor === this.anchor) {
            return;
        }

        this.cancel();
        this.anchor = anchor;

        // Once one tooltip is up, moving along a row of buttons should not make
        // the user wait again for each of them.
        if (immediate || !this.element.hidden) {
            this.show(anchor);
            return;
        }

        this.timer = window.setTimeout(() => {
            this.timer = null;
            if (this.anchor) {
                this.show(this.anchor);
            }
        }, SHOW_DELAY_MS);
    }

    /**
     * Stops describing a control, unless the pointer went somewhere that keeps
     * one described: further inside the same control, or straight onto another
     * one whose own mouseover is about to re-anchor us. Hiding on the way to a
     * neighbouring button would make the delay start over for every button in a
     * row, since "already showing" is what suppresses it.
     */
    private onLeave(to: EventTarget | null): void {
        if (to instanceof Element && to.closest<HTMLElement>('[data-tip]')) {
            return;
        }
        this.hide();
    }

    private show(anchor: HTMLElement): void {
        const text = anchor.dataset.tip;
        if (!text) {
            return;
        }

        const keys = anchor.dataset.tipKey
            ? formatShortcut(anchor.dataset.tipKey)
                  .map(key => `<kbd>${escapeHtml(key)}</kbd>`)
                  .join('')
            : '';

        this.element.innerHTML = `<span class="tooltip__text">${escapeHtml(text)}</span>${
            keys ? `<span class="tooltip__keys">${keys}</span>` : ''
        }`;
        this.element.hidden = false;
        this.position(anchor);
    }

    /**
     * Places the tooltip below the control, flipping above when there is no
     * room and clamping horizontally so an edge control still reads.
     */
    private position(anchor: HTMLElement): void {
        const control = anchor.getBoundingClientRect();

        // Measured from the corner rather than from wherever the last tooltip
        // was left. A fixed box with `left` set shrink-to-fits into the space
        // remaining to its right, so measuring it in place gave the width it
        // would have *there* -- and every pane action button sits at the
        // right-hand edge, where that width is a few characters. The text then
        // wrapped to one word per line and the clamp below, working from the
        // squeezed figure, kept it there.
        this.element.style.left = '0px';
        this.element.style.top = '0px';

        const tip = this.element.getBoundingClientRect();
        const viewportWidth = window.innerWidth || this.root.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || this.root.documentElement.clientHeight;

        const below = control.bottom + OFFSET;
        const above = control.top - tip.height - OFFSET;
        const flip = below + tip.height > viewportHeight - MARGIN && above >= MARGIN;

        const top = flip ? above : below;
        const centred = control.left + control.width / 2 - tip.width / 2;
        const left = Math.max(
            MARGIN,
            Math.min(centred, viewportWidth - tip.width - MARGIN)
        );

        this.element.style.top = `${Math.round(top)}px`;
        this.element.style.left = `${Math.round(left)}px`;
        this.element.classList.toggle('tooltip--above', flip);
    }

    private hide(): void {
        this.cancel();
        this.anchor = null;
        this.element.hidden = true;
        this.element.classList.remove('tooltip--above');
    }

    private cancel(): void {
        if (this.timer !== null) {
            window.clearTimeout(this.timer);
            this.timer = null;
        }
    }
}

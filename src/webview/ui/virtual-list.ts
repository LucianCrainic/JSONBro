/**
 * Renders only the rows that are on screen.
 *
 * The output pane used to be built as one HTML string containing a div per
 * line plus a div per gutter entry, so a hundred-thousand-line document meant
 * two hundred thousand elements and a freeze measured in seconds. Here the
 * element count is a function of the window height, not of the document.
 */
import { on } from './dom';

export interface VirtualListOptions {
    /** The scrolling element. */
    viewport: HTMLElement;
    /** How many rows the list currently has. */
    count: () => number;
    /** Markup for rows `[from, to)`, in order. */
    renderRows: (from: number, to: number) => string;
    /** Extra rows rendered above and below the window. */
    overscan?: number;
}

/** Height of one row, measured from a probe so CSS stays in charge of it. */
const FALLBACK_ROW_HEIGHT = 18;

/**
 * The tallest the spacer is allowed to be.
 *
 * Browsers stop scrolling elements taller than roughly 33 million pixels,
 * which at a typical row height is around a million and a half rows -- well
 * inside the range a large JSON file reaches. Past this the spacer is scaled
 * and the scroll position is mapped onto the row range proportionally: the
 * scrollbar stops being pixel-exact, but it keeps working.
 */
const MAX_SPACER_HEIGHT = 30_000_000;

export class VirtualList {
    private readonly options: Required<VirtualListOptions>;
    private readonly teardown: Array<() => void> = [];

    private readonly spacer: HTMLElement;
    private readonly window: HTMLElement;

    private rowHeight = FALLBACK_ROW_HEIGHT;
    private frame = 0;
    private renderedFrom = -1;
    private renderedTo = -1;
    /** True once the document is too tall for the spacer to be exact. */
    private scaled = false;

    constructor(options: VirtualListOptions) {
        this.options = { overscan: 12, ...options };

        const { viewport } = this.options;
        viewport.classList.add('vlist');
        viewport.innerHTML = '';

        this.spacer = document.createElement('div');
        this.spacer.className = 'vlist__spacer';

        this.window = document.createElement('div');
        this.window.className = 'vlist__window';

        this.spacer.appendChild(this.window);
        viewport.appendChild(this.spacer);

        this.teardown.push(on(viewport, 'scroll', () => this.schedule()));

        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(() => this.schedule());
            observer.observe(viewport);
            this.teardown.push(() => observer.disconnect());
        }
    }

    /** The element rows are rendered into, for reading back a specific row. */
    public get container(): HTMLElement {
        return this.window;
    }

    public get measuredRowHeight(): number {
        return this.rowHeight;
    }

    /** Re-renders from scratch, e.g. after the document changed. */
    public refresh(): void {
        this.renderedFrom = -1;
        this.renderedTo = -1;
        this.render();
    }

    /** Renders on the next frame; several scroll events collapse into one. */
    private schedule(): void {
        if (this.frame !== 0) {
            return;
        }
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            this.render();
        });
    }

    private render(): void {
        const total = this.options.count();
        const { viewport, overscan } = this.options;

        if (total === 0) {
            this.window.innerHTML = '';
            this.spacer.style.height = '0px';
            this.renderedFrom = 0;
            this.renderedTo = 0;
            return;
        }

        this.measureRowHeight(total);

        const naturalHeight = total * this.rowHeight;
        const height = Math.min(naturalHeight, MAX_SPACER_HEIGHT);
        this.scaled = naturalHeight > MAX_SPACER_HEIGHT;
        this.spacer.style.height = `${height}px`;

        const viewportHeight = viewport.clientHeight || 400;
        const visibleRows = Math.ceil(viewportHeight / this.rowHeight);

        let first: number;
        let offset: number;

        if (this.scaled) {
            // The spacer no longer maps to rows one-to-one, so the row range
            // comes from how far through the scroll we are, and the rendered
            // block simply follows the viewport.
            const scrollable = Math.max(1, height - viewportHeight);
            const ratio = Math.min(1, Math.max(0, viewport.scrollTop / scrollable));
            first = Math.max(0, Math.round(ratio * Math.max(0, total - visibleRows)) - overscan);
            offset = viewport.scrollTop;
        } else {
            first = Math.max(0, Math.floor(viewport.scrollTop / this.rowHeight) - overscan);
            offset = first * this.rowHeight;
        }

        const last = Math.min(total, first + visibleRows + overscan * 2);

        if (first === this.renderedFrom && last === this.renderedTo && !this.scaled) {
            return;
        }

        this.window.innerHTML = this.options.renderRows(first, last);
        // Positioned rather than padded: a transform does not invalidate the
        // spacer's layout, so scrolling stays cheap.
        this.window.style.transform = `translateY(${offset}px)`;

        this.renderedFrom = first;
        this.renderedTo = last;
    }

    /**
     * Learns the row height from a real row.
     *
     * Guessing it would misplace every row as soon as the font or line height
     * changed, and both come from the user's editor settings.
     */
    private measureRowHeight(total: number): void {
        if (this.window.firstElementChild) {
            const measured = (this.window.firstElementChild as HTMLElement).offsetHeight;
            if (measured > 0) {
                this.rowHeight = measured;
            }
            return;
        }

        if (total === 0) {
            return;
        }

        this.window.innerHTML = this.options.renderRows(0, 1);
        const probe = this.window.firstElementChild as HTMLElement | null;
        if (probe && probe.offsetHeight > 0) {
            this.rowHeight = probe.offsetHeight;
        }
        // Force a re-render now that the geometry is known.
        this.renderedFrom = -1;
        this.renderedTo = -1;
    }

    /** Scrolls `row` into view, centring it when it is not already showing. */
    public revealRow(row: number): void {
        const { viewport } = this.options;
        const total = this.options.count();

        if (this.scaled) {
            // Position by proportion, since pixels and rows no longer line up.
            const viewportHeight = viewport.clientHeight || 400;
            const visibleRows = Math.ceil(viewportHeight / this.rowHeight);
            const ratio = Math.min(1, row / Math.max(1, total - visibleRows));
            viewport.scrollTop = ratio * Math.max(0, this.spacer.offsetHeight - viewportHeight);
            this.renderedFrom = -1;
            this.render();
            return;
        }

        const top = row * this.rowHeight;
        const bottom = top + this.rowHeight;

        if (top < viewport.scrollTop || bottom > viewport.scrollTop + viewport.clientHeight) {
            viewport.scrollTop = Math.max(0, top - viewport.clientHeight / 2);
        }
        this.render();
    }

    /** The rendered element for `row`, when it is currently on screen. */
    public elementFor(row: number): HTMLElement | null {
        if (row < this.renderedFrom || row >= this.renderedTo) {
            return null;
        }
        return this.window.children[row - this.renderedFrom] as HTMLElement | null;
    }

    public dispose(): void {
        if (this.frame !== 0) {
            cancelAnimationFrame(this.frame);
            this.frame = 0;
        }
        this.teardown.forEach(fn => fn());
        this.teardown.length = 0;
    }
}

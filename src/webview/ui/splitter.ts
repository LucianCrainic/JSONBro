/**
 * Drag-to-resize between two sibling panes.
 */
import { on } from './dom';

export interface SplitterOptions {
    handle: HTMLElement;
    before: HTMLElement;
    after: HTMLElement;
    /** Smallest either pane may become, in pixels. */
    minSize?: number;
}

/**
 * Resizes the two panes either side of a handle.
 *
 * Sizing is relative to that pair rather than to the containing row, so
 * several splitters compose: each one redistributes only the width its own
 * two neighbours already occupy, and leaves every other pane alone.
 */
export class Splitter {
    private readonly options: Required<SplitterOptions>;
    private readonly teardown: Array<() => void> = [];
    private dragging = false;
    private startX = 0;
    private startBeforeWidth = 0;

    constructor(options: SplitterOptions) {
        this.options = {
            minSize: 160,
            ...options
        };

        const { handle } = this.options;

        this.teardown.push(
            on(handle, 'mousedown', event => this.onDown(event)),
            on(handle, 'dblclick', () => this.setRatio(0.5)),
            on(handle, 'selectstart', event => event.preventDefault()),
            on(document, 'mousemove', event => this.onMove(event as MouseEvent)),
            on(document, 'mouseup', () => this.onUp())
        );
    }

    /** Splits the pair's width, `ratio` being the share given to the first pane. */
    public setRatio(ratio: number): void {
        const available = this.availableWidth();
        const beforeWidth = available * ratio;
        this.applyWidths(beforeWidth, available - beforeWidth);
    }

    /** Drops explicit sizing so the panes fall back to their CSS flex rules. */
    public reset(): void {
        for (const pane of [this.options.before, this.options.after]) {
            pane.style.width = '';
            pane.style.flexBasis = '';
            pane.style.flexGrow = '';
            pane.style.flexShrink = '';
        }
    }

    public dispose(): void {
        this.teardown.forEach(fn => fn());
        this.teardown.length = 0;
    }

    /** The width the two neighbours currently share between them. */
    private availableWidth(): number {
        return this.options.before.offsetWidth + this.options.after.offsetWidth;
    }

    /**
     * Sizes the pair.
     *
     * Written as a share of the row rather than a pixel width. Pixel widths do
     * not survive the window being resized: every pane kept the size it was
     * dragged to and the extra width was simply left empty on the right, until
     * a reload started the layout over. A percentage costs no resize listener
     * and no recalculation -- the panes scale because the row does.
     *
     * The last pane in the row is never pinned, so whatever is left after the
     * sashes have taken their fixed few pixels always has somewhere to go.
     */
    private applyWidths(beforeWidth: number, afterWidth: number): void {
        const row = this.rowWidth();
        if (row <= 0) {
            return;
        }

        this.pin(this.options.before, (beforeWidth / row) * 100);

        if (this.isLastPane(this.options.after)) {
            this.fill(this.options.after);
        } else {
            this.pin(this.options.after, (afterWidth / row) * 100);
        }
    }

    private pin(pane: HTMLElement, share: number): void {
        pane.style.width = '';
        pane.style.flexBasis = `${share.toFixed(4)}%`;
        pane.style.flexGrow = '0';
        pane.style.flexShrink = '0';
    }

    /** Lets a pane absorb whatever the pinned ones leave over. */
    private fill(pane: HTMLElement): void {
        pane.style.width = '';
        pane.style.flexBasis = '0';
        pane.style.flexGrow = '1';
        pane.style.flexShrink = '1';
    }

    private rowWidth(): number {
        return this.options.before.parentElement?.clientWidth ?? 0;
    }

    /**
     * Whether nothing visible follows this pane in the row.
     *
     * Hidden panes are skipped rather than counted: the format row also holds
     * the tree, which is displayed only in the other mode, and treating it as
     * the last pane would leave the formatted output pinned with nothing able
     * to absorb the few pixels the sash takes.
     */
    private isLastPane(pane: HTMLElement): boolean {
        const visible = Array.from(pane.parentElement?.children ?? []).filter(
            child => child.classList.contains('pane') && (child as HTMLElement).offsetWidth > 0
        );
        return visible.length === 0 || visible[visible.length - 1] === pane;
    }

    private onDown(event: MouseEvent): void {
        this.dragging = true;
        this.startX = event.clientX;
        this.startBeforeWidth = this.options.before.offsetWidth;

        this.options.handle.classList.add('dragging');
        document.body.classList.add('dragging');
        document.body.style.userSelect = 'none';

        event.preventDefault();
    }

    private onMove(event: MouseEvent): void {
        if (!this.dragging) {
            return;
        }

        const available = this.availableWidth();
        const { minSize } = this.options;
        const proposed = this.startBeforeWidth + (event.clientX - this.startX);
        const beforeWidth = Math.max(minSize, Math.min(proposed, available - minSize));

        this.applyWidths(beforeWidth, available - beforeWidth);
        event.preventDefault();
    }

    private onUp(): void {
        if (!this.dragging) {
            return;
        }
        this.dragging = false;
        this.options.handle.classList.remove('dragging');
        document.body.classList.remove('dragging');
        document.body.style.userSelect = '';
    }
}

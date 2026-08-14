import { Splitter } from '../../ui/splitter';

/** jsdom has no layout, so widths have to be declared. */
function setWidth(element: HTMLElement, width: number): void {
    Object.defineProperty(element, 'offsetWidth', { value: width, configurable: true });
}

function setRowWidth(element: HTMLElement, width: number): void {
    Object.defineProperty(element, 'clientWidth', { value: width, configurable: true });
}

function drag(handle: HTMLElement, fromX: number, toX: number): void {
    handle.dispatchEvent(new MouseEvent('mousedown', { clientX: fromX, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: toX, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

/**
 * A pane's share of the row.
 *
 * Sizes are shares rather than pixel widths so that they survive the window
 * being resized; the pixels a share works out to are the browser's business.
 */
function shareOf(element: HTMLElement): number {
    return parseFloat(element.style.flexBasis);
}

/** True when a pane is set to absorb whatever the pinned ones leave over. */
function fills(element: HTMLElement): boolean {
    // jsdom normalises a bare `0` basis to `0px`.
    return element.style.flexGrow === '1' && parseFloat(element.style.flexBasis) === 0;
}

const ROW = 900;

describe('Splitter', () => {
    let row: HTMLElement;
    let a: HTMLElement;
    let b: HTMLElement;
    let c: HTMLElement;
    let handleAB: HTMLElement;
    let handleBC: HTMLElement;
    const splitters: Splitter[] = [];

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="row">
                <div id="a" class="pane"></div><div id="h1"></div>
                <div id="b" class="pane"></div><div id="h2"></div>
                <div id="c" class="pane"></div>
            </div>`;
        row = document.getElementById('row') as HTMLElement;
        a = document.getElementById('a') as HTMLElement;
        b = document.getElementById('b') as HTMLElement;
        c = document.getElementById('c') as HTMLElement;
        handleAB = document.getElementById('h1') as HTMLElement;
        handleBC = document.getElementById('h2') as HTMLElement;

        setRowWidth(row, ROW);
        [a, b, c].forEach(pane => setWidth(pane, 300));
    });

    afterEach(() => {
        splitters.forEach(splitter => splitter.dispose());
        splitters.length = 0;
    });

    function makeSplitter(
        handle: HTMLElement,
        before: HTMLElement,
        after: HTMLElement | HTMLElement[]
    ): Splitter {
        const splitter = new Splitter({ handle, before, after });
        splitters.push(splitter);
        return splitter;
    }

    it('moves width from one pane to its neighbour', () => {
        makeSplitter(handleAB, a, b);

        drag(handleAB, 300, 350);

        expect(shareOf(a)).toBeCloseTo((350 / ROW) * 100, 2);
        expect(shareOf(b)).toBeCloseTo((250 / ROW) * 100, 2);
    });

    it('keeps the pair total constant', () => {
        makeSplitter(handleAB, a, b);

        drag(handleAB, 300, 420);

        expect(shareOf(a) + shareOf(b)).toBeCloseTo((600 / ROW) * 100, 2);
    });

    it('leaves panes outside the pair untouched', () => {
        makeSplitter(handleAB, a, b);

        drag(handleAB, 300, 350);

        expect(c.style.flexBasis).toBe('');
    });

    it('lets two splitters resize independently', () => {
        makeSplitter(handleAB, a, b);
        makeSplitter(handleBC, b, c);

        drag(handleAB, 300, 400);
        const afterFirst = shareOf(a);

        drag(handleBC, 600, 700);

        expect(shareOf(a)).toBeCloseTo(afterFirst, 4);
    });

    it('refuses to shrink a pane below the minimum', () => {
        makeSplitter(handleAB, a, b);

        drag(handleAB, 300, -500);

        expect(shareOf(a)).toBeCloseTo((160 / ROW) * 100, 2);
    });

    it('refuses to grow a pane past the pair minus the minimum', () => {
        makeSplitter(handleAB, a, b);

        drag(handleAB, 300, 5000);

        expect(shareOf(a)).toBeCloseTo((440 / ROW) * 100, 2);
    });

    it('splits evenly on double-click', () => {
        makeSplitter(handleAB, a, b);

        handleAB.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

        expect(shareOf(a)).toBeCloseTo((300 / ROW) * 100, 2);
    });

    it('applies an explicit ratio', () => {
        const splitter = makeSplitter(handleAB, a, b);

        splitter.setRatio(0.75);

        expect(shareOf(a)).toBeCloseTo((450 / ROW) * 100, 2);
    });

    /*
     * Panes used to be pinned to the pixel width they were dragged to. Making
     * the window wider then left the extra space empty on the right until the
     * window was reloaded, because nothing in the row was allowed to grow.
     */
    describe('surviving a resize', () => {
        it('sizes panes as a share of the row, not in pixels', () => {
            makeSplitter(handleAB, a, b);

            drag(handleAB, 300, 350);

            expect(a.style.width).toBe('');
            expect(a.style.flexBasis).toMatch(/%$/);
        });

        it('leaves the last pane free to absorb what the others do not take', () => {
            makeSplitter(handleBC, b, c);

            drag(handleBC, 600, 650);

            expect(fills(c)).toBe(true);
        });

        it('treats a hidden pane as absent when deciding which is last', () => {
            // The format row also holds the tree, shown only in the other mode.
            setWidth(c, 0);
            makeSplitter(handleAB, a, b);

            drag(handleAB, 300, 350);

            expect(fills(b)).toBe(true);
        });

        it('gives everything back to the CSS on reset', () => {
            const splitter = makeSplitter(handleAB, a, b);
            drag(handleAB, 300, 350);

            splitter.reset();

            expect(a.style.flexBasis).toBe('');
            expect(a.style.flexGrow).toBe('');
        });
    });

    /*
     * The format row shows either the formatted text or the visual view in the
     * same slot. Sizing the hidden one made the sash work backwards: the width
     * being redistributed was not the width the reader could see, so dragging
     * right shrank the pane on the left until it stuck at its minimum.
     */
    describe('a slot that swaps panes by mode', () => {
        beforeEach(() => {
            // `b` is the hidden alternative; `c` is the one on screen.
            setWidth(b, 0);
            setWidth(a, 400);
            setWidth(c, 500);
        });

        it('resizes whichever alternative is on screen', () => {
            makeSplitter(handleAB, a, [b, c]);

            drag(handleAB, 400, 500);

            expect(shareOf(a)).toBeCloseTo((500 / ROW) * 100, 2);
        });

        it('grows the left pane when dragged right, not shrinks it', () => {
            makeSplitter(handleAB, a, [b, c]);

            drag(handleAB, 400, 500);

            expect(shareOf(a)).toBeGreaterThan((400 / ROW) * 100);
        });

        it('leaves the hidden alternative with no width of its own', () => {
            makeSplitter(handleAB, a, [b, c]);

            drag(handleAB, 400, 500);

            expect(b.style.cssText).toBe('');
        });

        it('clears every alternative on reset', () => {
            const splitter = makeSplitter(handleAB, a, [b, c]);
            drag(handleAB, 400, 500);

            splitter.reset();

            expect(c.style.flexBasis).toBe('');
        });
    });
});

import { Splitter } from '../../ui/splitter';

/** jsdom has no layout, so pane widths have to be declared. */
function setWidth(element: HTMLElement, width: number): void {
    Object.defineProperty(element, 'offsetWidth', { value: width, configurable: true });
}

function drag(handle: HTMLElement, fromX: number, toX: number): void {
    handle.dispatchEvent(new MouseEvent('mousedown', { clientX: fromX, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: toX, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

function widthOf(element: HTMLElement): number {
    return parseFloat(element.style.width);
}

describe('Splitter', () => {
    let a: HTMLElement;
    let b: HTMLElement;
    let c: HTMLElement;
    let handleAB: HTMLElement;
    let handleBC: HTMLElement;
    const splitters: Splitter[] = [];

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="row">
                <div id="a"></div><div id="h1"></div>
                <div id="b"></div><div id="h2"></div>
                <div id="c"></div>
            </div>`;
        a = document.getElementById('a') as HTMLElement;
        b = document.getElementById('b') as HTMLElement;
        c = document.getElementById('c') as HTMLElement;
        handleAB = document.getElementById('h1') as HTMLElement;
        handleBC = document.getElementById('h2') as HTMLElement;

        [a, b, c].forEach(pane => setWidth(pane, 300));
    });

    afterEach(() => {
        splitters.forEach(splitter => splitter.dispose());
        splitters.length = 0;
    });

    function makeSplitter(handle: HTMLElement, before: HTMLElement, after: HTMLElement): Splitter {
        const splitter = new Splitter({ handle, before, after });
        splitters.push(splitter);
        return splitter;
    }

    it('moves width from one pane to its neighbour', () => {
        makeSplitter(handleAB, a, b);

        drag(handleAB, 300, 350);

        expect(widthOf(a)).toBe(350);
        expect(widthOf(b)).toBe(250);
    });

    it('keeps the pair total constant', () => {
        makeSplitter(handleAB, a, b);

        drag(handleAB, 300, 180);

        expect(widthOf(a) + widthOf(b)).toBe(600);
    });

    /*
     * Sizing is relative to the pair, not the row, so a second splitter can
     * exist without the two fighting over the same total.
     */
    it('leaves panes outside the pair untouched', () => {
        makeSplitter(handleAB, a, b);
        makeSplitter(handleBC, b, c);

        drag(handleAB, 300, 400);

        expect(c.style.width).toBe('');
        expect(widthOf(a)).toBe(400);
        expect(widthOf(b)).toBe(200);
    });

    it('lets two splitters resize independently', () => {
        makeSplitter(handleAB, a, b);
        makeSplitter(handleBC, b, c);

        drag(handleAB, 300, 400);
        // b is now 200 wide; the second sash redistributes b and c only.
        setWidth(a, 400);
        setWidth(b, 200);
        drag(handleBC, 600, 650);

        expect(widthOf(a)).toBe(400);
        expect(widthOf(b) + widthOf(c)).toBe(500);
    });

    it('refuses to shrink a pane below the minimum', () => {
        makeSplitter(handleAB, a, b);

        drag(handleAB, 300, -1000);

        expect(widthOf(a)).toBe(160);
        expect(widthOf(b)).toBe(440);
    });

    it('refuses to grow a pane past the pair minus the minimum', () => {
        makeSplitter(handleAB, a, b);

        drag(handleAB, 300, 5000);

        expect(widthOf(a)).toBe(440);
        expect(widthOf(b)).toBe(160);
    });

    it('splits evenly on double-click', () => {
        makeSplitter(handleAB, a, b);
        setWidth(a, 450);
        setWidth(b, 150);

        handleAB.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

        expect(widthOf(a)).toBe(300);
        expect(widthOf(b)).toBe(300);
    });

    it('applies an explicit ratio', () => {
        makeSplitter(handleAB, a, b).setRatio(0.25);

        expect(widthOf(a)).toBe(150);
        expect(widthOf(b)).toBe(450);
    });

    it('drops explicit sizing on reset', () => {
        const splitter = makeSplitter(handleAB, a, b);
        drag(handleAB, 300, 350);

        splitter.reset();

        expect(a.style.width).toBe('');
        expect(a.style.flexGrow).toBe('');
        expect(b.style.width).toBe('');
    });

    it('marks the handle and body while dragging', () => {
        makeSplitter(handleAB, a, b);

        handleAB.dispatchEvent(new MouseEvent('mousedown', { clientX: 300, bubbles: true }));
        expect(handleAB.classList.contains('dragging')).toBe(true);
        expect(document.body.classList.contains('dragging')).toBe(true);

        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        expect(handleAB.classList.contains('dragging')).toBe(false);
        expect(document.body.classList.contains('dragging')).toBe(false);
    });

    it('ignores movement that did not start on the handle', () => {
        makeSplitter(handleAB, a, b);

        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, bubbles: true }));

        expect(a.style.width).toBe('');
    });

    it('stops responding after dispose', () => {
        const splitter = makeSplitter(handleAB, a, b);
        splitter.dispose();

        drag(handleAB, 300, 400);

        expect(a.style.width).toBe('');
    });
});

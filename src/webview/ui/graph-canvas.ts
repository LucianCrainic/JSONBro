/**
 * The document drawn as a graph, pannable and zoomable.
 *
 * SVG rather than a canvas: every colour then comes from the same stylesheet
 * as the rest of the panel, so the graph follows the user's theme without a
 * palette of its own, and a node is a real element that can be clicked and
 * described to a screen reader.
 *
 * Like the tree, it renders the document the format view produced -- and it
 * shares that view's fold state, so opening a node in one shape opens it in
 * the other.
 */
import {
    edgePath,
    layoutGraph,
    NODE_HEIGHT,
    NODE_WIDTH,
    type GraphLayout,
    type GraphNode
} from '../engine/graph-layout';
import { nodeAt, type NodeView } from '../engine/node-view';
import type { FoldState } from '../engine/line-index';
import type { PrettyDocument } from '../engine/pretty-sink';
import { escapeHtml, on } from './dom';

const SVG_NS = 'http://www.w3.org/2000/svg';

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

/**
 * How many characters each half of a node's box may use.
 *
 * The key is drawn from the left and the value from the right, so without a
 * budget a long key and a long value meet in the middle and overprint each
 * other -- which is exactly what a node holding a long description did. The
 * clip path below is the guarantee that nothing escapes the box; these keep
 * the two halves from reaching each other inside it.
 *
 * Derived from the box rather than picked, so widening a node widens what fits
 * in it. The per-character widths are measured from the rendered font: the key
 * is bold and therefore wider than the value.
 */
const KEY_CHAR_WIDTH = 7.4;
const VALUE_CHAR_WIDTH = 6.8;
const TEXT_PADDING = 10;
/** Blank space kept between the two halves so they never appear to touch. */
const TEXT_GAP = 14;

const HALF_WIDTH = (NODE_WIDTH - TEXT_PADDING * 2 - TEXT_GAP) / 2;
const KEY_BUDGET = Math.floor(HALF_WIDTH / KEY_CHAR_WIDTH);
const VALUE_BUDGET = Math.floor(HALF_WIDTH / VALUE_CHAR_WIDTH);

/** One clip per box, shared by every node: they are all the same size. */
const CLIP_ID = 'jb-graph-node-clip';

export interface GraphCanvasOptions {
    viewport: HTMLElement;
    /** Called when a node is clicked. */
    onSelect?: (line: number) => void;
    /** Called when a node's twisty is clicked. */
    onToggle?: (line: number) => void;
    /** Called after a layout, so the caller can report what it covers. */
    onLayout?: (layout: GraphLayout) => void;
}

export class GraphCanvas {
    private readonly options: GraphCanvasOptions;
    private readonly teardown: Array<() => void> = [];

    private readonly svg: SVGSVGElement;
    private readonly scene: SVGGElement;
    private readonly resizes: ResizeObserver | null;

    private doc: PrettyDocument | null = null;
    private folds: FoldState | null = null;
    private selected = -1;
    /** Lines carrying a search hit, so drawing a box is a lookup, not a scan. */
    private matches: ReadonlySet<number> = new Set();
    /** The one hit the reader is standing on, or -1. */
    private currentMatch = -1;

    private zoom = 1;
    private panX = 40;
    private panY = 40;
    private dragging = false;
    private dragFrom = { x: 0, y: 0, panX: 0, panY: 0 };
    /** Set once the reader has panned or zoomed, so redraws stop re-fitting. */
    private moved = false;

    constructor(options: GraphCanvasOptions) {
        this.options = options;

        this.svg = document.createElementNS(SVG_NS, 'svg');
        this.svg.setAttribute('class', 'graph');
        this.svg.setAttribute('role', 'img');
        this.scene = document.createElementNS(SVG_NS, 'g');
        this.svg.appendChild(this.scene);
        options.viewport.appendChild(this.svg);

        // The graph is framed against the size of its viewport, and that size
        // is zero while the visual view belongs to another mode. Watching it
        // means the first real size re-frames the picture -- and so does the
        // window being resized afterwards.
        this.resizes =
            typeof ResizeObserver === 'undefined'
                ? null
                : new ResizeObserver(() => this.onResize());
        this.resizes?.observe(options.viewport);

        this.wire();
    }

    private onResize(): void {
        if (this.moved || !this.doc || !this.folds) {
            return;
        }
        this.fit(layoutGraph(this.doc, this.folds));
    }

    public setDocument(doc: PrettyDocument | null, folds: FoldState | null): void {
        this.doc = doc;
        this.folds = folds;
        this.selected = -1;
        this.matches = new Set();
        this.currentMatch = -1;
        this.moved = false;
        this.render();
    }

    public setSelected(line: number): void {
        this.selected = line;
        for (const node of Array.from(this.scene.querySelectorAll('[data-graph-line]'))) {
            node.classList.toggle(
                'is-selected',
                Number((node as SVGGElement).dataset.graphLine) === line
            );
        }
    }

    /**
     * Marks the boxes a search found, and the one being stood on.
     *
     * Searching the picture used to move the view and change nothing else: the
     * count in the find widget went up, the graph slid somewhere, and nothing
     * on it said which box had been found. The tree marks its rows; this is the
     * same fact drawn in the other shape.
     *
     * Repainted in place rather than through a redraw -- the layout has not
     * changed, and re-fitting the view on every keystroke of a search would
     * throw away wherever the reader had panned to.
     */
    public setMatches(lines: ReadonlySet<number>, current: number): void {
        this.matches = lines;
        this.currentMatch = current;

        for (const node of Array.from(
            this.scene.querySelectorAll<SVGGElement>('[data-graph-line]')
        )) {
            const line = Number(node.dataset.graphLine);
            node.classList.toggle('is-match', lines.has(line));
            node.classList.toggle('is-current-match', line === current);
        }
    }

    /** Whether a line carries a search hit, and whether it is the current one. */
    private matchStateOf(line: number): string {
        if (!this.matches.has(line)) {
            return '';
        }
        return line === this.currentMatch ? ' is-match is-current-match' : ' is-match';
    }

    /** Redraws from the current fold state. */
    public render(): void {
        if (!this.doc || !this.folds) {
            this.scene.replaceChildren();
            return;
        }

        const layout = layoutGraph(this.doc, this.folds);
        this.scene.innerHTML = this.markup(layout);

        // Until the reader takes control of the view, every redraw re-fits:
        // opening a node changes the shape, and leaving the new part off
        // screen would make expanding look like nothing happened.
        if (this.moved) {
            this.applyTransform();
        } else {
            this.fit(layout);
        }

        this.options.onLayout?.(layout);
    }

    /**
     * Frames the whole graph, or as much of it as the zoom range allows.
     *
     * Never zooms in past 1: a three-node document blown up to fill the pane
     * looks broken rather than generous.
     */
    private fit(layout: GraphLayout): void {
        const rect = this.options.viewport.getBoundingClientRect();
        const padding = 24;
        const usableWidth = rect.width - padding * 2;
        const usableHeight = rect.height - padding * 2;

        if (layout.width <= 0 || usableWidth <= 0 || usableHeight <= 0) {
            this.applyTransform();
            return;
        }

        this.zoom = clamp(
            Math.min(usableWidth / layout.width, usableHeight / layout.height, 1),
            MIN_ZOOM,
            MAX_ZOOM
        );
        this.panX = (rect.width - layout.width * this.zoom) / 2;
        this.panY = (rect.height - layout.height * this.zoom) / 2;
        this.applyTransform();
    }

    // -------------------------------------------------------------- rendering

    private markup(layout: GraphLayout): string {
        const doc = this.doc;
        if (!doc) {
            return '';
        }

        const byLine = new Map(layout.nodes.map(node => [node.line, node]));

        const edges = layout.edges
            .map(edge => {
                const from = byLine.get(edge.from);
                const to = byLine.get(edge.to);
                return from && to
                    ? `<path class="graph__edge" d="${edgePath(from, to)}" />`
                    : '';
            })
            .join('');

        const nodes = layout.nodes.map(node => this.nodeMarkup(node)).join('');

        // Defined once and referenced by every node. A clip path applies in the
        // coordinates of the element using it, and each node carries its own
        // transform, so one definition clips all of them to their own box.
        const defs = `<defs><clipPath id="${CLIP_ID}"><rect width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="4" /></clipPath></defs>`;

        return `${defs}<g class="graph__edges">${edges}</g><g class="graph__nodes">${nodes}</g>`;
    }

    private nodeMarkup(node: GraphNode): string {
        const doc = this.doc as PrettyDocument;
        const view = nodeAt(doc, node.line);

        const name = labelOf(view);
        const label = clip(name, KEY_BUDGET);
        const value = clip(view.preview, VALUE_BUDGET);

        // A collapsed container says how much is folded away, so the reader can
        // tell a node worth opening from one that holds a single value.
        const twisty = node.expandable
            ? `<g class="graph__twisty" data-graph-toggle="${node.line}" transform="translate(${
                  node.x + NODE_WIDTH
              } ${node.y + NODE_HEIGHT / 2})">
                    <circle r="8" />
                    <text text-anchor="middle" dy="3.5">${node.collapsed ? '+' : '−'}</text>
               </g>`
            : '';

        return `<g class="graph__node graph__node--${view.type}${
            node.line === this.selected ? ' is-selected' : ''
        }${this.matchStateOf(node.line)}" data-graph-line="${node.line}" transform="translate(${node.x} ${node.y})"
                    role="treeitem" aria-level="${node.depth + 1}"
                    data-tip="${escapeHtml(describeNode(name, view.preview))}">
                    <rect width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="4" />
                    <g clip-path="url(#${CLIP_ID})">
                        <text class="graph__label${
                            view.indexed ? ' graph__label--index' : ''
                        }" x="${TEXT_PADDING}" y="20">${escapeHtml(label)}</text>
                        <text class="graph__value" x="${NODE_WIDTH - TEXT_PADDING}" y="20" text-anchor="end">${escapeHtml(
                            value
                        )}</text>
                    </g>
               </g>${twisty}`;
    }

    // ------------------------------------------------------------ interaction

    private wire(): void {
        this.teardown.push(
            on(this.options.viewport, 'mousedown', event => this.onDown(event)),
            on(document, 'mousemove', event => this.onMove(event as MouseEvent)),
            on(document, 'mouseup', () => this.onUp()),
            on(this.options.viewport, 'wheel', event => this.onWheel(event as WheelEvent), {
                passive: false
            }),
            on(this.options.viewport, 'click', event => this.onClick(event))
        );
    }

    private onClick(event: MouseEvent): void {
        const target = event.target as Element | null;

        const toggle = target?.closest<SVGGElement>('[data-graph-toggle]');
        if (toggle) {
            event.stopPropagation();
            this.options.onToggle?.(Number(toggle.dataset.graphToggle));
            return;
        }

        const node = target?.closest<SVGGElement>('[data-graph-line]');
        if (node) {
            this.options.onSelect?.(Number(node.dataset.graphLine));
        }
    }

    private onDown(event: MouseEvent): void {
        // Dragging a node would mean moving it, which the layout owns; dragging
        // the background moves the view.
        if ((event.target as Element | null)?.closest('[data-graph-line]')) {
            return;
        }
        this.dragging = true;
        this.dragFrom = { x: event.clientX, y: event.clientY, panX: this.panX, panY: this.panY };
        this.options.viewport.classList.add('is-panning');
        event.preventDefault();
    }

    private onMove(event: MouseEvent): void {
        if (!this.dragging) {
            return;
        }
        this.panX = this.dragFrom.panX + (event.clientX - this.dragFrom.x);
        this.panY = this.dragFrom.panY + (event.clientY - this.dragFrom.y);
        this.moved = true;
        this.applyTransform();
    }

    private onUp(): void {
        this.dragging = false;
        this.options.viewport.classList.remove('is-panning');
    }

    /**
     * Zooms about the pointer, so whatever is under it stays under it.
     */
    private onWheel(event: WheelEvent): void {
        event.preventDefault();

        const rect = this.options.viewport.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;

        const next = clamp(this.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), MIN_ZOOM, MAX_ZOOM);
        const factor = next / this.zoom;

        this.panX = pointerX - (pointerX - this.panX) * factor;
        this.panY = pointerY - (pointerY - this.panY) * factor;
        this.zoom = next;
        this.moved = true;
        this.applyTransform();
    }

    public zoomBy(factor: number): void {
        this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        this.moved = true;
        this.applyTransform();
    }

    /** Frames the whole graph again, and resumes re-fitting on every redraw. */
    public resetView(): void {
        this.moved = false;
        this.render();
    }

    /** Brings a node into view without changing the zoom. */
    public revealLine(line: number): void {
        const node = this.scene.querySelector<SVGGElement>(`[data-graph-line="${line}"]`);
        if (!node || !this.doc || !this.folds) {
            return;
        }

        const transform = node.getAttribute('transform') ?? '';
        const [x, y] = (transform.match(/-?[\d.]+/g) ?? ['0', '0']).map(Number);
        const rect = this.options.viewport.getBoundingClientRect();

        this.panX = rect.width / 2 - (x + NODE_WIDTH / 2) * this.zoom;
        this.panY = rect.height / 2 - (y + NODE_HEIGHT / 2) * this.zoom;
        this.moved = true;
        this.applyTransform();
    }

    /**
     * Written as an attribute rather than a style, so the panel's content
     * security policy -- which forbids inline styles -- has nothing to say.
     */
    private applyTransform(): void {
        this.scene.setAttribute(
            'transform',
            `translate(${this.panX.toFixed(2)} ${this.panY.toFixed(2)}) scale(${this.zoom.toFixed(3)})`
        );
    }

    public dispose(): void {
        for (const off of this.teardown) {
            off();
        }
        this.teardown.length = 0;
        this.resizes?.disconnect();
        this.svg.remove();
    }
}

function clip(text: string, budget: number): string {
    return text.length > budget ? `${text.slice(0, budget - 1)}…` : text;
}

/**
 * What a box calls itself.
 *
 * A property has its name; an array element has nothing but its position, and
 * leaving that blank turned an array of objects into a column of identical
 * unlabelled boxes with no way to tell which was which.
 */
function labelOf(view: NodeView): string {
    if (view.key) {
        return view.key;
    }
    return view.indexed ? String(view.index) : 'root';
}

/** The full text of a node, for the tooltip that shows what was clipped. */
function describeNode(key: string, value: string): string {
    return key ? `${key}: ${value}` : value;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

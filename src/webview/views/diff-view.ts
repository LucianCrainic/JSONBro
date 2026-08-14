/**
 * The Diff view: original/modified inputs and the list of changes between them.
 */
import { JSONDiff } from '../diff';
import type { DiffResult } from '../diff';
import { JSONParser } from '../json-parser';
import { byId, delegate, escapeHtml, on, qsa } from '../ui/dom';
import { Icons } from '../ui/icons';
import { PanelGroup } from '../ui/panels';
import { Splitter } from '../ui/splitter';
import { plural, type StatusModel } from '../ui/status-bar';
import type { DiffState } from '../../shared/messages';
import type { Messenger } from '../ui/messaging';

const PANEL_IDS = ['left-json-panel', 'diff-result-panel', 'right-json-panel'];

export class DiffView {
    private readonly messenger: Messenger;
    private readonly teardown: Array<() => void> = [];

    private leftJson: unknown = null;
    /**
     * The left document as it was when the comparison ran.
     *
     * Changes are always applied to this rather than to the running result:
     * every path in `diffs` is expressed in its coordinates, so re-deriving
     * the document from the set of applied changes keeps them meaningful no
     * matter what order the user resolves rows in.
     */
    private originalLeft: unknown = null;
    private rightJson: unknown = null;
    private diffs: DiffResult[] = [];
    private states = new Map<string, DiffState>();
    private strict = false;
    private loadingFromHistory = false;
    private status: StatusModel = {};

    private panels: PanelGroup | null = null;
    private readonly splitters: Splitter[] = [];

    /** Notifies the shell that the status model changed. */
    public onStatusChange: (status: StatusModel) => void = () => undefined;

    constructor(messenger: Messenger) {
        this.messenger = messenger;
        this.setupLayout();
        this.setupControls();
        this.setupResultInteractions();
    }

    public get strictMode(): boolean {
        return this.strict;
    }

    // ---------------------------------------------------------------- layout

    private setupLayout(): void {
        const container = byId('diff-container');
        if (!container) {
            return;
        }

        this.panels = new PanelGroup({
            container,
            panelIds: PANEL_IDS,
            onChange: maximized => {
                if (maximized === null) {
                    this.splitters.forEach(splitter => splitter.reset());
                }
                this.splitters.forEach((splitter, i) => {
                    const handle = byId(i === 0 ? 'diff-splitter-left' : 'diff-splitter-right');
                    handle?.classList.toggle('hidden', maximized !== null);
                });
            }
        });

        // Two sashes for three panes. Each resizes only its own neighbours, so
        // dragging one does not disturb the pane on the far side.
        for (const [handleId, beforeId, afterId] of [
            ['diff-splitter-left', 'left-json-panel', 'diff-result-panel'],
            ['diff-splitter-right', 'diff-result-panel', 'right-json-panel']
        ] as const) {
            const handle = byId(handleId);
            const before = byId(beforeId);
            const after = byId(afterId);
            if (handle && before && after) {
                this.splitters.push(new Splitter({ handle, before, after }));
            }
        }
    }

    public resetPanelSizes(): void {
        this.panels?.restore();
        this.splitters.forEach(splitter => splitter.reset());
    }

    // -------------------------------------------------------------- controls

    private setupControls(): void {
        const bind = (id: string, handler: () => void) => {
            const element = byId(id);
            if (element) {
                this.teardown.push(on(element, 'click', handler));
            }
        };

        bind('strict-diff-toggle', () => this.toggleStrict());

        const filters = byId('diff-filters');
        if (filters) {
            this.teardown.push(
                delegate(filters, 'click', '[data-diff-filter]', chip => {
                    this.setFilter(chip.dataset.diffFilter ?? 'all');
                })
            );
        }
        bind('apply-all-diffs', () => this.applyAll());
        bind('reject-all-diffs', () => this.rejectAll());
        bind('copy-left-json', () => this.copyLeft());
        bind('clear-left-json', () => {
            this.clearSide('left-json');
            this.clearResults();
        });
        bind('clear-right-json', () => {
            this.clearSide('right-json');
            this.clearResults();
        });
    }

    private toggleStrict(): void {
        this.strict = !this.strict;
        const toggle = byId('strict-diff-toggle');
        toggle?.classList.toggle('is-active', this.strict);
        toggle?.setAttribute('aria-pressed', String(this.strict));

        const left = byId<HTMLTextAreaElement>('left-json')?.value.trim();
        const right = byId<HTMLTextAreaElement>('right-json')?.value.trim();
        if (left && right) {
            this.compare();
        }
    }

    private copyLeft(): void {
        const value = byId<HTMLTextAreaElement>('left-json')?.value;
        if (value?.trim()) {
            void navigator.clipboard
                .writeText(value)
                .catch(error => console.error('Failed to copy to clipboard:', error));
        }
    }

    private clearSide(id: 'left-json' | 'right-json'): void {
        const element = byId<HTMLTextAreaElement>(id);
        if (element) {
            element.value = '';
        }
        if (id === 'left-json') {
            this.leftJson = null;
        } else {
            this.rightJson = null;
        }
    }

    // --------------------------------------------------------------- compare

    public compare(): void {
        const leftEl = byId<HTMLTextAreaElement>('left-json');
        const rightEl = byId<HTMLTextAreaElement>('right-json');
        const output = byId('diff-output');
        if (!leftEl || !rightEl || !output) {
            return;
        }

        const leftRaw = leftEl.value.trim();
        const rightRaw = rightEl.value.trim();

        if (!leftRaw || !rightRaw) {
            output.innerHTML = renderNotice(
                Icons.diff,
                'Paste JSON into both panes to compare them.'
            );
            this.setBulkActionsVisible(false);
            this.publishStatus({});
            return;
        }

        try {
            const left = JSONParser.parseFlexible(leftRaw);
            const right = JSONParser.parseFlexible(rightRaw);

            this.states.clear();
            this.setFilter('all');
            this.leftJson = left;
            this.originalLeft = left;
            this.rightJson = right;
            this.diffs = JSONDiff.compareJson(left, right, [], this.strict);

            leftEl.value = JSON.stringify(left, null, 2);
            rightEl.value = JSON.stringify(right, null, 2);

            // Renders the comparison already in hand; it used to be computed a
            // second time here, doubling the cost on large documents.
            output.innerHTML = JSONDiff.renderDiffs(this.diffs);

            this.setBulkActionsVisible(this.diffs.length > 0);
            this.publishStatus(this.describe());

            if (!this.loadingFromHistory) {
                this.messenger.post({
                    command: 'addDiffHistory',
                    leftJson: leftRaw,
                    rightJson: rightRaw
                });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown parsing error';
            output.innerHTML = renderNotice(Icons.error, `Could not parse JSON. ${message}`, 'diff-error');
            this.setBulkActionsVisible(false);
            this.publishStatus({
                left: [{ text: 'Invalid JSON', icon: Icons.error, tone: 'error', title: message }]
            });
        }
    }

    /**
     * Narrows the list to one kind of change.
     *
     * The list carries the filter and every row decides for itself in CSS, so
     * nothing here walks the DOM.
     */
    private setFilter(filter: string): void {
        const output = byId('diff-output');
        if (output) {
            output.dataset.filter = filter;
        }

        for (const chip of qsa<HTMLElement>('[data-diff-filter]')) {
            const active = chip.dataset.diffFilter === filter;
            chip.classList.toggle('is-active', active);
            chip.setAttribute('aria-pressed', String(active));
        }
    }

    /** Change counts for the status bar, pane header and filter chips. */
    private describe(): StatusModel {
        const count = (type: string) => this.diffs.filter(diff => diff.type === type).length;
        const added = count('added');
        const removed = count('removed');
        const modified = count('modified');
        const applied = [...this.states.values()].filter(state => state === 'applied').length;

        const meta = byId('diff-meta');
        if (meta) {
            meta.textContent = this.diffs.length > 0 ? String(this.diffs.length) : '';
        }

        this.renderFilterChips({ all: this.diffs.length, added, removed, modified });

        if (this.diffs.length === 0) {
            return { left: [{ text: 'No differences', icon: Icons.valid, tone: 'ok' }] };
        }

        return {
            left: [
                { text: plural(this.diffs.length, 'difference') },
                { text: `+${added}`, tone: 'added', title: `${added} added` },
                { text: `−${removed}`, tone: 'removed', title: `${removed} removed` },
                { text: `~${modified}`, tone: 'modified', title: `${modified} modified` }
            ],
            right: applied > 0 ? [{ text: `${applied} applied`, icon: Icons.apply }] : []
        };
    }

    /** Writes the per-kind counts onto the chips and hides the row when empty. */
    private renderFilterChips(counts: Record<string, number>): void {
        const filters = byId('diff-filters');
        if (filters) {
            filters.hidden = this.diffs.length === 0;
        }

        for (const chip of qsa<HTMLElement>('[data-diff-filter]')) {
            const filter = chip.dataset.diffFilter ?? 'all';
            const count = counts[filter] ?? 0;
            chip.dataset.count = String(count);

            const label = chip.querySelector('.chip__count');
            if (label) {
                label.textContent = String(count);
            }
        }
    }

    private publishStatus(status: StatusModel): void {
        this.status = status;
        this.onStatusChange(status);
    }

    /** The status model for this view, re-published when it becomes active. */
    public getStatus(): StatusModel {
        return this.status;
    }

    public load(leftJson: string, rightJson: string): void {
        const leftEl = byId<HTMLTextAreaElement>('left-json');
        const rightEl = byId<HTMLTextAreaElement>('right-json');
        if (!leftEl || !rightEl) {
            return;
        }
        this.loadingFromHistory = true;
        try {
            leftEl.value = leftJson;
            rightEl.value = rightJson;
            this.compare();
        } finally {
            this.loadingFromHistory = false;
        }
    }

    public clear(): void {
        this.clearSide('left-json');
        this.clearSide('right-json');
        this.clearResults();
    }

    private clearResults(): void {
        const output = byId('diff-output');
        if (output) {
            output.innerHTML = '';
        }
        const meta = byId('diff-meta');
        if (meta) {
            meta.textContent = '';
        }
        this.diffs = [];
        this.states.clear();
        this.setBulkActionsVisible(false);
        this.setFilter('all');
        this.renderFilterChips({ all: 0, added: 0, removed: 0, modified: 0 });
        this.publishStatus({});
    }

    public copyResults(): void {
        const text = byId('diff-output')?.textContent;
        if (text) {
            void navigator.clipboard
                .writeText(text)
                .catch(error => console.error('Failed to copy to clipboard:', error));
        }
    }

    private setBulkActionsVisible(visible: boolean): void {
        for (const id of ['apply-all-diffs', 'reject-all-diffs']) {
            const button = byId(id);
            if (button) {
                button.hidden = !visible;
            }
        }
    }

    // ---------------------------------------------------- result interaction

    private setupResultInteractions(): void {
        const output = byId('diff-output');
        if (!output) {
            return;
        }

        this.teardown.push(
            delegate(output, 'click', '.expandable-value', element => {
                const full = element.getAttribute('data-full');
                if (full) {
                    element.innerHTML = full;
                    element.classList.remove('expandable-value');
                    element.removeAttribute('data-full');
                    element.removeAttribute('title');
                }
            }),
            delegate(output, 'click', '.apply-diff-btn', button => {
                const item = button.closest('.diff-item');
                if (item) {
                    this.applyOne(item as HTMLElement);
                }
            }),
            delegate(output, 'click', '.reject-diff-btn', button => {
                const item = button.closest('.diff-item');
                if (item) {
                    this.setState(item as HTMLElement, 'rejected');
                }
            }),
            delegate(output, 'click', '.undo-diff-btn', button => {
                const item = button.closest('.diff-item');
                if (item) {
                    this.undoOne(item as HTMLElement);
                }
            })
        );
    }

    private applyOne(item: HTMLElement): void {
        this.setState(item, 'applied');
        this.rebuildLeft();
    }

    private undoOne(item: HTMLElement): void {
        this.setState(item, 'pending');
        this.rebuildLeft();
    }

    private applyAll(): void {
        if (this.originalLeft === null || this.diffs.length === 0) {
            return;
        }
        try {
            this.leftJson = JSONDiff.applyDiffs(this.originalLeft, this.diffs);
            this.writeLeftJson();
            this.compare();
        } catch (error) {
            console.error('Error applying all diffs:', error);
        }
    }

    /**
     * Rejecting every change must also record each one as rejected. Marking
     * only the CSS class left `states` disagreeing with the UI, so a later
     * undo on an individual row behaved as if it had never been rejected.
     */
    private rejectAll(): void {
        const output = byId('diff-output');
        if (!output) {
            return;
        }
        for (const item of Array.from(output.querySelectorAll('.diff-item'))) {
            this.setState(item as HTMLElement, 'rejected');
        }
        this.rebuildLeft();
    }

    /**
     * Re-derives the left document from the original plus every applied change.
     *
     * Doing it this way -- rather than mutating on apply and un-mutating on
     * undo -- means the result cannot drift from the recorded states, and
     * array positions stay valid however many rows have been resolved.
     */
    private rebuildLeft(): void {
        if (this.originalLeft === null) {
            return;
        }

        const applied = this.diffs.filter(
            (_, index) => this.states.get(`diff-${index}`) === 'applied'
        );

        try {
            this.leftJson = applied.length > 0
                ? JSONDiff.applyDiffs(this.originalLeft, applied)
                : this.originalLeft;
            this.writeLeftJson();
        } catch (error) {
            console.error('Error applying diffs:', error);
        }
    }

    private writeLeftJson(): void {
        const leftEl = byId<HTMLTextAreaElement>('left-json');
        if (leftEl) {
            leftEl.value = JSON.stringify(this.leftJson, null, 2);
        }
    }

    private setState(item: HTMLElement, state: DiffState): void {
        const id = item.getAttribute('data-diff-id') ?? '';
        if (id) {
            this.states.set(id, state);
        }

        // Single source: CSS keys off the same attribute the view records, so
        // the two cannot disagree the way parallel classes allowed.
        item.dataset.state = state;

        const resolved = state !== 'pending';
        const toggle = (selector: string, hidden: boolean) => {
            const button = item.querySelector<HTMLElement>(selector);
            if (button) {
                button.hidden = hidden;
            }
        };
        toggle('.apply-diff-btn', resolved);
        toggle('.reject-diff-btn', resolved);
        toggle('.undo-diff-btn', !resolved);

        this.publishStatus(this.describe());
    }

    /** The resolution state of every change, for tests and future persistence. */
    public getStates(): ReadonlyMap<string, DiffState> {
        return this.states;
    }

    public dispose(): void {
        this.teardown.forEach(fn => fn());
        this.teardown.length = 0;
        this.panels?.dispose();
        this.splitters.forEach(splitter => splitter.dispose());
        this.splitters.length = 0;
    }
}

/** A centred icon-and-message placeholder shown in place of a change list. */
function renderNotice(icon: string, message: string, className = 'diff-result no-changes'): string {
    return `<div class="${className}">
        <span class="codicon codicon-${icon}" aria-hidden="true"></span>
        <span>${escapeHtml(message)}</span>
    </div>`;
}

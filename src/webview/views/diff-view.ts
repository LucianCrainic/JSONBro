/**
 * The Diff view: original/modified inputs and the list of changes between them.
 */
import { JSONDiff } from '../diff';
import type { DiffResult, DiffType } from '../diff';
import { JSONParser } from '../json-parser';
import { byId, delegate, on } from '../ui/dom';
import { PanelGroup } from '../ui/panels';
import type { DiffState } from '../../shared/messages';
import type { Messenger } from '../ui/messaging';

const PANEL_IDS = ['left-json-panel', 'diff-result-panel', 'right-json-panel'];

export class DiffView {
    private readonly messenger: Messenger;
    private readonly teardown: Array<() => void> = [];

    private leftJson: unknown = null;
    private rightJson: unknown = null;
    private diffs: DiffResult[] = [];
    private states = new Map<string, DiffState>();
    private strict = false;
    private loadingFromHistory = false;

    private panels: PanelGroup | null = null;

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
        if (container) {
            this.panels = new PanelGroup({ container, panelIds: PANEL_IDS });
        }
    }

    public resetPanelSizes(): void {
        this.panels?.restore();
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
        byId('strict-diff-toggle')?.classList.toggle('active', this.strict);

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
            output.innerHTML = '<div class="diff-error">Please enter JSON in both panes to compare.</div>';
            return;
        }

        try {
            const left = JSONParser.parseFlexible(leftRaw);
            const right = JSONParser.parseFlexible(rightRaw);

            this.states.clear();
            this.leftJson = left;
            this.rightJson = right;
            this.diffs = JSONDiff.compareJson(left, right, [], this.strict);

            leftEl.value = JSON.stringify(left, null, 2);
            rightEl.value = JSON.stringify(right, null, 2);

            output.style.color = 'inherit';
            output.innerHTML = JSONDiff.renderJsonDiff(left, right, this.strict);

            this.setBulkActionsVisible(this.diffs.length > 0);

            if (!this.loadingFromHistory) {
                this.messenger.post({
                    command: 'addDiffHistory',
                    leftJson: leftRaw,
                    rightJson: rightRaw
                });
            }
        } catch (error) {
            output.style.color = 'var(--vscode-errorForeground)';
            const message = error instanceof Error ? error.message : 'Unknown parsing error';
            output.innerHTML = `<div class="diff-error">Error parsing JSON: ${message}</div>`;
            this.setBulkActionsVisible(false);
        }
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
        this.diffs = [];
        this.states.clear();
        this.setBulkActionsVisible(false);
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

    /** Reads the diff back off the DOM node that renders it. */
    private readDiff(item: HTMLElement): DiffResult | null {
        const rawPath = item.getAttribute('data-diff-path');
        const type = item.getAttribute('data-diff-type');
        if (!rawPath || !type) {
            return null;
        }
        try {
            const diff: DiffResult = {
                type: type as DiffType,
                path: JSON.parse(rawPath)
            };
            const newValue = item.getAttribute('data-diff-value');
            const oldValue = item.getAttribute('data-diff-old-value');
            if (newValue) {
                diff.newValue = JSON.parse(newValue);
            }
            if (oldValue) {
                diff.oldValue = JSON.parse(oldValue);
            }
            return diff;
        } catch (error) {
            console.error('Malformed diff data on element:', error);
            return null;
        }
    }

    private applyOne(item: HTMLElement): void {
        const diff = this.readDiff(item);
        if (!diff || this.leftJson === null) {
            return;
        }
        try {
            this.leftJson = JSONDiff.applyDiff(this.leftJson, diff);
            this.writeLeftJson();
            this.setState(item, 'applied');
        } catch (error) {
            console.error('Error applying diff:', error);
        }
    }

    private undoOne(item: HTMLElement): void {
        const id = item.getAttribute('data-diff-id') ?? '';
        const state = this.states.get(id) ?? 'pending';

        if (state === 'applied') {
            const diff = this.readDiff(item);
            if (!diff || this.leftJson === null) {
                return;
            }
            try {
                this.leftJson = JSONDiff.revertDiff(this.leftJson, diff);
                this.writeLeftJson();
            } catch (error) {
                console.error('Error reverting diff:', error);
                return;
            }
        }

        this.setState(item, 'pending');
    }

    private applyAll(): void {
        if (this.leftJson === null || this.diffs.length === 0) {
            return;
        }
        try {
            this.leftJson = JSONDiff.applyDiffs(this.leftJson, this.diffs);
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

        item.classList.toggle('diff-applied', state === 'applied');
        item.classList.toggle('diff-rejected', state === 'rejected');

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
    }

    /** The resolution state of every change, for tests and future persistence. */
    public getStates(): ReadonlyMap<string, DiffState> {
        return this.states;
    }

    public dispose(): void {
        this.teardown.forEach(fn => fn());
        this.teardown.length = 0;
        this.panels?.dispose();
    }
}

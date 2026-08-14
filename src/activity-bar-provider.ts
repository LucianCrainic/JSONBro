/**
 * Activity bar tree data provider for JSONBro
 */
import * as vscode from 'vscode';
import {
    formatSize,
    relativeTime,
    type DiffEntry,
    type FormatEntry,
    type HistoryStore
} from './history-store';

/**
 * What a tree item stands for.
 *
 * Children used to be chosen by comparing the item's *label* against the
 * string 'Format History', so renaming a heading would have silently emptied
 * the tree beneath it.
 */
type ItemKind = 'action' | 'formatHistoryRoot' | 'diffHistoryRoot' | 'formatEntry' | 'diffEntry';

export class JSONBroActivityBarProvider implements vscode.TreeDataProvider<JSONBroItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<JSONBroItem | undefined | null | void> = new vscode.EventEmitter<JSONBroItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<JSONBroItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private readonly store: HistoryStore;

    constructor(store: HistoryStore) {
        this.store = store;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async addFormatHistory(json: string): Promise<void> {
        await this.store.addFormat(json);
        this.refresh();
    }

    async addDiffHistory(leftJson: string, rightJson: string): Promise<void> {
        await this.store.addDiff(leftJson, rightJson);
        this.refresh();
    }

    async removeFormatHistoryEntries(indices: number[]): Promise<void> {
        await this.store.removeFormats(indices);
        this.refresh();
    }

    async removeDiffHistoryEntries(indices: number[]): Promise<void> {
        await this.store.removeDiffs(indices);
        this.refresh();
    }

    async clearFormatHistory(): Promise<void> {
        await this.store.clearFormats();
        this.refresh();
    }

    async clearDiffHistory(): Promise<void> {
        await this.store.clearDiffs();
        this.refresh();
    }

    async renameFormatHistoryEntry(index: number, newName: string): Promise<void> {
        await this.store.renameFormat(index, newName);
        this.refresh();
    }

    async renameDiffHistoryEntry(index: number, newName: string): Promise<void> {
        await this.store.renameDiff(index, newName);
        this.refresh();
    }

    async clearHistory(): Promise<void> {
        await this.store.clear();
        this.refresh();
    }

    getTreeItem(element: JSONBroItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: JSONBroItem): Thenable<JSONBroItem[]> {
        if (!element) {
            return Promise.resolve(this.roots());
        }

        switch (element.kind) {
            case 'formatHistoryRoot':
                return Promise.resolve(this.formatEntries());
            case 'diffHistoryRoot':
                return Promise.resolve(this.diffEntries());
            default:
                return Promise.resolve([]);
        }
    }

    private roots(): JSONBroItem[] {
        const formats = this.store.getFormatHistory();
        const diffs = this.store.getDiffHistory();
        const usage = this.store.usage();

        // History lives in global state, so what it costs should be visible
        // rather than something the user discovers by other means.
        const budget =
            `${formatSize(usage.bytes)} of ${formatSize(usage.limit)} used.\n` +
            'Oldest entries are dropped once the budget is full.';

        return [
            new JSONBroItem('action', 'Format JSON', 'Click to open JSON formatter', {
                command: 'jsonbro.formatJson',
                title: 'Format JSON'
            }, 'symbol-property'),
            new JSONBroItem('action', 'Diff JSON', 'Click to compare JSON files', {
                command: 'jsonbro.diffJson',
                title: 'Diff JSON'
            }, 'diff'),
            this.historyRoot('formatHistoryRoot', 'Format History', formats, budget),
            this.historyRoot('diffHistoryRoot', 'Diff History', diffs, budget)
        ];
    }

    private historyRoot(
        kind: ItemKind,
        label: string,
        entries: Array<FormatEntry | DiffEntry>,
        budget: string
    ): JSONBroItem {
        const bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
        const item = new JSONBroItem(
            kind,
            label,
            budget,
            undefined,
            'history',
            entries.length > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );

        item.description =
            entries.length === 0
                ? 'empty'
                : `${entries.length} · ${formatSize(bytes)}`;
        // Drives the section's own "clear" action in the context menu.
        item.contextValue = kind;
        return item;
    }

    private formatEntries(): JSONBroItem[] {
        return this.store.getFormatHistory().map((entry, index) => {
            const item = new JSONBroItem(
                'formatEntry',
                entry.name || defaultName(entry),
                previewOf(entry.json),
                {
                    command: 'jsonbro.loadFormatHistory',
                    title: 'Load from history',
                    arguments: [entry.json]
                },
                'file-code'
            );
            // Relative time and size beat a raw 50-character slice of the JSON:
            // one entry looks much like another when they all start with `{"`.
            item.description = describe(entry);
            item.contextValue = 'formatHistoryEntry';
            item.resourceUri = vscode.Uri.parse(`jsonbro://format-history/${index}`);
            return item;
        });
    }

    private diffEntries(): JSONBroItem[] {
        return this.store.getDiffHistory().map((entry, index) => {
            const item = new JSONBroItem(
                'diffEntry',
                entry.name || defaultName(entry),
                `${previewOf(entry.leftJson)}\n↔\n${previewOf(entry.rightJson)}`,
                {
                    command: 'jsonbro.loadDiffHistory',
                    title: 'Load from history',
                    arguments: [entry.leftJson, entry.rightJson]
                },
                'diff'
            );
            item.description = describe(entry);
            item.contextValue = 'diffHistoryEntry';
            item.resourceUri = vscode.Uri.parse(`jsonbro://diff-history/${index}`);
            return item;
        });
    }
}

/** Names an unnamed entry after when it was saved. */
function defaultName(entry: FormatEntry | DiffEntry): string {
    const when = new Date(entry.timestamp);
    const time = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isToday = new Date().toDateString() === when.toDateString();
    return isToday ? time : `${when.toLocaleDateString()} ${time}`;
}

function describe(entry: FormatEntry | DiffEntry): string {
    const parts = [relativeTime(entry.timestamp), formatSize(entry.size)];
    if (entry.truncated) {
        parts.push('preview only');
    }
    return parts.join(' · ');
}

function previewOf(json: string): string {
    const collapsed = json.replace(/\s+/g, ' ').trim();
    return collapsed.length > 200 ? `${collapsed.slice(0, 200)}…` : collapsed;
}

class JSONBroItem extends vscode.TreeItem {
    public contextValue?: string;
    public resourceUri?: vscode.Uri;

    constructor(
        public readonly kind: ItemKind,
        public readonly label: string,
        public readonly tooltip: string,
        public readonly command?: vscode.Command,
        iconId?: string,
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState || vscode.TreeItemCollapsibleState.None);
        this.tooltip = tooltip;
        this.command = command;
        if (iconId) {
            this.iconPath = new vscode.ThemeIcon(iconId);
        }
    }
}

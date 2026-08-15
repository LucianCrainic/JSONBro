/**
 * One section of saved sessions, either format or diff.
 *
 * Both kinds behave identically -- list, open, rename, pin, remove -- so one
 * provider serves both rather than the two being written out twice.
 */
import * as vscode from 'vscode';
import { describe, defaultName, entryUri, JSONBroItem, previewOf } from './tree-items';
import { formatSize, type HistoryStore } from '../history-store';

export type HistoryKind = 'format' | 'diff';

export class HistoryView implements vscode.TreeDataProvider<JSONBroItem> {
    private readonly changed = new vscode.EventEmitter<void>();
    public readonly onDidChangeTreeData = this.changed.event;

    constructor(
        private readonly kind: HistoryKind,
        private readonly store: HistoryStore
    ) {}

    public refresh(): void {
        this.changed.fire();
    }

    public getTreeItem(element: JSONBroItem): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: JSONBroItem): Thenable<JSONBroItem[]> {
        // One flat list, so anything with a parent has no children.
        return Promise.resolve(element ? [] : this.entries());
    }

    /** The size of this section, for its view title. */
    public get summary(): string {
        const entries =
            this.kind === 'format' ? this.store.getFormatHistory() : this.store.getDiffHistory();
        if (entries.length === 0) {
            return '';
        }
        const bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
        return `${entries.length} · ${formatSize(bytes)}`;
    }

    private entries(): JSONBroItem[] {
        return this.kind === 'format' ? this.formatEntries() : this.diffEntries();
    }

    private formatEntries(): JSONBroItem[] {
        return this.store.getFormatHistory().map((entry, index) => {
            return new JSONBroItem(entry.name || defaultName(entry), previewOf(entry.json), {
                command: {
                    command: 'jsonbro.loadFormatHistory',
                    title: 'Load from history',
                    arguments: [entry.json]
                },
                icon: entry.pinned ? 'pinned' : 'file-code',
                description: describe(entry),
                // Pinned and unpinned rows offer different actions, so the
                // context value has to say which this is.
                contextValue: entry.pinned ? 'formatHistoryEntryPinned' : 'formatHistoryEntry',
                resourceUri: entryUri('format', index)
            });
        });
    }

    private diffEntries(): JSONBroItem[] {
        return this.store.getDiffHistory().map((entry, index) => {
            return new JSONBroItem(
                entry.name || defaultName(entry),
                `${previewOf(entry.leftJson)}\n↔\n${previewOf(entry.rightJson)}`,
                {
                    command: {
                        command: 'jsonbro.loadDiffHistory',
                        title: 'Load from history',
                        arguments: [entry.leftJson, entry.rightJson]
                    },
                    icon: entry.pinned ? 'pinned' : 'diff',
                    description: describe(entry),
                    contextValue: entry.pinned ? 'diffHistoryEntryPinned' : 'diffHistoryEntry',
                    resourceUri: entryUri('diff', index)
                }
            );
        });
    }
}

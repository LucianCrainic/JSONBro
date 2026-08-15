/**
 * Files opened through JSONBro.
 *
 * Rows carry a `resourceUri`, so VS Code gives them the same file icon and the
 * same right-click menu as any other file in the workbench -- there is nothing
 * to reimplement, and a file that has since been deleted or renamed still
 * reads correctly.
 */
import * as vscode from 'vscode';
import { JSONBroItem } from './tree-items';
import { relativeTime, type HistoryStore } from '../history-store';

export class RecentFilesView implements vscode.TreeDataProvider<JSONBroItem> {
    private readonly changed = new vscode.EventEmitter<void>();
    public readonly onDidChangeTreeData = this.changed.event;

    constructor(private readonly store: HistoryStore) {}

    public refresh(): void {
        this.changed.fire();
    }

    public getTreeItem(element: JSONBroItem): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: JSONBroItem): Thenable<JSONBroItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        return Promise.resolve(
            this.store.getRecentFiles().map(file => {
                const uri = vscode.Uri.parse(file.uri);
                const name = uri.path.split('/').pop() ?? file.uri;

                return new JSONBroItem(name, uri.fsPath, {
                    command: {
                        command: 'jsonbro.openFile',
                        title: 'Format this file',
                        arguments: [uri]
                    },
                    description: relativeTime(file.timestamp),
                    contextValue: 'recentFile',
                    resourceUri: uri
                });
            })
        );
    }
}

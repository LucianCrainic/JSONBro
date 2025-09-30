/**
 * Activity bar tree data provider for JSONBro
 */
import * as vscode from 'vscode';

interface HistoryEntry {
    json: string;
    timestamp: number;
    mode: 'format' | 'diff';
}

export class JSONBroActivityBarProvider implements vscode.TreeDataProvider<JSONBroItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<JSONBroItem | undefined | null | void> = new vscode.EventEmitter<JSONBroItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<JSONBroItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private formatHistory: string[] = [];
    private diffHistory: Array<{leftJson: string, rightJson: string, timestamp: number}> = [];
    private formatHistoryNames: string[] = []; // Custom names for format history entries
    private diffHistoryNames: string[] = []; // Custom names for diff history entries
    
    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    addFormatHistory(json: string): void {
        this.formatHistory.unshift(json);
        this.formatHistoryNames.unshift(''); // Empty name initially, will use default
        if (this.formatHistory.length > 50) {
            this.formatHistory = this.formatHistory.slice(0, 50);
            this.formatHistoryNames = this.formatHistoryNames.slice(0, 50);
        }
        this.refresh();
    }

    addDiffHistory(leftJson: string, rightJson: string): void {
        this.diffHistory.unshift({
            leftJson,
            rightJson,
            timestamp: Date.now()
        });
        this.diffHistoryNames.unshift(''); // Empty name initially, will use default
        if (this.diffHistory.length > 50) {
            this.diffHistory = this.diffHistory.slice(0, 50);
            this.diffHistoryNames = this.diffHistoryNames.slice(0, 50);
        }
        this.refresh();
    }

    removeFormatHistoryEntry(index: number): void {
        if (index >= 0 && index < this.formatHistory.length) {
            this.formatHistory.splice(index, 1);
            this.formatHistoryNames.splice(index, 1);
            this.refresh();
        }
    }

    removeDiffHistoryEntry(index: number): void {
        if (index >= 0 && index < this.diffHistory.length) {
            this.diffHistory.splice(index, 1);
            this.diffHistoryNames.splice(index, 1);
            this.refresh();
        }
    }

    renameFormatHistoryEntry(index: number, newName: string): void {
        if (index >= 0 && index < this.formatHistoryNames.length) {
            this.formatHistoryNames[index] = newName;
            this.refresh();
        }
    }

    renameDiffHistoryEntry(index: number, newName: string): void {
        if (index >= 0 && index < this.diffHistoryNames.length) {
            this.diffHistoryNames[index] = newName;
            this.refresh();
        }
    }

    getTreeItem(element: JSONBroItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: JSONBroItem): Thenable<JSONBroItem[]> {
        if (!element) {
            // Root items
            return Promise.resolve([
                new JSONBroItem('Format JSON', 'Click to open JSON formatter', {
                    command: 'jsonbro.formatJson',
                    title: 'Format JSON'
                }, 'symbol-property', vscode.TreeItemCollapsibleState.None),
                new JSONBroItem('Diff JSON', 'Click to compare JSON files', {
                    command: 'jsonbro.diffJson',
                    title: 'Diff JSON'
                }, 'diff', vscode.TreeItemCollapsibleState.None),
                new JSONBroItem('Format History', `${this.formatHistory.length} entries`, undefined, 'history', vscode.TreeItemCollapsibleState.Collapsed),
                new JSONBroItem('Diff History', `${this.diffHistory.length} entries`, undefined, 'history', vscode.TreeItemCollapsibleState.Collapsed)
            ]);
        } else if (element.label === 'Format History') {
            return Promise.resolve(
                this.formatHistory.map((json, index) => {
                    const customName = this.formatHistoryNames[index];
                    const displayName = customName || `Entry ${index + 1}`;
                    const preview = json.length > 50 ? json.substring(0, 50) + '...' : json;
                    const item = new JSONBroItem(
                        displayName,
                        preview,
                        {
                            command: 'jsonbro.loadFormatHistory',
                            title: 'Load from history',
                            arguments: [json]
                        },
                        'file-text',
                        vscode.TreeItemCollapsibleState.None
                    );
                    item.contextValue = 'formatHistoryEntry';
                    item.resourceUri = vscode.Uri.parse(`jsonbro://format-history/${index}`);
                    return item;
                })
            );
        } else if (element.label === 'Diff History') {
            return Promise.resolve(
                this.diffHistory.map((entry, index) => {
                    const customName = this.diffHistoryNames[index];
                    const displayName = customName || `Diff ${index + 1}`;
                    const date = new Date(entry.timestamp).toLocaleString();
                    const item = new JSONBroItem(
                        displayName,
                        `Compared on ${date}`,
                        {
                            command: 'jsonbro.loadDiffHistory',
                            title: 'Load from history',
                            arguments: [entry.leftJson, entry.rightJson]
                        },
                        'diff',
                        vscode.TreeItemCollapsibleState.None
                    );
                    item.contextValue = 'diffHistoryEntry';
                    item.resourceUri = vscode.Uri.parse(`jsonbro://diff-history/${index}`);
                    return item;
                })
            );
        }
        return Promise.resolve([]);
    }
}

class JSONBroItem extends vscode.TreeItem {
    public contextValue?: string;
    public resourceUri?: vscode.Uri;

    constructor(
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

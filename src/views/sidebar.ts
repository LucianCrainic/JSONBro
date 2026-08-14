/**
 * The sidebar as a whole.
 *
 * Four sections rather than one tree: quick actions, recently opened files,
 * and the two histories. Each is a small provider of its own, and this owns
 * them so the rest of the extension has one thing to tell when something
 * changes rather than four.
 */
import * as vscode from 'vscode';
import { ActionsView } from './actions-view';
import { HistoryView } from './history-view';
import { RecentFilesView } from './recent-files-view';
import type { JSONBroItem } from './tree-items';
import type { HistoryStore } from '../history-store';

export class Sidebar {
    private readonly formatHistory: HistoryView;
    private readonly diffHistory: HistoryView;
    private readonly recentFiles: RecentFilesView;
    private readonly views: vscode.TreeView<JSONBroItem>[] = [];

    constructor(private readonly store: HistoryStore) {
        this.formatHistory = new HistoryView('format', store);
        this.diffHistory = new HistoryView('diff', store);
        this.recentFiles = new RecentFilesView(store);
    }

    /** Registers every section. The returned disposable tears them all down. */
    public register(): vscode.Disposable {
        const create = (id: string, provider: vscode.TreeDataProvider<JSONBroItem>, many = false) => {
            this.views.push(
                vscode.window.createTreeView(id, {
                    treeDataProvider: provider,
                    // Only multi-select gives a bulk delete; a bare data
                    // provider cannot do it at all.
                    canSelectMany: many
                })
            );
        };

        create('jsonbro.actions', new ActionsView());
        create('jsonbro.recentFiles', this.recentFiles);
        create('jsonbro.formatHistory', this.formatHistory, true);
        create('jsonbro.diffHistory', this.diffHistory, true);

        this.refresh();
        return vscode.Disposable.from(...this.views);
    }

    /**
     * Redraws every section and restates how much each history holds.
     *
     * The count lives in the view's own title rather than on a row, which is
     * where VS Code's own views put it.
     */
    public refresh(): void {
        this.formatHistory.refresh();
        this.diffHistory.refresh();
        this.recentFiles.refresh();

        const [, , formats, diffs] = this.views;
        if (formats) {
            formats.description = this.formatHistory.summary;
        }
        if (diffs) {
            diffs.description = this.diffHistory.summary;
        }
    }

    // ------------------------------------------------------------- mutations

    public async addFormatHistory(json: string): Promise<void> {
        await this.store.addFormat(json);
        this.refresh();
    }

    public async addDiffHistory(leftJson: string, rightJson: string): Promise<void> {
        await this.store.addDiff(leftJson, rightJson);
        this.refresh();
    }

    public async addRecentFile(uri: vscode.Uri): Promise<void> {
        await this.store.addRecentFile(uri.toString());
        this.refresh();
    }

    public async removeFormatHistoryEntries(indices: number[]): Promise<void> {
        await this.store.removeFormats(indices);
        this.refresh();
    }

    public async removeDiffHistoryEntries(indices: number[]): Promise<void> {
        await this.store.removeDiffs(indices);
        this.refresh();
    }

    public async renameFormatHistoryEntry(index: number, name: string): Promise<void> {
        await this.store.renameFormat(index, name);
        this.refresh();
    }

    public async renameDiffHistoryEntry(index: number, name: string): Promise<void> {
        await this.store.renameDiff(index, name);
        this.refresh();
    }

    public async setFormatPinned(index: number, pinned: boolean): Promise<void> {
        await this.store.setFormatPinned(index, pinned);
        this.refresh();
    }

    public async setDiffPinned(index: number, pinned: boolean): Promise<void> {
        await this.store.setDiffPinned(index, pinned);
        this.refresh();
    }

    public async clearFormatHistory(): Promise<void> {
        await this.store.clearFormats();
        this.refresh();
    }

    public async clearDiffHistory(): Promise<void> {
        await this.store.clearDiffs();
        this.refresh();
    }

    public async clearRecentFiles(): Promise<void> {
        await this.store.clearRecentFiles();
        this.refresh();
    }

    public async clearHistory(): Promise<void> {
        await this.store.clear();
        await this.store.clearRecentFiles();
        this.refresh();
    }

    /** What the whole store is using, for the confirmation prompt. */
    public usage(): ReturnType<HistoryStore['usage']> {
        return this.store.usage();
    }
}

/**
 * VS Code extension commands and functionality
 */
import * as vscode from 'vscode';
import { WebviewProvider } from '../webview-provider';
import { Sidebar } from '../views/sidebar';

/**
 * Handles all extension commands
 */
export class CommandHandler {
    private webviewProvider: WebviewProvider;
    private sidebar: Sidebar;

    constructor(context: vscode.ExtensionContext, sidebar: Sidebar) {
        this.webviewProvider = new WebviewProvider(context, sidebar);
        this.sidebar = sidebar;
    }

    /**
     * Registers all extension commands
     */
    public registerCommands(context: vscode.ExtensionContext): void {
        const formatJsonCommand = vscode.commands.registerCommand(
            'jsonbro.formatJson',
            () => this.formatJson()
        );

        const diffJsonCommand = vscode.commands.registerCommand(
            'jsonbro.diffJson',
            () => this.diffJson()
        );

        const openFromActivityBarCommand = vscode.commands.registerCommand(
            'jsonbro.openFromActivityBar',
            () => this.openFromActivityBar()
        );

        const loadFormatHistoryCommand = vscode.commands.registerCommand(
            'jsonbro.loadFormatHistory',
            (json: string) => this.loadFormatHistory(json)
        );

        const loadDiffHistoryCommand = vscode.commands.registerCommand(
            'jsonbro.loadDiffHistory',
            (leftJson: string, rightJson: string) => this.loadDiffHistory(leftJson, rightJson)
        );

        // The second argument is the tree's whole selection, so these act on
        // everything the user picked rather than only the row they clicked.
        const removeFormatHistoryCommand = vscode.commands.registerCommand(
            'jsonbro.removeFormatHistory',
            (item: any, selection?: any[]) => this.removeFormatHistory(item, selection)
        );

        const removeDiffHistoryCommand = vscode.commands.registerCommand(
            'jsonbro.removeDiffHistory',
            (item: any, selection?: any[]) => this.removeDiffHistory(item, selection)
        );

        const clearFormatHistoryCommand = vscode.commands.registerCommand(
            'jsonbro.clearFormatHistory',
            () => this.clearFormatHistory()
        );

        const clearRecentFilesCommand = vscode.commands.registerCommand(
            'jsonbro.clearRecentFiles',
            () => this.sidebar.clearRecentFiles()
        );

        const formatClipboardCommand = vscode.commands.registerCommand(
            'jsonbro.formatClipboard',
            () => this.formatClipboard()
        );

        // Pinning is per-entry, so both of these read the index off the item.
        const pinCommand = vscode.commands.registerCommand(
            'jsonbro.pinHistoryEntry',
            (item: any) => this.setPinned(item, true)
        );

        const unpinCommand = vscode.commands.registerCommand(
            'jsonbro.unpinHistoryEntry',
            (item: any) => this.setPinned(item, false)
        );

        const clearDiffHistoryCommand = vscode.commands.registerCommand(
            'jsonbro.clearDiffHistory',
            () => this.clearDiffHistory()
        );

        const renameFormatHistoryCommand = vscode.commands.registerCommand(
            'jsonbro.renameFormatHistory',
            (item: any) => this.renameFormatHistory(item)
        );

        const renameDiffHistoryCommand = vscode.commands.registerCommand(
            'jsonbro.renameDiffHistory',
            (item: any) => this.renameDiffHistory(item)
        );

        const clearHistoryCommand = vscode.commands.registerCommand(
            'jsonbro.clearHistory',
            () => this.clearHistory()
        );

        // These four also appear on a file's Explorer context menu, which
        // passes the clicked file as the first argument and the whole
        // selection as the second.
        const openFileCommand = vscode.commands.registerCommand(
            'jsonbro.openFile',
            (uri?: vscode.Uri) => this.webviewProvider.openJsonFile(uri)
        );

        const setDiffOriginalCommand = vscode.commands.registerCommand(
            'jsonbro.setDiffOriginal',
            (uri?: vscode.Uri) => this.webviewProvider.loadDiffSide('left', uri)
        );

        const setDiffModifiedCommand = vscode.commands.registerCommand(
            'jsonbro.setDiffModified',
            (uri?: vscode.Uri) => this.webviewProvider.loadDiffSide('right', uri)
        );

        const compareFilesCommand = vscode.commands.registerCommand(
            'jsonbro.compareSelectedFiles',
            (_uri: vscode.Uri, selection?: vscode.Uri[]) => this.compareSelected(selection)
        );

        context.subscriptions.push(
            formatJsonCommand, 
            diffJsonCommand, 
            openFromActivityBarCommand,
            loadFormatHistoryCommand,
            loadDiffHistoryCommand,
            removeFormatHistoryCommand,
            removeDiffHistoryCommand,
            clearFormatHistoryCommand,
            clearDiffHistoryCommand,
            clearRecentFilesCommand,
            formatClipboardCommand,
            pinCommand,
            unpinCommand,
            renameFormatHistoryCommand,
            renameDiffHistoryCommand,
            clearHistoryCommand,
            openFileCommand,
            setDiffOriginalCommand,
            setDiffModifiedCommand,
            compareFilesCommand
        );
    }

    /** Restores panels after a window reload. */
    public registerSerializer(): vscode.Disposable {
        return this.webviewProvider.registerSerializer();
    }

    /** Pushes changed configuration to every open panel. */
    public broadcastSettings(): void {
        this.webviewProvider.broadcastSettings();
    }

    private async clearHistory(): Promise<void> {
        if (await this.confirm('Clear all JSONBro history?', 'Clear')) {
            await this.sidebar.clearHistory();
        }
    }

    private formatJson(): void {
        this.webviewProvider.showFormatPanel();
    }

    private diffJson(): void {
        this.webviewProvider.showDiffPanel();
    }

    private openFromActivityBar(): void {
        this.webviewProvider.showOrFocusFormatPanel();
    }

    private loadFormatHistory(json: string): void {
        this.webviewProvider.loadFormatHistory(json);
    }

    private loadDiffHistory(leftJson: string, rightJson: string): void {
        this.webviewProvider.loadDiffHistory(leftJson, rightJson);
    }

    /**
     * Removes every selected format entry.
     *
     * VS Code passes the whole tree selection as the second argument, so
     * removing five entries is one confirmation rather than five.
     */
    private async removeFormatHistory(item: any, selection?: any[]): Promise<void> {
        const indices = this.selectedIndices(item, selection);
        if (indices.length > 0 && (await this.confirmRemoval(indices.length))) {
            await this.sidebar.removeFormatHistoryEntries(indices);
        }
    }

    private async removeDiffHistory(item: any, selection?: any[]): Promise<void> {
        const indices = this.selectedIndices(item, selection);
        if (indices.length > 0 && (await this.confirmRemoval(indices.length))) {
            await this.sidebar.removeDiffHistoryEntries(indices);
        }
    }

    /** Loads exactly two selected files as the two sides of a comparison. */
    private async compareSelected(selection?: vscode.Uri[]): Promise<void> {
        if (!selection || selection.length !== 2) {
            vscode.window.showWarningMessage(
                'Select exactly two files to compare them in JSONBro.'
            );
            return;
        }
        await this.webviewProvider.compareFiles(selection[0], selection[1]);
    }

    /** Formats whatever is on the clipboard, without a paste step. */
    private async formatClipboard(): Promise<void> {
        const text = (await vscode.env.clipboard.readText()).trim();
        if (!text) {
            vscode.window.showInformationMessage('The clipboard is empty.');
            return;
        }
        this.webviewProvider.loadFormatHistory(text);
    }

    /**
     * Pins or unpins a history entry.
     *
     * Which list it belongs to is on the item's resource URI, which is also
     * where its position is -- a context-menu command is handed the item, not
     * where it sits.
     */
    private async setPinned(item: any, pinned: boolean): Promise<void> {
        const index = item?.resourceUri ? this.extractIndexFromUri(item.resourceUri) : -1;
        if (index === -1) {
            return;
        }

        if (String(item.resourceUri).includes('diff-history')) {
            await this.sidebar.setDiffPinned(index, pinned);
        } else {
            await this.sidebar.setFormatPinned(index, pinned);
        }
    }

    private async clearFormatHistory(): Promise<void> {
        if (await this.confirm('Clear all format history?', 'Clear')) {
            await this.sidebar.clearFormatHistory();
        }
    }

    private async clearDiffHistory(): Promise<void> {
        if (await this.confirm('Clear all diff history?', 'Clear')) {
            await this.sidebar.clearDiffHistory();
        }
    }

    /**
     * The history indices a command was invoked on.
     *
     * The right-clicked item is included even when it is not part of the
     * selection, which is what VS Code's own trees do.
     */
    private selectedIndices(item: any, selection?: any[]): number[] {
        const items = selection && selection.length > 0 ? selection : [item];
        const indices = new Set<number>();

        for (const candidate of items) {
            const index = candidate?.resourceUri
                ? this.extractIndexFromUri(candidate.resourceUri)
                : -1;
            if (index !== -1) {
                indices.add(index);
            }
        }
        if (item?.resourceUri) {
            const index = this.extractIndexFromUri(item.resourceUri);
            if (index !== -1) {
                indices.add(index);
            }
        }

        return [...indices];
    }

    private confirmRemoval(count: number): Promise<boolean> {
        return this.confirm(
            count === 1
                ? 'Remove this history entry?'
                : `Remove ${count} history entries?`,
            'Remove'
        );
    }

    private async confirm(question: string, action: string): Promise<boolean> {
        const result = await vscode.window.showWarningMessage(
            question,
            { modal: true },
            action
        );
        return result === action;
    }

    private async renameFormatHistory(item: any): Promise<void> {
        const name = await this.askForName(item);
        if (name !== undefined) {
            await this.sidebar.renameFormatHistoryEntry(
                this.extractIndexFromUri(item.resourceUri),
                name
            );
        }
    }

    private async renameDiffHistory(item: any): Promise<void> {
        const name = await this.askForName(item);
        if (name !== undefined) {
            await this.sidebar.renameDiffHistoryEntry(
                this.extractIndexFromUri(item.resourceUri),
                name
            );
        }
    }

    private async askForName(item: any): Promise<string | undefined> {
        if (!item?.resourceUri || this.extractIndexFromUri(item.resourceUri) === -1) {
            return undefined;
        }

        return vscode.window.showInputBox({
            prompt: 'Enter a new name for this history entry',
            value: item.label,
            placeHolder: 'History entry name'
        });
    }

    private extractIndexFromUri(uri: vscode.Uri): number {
        const path = uri.path;
        const match = path.match(/\/(\d+)$/);
        return match ? parseInt(match[1], 10) : -1;
    }
}

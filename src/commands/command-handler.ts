/**
 * VS Code extension commands and functionality
 */
import * as vscode from 'vscode';
import { WebviewProvider } from '../webview-provider';
import { JSONBroActivityBarProvider } from '../activity-bar-provider';

/**
 * Handles all extension commands
 */
export class CommandHandler {
    private webviewProvider: WebviewProvider;
    private activityBarProvider: JSONBroActivityBarProvider;

    constructor(context: vscode.ExtensionContext, activityBarProvider: JSONBroActivityBarProvider) {
        this.webviewProvider = new WebviewProvider(context, activityBarProvider);
        this.activityBarProvider = activityBarProvider;
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

        const removeFormatHistoryCommand = vscode.commands.registerCommand(
            'jsonbro.removeFormatHistory',
            (item: any) => this.removeFormatHistory(item)
        );

        const removeDiffHistoryCommand = vscode.commands.registerCommand(
            'jsonbro.removeDiffHistory',
            (item: any) => this.removeDiffHistory(item)
        );

        const renameFormatHistoryCommand = vscode.commands.registerCommand(
            'jsonbro.renameFormatHistory',
            (item: any) => this.renameFormatHistory(item)
        );

        const renameDiffHistoryCommand = vscode.commands.registerCommand(
            'jsonbro.renameDiffHistory',
            (item: any) => this.renameDiffHistory(item)
        );

        context.subscriptions.push(
            formatJsonCommand, 
            diffJsonCommand, 
            openFromActivityBarCommand,
            loadFormatHistoryCommand,
            loadDiffHistoryCommand,
            removeFormatHistoryCommand,
            removeDiffHistoryCommand,
            renameFormatHistoryCommand,
            renameDiffHistoryCommand
        );
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

    private async removeFormatHistory(item: any): Promise<void> {
        if (item && item.resourceUri) {
            const index = this.extractIndexFromUri(item.resourceUri);
            if (index !== -1) {
                const result = await vscode.window.showWarningMessage(
                    'Are you sure you want to remove this history entry?',
                    { modal: true },
                    'Remove'
                );
                if (result === 'Remove') {
                    this.activityBarProvider.removeFormatHistoryEntry(index);
                }
            }
        }
    }

    private async removeDiffHistory(item: any): Promise<void> {
        if (item && item.resourceUri) {
            const index = this.extractIndexFromUri(item.resourceUri);
            if (index !== -1) {
                const result = await vscode.window.showWarningMessage(
                    'Are you sure you want to remove this history entry?',
                    { modal: true },
                    'Remove'
                );
                if (result === 'Remove') {
                    this.activityBarProvider.removeDiffHistoryEntry(index);
                }
            }
        }
    }

    private async renameFormatHistory(item: any): Promise<void> {
        if (item && item.resourceUri) {
            const index = this.extractIndexFromUri(item.resourceUri);
            if (index !== -1) {
                const currentName = item.label;
                const newName = await vscode.window.showInputBox({
                    prompt: 'Enter a new name for this history entry',
                    value: currentName.startsWith('Entry ') ? '' : currentName,
                    placeHolder: 'History entry name'
                });
                if (newName !== undefined) {
                    this.activityBarProvider.renameFormatHistoryEntry(index, newName);
                }
            }
        }
    }

    private async renameDiffHistory(item: any): Promise<void> {
        if (item && item.resourceUri) {
            const index = this.extractIndexFromUri(item.resourceUri);
            if (index !== -1) {
                const currentName = item.label;
                const newName = await vscode.window.showInputBox({
                    prompt: 'Enter a new name for this history entry',
                    value: currentName.startsWith('Diff ') ? '' : currentName,
                    placeHolder: 'History entry name'
                });
                if (newName !== undefined) {
                    this.activityBarProvider.renameDiffHistoryEntry(index, newName);
                }
            }
        }
    }

    private extractIndexFromUri(uri: vscode.Uri): number {
        const path = uri.path;
        const match = path.match(/\/(\d+)$/);
        return match ? parseInt(match[1], 10) : -1;
    }
}

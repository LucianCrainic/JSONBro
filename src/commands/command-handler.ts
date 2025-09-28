/**
 * VS Code extension commands and functionality
 */
import * as vscode from 'vscode';
import { WebviewProvider } from '../webview-provider';

/**
 * Handles all extension commands
 */
export class CommandHandler {
    private webviewProvider: WebviewProvider;

    constructor(context: vscode.ExtensionContext) {
        this.webviewProvider = new WebviewProvider(context);
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

        context.subscriptions.push(formatJsonCommand, diffJsonCommand);
    }

    private formatJson(): void {
        this.webviewProvider.showFormatPanel();
    }

    private diffJson(): void {
        this.webviewProvider.showDiffPanel();
    }
}

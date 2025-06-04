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

        const validateJsonCommand = vscode.commands.registerCommand(
            'jsonbro.validateJson',
            () => this.validateJson()
        );

        context.subscriptions.push(formatJsonCommand, validateJsonCommand);
    }

    private formatJson(): void {
        this.webviewProvider.showFormatPanel();
    }

    private validateJson(): void {
        // Future implementation for JSON validation
        vscode.window.showInformationMessage('JSON validation feature coming soon!');
    }
}

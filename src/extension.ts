import * as vscode from 'vscode';
import { getWebviewContent } from './view';

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('jsonbro.formatJson', () => {
        const panel = vscode.window.createWebviewPanel(
            'jsonbro.formatJson',
            'Format JSON',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}

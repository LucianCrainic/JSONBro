/**
 * Webview provider for creating and managing JSON formatter webviews
 */
import * as vscode from 'vscode';
import { WebviewContentGenerator } from './webview-content';

export class WebviewProvider {
    private context: vscode.ExtensionContext;
    private contentGenerator: WebviewContentGenerator;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.contentGenerator = new WebviewContentGenerator(context);
    }

    /**
     * Shows the JSON format panel
     */
    public showFormatPanel(): void {
        const panel = vscode.window.createWebviewPanel(
            'jsonbro.formatJson',
            'JSONBro - Format JSON',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'out'),
                    vscode.Uri.joinPath(this.context.extensionUri, 'node_modules')
                ]
            }
        );

        panel.webview.html = this.contentGenerator.getWebviewContent(panel.webview);

        // Handle messages from the webview (if needed in the future)
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'showError':
                        vscode.window.showErrorMessage(message.text);
                        break;
                    case 'showInfo':
                        vscode.window.showInformationMessage(message.text);
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );
    }
}

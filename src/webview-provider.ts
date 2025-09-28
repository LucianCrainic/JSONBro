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
        this.showPanel('format');
    }

    /**
     * Shows the JSON diff panel
     */
    public showDiffPanel(): void {
        this.showPanel('diff');
    }

    /**
     * Shows the webview panel with the specified mode
     */
    private showPanel(mode: 'format' | 'diff'): void {
        const panelId = mode === 'format' ? 'jsonbro.formatJson' : 'jsonbro.diffJson';
        const title = mode === 'format' ? 'JSONBro - Format JSON' : 'JSONBro - Diff JSON';

        const panel = vscode.window.createWebviewPanel(
            panelId,
            title,
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

        panel.webview.html = this.contentGenerator.getWebviewContent(panel.webview, mode);

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

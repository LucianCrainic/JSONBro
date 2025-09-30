/**
 * Webview provider for creating and managing JSON formatter webviews
 */
import * as vscode from 'vscode';
import { WebviewContentGenerator } from './webview-content';
import { JSONBroActivityBarProvider } from './activity-bar-provider';

export class WebviewProvider {
    private context: vscode.ExtensionContext;
    private contentGenerator: WebviewContentGenerator;
    private activityBarProvider: JSONBroActivityBarProvider;
    private existingPanels: Map<string, vscode.WebviewPanel> = new Map();

    constructor(context: vscode.ExtensionContext, activityBarProvider: JSONBroActivityBarProvider) {
        this.context = context;
        this.contentGenerator = new WebviewContentGenerator(context);
        this.activityBarProvider = activityBarProvider;
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
     * Shows or focuses the format panel (default for activity bar)
     */
    public showOrFocusFormatPanel(): void {
        const existingPanel = this.existingPanels.get('format');
        if (existingPanel) {
            existingPanel.reveal();
        } else {
            this.showFormatPanel();
        }
    }

    /**
     * Loads JSON from format history into the format panel
     */
    public loadFormatHistory(json: string): void {
        const existingPanel = this.existingPanels.get('format');
        if (existingPanel) {
            existingPanel.webview.postMessage({
                command: 'loadJson',
                json: json
            });
            existingPanel.reveal();
        } else {
            this.showFormatPanel();
            // Wait a bit for the panel to load, then send the message
            setTimeout(() => {
                const panel = this.existingPanels.get('format');
                if (panel) {
                    panel.webview.postMessage({
                        command: 'loadJson',
                        json: json
                    });
                }
            }, 100);
        }
    }

    /**
     * Loads JSON from diff history into the diff panel
     */
    public loadDiffHistory(leftJson: string, rightJson: string): void {
        const existingPanel = this.existingPanels.get('diff');
        if (existingPanel) {
            existingPanel.webview.postMessage({
                command: 'loadDiff',
                leftJson: leftJson,
                rightJson: rightJson
            });
            existingPanel.reveal();
        } else {
            this.showDiffPanel();
            // Wait a bit for the panel to load, then send the message
            setTimeout(() => {
                const panel = this.existingPanels.get('diff');
                if (panel) {
                    panel.webview.postMessage({
                        command: 'loadDiff',
                        leftJson: leftJson,
                        rightJson: rightJson
                    });
                }
            }, 100);
        }
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

        // Set JSON file icon for the panel
        panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'images', 'json-file-icon.svg');

        // Track the panel
        this.existingPanels.set(mode, panel);

        // Remove from tracking when disposed
        panel.onDidDispose(() => {
            this.existingPanels.delete(mode);
        });

        panel.webview.html = this.contentGenerator.getWebviewContent(panel.webview, mode);

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'showError':
                        vscode.window.showErrorMessage(message.text);
                        break;
                    case 'showInfo':
                        vscode.window.showInformationMessage(message.text);
                        break;
                    case 'addFormatHistory':
                        this.activityBarProvider.addFormatHistory(message.json);
                        break;
                    case 'addDiffHistory':
                        this.activityBarProvider.addDiffHistory(message.leftJson, message.rightJson);
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );
    }
}

/**
 * Webview provider for creating and managing JSON formatter webviews
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import { WebviewContentGenerator } from './webview-content';
import { JSONBroActivityBarProvider } from './activity-bar-provider';
import { readSettings } from './settings';
import type { HostToWebview, Mode } from './shared/messages';

export class WebviewProvider {
    private context: vscode.ExtensionContext;
    private contentGenerator: WebviewContentGenerator;
    private activityBarProvider: JSONBroActivityBarProvider;
    private existingPanels: Map<string, vscode.WebviewPanel> = new Map();

    /** Panels whose webview has reported that it is listening. */
    private readyPanels: Set<string> = new Set();

    /** Messages waiting for a panel that has not signalled ready yet. */
    private pendingMessages: Map<string, HostToWebview[]> = new Map();

    /** A folder a panel must be able to read, set when opening a file from it. */
    private extraResourceRoot: vscode.Uri | undefined;

    constructor(context: vscode.ExtensionContext, activityBarProvider: JSONBroActivityBarProvider) {
        this.context = context;
        this.contentGenerator = new WebviewContentGenerator(context);
        this.activityBarProvider = activityBarProvider;
    }

    /**
     * Brings panels back after a window reload.
     *
     * VS Code offers the panel it had; without a serializer registered it
     * simply discards it, which is why nothing survived a reload before.
     */
    public registerSerializer(): vscode.Disposable {
        const provider = this;

        const register = (mode: Mode, viewType: string) =>
            vscode.window.registerWebviewPanelSerializer(viewType, {
                async deserializeWebviewPanel(panel: vscode.WebviewPanel): Promise<void> {
                    provider.adopt(mode, panel);
                }
            });

        return vscode.Disposable.from(
            register('format', 'jsonbro.formatJson'),
            register('diff', 'jsonbro.diffJson')
        );
    }

    /** Takes over a panel VS Code restored, wiring it up as if new. */
    private adopt(mode: Mode, panel: vscode.WebviewPanel): void {
        panel.webview.options = this.webviewOptions();
        this.existingPanels.set(mode, panel);
        this.attach(mode, panel);
        panel.webview.html = this.contentGenerator.getWebviewContent(panel.webview, mode);
    }

    /** Pushes the current configuration to every open panel. */
    public broadcastSettings(): void {
        const settings = readSettings();
        for (const mode of this.existingPanels.keys()) {
            this.sendToPanel(mode as Mode, { command: 'settings', settings });
        }
    }

    private webviewOptions(): vscode.WebviewOptions & vscode.WebviewPanelOptions {
        const roots = [
            vscode.Uri.joinPath(this.context.extensionUri, 'out'),
            vscode.Uri.joinPath(this.context.extensionUri, 'media')
        ];
        if (this.extraResourceRoot) {
            roots.push(this.extraResourceRoot);
        }

        return {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: roots
        };
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
     * Opens a JSON file in the format panel without reading it here.
     *
     * The panel's worker streams the file itself from a webview resource URI,
     * so a very large document never crosses postMessage and never has to fit
     * in a textarea.
     */
    public async openJsonFile(): Promise<void> {
        const picked = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Open in JSONBro',
            filters: { 'JSON Files': ['json', 'jsonl', 'ndjson', 'txt'], 'All Files': ['*'] }
        });

        const file = picked?.[0];
        if (!file) {
            return;
        }

        // A file can only be handed to the webview as a URI if its folder is a
        // permitted resource root, so widen the roots before asking for one.
        this.extraResourceRoot = vscode.Uri.joinPath(file, '..');

        let panel = this.existingPanels.get('format');
        if (panel) {
            panel.webview.options = this.webviewOptions();
        } else {
            this.showPanel('format');
            panel = this.existingPanels.get('format');
        }

        if (!panel) {
            return;
        }

        this.sendToPanel('format', {
            command: 'openUrl',
            url: panel.webview.asWebviewUri(file).toString(),
            label: file.path.split('/').pop() ?? 'file'
        });
    }

    /**
     * Loads JSON from format history into the format panel
     */
    public loadFormatHistory(json: string): void {
        this.sendToPanel('format', { command: 'loadJson', json });
    }

    /**
     * Loads JSON from diff history into the diff panel
     */
    public loadDiffHistory(leftJson: string, rightJson: string): void {
        this.sendToPanel('diff', { command: 'loadDiff', leftJson, rightJson });
    }

    /**
     * Delivers a message to a panel, creating it first if necessary.
     *
     * A freshly created webview cannot receive messages until its script has
     * run, so anything sent before then is queued and flushed when the webview
     * reports ready. Previously this was a fixed 100ms delay, which dropped the
     * message on a slow load and delayed it needlessly on a fast one.
     */
    private sendToPanel(mode: 'format' | 'diff', message: HostToWebview): void {
        const existingPanel = this.existingPanels.get(mode);

        if (existingPanel && this.readyPanels.has(mode)) {
            existingPanel.webview.postMessage(message);
            existingPanel.reveal();
            return;
        }

        const queue = this.pendingMessages.get(mode) ?? [];
        queue.push(message);
        this.pendingMessages.set(mode, queue);

        if (existingPanel) {
            existingPanel.reveal();
        } else {
            this.showPanel(mode);
        }
    }

    /** Delivers anything queued for a panel that has just become ready. */
    private flushPendingMessages(mode: 'format' | 'diff'): void {
        const panel = this.existingPanels.get(mode);
        const queue = this.pendingMessages.get(mode);
        if (!panel || !queue) {
            return;
        }
        this.pendingMessages.delete(mode);
        for (const message of queue) {
            panel.webview.postMessage(message);
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
            this.webviewOptions()
        );

        // The tab icon renders outside the webview, so it cannot pick up theme
        // colours through CSS -- VS Code needs a variant per theme kind.
        panel.iconPath = {
            light: vscode.Uri.joinPath(this.context.extensionUri, 'images', 'json-file-icon-light.svg'),
            dark: vscode.Uri.joinPath(this.context.extensionUri, 'images', 'json-file-icon-dark.svg')
        };

        // Track the panel
        this.existingPanels.set(mode, panel);
        this.attach(mode, panel);

        panel.webview.html = this.contentGenerator.getWebviewContent(panel.webview, mode);
    }

    /** Wires the lifecycle and message handling shared by new and restored panels. */
    private attach(mode: 'format' | 'diff', panel: vscode.WebviewPanel): void {
        // Remove from tracking when disposed
        panel.onDidDispose(() => {
            this.existingPanels.delete(mode);
            this.readyPanels.delete(mode);
            this.pendingMessages.delete(mode);
        });

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'ready':
                        this.readyPanels.add(mode);
                        // Settings first, so the panel is configured before it
                        // acts on anything that was queued for it.
                        panel.webview.postMessage({
                            command: 'settings',
                            settings: readSettings()
                        });
                        this.flushPendingMessages(mode);
                        break;
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
                    case 'saveFormattedJson':
                        this.saveFormattedJsonToFile(message.content);
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );
    }

    /**
     * Show save dialog and save formatted JSON to user-selected file
     */
    private async saveFormattedJsonToFile(content: string): Promise<void> {
        try {
            // Get the user's home directory
            const homeDir = vscode.Uri.file(os.homedir());
            const defaultUri = vscode.Uri.joinPath(homeDir, 'formatted.json');
            
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: defaultUri,
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                },
                saveLabel: 'Save JSON'
            });

            if (saveUri) {
                await fs.promises.writeFile(saveUri.fsPath, content, 'utf8');
                vscode.window.showInformationMessage(`JSON saved to ${saveUri.fsPath}`);
            }
        } catch (error) {
            console.error('Error saving file:', error);
            vscode.window.showErrorMessage(`Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

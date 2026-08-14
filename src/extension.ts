import * as vscode from 'vscode';
import { CommandHandler } from './commands/command-handler';
import { JSONBroActivityBarProvider } from './activity-bar-provider';
import { HistoryStore } from './history-store';

export function activate(context: vscode.ExtensionContext) {
    // History is backed by globalState, so saved entries survive a restart.
    const history = new HistoryStore(context);

    const activityBarProvider = new JSONBroActivityBarProvider(history);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('jsonbro.explorer', activityBarProvider)
    );

    const commandHandler = new CommandHandler(context, activityBarProvider);
    commandHandler.registerCommands(context);

    // Panels come back after a window reload rather than being discarded.
    context.subscriptions.push(commandHandler.registerSerializer());

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (
                event.affectsConfiguration('jsonbro') ||
                // A different theme, or a change to how its tokens are
                // coloured, changes how the panel should paint JSON.
                event.affectsConfiguration('workbench.colorTheme') ||
                event.affectsConfiguration('editor.tokenColorCustomizations')
            ) {
                commandHandler.broadcastSettings();
            }
        }),
        vscode.window.onDidChangeActiveColorTheme(() => commandHandler.broadcastSettings())
    );
}

export function deactivate() {}

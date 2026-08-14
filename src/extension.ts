import * as vscode from 'vscode';
import { CommandHandler } from './commands/command-handler';
import { Sidebar } from './views/sidebar';
import { HistoryStore } from './history-store';
import { readHistoryLimits } from './settings';

export function activate(context: vscode.ExtensionContext) {
    // History is backed by globalState, so saved entries survive a restart.
    // Limits are read per write, so lowering one takes effect immediately.
    const history = new HistoryStore(context, readHistoryLimits);

    const sidebar = new Sidebar(history);
    context.subscriptions.push(sidebar.register());

    const commandHandler = new CommandHandler(context, sidebar);
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

import * as vscode from 'vscode';
import { CommandHandler } from './commands/command-handler';
import { JSONBroActivityBarProvider } from './activity-bar-provider';

export function activate(context: vscode.ExtensionContext) {
    console.log('JSONBro extension is now active!');
    
    // Register the activity bar tree data provider
    const activityBarProvider = new JSONBroActivityBarProvider();
    vscode.window.registerTreeDataProvider('jsonbro.explorer', activityBarProvider);
    
    const commandHandler = new CommandHandler(context, activityBarProvider);
    commandHandler.registerCommands(context);
}

export function deactivate() {}

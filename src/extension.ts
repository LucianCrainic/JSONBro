import * as vscode from 'vscode';
import { CommandHandler } from './commands/command-handler';

export function activate(context: vscode.ExtensionContext) {
    console.log('JSONBro extension is now active!');
    
    const commandHandler = new CommandHandler(context);
    commandHandler.registerCommands(context);
}

export function deactivate() {}

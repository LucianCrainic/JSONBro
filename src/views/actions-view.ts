/**
 * The things worth doing, at the top of the sidebar.
 *
 * The sidebar used to be two action rows and two history lists in one tree,
 * which left most of the panel empty. These are the entry points that were
 * previously only reachable from the command palette.
 */
import * as vscode from 'vscode';
import { JSONBroItem } from './tree-items';

interface Action {
    label: string;
    tooltip: string;
    command: string;
    icon: string;
}

const ACTIONS: Action[] = [
    {
        label: 'Format JSON',
        tooltip: 'Open a panel to format and inspect a document',
        command: 'jsonbro.formatJson',
        icon: 'symbol-property'
    },
    {
        label: 'Visualise JSON',
        tooltip: 'Open a panel and draw a document as a tree or a graph',
        command: 'jsonbro.visualiseJson',
        icon: 'type-hierarchy'
    },
    {
        label: 'Compare JSON',
        tooltip: 'Open a panel to compare two documents',
        command: 'jsonbro.diffJson',
        icon: 'diff'
    },
    {
        label: 'Open File…',
        tooltip: 'Format a file, streamed in rather than pasted',
        command: 'jsonbro.openFile',
        icon: 'go-to-file'
    },
    {
        label: 'Format from Clipboard',
        tooltip: 'Format whatever is on the clipboard right now',
        command: 'jsonbro.formatClipboard',
        icon: 'clippy'
    }
];

export class ActionsView implements vscode.TreeDataProvider<JSONBroItem> {
    public getTreeItem(element: JSONBroItem): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: JSONBroItem): Thenable<JSONBroItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        return Promise.resolve(
            ACTIONS.map(
                action =>
                    new JSONBroItem(action.label, action.tooltip, {
                        command: { command: action.command, title: action.label },
                        icon: action.icon
                    })
            )
        );
    }
}

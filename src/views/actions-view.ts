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

/**
 * What to do, then where to get it from.
 *
 * The first three open a panel on one of its three views and are named after
 * what that view does; the last two are the two ways of bringing a document in
 * without typing it. Nothing says "JSON": every row in this container is about
 * JSON, and repeating it five times pushed the word that actually distinguishes
 * one row from another to the end of each label.
 */
const ACTIONS: Action[] = [
    {
        label: 'Format',
        tooltip: 'Open a panel to format and inspect a document',
        command: 'jsonbro.formatJson',
        icon: 'symbol-property'
    },
    {
        label: 'Visualise',
        tooltip: 'Open a panel and draw a document as a tree or a graph',
        command: 'jsonbro.visualiseJson',
        icon: 'type-hierarchy'
    },
    {
        label: 'Compare',
        tooltip: 'Open a panel to compare two documents',
        command: 'jsonbro.diffJson',
        icon: 'diff'
    },
    {
        label: 'Open a File…',
        tooltip: 'Format a file, streamed in rather than pasted',
        command: 'jsonbro.openFile',
        icon: 'go-to-file'
    },
    {
        label: 'Paste from Clipboard',
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

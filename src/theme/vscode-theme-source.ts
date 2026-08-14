/**
 * The VS Code side of reading a colour theme.
 *
 * Kept apart from the resolver so the matching rules stay a pure function over
 * data: this module is the only place that knows about extensions, URIs and
 * the file system.
 */
import * as vscode from 'vscode';
import { isRecord, type ThemeSource } from './token-colors';

export function vscodeThemeSource(): ThemeSource {
    const config = vscode.workspace.getConfiguration();

    return {
        label: config.get<string>('workbench.colorTheme'),
        customizations: config.get<Record<string, unknown>>('editor.tokenColorCustomizations'),
        locate: locateTheme,
        resolve: (from, relative) =>
            vscode.Uri.joinPath(vscode.Uri.parse(from), '..', relative).toString(),
        read: async location => {
            try {
                const bytes = await vscode.workspace.fs.readFile(vscode.Uri.parse(location));
                return Buffer.from(bytes).toString('utf8');
            } catch {
                // A theme extension can be uninstalled between the setting
                // being read and the file being opened. The contributed
                // colours cover it.
                return null;
            }
        }
    };
}

/**
 * Finds the file for a theme label across every installed extension.
 *
 * `workbench.colorTheme` holds the theme's display label, which is what a
 * `contributes.themes` entry declares; some extensions use `id` instead.
 */
function locateTheme(label: string): string | null {
    for (const extension of vscode.extensions.all) {
        const themes = extension.packageJSON?.contributes?.themes;
        if (!Array.isArray(themes)) {
            continue;
        }

        for (const theme of themes) {
            if (!isRecord(theme) || typeof theme.path !== 'string') {
                continue;
            }
            if (theme.label === label || theme.id === label) {
                return vscode.Uri.joinPath(extension.extensionUri, theme.path).toString();
            }
        }
    }
    return null;
}

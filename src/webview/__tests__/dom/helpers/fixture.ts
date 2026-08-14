/**
 * Renders the panel's real markup into jsdom.
 */
import { WebviewContentGenerator } from '../../../../webview-content';
import type { PanelKind } from '../../../../shared/messages';

const webviewStub = {
    cspSource: 'vscode-webview://test',
    asWebviewUri: (uri: { path: string }) => `res:${uri.path}`
};

const contextStub = {
    extensionUri: { path: '/ext', toString: () => '/ext' }
};

/**
 * Installs the panel body for `mode` and returns the full document HTML.
 *
 * Only the <body> contents are mounted -- the <head> links to stylesheets that
 * jsdom does not fetch, and no assertion here depends on styling.
 */
export function mountPanel(mode: PanelKind): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const generator = new WebviewContentGenerator(contextStub as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = generator.getWebviewContent(webviewStub as any, mode);

    const body = html.slice(html.indexOf('<body'), html.indexOf('</body>'));
    document.body.innerHTML = body.slice(body.indexOf('>') + 1);
    document.body.dataset.mode = mode;

    return html;
}

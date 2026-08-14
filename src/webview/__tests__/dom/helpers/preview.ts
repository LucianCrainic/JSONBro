/**
 * Renders the real panel markup to a standalone HTML file for eyeballing.
 *
 * The webview only exists inside VS Code, so this is the only way to see what
 * a change actually looks like from here. It runs as a test so it can use the
 * same `vscode` stub the DOM fixtures use, and is skipped unless JSONBRO_PREVIEW
 * is set -- it writes files, which a normal test run should not.
 */
import * as fs from 'fs';
import * as path from 'path';
import { WebviewContentGenerator } from '../../../../webview-content';

const webviewStub = {
    cspSource: 'vscode-webview://preview',
    asWebviewUri: (uri: { path: string }) => `res:${uri.path}`
};

const contextStub = { extensionUri: { path: '/ext', toString: () => '/ext' } };

/** Enough of Dark Modern / Light Modern to judge contrast and colour. */
const THEMES: Record<string, Record<string, string>> = {
    dark: {
        'editor-background': '#1f1f1f',
        'editor-foreground': '#cccccc',
        'editorGroupHeader-tabsBackground': '#181818',
        'editorGroup-border': '#2b2b2b',
        'input-background': '#313131',
        'input-foreground': '#cccccc',
        'input-border': '#3c3c3c',
        'descriptionForeground': '#9d9d9d',
        'disabledForeground': '#7f7f7f',
        'errorForeground': '#f85149',
        'focusBorder': '#0078d4',
        'button-background': '#0078d4',
        'button-foreground': '#ffffff',
        'button-hoverBackground': '#026ec1',
        'button-secondaryBackground': '#313131',
        'button-secondaryForeground': '#cccccc',
        'toolbar-hoverBackground': '#2a2d2e',
        'widget-shadow': '#0000005c',
        'inputValidation-warningBackground': '#352a05',
        'inputValidation-warningBorder': '#966c1e',
        'inputValidation-warningForeground': '#e2c08d',
        'editorWarning-foreground': '#cca700',
        'editorError-foreground': '#f14c4c',
        'editorInfo-foreground': '#3794ff',
        'gitDecoration-addedResourceForeground': '#81b88b',
        'gitDecoration-deletedResourceForeground': '#c74e39',
        'gitDecoration-modifiedResourceForeground': '#e2c08d',
        'diffEditor-insertedTextBackground': '#9bb95533',
        'diffEditor-removedTextBackground': '#ff000033',
        'diffEditor-border': '#3a3a3a',
        'statusBar-background': '#181818',
        'statusBar-foreground': '#cccccc',
        'scrollbarSlider-background': '#79797966',
        'scrollbarSlider-hoverBackground': '#646464b3',
        'editorLineNumber-foreground': '#6e7681',
        'editorLineNumber-activeForeground': '#cccccc',
        'editor-findMatchBackground': '#9e6a03',
        'editor-findMatchHighlightBackground': '#ea5c0055',
        'editor-selectionBackground': '#264f78',
        'list-hoverBackground': '#2a2d2e',
        'panel-border': '#2b2b2b',
        'badge-background': '#616161',
        'badge-foreground': '#f8f8f8',
        // What VS Code injects for the colours this extension contributes.
        'jsonbro-syntaxKey': '#9cdcfe',
        'jsonbro-syntaxString': '#ce9178',
        'jsonbro-syntaxNumber': '#b5cea8',
        'jsonbro-syntaxBoolean': '#569cd6',
        'jsonbro-syntaxNull': '#569cd6',
        'jsonbro-syntaxPunctuation': '#cccccc',
        'jsonbro-addedBackground': '#2ea04326',
        'jsonbro-removedBackground': '#f8514926',
        'jsonbro-modifiedBackground': '#e2c08d1a',
        'font-family': 'system-ui, "Segoe UI", sans-serif',
        'font-size': '13px',
        'editor-font-family': 'Menlo, Monaco, "Courier New", monospace'
    },
    light: {
        'editor-background': '#ffffff',
        'editor-foreground': '#3b3b3b',
        'editorGroupHeader-tabsBackground': '#f8f8f8',
        'editorGroup-border': '#e5e5e5',
        'input-background': '#ffffff',
        'input-foreground': '#3b3b3b',
        'input-border': '#cecece',
        'descriptionForeground': '#3b3b3b99',
        'disabledForeground': '#616161',
        'errorForeground': '#f85149',
        'focusBorder': '#005fb8',
        'button-background': '#005fb8',
        'button-foreground': '#ffffff',
        'button-hoverBackground': '#0258a8',
        'button-secondaryBackground': '#e5e5e5',
        'button-secondaryForeground': '#3b3b3b',
        'toolbar-hoverBackground': '#b8b8b850',
        'widget-shadow': '#00000029',
        'inputValidation-warningBackground': '#f6f5d2',
        'inputValidation-warningBorder': '#b89500',
        'inputValidation-warningForeground': '#3b3b3b',
        'editorWarning-foreground': '#bf8803',
        'editorError-foreground': '#e51400',
        'editorInfo-foreground': '#1a85ff',
        'gitDecoration-addedResourceForeground': '#587c0c',
        'gitDecoration-deletedResourceForeground': '#ad0707',
        'gitDecoration-modifiedResourceForeground': '#895503',
        'diffEditor-insertedTextBackground': '#9bb95533',
        'diffEditor-removedTextBackground': '#ff000033',
        'diffEditor-border': '#cccccc',
        'statusBar-background': '#f8f8f8',
        'statusBar-foreground': '#3b3b3b',
        'scrollbarSlider-background': '#64646466',
        'scrollbarSlider-hoverBackground': '#646464b3',
        'editorLineNumber-foreground': '#6e7681',
        'editorLineNumber-activeForeground': '#171184',
        'editor-findMatchBackground': '#a8ac94',
        'editor-findMatchHighlightBackground': '#ea5c0055',
        'editor-selectionBackground': '#add6ff',
        'list-hoverBackground': '#f0f0f0',
        'panel-border': '#e5e5e5',
        'badge-background': '#cccccc',
        'badge-foreground': '#3b3b3b',
        'jsonbro-syntaxKey': '#0451a5',
        'jsonbro-syntaxString': '#a31515',
        'jsonbro-syntaxNumber': '#098658',
        'jsonbro-syntaxBoolean': '#0000ff',
        'jsonbro-syntaxNull': '#0000ff',
        'jsonbro-syntaxPunctuation': '#3b3b3b',
        'jsonbro-addedBackground': '#2ea04326',
        'jsonbro-removedBackground': '#f8514926',
        'jsonbro-modifiedBackground': '#8955031a',
        'font-family': 'system-ui, "Segoe UI", sans-serif',
        'font-size': '13px',
        'editor-font-family': 'Menlo, Monaco, "Courier New", monospace'
    }
};

const ROOT = path.resolve(__dirname, '../../../../..');

function themeCss(theme: string): string {
    const entries = Object.entries(THEMES[theme])
        .map(([name, value]) => `    --vscode-${name}: ${value};`)
        .join('\n');
    return `:root {\n${entries}\n}\nbody { background: var(--vscode-editor-background); }`;
}

/**
 * Builds a page from the real generator, with the CSP dropped, the stylesheets
 * inlined and a script that drives the panel into the state we want to see.
 */
export function buildPreview(mode: 'format' | 'diff', theme: string, seed: string): string {
    fs.mkdirSync(process.env.JSONBRO_PREVIEW as string, { recursive: true });
    const generator = new WebviewContentGenerator(contextStub as never);
    let html = generator.getWebviewContent(webviewStub as never, mode);

    html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');

    const styles = ['tokens.css', 'base.css', 'components.css', 'format.css', 'diff.css']
        .map(name => fs.readFileSync(path.join(ROOT, 'media', name), 'utf8'))
        .join('\n');

    html = html.replace(
        /<link[^>]*>/g,
        ''
    );
    html = html.replace(
        '</head>',
        `<style>${styles}</style><style>${themeCss(theme)}</style></head>`
    );

    const bundle = fs.readFileSync(path.join(ROOT, 'out', 'webview', 'main.js'), 'utf8');

    // The worker is served alongside the preview pages so it can actually be
    // started; without a real URL the panel would silently fall back to
    // formatting in place, which is the thing under test.
    fs.copyFileSync(
        path.join(ROOT, 'out', 'webview', 'worker.js'),
        path.join(process.env.JSONBRO_PREVIEW as string, 'worker.js')
    );
    html = html.replace(/data-worker-src="[^"]*"/, 'data-worker-src="worker.js"');

    html = html.replace(
        /<script[^>]*><\/script>/,
        `<script>
            window.acquireVsCodeApi = () => ({
                postMessage: () => undefined,
                getState: () => undefined,
                setState: () => undefined
            });
        </script>
        <script>${bundle}</script>
        <script>
            // The bundle starts on DOMContentLoaded, so the seed has to queue
            // behind it rather than running the moment it is parsed.
            window.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => { ${seed} }, 0);
            });
        </script>`
    );

    return html;
}

export function writePreview(name: string, html: string): string {
    const dir = process.env.JSONBRO_PREVIEW as string;
    const file = path.join(dir, `${name}.html`);
    fs.writeFileSync(file, html, 'utf8');
    return file;
}

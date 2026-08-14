/**
 * Writes preview pages for visual inspection. Not a test of behaviour.
 *
 * Run with: JSONBRO_PREVIEW=<dir> npx jest preview
 */
import { buildPreview, writePreview } from './helpers/preview';

const BROKEN = String.raw`{
  'user': {
    name: 'Ada Lovelace',
    "note": "True story about None",
    "path": "x, b: 1",
    active: True,
    score: +42,
    tags: ['maths' 'engines',],
    "bio": "unterminated
  }`;

const seedFormat = (json: string) => `
    document.getElementById('input').value = ${JSON.stringify(json)};
    document.getElementById('action-btn').click();
    document.getElementById('problems-toggle').click();
`;

const describeOrSkip = process.env.JSONBRO_PREVIEW ? describe : describe.skip;

describeOrSkip('preview pages', () => {
    it.each(['dark', 'light'])('format view with repairs (%s)', theme => {
        const file = writePreview(
            `problems-${theme}`,
            buildPreview('format', theme, seedFormat(BROKEN))
        );
        expect(file).toBeTruthy();
    });

    it.each(['dark', 'light'])('format view with clean input (%s)', theme => {
        const file = writePreview(
            `clean-${theme}`,
            buildPreview('format', theme, seedFormat('{"a":1,"b":[1,2,3],"c":{"d":true}}'))
        );
        expect(file).toBeTruthy();
    });

    /**
     * The colours a real theme would push over the contributed defaults.
     * Gruvbox, because its JSON palette looks nothing like VS Code's own --
     * if the message is ignored the difference is obvious rather than subtle.
     */
    it('format view with theme colours applied', () => {
        const colors = {
            key: '#689d6a',
            string: '#83a598',
            number: '#d3869b',
            boolean: '#d3869b',
            null: '#d3869b',
            punctuation: '#a89984'
        };

        const file = writePreview(
            'themed-dark',
            buildPreview(
                'format',
                'dark',
                `
                    window.postMessage({ command: 'themeColors', colors: ${JSON.stringify(colors)} }, '*');
                    ${seedFormat('{"a":1,"b":"two","c":true,"d":null,"e":[1,2]}')}
                `
            )
        );
        expect(file).toBeTruthy();
    });

    /** One change of each kind, to judge whether the three read apart. */
    it.each(['dark', 'light'])('diff view with changes (%s)', theme => {
        const left = { keep: 1, drop: 'gone', change: 'before', items: [1, 2, 3] };
        const right = { keep: 1, change: 'after', added: true, items: [1, 2, 3, 4] };

        const file = writePreview(
            `diff-${theme}`,
            buildPreview(
                'diff',
                theme,
                `
                    document.getElementById('left-json').value = ${JSON.stringify(
                        JSON.stringify(left)
                    )};
                    document.getElementById('right-json').value = ${JSON.stringify(
                        JSON.stringify(right)
                    )};
                    document.getElementById('action-btn').click();
                `
            )
        );
        expect(file).toBeTruthy();
    });

    /** Big enough that rendering every row would be plainly unworkable. */
    it('format view with a large document', () => {
        const big = JSON.stringify({
            rows: Array.from({ length: 25_000 }, (_, i) => ({
                id: i,
                name: `record ${i}`,
                email: `user${i}@example.com`,
                tags: ['alpha', 'beta'],
                meta: { active: i % 2 === 0, score: i * 3 }
            }))
        });

        const file = writePreview(
            'big-dark',
            buildPreview(
                'format',
                'dark',
                `
                    document.getElementById('input').value = ${JSON.stringify(big)};
                    window.__t0 = performance.now();
                    document.getElementById('action-btn').click();
                    window.__clickReturnedMs = performance.now() - window.__t0;
                `
            )
        );
        expect(file).toBeTruthy();
    });
});

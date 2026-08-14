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
});

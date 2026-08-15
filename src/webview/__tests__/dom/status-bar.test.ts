/*
 * The counted nouns along the bottom of the panel.
 *
 * The regression here: the plural form defaults to the singular with an s
 * added, which is right for every noun the panel counts and wrong for one that
 * does not take it. The Format status bar read "69 fixs" for a while, so the
 * override exists for the next irregular noun and is checked below.
 */
import { formatBytes, plural } from '../../ui/status-bar';

describe('counting things', () => {
    it('keeps the singular at one', () => {
        expect(plural(1, 'line')).toBe('1 line');
        expect(plural(1, 'repair')).toBe('1 repair');
    });

    it('adds an s for the nouns that take one', () => {
        expect(plural(0, 'line')).toBe('0 lines');
        expect(plural(2, 'node')).toBe('2 nodes');
        expect(plural(11, 'difference')).toBe('11 differences');
    });

    it('separates thousands, since documents get large', () => {
        expect(plural(1020004, 'line')).toBe('1,020,004 lines');
    });

    /* "fixs" is what the default gives, which is why the third argument is
       there; nothing in the panel counts "fix" any more, but the next -x, -ch
       or -y noun will need it. */
    it('takes a plural that is not just an added s', () => {
        expect(plural(69, 'fix', 'fixes')).toBe('69 fixes');
        expect(plural(1, 'fix', 'fixes')).toBe('1 fix');
        expect(plural(3, 'entry', 'entries')).toBe('3 entries');
    });
});

describe('reporting size', () => {
    it('counts bytes up to a kilobyte, then scales', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(1023)).toBe('1023 B');
        expect(formatBytes(1024)).toBe('1.0 KB');
        expect(formatBytes(12488423)).toBe('11.9 MB');
    });
});

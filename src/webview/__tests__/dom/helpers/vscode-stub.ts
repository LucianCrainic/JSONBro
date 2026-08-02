/**
 * Minimal stand-in for the `vscode` module.
 *
 * Lets DOM tests build their fixture from the real WebviewContentGenerator
 * instead of a hand-copied approximation, so markup changes cannot quietly
 * drift away from what the tests assert against.
 */

export interface StubUri {
    path: string;
    toString(): string;
}

export const Uri = {
    joinPath(base: StubUri, ...segments: string[]): StubUri {
        const path = [base.path.replace(/\/$/, ''), ...segments].join('/');
        return { path, toString: () => path };
    },
    file(path: string): StubUri {
        return { path, toString: () => path };
    }
};

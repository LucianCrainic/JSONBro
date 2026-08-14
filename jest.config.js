/*
 * Two projects: the pure engines run in node, anything that touches the DOM
 * runs in jsdom. Splitting them keeps the logic suites fast.
 */
const shared = {
  preset: 'ts-jest',
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
};

module.exports = {
  projects: [
    {
      ...shared,
      displayName: 'node',
      testEnvironment: 'node',
      // Everything directly under __tests__; the single `*` does not cross a
      // slash, so the jsdom suites in __tests__/dom stay with the other project.
      // Listing the files individually meant a new engine suite ran nowhere.
      testMatch: ['**/__tests__/*.test.ts'],
    },
    {
      ...shared,
      displayName: 'dom',
      testEnvironment: 'jsdom',
      testMatch: ['**/__tests__/dom/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/src/webview/__tests__/dom/helpers/setup.ts'],
      // Lets DOM tests build fixtures from the real WebviewContentGenerator,
      // which imports 'vscode' -- a module that only exists inside the host.
      moduleNameMapper: {
        '^vscode$': '<rootDir>/src/webview/__tests__/dom/helpers/vscode-stub.ts',
      },
    },
  ],
};

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
      testMatch: [
        '**/__tests__/diff.test.ts',
        '**/__tests__/json-parser.test.ts',
        '**/__tests__/formatter.test.ts',
      ],
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

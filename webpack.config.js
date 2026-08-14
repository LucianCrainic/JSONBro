const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = [
  // Extension source
  {
    name: 'extension',
    target: 'node',
    mode: 'none',
    entry: './src/extension.ts',
    output: {
      path: path.resolve(__dirname, 'out'),
      filename: 'extension.js',
      libraryTarget: 'commonjs2'
    },
    optimization: {
      minimize: true
    },
    devtool: 'nosources-source-map',
    externals: {
      vscode: 'commonjs vscode'
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'ts-loader'
            }
          ]
        }
      ]
    }
  },
  // Webview source
  {
    name: 'webview',
    target: 'web',
    mode: 'none',
    entry: './src/webview/main.ts',
    output: {
      path: path.resolve(__dirname, 'out', 'webview'),
      filename: 'main.js'
    },
    optimization: {
      minimize: true
    },
    devtool: 'nosources-source-map',
    plugins: [
      // The codicon font ships inside the extension because .vscodeignore
      // excludes node_modules, so it cannot be referenced from there at runtime.
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, 'node_modules/@vscode/codicons/dist/codicon.css'),
            to: path.resolve(__dirname, 'media/codicons/codicon.css')
          },
          {
            from: path.resolve(__dirname, 'node_modules/@vscode/codicons/dist/codicon.ttf'),
            to: path.resolve(__dirname, 'media/codicons/codicon.ttf')
          }
        ]
      })
    ],
    resolve: {
      extensions: ['.ts', '.js']
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                configFile: path.resolve(__dirname, 'tsconfig.webview.json')
              }
            }
          ]
        }
      ]
    }
  }
];

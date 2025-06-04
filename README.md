# JSONBro

A modern VS Code extension for working with JSON, built with TypeScript and a modular architecture.

## Features

- 🎨 **Format JSON**: Beautiful syntax highlighting and collapsible sections
- 📋 **Copy formatted JSON**: Easy clipboard integration
- 🗜️ **Minify JSON**: Compact JSON output
- 🕒 **History**: Keep track of your recent JSON operations
- ✅ **Validate JSON**: Real-time JSON validation with error messages
- 🧹 **Clear workspace**: Quick reset functionality

## Architecture

This extension uses a clean, modular TypeScript architecture:

### Extension Structure

```
src/
├── extension.ts                 # Main extension entry point
├── commands/
│   └── command-handler.ts      # Command registration and handling
├── webview/
│   ├── main.ts                 # Webview entry point
│   ├── controller.ts           # Main webview logic
│   ├── formatter.ts            # JSON formatting utilities
│   └── diff.ts                 # JSON diff utilities (future)
├── webview-provider.ts         # Webview creation and management
└── webview-content.ts          # HTML content generation
```

### Key Design Principles

- **Separation of Concerns**: Each module has a single responsibility
- **TypeScript First**: Strong typing throughout the codebase
- **No JavaScript Dependencies**: Pure TypeScript implementation
- **Modular Architecture**: Easy to extend and maintain
- **Modern Build Process**: Webpack-based compilation

## Development

### Prerequisites

- Node.js 16+
- npm or yarn
- VS Code

### Setup

```bash
# Install dependencies
npm install

# Compile in development mode
npm run compile:dev

# Watch for changes
npm run watch

# Build for production
npm run compile

# Package extension
npm run package
```

### Build Process

The extension uses Webpack to bundle both the extension code and webview code:

- **Extension Bundle**: `out/extension.js` - The main extension code
- **Webview Bundle**: `out/webview/main.js` - The webview frontend code

### Commands

- `JSONBro: Format JSON` - Opens the JSON formatter panel
- `JSONBro: Validate JSON` - Validates JSON (coming soon)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes following the modular architecture
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.


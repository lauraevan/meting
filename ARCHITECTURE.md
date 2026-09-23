# Meting Architecture Refactor

## Refactor Overview

This refactor moves the logic for each music provider out of the original monolithic file and into independent Provider files. It uses a standard Provider pattern to improve maintainability and extensibility.

## New Architecture

```
src/
├── meting.js                 # Main entry point (refactored)
├── meting-original.js        # Backup of the original file
└── providers/                # Music platform provider directory
    ├── index.js              # Provider factory
    ├── base.js               # Base Provider interface
    ├── netease.js            # NetEase Cloud Music Provider
    ├── tencent.js            # Tencent Music Provider
    ├── kugou.js              # KuGou Music Provider
    ├── baidu.js              # Baidu Music Provider
    └── kuwo.js               # Kuwo Music Provider
```

## Architecture Benefits

### 1. Single Responsibility Principle
- Each Provider is responsible for the logic of one music platform.
- The main Meting class only handles coordination and shared functionality.

### 2. Open/Closed Principle
- New platforms can be added by creating a new Provider without rewriting existing providers.
- Changes to one platform do not affect the others.

### 3. Self-Contained Provider Design
- Each Provider handles its own encoding and decoding logic.
- This avoids method mapping and platform-specific processing in the main class.
- Platform logic stays fully isolated.

### 4. Clear Code Organization
- Every file has a clear responsibility and is easier to maintain.
- Related functionality is grouped together.
- The version number is injected from `package.json` at build time instead of reading files at runtime.

## Core Components

### BaseProvider Base Class
The base interface for all platform Providers defines the standard methods:
- `getHeaders()`: Get request header configuration.
- `search()`: Search.
- `song()`: Get song details.
- `album()`: Get album information.
- `artist()`: Get an artist's works.
- `playlist()`: Get a playlist.
- `url()`: Get a playback URL.
- `lyric()`: Get lyrics.
- `pic()`: Get cover artwork.
- `format()`: Format data.
- `encode()`: Encode a request when required.
- `urlDecode()`: Decode a URL response when required.
- `lyricDecode()`: Decode lyrics when required.

### ProviderFactory
Creates and manages Provider instances:
- `create(platform, meting)`: Create a Provider for the requested platform.
- `getSupportedPlatforms()`: Return the supported platform list.
- `isSupported(platform)`: Check whether a platform is supported.

### Main Meting Class
Coordinates Providers and exposes a unified API:
- Keeps the original public API intact.
- Acts as a lightweight coordinator.
- Delegates platform-specific execution to the Provider.
- Receives its version number at build time with no runtime filesystem overhead.

## Usage

The refactored API remains compatible with the original usage:

```javascript
import Meting from './src/meting.js';

// Create an instance
const meting = new Meting('netease');

// Or switch providers dynamically
meting.site('tencent');

// Use the API exactly as before
const result = await meting.search('Jay Chou');
```

## Adding a New Platform

To add another provider:

1. Create a Provider file under `src/providers/`.
2. Extend `BaseProvider` and implement the required methods.
3. Register the Provider in `src/providers/index.js`.

Example:

```javascript
// src/providers/newplatform.js
import BaseProvider from './base.js';

export default class NewPlatformProvider extends BaseProvider {
  constructor(meting) {
    super(meting);
    this.name = 'newplatform';
  }

  getHeaders() {
    // Implement platform-specific headers
  }

  search(keyword, option = {}) {
    // Implement search logic
  }

  // ... implement the other required methods
}
```

## Build System

### Rollup Configuration
- Uses a custom plugin to inject the version number at build time.
- Source code uses the `__VERSION__` placeholder.
- The build automatically replaces it with the actual version from `package.json`.
- This avoids runtime filesystem reads.

### Build Process

```bash
npm run build  # Build both ESM and CJS formats
```

Build output:
- `lib/meting.esm.js` - ES Module format.
- `lib/meting.js` - CommonJS format.

## Compatibility

- ✅ Original API remains unchanged.
- ✅ Original usage remains unchanged.
- ✅ Existing functionality remains available.
- ✅ Existing chainable calls remain supported.
- ✅ Existing configuration methods remain supported.
- ✅ Version injection happens at build time with no runtime filesystem overhead.

## Test Verification

The project includes tests for:
- Core functionality (`test/test.js`).
- Architecture behavior.
- Build-time version injection.
- Individual platform Providers.

The refactor preserves the original behavior while making the codebase easier to maintain, extend, and optimize.

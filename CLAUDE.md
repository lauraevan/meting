# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Meting for Node.js is a music API framework for building music-related applications. It is a Node.js port of the original PHP Meting project and provides a unified interface for several music platforms, including NetEase Cloud Music (`netease`), Tencent Music (`tencent`), KuGou Music (`kugou`), Baidu Music (`baidu`), and Kuwo Music (`kuwo`).

## Development Commands

### Build and Test

```bash
# Build the library in ESM and CJS formats
npm run build

# Development mode with automatic rebuilds
npm run dev

# Run the complete test suite (builds first)
npm test

# Run the example
npm start
# or
npm run example

# Run individual files directly after building
node test/test.js           # Full platform test
node test/example.js        # Example program
```

### Individual Test Commands

```bash
# Quick test of a single platform after building
node -e "
import Meting from './lib/meting.js';
const m = new Meting('netease');
m.format(true);
m.search('test', { limit: 5 }).then(console.log);
"

# Verify build-time version injection
node -e "import Meting from './lib/meting.js'; console.log('Version:', (new Meting()).VERSION)"
```

### Environment Requirements

- Node.js >= 12.0.0
- No runtime third-party dependencies; provider code uses Node.js built-ins.

## Core Architecture

### Provider Pattern

The project uses a Provider pattern so platform-specific behavior stays isolated:

- **Main Meting class** (`src/meting.js`): Coordinates provider switching and delegates API calls.
- **Provider factory** (`src/providers/index.js`): Creates and registers platform Providers.
- **Base Provider** (`src/providers/base.js`): Defines shared interfaces and default behavior.
- **Platform Providers** (`src/providers/{platform}.js`): Contain independent implementations for each platform.
- **Unified request flow**: Requests pass through the shared Provider request pipeline while each Provider controls its own platform-specific behavior.

### Key Design Principles

1. **Self-contained Providers**: Each Provider independently handles its own encoding and decoding through methods such as `handleEncode()` and `handleDecode()`.
2. **Single responsibility**: Each file owns one platform or one shared responsibility.
3. **No central method mapping**: Platform-specific behavior is handled directly inside Providers rather than mapped inside the main class.

### Execution Flow

```
User API call -> Meting class -> Provider.executeRequest() -> platform-specific processing -> normalized result
```

Detailed request flow:

1. **API call**: A public method such as `meting.search('keyword', { page: 1, limit: 30 })` is called.
2. **Provider delegation**: The main class asks the active Provider for an API request configuration.
3. **Encoding**: The Provider can run `handleEncode()` when platform-specific request encoding is required.
4. **HTTP request**: The built-in Fetch API sends the request with timeout and retry handling.
5. **Decoding**: The Provider can run `handleDecode()` when the response requires decoding.
6. **Formatting**: If `format(true)` is enabled, the data is normalized.
7. **Return value**: The processed result is returned as a JSON string.

## Public API

- `search(keyword, option = {})`: Search for music. Options include `type`, `page`, and `limit`.
- `song(id)`: Get song details.
- `album(id)`: Get album information.
- `artist(id, limit = 50)`: Get an artist's works.
- `playlist(id)`: Get a playlist.
- `url(id, br = 320)`: Get an audio playback URL at the requested bitrate when available.
- `lyric(id)`: Get lyrics.
- `pic(id, size = 300)`: Get cover artwork at the requested size.

### Error Handling

- **Network errors**: Requests retry up to three times with a one-second delay.
- **Timeout**: Default request timeout is 20 seconds.
- **Provider switching**: Callers can switch platforms as a fallback.
- **Error state**: Request errors are stored in `meting.error` and `meting.status`.

### Version Management

- Source code uses the `__VERSION__` placeholder.
- A custom Rollup plugin injects the actual version from `package.json` during the build.
- This avoids runtime filesystem reads.

Build-time injection:

```javascript
// Version injection plugin in rollup.config.js
{
  name: 'inject-version',
  transform(code, id) {
    if (id.endsWith('src/meting.js')) {
      return code.replace('__VERSION__', packageInfo.version);
    }
    return null;
  }
}
```

Usage:

```javascript
const meting = new Meting();
console.log(meting.VERSION); // Actual version, for example "1.5.13"
```

## Important Design Patterns

### Adapter Pattern

Every platform has its own formatting implementation while exposing a unified output structure:
- Providers return the same standardized JSON shape.
- Normalization is enabled with `format(true)`.

### Strategy Pattern

Provider implementations define each platform's request strategy:
- Platform-specific API endpoints.
- Platform-specific encryption and signing.
- Dynamic headers and request parameters.

### Built-In Cryptography

Some providers use platform-specific encryption or signing implemented with Node.js built-ins. Do not change protocol constants or cryptographic behavior during unrelated refactors.

## Adding a New Platform

1. Create a new Provider file in `src/providers/`.
2. Extend `BaseProvider` and implement all required methods.
3. Implement platform-specific `handleEncode()` and `handleDecode()` behavior when needed.
4. Register the Provider in `src/providers/index.js`.
5. Add tests.

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
    // Implement search and return the shared API configuration shape
  }

  async handleEncode(api) {
    // Implement platform-specific encoding
    return api;
  }

  async handleDecode(decodeType, data) {
    // Implement platform-specific decoding
    return data;
  }

  // ... implement other required methods
}
```

## Data Format

### Standard Song Shape (`format: true`)

```javascript
{
  "id": "song ID",
  "name": "song name",
  "artist": ["artist 1", "artist 2"],
  "album": "album name",
  "pic_id": "cover image ID",
  "url_id": "playback URL ID",
  "lyric_id": "lyrics ID",
  "source": "provider identifier"
}
```

## Operational Notes

### API Request Limits

- Add delays when repeatedly testing upstream platforms.
- Avoid unnecessary high-frequency requests.
- Each upstream platform may enforce different rate limits.

### Platform Compatibility

- Upstream music APIs can change without notice and may require maintenance.
- Some resources may be unavailable because of rights, region, account tier, or catalog restrictions.
- Some platforms may require cookies for specific functionality.

### Fallback Pattern

```javascript
const meting = new Meting('netease');
meting.format(true);

try {
  const result = await meting.search('keyword', { page: 1, limit: 30 });
  // Process the normalized result
} catch (error) {
  // Log the error and retry with another provider
  console.error(meting.status);
  meting.site('tencent');
  const fallback = await meting.search('keyword', { page: 1, limit: 30 });
}
```

## Build System

### Rollup Configuration

- **Dual output**: Builds ESM (`lib/meting.esm.js`) and CJS (`lib/meting.js`).
- **Version injection**: Replaces `__VERSION__` with the version from `package.json`.
- **Dependency handling**: Uses Node.js built-in modules.
- **Minification**: Uses the terser plugin.
- **Development mode**: Supports automatic rebuilds with `npm run dev`.

### Build Flow

```bash
# Development
npm run dev    # Watch files and rebuild automatically

# Production
npm run build  # Build both formats into lib/
npm test       # Build and run tests
npm publish    # prepublishOnly builds automatically
```

### Output Files

- `lib/meting.esm.js`: ES Module build for modern tooling.
- `lib/meting.js`: CommonJS build for Node.js `require`.

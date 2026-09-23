/**
 * Meting music framework - Node.js version (refactored version)
 * https://i-meto.com
 * https://github.com/metowolf/Meting
 *
 * Copyright 2019, METO Sheel <i@i-meto.com>
 * Released under the MIT license
 */

import { URLSearchParams } from 'url';
import ProviderFactory from './providers/index.js';

class Meting {
  constructor(server = 'netease') {
    this.VERSION = '__VERSION__'; // Replaced by Rollup with the actual version at build time
    this.raw = null;
    this.info = null;
    this.error = null;
    this.status = null;
    this.temp = {};

    this.server = null;
    this.provider = null;
    this.isFormat = false;
    this.header = {};

    this.site(server);
  }

  // Set music platform
  site(server) {
    if (!ProviderFactory.isSupported(server)) {
      server = 'netease'; // Default to NetEase Cloud Music
    }

    this.server = server;
    this.provider = ProviderFactory.create(server, this);
    this.header = this.provider.getHeaders();

    return this;
  }

  // Set Cookie
  cookie(cookie) {
    this.header['Cookie'] = cookie;
    return this;
  }

  // Configure data formatting
  format(format = true) {
    this.isFormat = format;
    return this;
  }

  // Main API request execution method
  async _exec(api) {
    // Let the Provider handle the complete request flow
    return await this.provider.executeRequest(api, this);
  }

  // HTTP request method - uses the Fetch API
  async _curl(url, payload = null, headerOnly = false) {
    const requestOptions = {
      method: payload ? 'POST' : 'GET',
      headers: { ...this.header }
    };

    // Process request body
    if (payload) {
      if (typeof payload === 'object' && !Buffer.isBuffer(payload) && typeof payload !== 'string') {
        payload = new URLSearchParams(payload).toString();
        requestOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
      requestOptions.body = payload;
    }

    // Add timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    requestOptions.signal = controller.signal;

    let retries = 3;
    const makeRequest = async () => {
      try {
        const response = await fetch(url, requestOptions);
        
        clearTimeout(timeoutId);
        
        // Store response information
        this.info = {
          statusCode: response.status,
          headers: Object.fromEntries(response.headers.entries())
        };

        // Read response data
        const data = await response.text();
        this.raw = data;
        this.error = null;
        this.status = '';
        
        return this;
      } catch (err) {
        clearTimeout(timeoutId);
        
        // Handle errors
        if (err.name === 'AbortError') {
          this.error = 'TIMEOUT';
          this.status = 'Request timeout';
        } else {
          this.error = err.code || err.name;
          this.status = err.message;
        }
        
        // Retry mechanism
        if (retries > 0) {
          retries--;
          await new Promise(resolve => setTimeout(resolve, 1000));
          return makeRequest();
        } else {
          return this;
        }
      }
    };

    return await makeRequest();
  }


  // ========== Public API methods ==========

  // Search
  async search(keyword, option = {}) {
    const api = this.provider.search(keyword, option);
    return await this._exec(api);
  }

  // Get song details
  async song(id) {
    const api = this.provider.song(id);
    return await this._exec(api);
  }

  // Get album information
  async album(id) {
    const api = this.provider.album(id);
    return await this._exec(api);
  }

  // Get artist works
  async artist(id, limit = 50) {
    const api = this.provider.artist(id, limit);
    return await this._exec(api);
  }

  // Get playlist
  async playlist(id) {
    const api = this.provider.playlist(id);
    return await this._exec(api);
  }

  // Get audio playback URL
  async url(id, br = 320) {
    this.temp.br = br;
    const api = this.provider.url(id, br);
    return await this._exec(api);
  }

  // Get lyrics
  async lyric(id) {
    const api = this.provider.lyric(id);
    return await this._exec(api);
  }

  // Get cover artwork
  async pic(id, size = 300) {
    return await this.provider.pic(id, size);
  }

  // ========== Static methods ==========

  // Get supported platforms
  static getSupportedPlatforms() {
    return ProviderFactory.getSupportedPlatforms();
  }

  // Check whether a platform is supported
  static isSupported(platform) {
    return ProviderFactory.isSupported(platform);
  }
}

export default Meting;

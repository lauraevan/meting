/**
 * Base class for music platform providers
 * Defines the interface that all music platform providers must implement
 */
export default class BaseProvider {
  constructor(meting) {
    this.meting = meting;
    this.name = 'base';
  }

  /**
   * Get request headers for the platform
   * @returns {Object} Request headers object
   */
  getHeaders() {
    return {};
  }

  /**
   * Search for songs
   * @param {string} keyword Search keyword
   * @param {Object} [option={}] Search options
   * @returns {Object} API configuration object
   */
  search(keyword, option = {}) {
    throw new Error(`${this.name} provider must implement search method`);
  }

  /**
   * Get song details
   * @param {string} id Song ID
   * @returns {Object} API configuration object
   */
  song(id) {
    throw new Error(`${this.name} provider must implement song method`);
  }

  /**
   * Get album information
   * @param {string} id Album ID
   * @returns {Object} API configuration object
   */
  album(id) {
    throw new Error(`${this.name} provider must implement album method`);
  }

  /**
   * Get artist works
   * @param {string} id Artist ID
   * @param {number} limit Result limit
   * @returns {Object} API configuration object
   */
  artist(id, limit = 50) {
    throw new Error(`${this.name} provider must implement artist method`);
  }

  /**
   * Get playlist
   * @param {string} id Playlist ID
   * @returns {Object} API configuration object
   */
  playlist(id) {
    throw new Error(`${this.name} provider must implement playlist method`);
  }

  /**
   * Get audio playback URL
   * @param {string} id Song ID
   * @param {number} br Bitrate
   * @returns {Object} API configuration object
   */
  url(id, br = 320) {
    throw new Error(`${this.name} provider must implement url method`);
  }

  /**
   * Get lyrics
   * @param {string} id Song ID
   * @returns {Object} API configuration object
   */
  lyric(id) {
    throw new Error(`${this.name} provider must implement lyric method`);
  }

  /**
   * Get cover artwork
   * @param {string} id Image ID
   * @param {number} size Image size
   * @returns {Promise<string>} JSON string containing the image URL
   */
  async pic(id, size = 300) {
    throw new Error(`${this.name} provider must implement pic method`);
  }

  /**
   * Format data
   * @param {Object} data Raw data
   * @returns {Object} Formatted data
   */
  format(data) {
    throw new Error(`${this.name} provider must implement format method`);
  }

  /**
   * URL decoding method (when required)
   * @param {string} result Raw result
   * @returns {string} Decoded result
   */
  urlDecode(result) {
    // Default implementation; subclasses may override
    return result;
  }

  /**
   * Lyrics decoding method (when required)
   * @param {string} result Raw result
   * @returns {string} Decoded result
   */
  lyricDecode(result) {
    // Default implementation; subclasses may override
    return result;
  }

  /**
   * Execute the complete API request flow
   * @param {Object} api API configuration object
   * @param {Object} meting Meting instance
   * @returns {string} Processed result
   */
  async executeRequest(api, meting) {
    // Run encoding first when an encoding method is defined
    if (api.encode) {
      api = await this.handleEncode(api);
    }

    // Process GET request parameters
    if (api.method === 'GET' && api.body) {
      const params = new URLSearchParams(api.body);
      api.url += '?' + params.toString();
      api.body = null;
    }

    // Send HTTP request
    await meting._curl(api.url, api.body);

    // Return raw data immediately when formatting is disabled
    if (!meting.isFormat) {
      return meting.raw;
    }

    let data = meting.raw;

    // Decode the response when a decoding method is available
    if (api.decode) {
      data = await this.handleDecode(api.decode, data);
    }

    // Clean the data when a formatting rule is defined
    if ('format' in api) {
      data = this.cleanData(data, api.format, meting);
    }

    return data;
  }

  /**
   * Handle encoding
   * @param {Object} api API configuration object
   * @returns {Object} Encoded API configuration
   */
  async handleEncode(api) {
    // Subclasses may override this method for platform-specific encoding
    return api;
  }

  /**
   * Handle decoding
   * @param {string} decodeType Decode type
   * @param {string} data Raw data
   * @returns {string} Decoded data
   */
  async handleDecode(decodeType, data) {
    // Call the appropriate method for the decode type
    if (decodeType.includes('url')) {
      return this.urlDecode(data);
    } else if (decodeType.includes('lyric')) {
      return this.lyricDecode(data);
    }
    return data;
  }

  /**
   * Data cleaning method
   * @param {string} raw Raw data
   * @param {string} rule Extraction rule
   * @param {Object} meting Meting instance
   * @returns {string} Cleaned data
   */
  cleanData(raw, rule, meting) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return JSON.stringify([]);
    }

    if (rule) {
      data = this.pickupData(data, rule);
    }

    if (!Array.isArray(data) && typeof data === 'object' && data !== null) {
      data = [data];
    }

    if (!Array.isArray(data)) {
      return JSON.stringify([]);
    }

    // Use the current Provider's formatting method
    if (typeof this.format === 'function') {
      const result = data.map(item => this.format(item));
      return JSON.stringify(result);
    }

    return JSON.stringify(data);
  }

  /**
   * Data extraction method
   * @param {Object} array Data object
   * @param {string} rule Extraction rule
   * @returns {Object} Extracted data
   */
  pickupData(array, rule) {
    const parts = rule.split('.');
    let result = array;
    
    for (const part of parts) {
      if (!result || typeof result !== 'object' || !(part in result)) {
        return {};
      }
      result = result[part];
    }
    
    return result;
  }
}

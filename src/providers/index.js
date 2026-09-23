import NeteaseProvider from './netease.js';
import TencentProvider from './tencent.js';
import KugouProvider from './kugou.js';
import BaiduProvider from './baidu.js';
import KuwoProvider from './kuwo.js';

/**
 * Music platform provider factory
 */
export default class ProviderFactory {
  static providers = {
    netease: NeteaseProvider,
    tencent: TencentProvider,
    kugou: KugouProvider,
    baidu: BaiduProvider,
    kuwo: KuwoProvider
  };

  /**
   * Create a provider instance for the specified platform
   * @param {string} platform Platform name
   * @param {Object} meting Meting instance
   * @returns {BaseProvider} Platform provider instance
   */
  static create(platform, meting) {
    const ProviderClass = this.providers[platform];
    if (!ProviderClass) {
      throw new Error(`Unsupported platform: ${platform}`);
    }
    return new ProviderClass(meting);
  }

  /**
   * Get the supported platform list
   * @returns {string[]} Array of supported platform names
   */
  static getSupportedPlatforms() {
    return Object.keys(this.providers);
  }

  /**
   * Check whether a platform is supported
   * @param {string} platform Platform name
   * @returns {boolean} Whether the platform is supported
   */
  static isSupported(platform) {
    return platform in this.providers;
  }
}
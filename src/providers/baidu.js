import crypto from 'crypto';
import BaseProvider from './base.js';

/**
 * Baidu Music provider
 */
export default class BaiduProvider extends BaseProvider {
  constructor(meting) {
    super(meting);
    this.name = 'baidu';
  }

  /**
   * Get Baidu Music request headers
   */
  getHeaders() {
    return {
      'Cookie': `BAIDUID=${this._getRandomHex(32)}:FG=1`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) baidu-music/1.2.1 Chrome/66.0.3359.181 Electron/3.0.5 Safari/537.36',
      'Accept': '*/*',
      'Content-Type': 'application/json;charset=UTF-8',
      'Accept-Language': 'zh-CN'
    };
  }

  /**
   * Search for songs
   */
  search(keyword, option = {}) {
    return {
      method: 'GET',
      url: 'http://musicapi.taihe.com/v1/restserver/ting',
      body: {
        from: 'qianqianmini',
        method: 'baidu.ting.search.merge',
        isNew: 1,
        platform: 'darwin',
        page_no: option.page || 1,
        query: keyword,
        version: '11.2.1',
        page_size: option.limit || 30
      },
      format: 'result.song_info.song_list'
    };
  }

  /**
   * Get song details
   */
  song(id) {
    return {
      method: 'GET',
      url: 'http://musicapi.taihe.com/v1/restserver/ting',
      body: {
        from: 'qianqianmini',
        method: 'baidu.ting.song.getInfos',
        songid: id,
        res: 1,
        platform: 'darwin',
        version: '1.0.0'
      },
      encode: 'baidu_AESCBC',
      format: 'songinfo'
    };
  }

  /**
   * Get album information
   */
  album(id) {
    return {
      method: 'GET',
      url: 'http://musicapi.taihe.com/v1/restserver/ting',
      body: {
        from: 'qianqianmini',
        method: 'baidu.ting.album.getAlbumInfo',
        album_id: id,
        platform: 'darwin',
        version: '11.2.1'
      },
      format: 'songlist'
    };
  }

  /**
   * Get artist works
   */
  artist(id, limit = 50) {
    return {
      method: 'GET',
      url: 'http://musicapi.taihe.com/v1/restserver/ting',
      body: {
        from: 'qianqianmini',
        method: 'baidu.ting.artist.getSongList',
        artistid: id,
        limits: limit,
        platform: 'darwin',
        offset: 0,
        tinguid: 0,
        version: '11.2.1'
      },
      format: 'songlist'
    };
  }

  /**
   * Get playlist
   */
  playlist(id) {
    return {
      method: 'GET',
      url: 'http://musicapi.taihe.com/v1/restserver/ting',
      body: {
        from: 'qianqianmini',
        method: 'baidu.ting.diy.gedanInfo',
        listid: id,
        platform: 'darwin',
        version: '11.2.1'
      },
      format: 'content'
    };
  }

  /**
   * Get audio playback URL
   */
  url(id, br = 320) {
    return {
      method: 'GET',
      url: 'http://musicapi.taihe.com/v1/restserver/ting',
      body: {
        from: 'qianqianmini',
        method: 'baidu.ting.song.getInfos',
        songid: id,
        res: 1,
        platform: 'darwin',
        version: '1.0.0'
      },
      encode: 'baidu_AESCBC',
      decode: 'baidu_url'
    };
  }

  /**
   * Get lyrics
   */
  lyric(id) {
    return {
      method: 'GET',
      url: 'http://musicapi.taihe.com/v1/restserver/ting',
      body: {
        from: 'qianqianmini',
        method: 'baidu.ting.song.lry',
        songid: id,
        platform: 'darwin',
        version: '1.0.0'
      },
      decode: 'baidu_lyric'
    };
  }

  /**
   * Get cover artwork
   */
  async pic(id, size = 300) {
    const format = this.meting.isFormat;
    const data = await this.meting.format(false).song(id);
    this.meting.isFormat = format;
    const songData = JSON.parse(data);
    const url = songData.songinfo.pic_radio || songData.songinfo.pic_small;
    return JSON.stringify({ url: url });
  }

  /**
   * Format Baidu Music data
   */
  format(data) {
    return {
      id: data.song_id,
      name: data.title,
      artist: data.author ? data.author.split(',') : [],
      album: data.album_title || '',
      pic_id: data.song_id,
      url_id: data.song_id,
      lyric_id: data.song_id,
      source: 'baidu'
    };
  }

  /**
   * Handle Baidu Music encoding/decoding
   */
  async handleEncode(api) {
    if (api.encode === 'baidu_AESCBC') {
      return this.aesEncrypt(api);
    }
    return api;
  }

  async handleDecode(decodeType, data) {
    if (decodeType === 'baidu_url') {
      return this.urlDecode(data);
    } else if (decodeType === 'baidu_lyric') {
      return this.lyricDecode(data);
    }
    return data;
  }

  /**
   * Baidu Music AES encryption
   */
  async aesEncrypt(api) {
    const key = 'DBEECF8C50FD160E';
    const vi = '1231021386755796';
    
    const data = `songid=${api.body.songid}&ts=${Date.now()}`;
    
    const cipher = crypto.createCipheriv('aes-128-cbc', key, vi);
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    api.body.e = encrypted;
    
    return api;
  }

  /**
   * Baidu Music URL decoding
   */
  urlDecode(result) {
    const data = JSON.parse(result);
    
    let maxBr = 0;
    let url;
    
    data.songurl.url.forEach(item => {
      if (item.file_bitrate <= this.meting.temp.br && item.file_bitrate > maxBr) {
        maxBr = item.file_bitrate;
        url = {
          url: item.file_link,
          br: item.file_bitrate
        };
      }
    });
    
    if (!url) {
      url = {
        url: '',
        br: -1
      };
    }
    
    return JSON.stringify(url);
  }

  /**
   * Baidu Music lyrics decoding
   */
  lyricDecode(result) {
    const data = JSON.parse(result);
    const lyricData = {
      lyric: data.lrcContent || '',
      tlyric: ''
    };
    
    return JSON.stringify(lyricData);
  }

  // ========== Private utility methods ==========

  /**
   * Generate a random hexadecimal string
   */
  _getRandomHex(length) {
    return crypto.randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  }
}
import BaseProvider from './base.js';

/**
 * Kuwo Music provider
 */
export default class KuwoProvider extends BaseProvider {
  constructor(meting) {
    super(meting);
    this.name = 'kuwo';
  }

  /**
   * Get Kuwo Music request headers
   */
  getHeaders() {
    return {
      'Host': 'www.kuwo.cn',
      'Referer': 'https://www.kuwo.cn/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36'
    };
  }

  /**
   * Search for songs
   */
  search(keyword, option = {}) {
    return {
      method: 'GET',
      url: 'https://www.kuwo.cn/api/www/search/searchMusicBykeyWord',
      body: {
        key: keyword,
        pn: option.page || 1,
        rn: option.limit || 30,
        httpsStatus: 1
      },
      format: 'data.list'
    };
  }

  /**
   * Get song details
   */
  song(id) {
    return {
      method: 'GET',
      url: 'http://www.kuwo.cn/api/www/music/musicInfo',
      body: {
        mid: id,
        httpsStatus: 1
      },
      format: 'data'
    };
  }

  /**
   * Get album information
   */
  album(id) {
    return {
      method: 'GET',
      url: 'http://www.kuwo.cn/api/www/album/albumInfo',
      body: {
        albumId: id,
        pn: 1,
        rn: 1000,
        httpsStatus: 1
      },
      format: 'data.musicList'
    };
  }

  /**
   * Get artist works
   */
  artist(id, limit = 50) {
    return {
      method: 'GET',
      url: 'http://www.kuwo.cn/api/www/artist/artistMusic',
      body: {
        artistid: id,
        pn: 1,
        rn: limit,
        httpsStatus: 1
      },
      format: 'data.list'
    };
  }

  /**
   * Get playlist
   */
  playlist(id) {
    return {
      method: 'GET',
      url: 'http://www.kuwo.cn/api/www/playlist/playListInfo',
      body: {
        pid: id,
        pn: 1,
        rn: 1000,
        httpsStatus: 1
      },
      format: 'data.musicList'
    };
  }

  /**
   * Get audio playback URL
   */
  url(id, br = 320) {
    return {
      method: 'GET',
      url: 'https://www.kuwo.cn/api/v1/www/music/playUrl',
      body: {
        mid: id,
        type: 'music',
        httpsStatus: 1
      },
      decode: 'kuwo_url'
    };
  }

  /**
   * Get lyrics
   */
  lyric(id) {
    return {
      method: 'GET',
      url: 'http://m.kuwo.cn/newh5/singles/songinfoandlrc',
      body: {
        musicId: id,
        httpsStatus: 1
      },
      decode: 'kuwo_lyric'
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
    const url = songData.data.pic || songData.data.albumpic;
    return JSON.stringify({ url: url });
  }

  /**
   * Format Kuwo Music data
   */
  format(data) {
    return {
      id: data.rid,
      name: data.name,
      artist: data.artist ? data.artist.split('&') : [],
      album: data.album || '',
      pic_id: data.rid,
      url_id: data.rid,
      lyric_id: data.rid,
      source: 'kuwo'
    };
  }

  /**
   * Handle Kuwo Music decoding
   */
  async handleDecode(decodeType, data) {
    if (decodeType === 'kuwo_url') {
      return this.urlDecode(data);
    } else if (decodeType === 'kuwo_lyric') {
      return this.lyricDecode(data);
    }
    return data;
  }

  /**
   * Kuwo Music URL decoding
   */
  urlDecode(result) {
    const data = JSON.parse(result);
    
    let url;
    if (data.code === 200 && data.data && data.data.url) {
      url = {
        url: data.data.url,
        br: 128
      };
    } else {
      url = {
        url: '',
        br: -1
      };
    }
    
    return JSON.stringify(url);
  }

  /**
   * Kuwo Music lyrics decoding
   */
  lyricDecode(result) {
    const data = JSON.parse(result);
    
    let lyric = '';
    if (data.data && data.data.lrclist && data.data.lrclist.length > 0) {
      data.data.lrclist.forEach(item => {
        const time = parseFloat(item.time);
        const min = Math.floor(time / 60).toString().padStart(2, '0');
        const sec = Math.floor(time % 60).toString().padStart(2, '0');
        const msec = ((time % 1) * 100).toFixed(0).padStart(2, '0');
        
        lyric += `[${min}:${sec}.${msec}]${item.lineLyric}\n`;
      });
    }
    
    const lyricData = {
      lyric: lyric,
      tlyric: ''
    };
    
    return JSON.stringify(lyricData);
  }
}

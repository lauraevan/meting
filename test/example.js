/**
 * Meting Node.js usage example
 */

import Meting from '../lib/meting.esm.js';

async function main() {
  // Create a Meting instance
  const meting = new Meting('netease'); // Options: 'netease', 'tencent', 'kugou', 'baidu', 'kuwo'
  
  // Enable data formatting
  meting.format(true);
  
  console.log('=== Meting Node.js Example ===\n');
  
  try {
    // 1. Search for songs
    console.log('1. Search for songs：');
    const searchResult = await meting.search('Light Years Away', { limit: 3 });
    console.log('Search results：');
    console.log(JSON.stringify(JSON.parse(searchResult), null, 2));
    console.log('\n');
    
    // Get the ID of the first song
    const songs = JSON.parse(searchResult);
    if (songs.length > 0) {
      const firstSong = songs[0];
      console.log(`Selected song: ${firstSong.name} - ${firstSong.artist.join(', ')}\n`);
      
      // 2. Get song details
      console.log('2. Get song details：');
      const songDetail = await meting.song(firstSong.id);
      console.log('Song details：');
      console.log(JSON.stringify(JSON.parse(songDetail), null, 2));
      console.log('\n');
      
      // 3. Get song playback URL
      console.log('3. Get song playback URL：');
      const url = await meting.url(firstSong.url_id, 320);
      console.log('Playback URL：');
      console.log(JSON.stringify(JSON.parse(url), null, 2));
      console.log('\n');
      
      // 4. Get lyrics
      console.log('4. Get lyrics：');
      const lyric = await meting.lyric(firstSong.lyric_id);
      const lyricData = JSON.parse(lyric);
      console.log('Lyrics preview (first 5 lines)：');
      if (lyricData.lyric) {
        const lines = lyricData.lyric.split('\n').slice(0, 5);
        lines.forEach(line => {
          if (line.trim()) console.log(line);
        });
      } else {
        console.log('No lyrics available');
      }
      console.log('\n');
      
      // 5. Get cover artwork
      console.log('5. Get cover artwork：');
      const pic = await meting.pic(firstSong.pic_id, 300);
      console.log('Cover artwork：');
      console.log(JSON.stringify(JSON.parse(pic), null, 2));
      console.log('\n');
    }
    
    // 6. Switch to another platform for testing
    console.log('6. Switch to Tencent Music：');
    meting.site('tencent');
    const tencentSearch = await meting.search('G.E.M.', { limit: 2 });
    console.log('Tencent Music search results：');
    console.log(JSON.stringify(JSON.parse(tencentSearch), null, 2));
    console.log('\n');
    
  } catch (error) {
    console.error('An error occurred：', error);
  }
}

// Run the example
main().then(() => {
  console.log('Example completed！');
}).catch(error => {
  console.error('Example failed：', error);
});
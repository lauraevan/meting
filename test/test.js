/**
 * Meting Node.js basic test
 */

import Meting from '../src/meting.js';

async function runTests() {
  console.log('=== Meting Node.js Basic Test ===\n');
  
  const platforms = ['netease', 'tencent', 'kugou', 'baidu', 'kuwo'];
  const testKeyword = 'Jay Chou';
  
  for (const platform of platforms) {
    console.log(`\n--- Testing platform: ${platform} ---`);
    
    try {
      const meting = new Meting(platform);
      meting.format(true);
      
      // Testing search
      console.log('Testing search...');
      const searchResult = await meting.search(testKeyword, { limit: 1 });
      const songs = JSON.parse(searchResult);
      
      if (songs.length > 0) {
        const song = songs[0];
        console.log(`✓ Search succeeded: ${song.name} - ${song.artist.join(', ')}`);
        
        // Testing song details
        console.log('Testing song details...');
        const songDetail = await meting.song(song.id);
        const songData = JSON.parse(songDetail);
        if (songData.length > 0) {
          console.log(`✓ Song details retrieved successfully: ${songData[0].name}`);
        } else {
          console.log('✗ Failed to retrieve song details');
        }
        
        // Testing playback URL
        console.log('Testing playback URL...');
        try {
          const url = await meting.url(song.url_id, 128);
          const urlData = JSON.parse(url);
          if (urlData.url) {
            console.log('✓ Playback URL retrieved successfully');
          } else {
            console.log('✗ Failed to retrieve playback URL (may require a subscription or the track may be unavailable)');
          }
        } catch (error) {
          console.log('✗ Error retrieving playback URL:', error.message);
        }
        
        // Testing lyrics
        console.log('Testing lyrics...');
        try {
          const lyric = await meting.lyric(song.lyric_id);
          const lyricData = JSON.parse(lyric);
          if (lyricData.lyric) {
            console.log('✓ Lyrics retrieved successfully');
          } else {
            console.log('✗ Failed to retrieve lyrics (lyrics may be unavailable)');
          }
        } catch (error) {
          console.log('✗ Error retrieving lyrics:', error.message);
        }
        
        // Testing cover artwork
        console.log('Testing cover artwork...');
        try {
          const pic = await meting.pic(song.pic_id, 200);
          const picData = JSON.parse(pic);
          if (picData.url) {
            console.log('✓ Cover artwork retrieved successfully');
          } else {
            console.log('✗ Failed to retrieve cover artwork');
          }
        } catch (error) {
          console.log('✗ Error retrieving cover artwork:', error.message);
        }
        
      } else {
        console.log('✗ Search failed or returned no results');
      }
      
    } catch (error) {
      console.log(`✗ Platform ${platform} test failed:`, error.message);
    }
    
    // Add a delay to avoid sending requests too quickly
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n=== Tests Complete ===');
}

// Run tests
runTests().catch(console.error);

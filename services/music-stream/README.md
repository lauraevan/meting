# Dedicated music stream service

This optional service runs the YouTube resolver separately from Vercel, where
the installed `yt-dlp` script cannot run because Python is absent. It accepts
only 11-character YouTube video IDs. `/stream/:id` resolves the current audio
URL and relays it with byte range support; `/health` reports availability.

For a Node host, download the **standalone Linux executable** from the official
yt-dlp release page as `services/music-stream/yt-dlp`, make it executable, then
run `node services/music-stream/server.js`. Set `YTDLP_PATH` if it lives elsewhere.
The `Dockerfile` provides an alternative where Docker is available.

Set `YOUTUBE_STREAM_ORIGIN` on the Vercel project to the HTTPS origin of this
service after it is deployed. The web player will then try this stream and
fall back to the visible YouTube player if it fails. Keep the runtime patched:
YouTube changes its player and automated extraction can stop working.

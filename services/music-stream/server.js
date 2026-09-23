import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';

const port = Number(process.env.PORT || 8080);
const executable = process.env.YTDLP_PATH || './services/music-stream/yt-dlp';
const resolverCheck = spawnSync(executable, ['--version'], { timeout: 12000, encoding: 'utf8' });
const resolverReady = resolverCheck.status === 0;
if (!resolverReady) console.error('yt-dlp unavailable:', resolverCheck.error?.message || resolverCheck.stderr?.slice(0, 300) || `exit ${resolverCheck.status}`);
const cache = new Map();
const pending = new Map();
const validId = id => /^[A-Za-z0-9_-]{11}$/.test(id);

const resolve = id => {
  const cached = cache.get(id);
  if (cached?.expires > Date.now()) return Promise.resolve(cached.url);
  if (pending.has(id)) return pending.get(id);

  const work = new Promise((done, fail) => {
    const child = spawn(executable, [
      '--get-url', '-f', 'bestaudio[ext=m4a]/bestaudio',
      '--no-playlist', '--no-warnings', '--quiet',
      `https://www.youtube.com/watch?v=${id}`
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-1500); });
    child.on('error', fail);
    child.on('close', code => {
      clearTimeout(timer);
      const url = stdout.trim().split('\n')[0];
      if (code !== 0 || !url) return fail(new Error(stderr || 'Audio unavailable'));
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || !/(^|\.)googlevideo\.com$/.test(parsed.hostname)) {
          throw new Error('Unexpected audio host');
        }
        cache.set(id, { url, expires: Date.now() + 4 * 60 * 1000 });
        if (cache.size > 100) cache.delete(cache.keys().next().value);
        done(url);
      } catch (error) { fail(error); }
    });
  }).finally(() => pending.delete(id));
  pending.set(id, work);
  return work;
};

http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = resolverReady ? 200 : 503;
    res.end(JSON.stringify({ ok: resolverReady, service: 'meting-music-stream' }));
    return;
  }

  const id = /^\/stream\/([^/]+)$/.exec(path)?.[1];
  if (req.method !== 'GET' || !validId(id)) {
    res.writeHead(404).end();
    return;
  }

  try {
    const url = await resolve(id);
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    const range = req.headers.range;
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: range ? { Range: range } : {}
    });
    if (!upstream.ok || !upstream.body) throw new Error(`Audio returned ${upstream.status}`);
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'audio/mp4',
      'Cache-Control': 'private, no-store',
      'Accept-Ranges': 'bytes',
      ...(upstream.headers.get('content-length') ? { 'Content-Length': upstream.headers.get('content-length') } : {}),
      ...(upstream.headers.get('content-range') ? { 'Content-Range': upstream.headers.get('content-range') } : {})
    });
    Readable.fromWeb(upstream.body).on('error', () => res.destroy()).pipe(res);
  } catch {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Audio unavailable' }));
    else res.destroy();
  }
}).listen(port, '0.0.0.0', () => console.log(`Music stream server listening on ${port}`));

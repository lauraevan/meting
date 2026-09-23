const SITE_BASE = String(
  process.env.MONOCHROME_SITE_URL || 'https://monochrome.tf'
).replace(/\/+$/, '');

const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

let browserPromise = null;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
        import('puppeteer-core'),
        import('@sparticuz/chromium')
      ]);

      chromium.setGraphicsMode = false;

      const executablePath =
        process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath();

      const browser = await puppeteer.launch({
        args: await puppeteer.defaultArgs({
          args: chromium.args,
          headless: 'shell'
        }),
        executablePath,
        headless: 'shell',
        defaultViewport: {
          width: 1280,
          height: 900,
          deviceScaleFactor: 1
        }
      });

      browser.once('disconnected', () => {
        browserPromise = null;
      });

      return browser;
    })().catch(error => {
      browserPromise = null;
      throw error;
    });
  }

  return browserPromise;
}

async function withPage(run) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(BROWSER_UA);
    await page.setCacheEnabled(true);
    await page.setRequestInterception(true);

    page.on('request', request => {
      const type = request.resourceType();

      if (type === 'font' || type === 'image') {
        request.abort().catch(() => {});
        return;
      }

      request.continue().catch(() => {});
    });

    return await run(page);
  } finally {
    await page.close().catch(() => {});
  }
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export async function scrapeMonochromeSearch(query, limit = 20) {
  const cleanQuery = cleanText(query);
  if (!cleanQuery) return [];

  return withPage(async page => {
    const url = `${SITE_BASE}/search/${encodeURIComponent(cleanQuery)}`;

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 12000
    });

    await page.waitForSelector(
      '#search-tracks-container .track-item[data-track-id]',
      { timeout: 9000 }
    );

    const tracks = await page.$$eval(
      '#search-tracks-container .track-item[data-track-id]',
      (elements, requestedLimit) => elements.slice(0, requestedLimit).map(element => {
        const titleNode = element.querySelector('.track-item-details .title');
        const titleClone = titleNode?.cloneNode(true);
        titleClone?.querySelectorAll('.explicit-badge, .quality-badge, svg').forEach(node => node.remove());

        const artistNode = element.querySelector('.track-item-details .artist');
        const coverNode = element.querySelector('.track-item-cover');

        return {
          id: element.getAttribute('data-track-id') || '',
          name: (titleClone?.textContent || titleNode?.textContent || '').replace(/\s+/g, ' ').trim(),
          artist: [(artistNode?.textContent || '').replace(/\s+/g, ' ').trim()].filter(Boolean),
          artwork: coverNode?.getAttribute('src') || '',
          duration: 0,
          explicit: Boolean(titleNode?.querySelector('.explicit-badge'))
        };
      }).filter(track => track.id && track.name),
      Math.max(1, Math.min(40, Number(limit) || 20))
    );

    return tracks;
  });
}

const pickForwardHeaders = headers => {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = key.toLowerCase();
    if (
      lower === 'authorization' ||
      lower === 'cookie' ||
      lower === 'referer' ||
      lower === 'origin' ||
      lower === 'user-agent' ||
      lower === 'accept'
    ) {
      out[lower] = value;
    }
  }
  return out;
};

export async function scrapeMonochromePlayback(trackId) {
  const id = String(trackId || '').trim();
  if (!id) return null;

  return withPage(async page => {
    let mediaResolve;
    const mediaPromise = new Promise(resolve => {
      mediaResolve = resolve;
    });

    const onResponse = response => {
      try {
        const request = response.request();
        const type = request.resourceType();
        const headers = response.headers();
        const contentType = String(headers['content-type'] || '').toLowerCase();

        const looksLikeAudio =
          type === 'media' ||
          contentType.startsWith('audio/') ||
          contentType.includes('application/octet-stream');

        if (!looksLikeAudio) return;

        const url = response.url();
        if (!/^https?:\/\//i.test(url)) return;

        mediaResolve({
          url,
          headers: pickForwardHeaders(request.headers()),
          contentType: headers['content-type'] || null
        });
      } catch {}
    };

    page.on('response', onResponse);

    try {
      await page.goto(`${SITE_BASE}/track/${encodeURIComponent(id)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 12000
      });

      await page.waitForSelector('#play-track-btn', { timeout: 9000 });

      await page.waitForFunction(
        () => {
          const button = document.getElementById('play-track-btn');
          return button && !button.disabled;
        },
        { timeout: 9000 }
      ).catch(() => {});

      await page.click('#play-track-btn');

      const media = await Promise.race([
        mediaPromise,
        sleep(9000).then(() => null)
      ]);

      if (media?.url) {
        const cookies = await page.cookies().catch(() => []);
        if (cookies.length) {
          const cookie = cookies
            .map(item => `${item.name}=${item.value}`)
            .join('; ');
          if (cookie) media.headers.cookie = cookie;
        }
        return media;
      }

      const currentSrc = await page.evaluate(() => {
        const audio = document.querySelector('audio');
        const value = audio?.currentSrc || audio?.src || '';
        return /^https?:\/\//i.test(value) ? value : '';
      });

      if (!currentSrc) return null;

      const cookies = await page.cookies().catch(() => []);
      const cookie = cookies
        .map(item => `${item.name}=${item.value}`)
        .join('; ');

      return {
        url: currentSrc,
        headers: {
          'user-agent': BROWSER_UA,
          referer: SITE_BASE + '/',
          ...(cookie ? { cookie } : {})
        },
        contentType: null
      };
    } finally {
      page.off('response', onResponse);
    }
  });
}

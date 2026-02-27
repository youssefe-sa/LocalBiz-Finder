import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';
import * as cheerio from 'cheerio';
import Database from 'better-sqlite3';

const browserDistFolder = join(process.cwd(), 'dist/app/browser');

// Initialize Database lazily
let dbInstance: Database.Database | null = null;
function getDb() {
  if (!dbInstance) {
    try {
      // Use /tmp for the database if we're in a restricted environment, 
      // but try current directory first as it's persisted.
      const dbPath = process.env['NODE_ENV'] === 'production' 
        ? join(process.cwd(), 'campaigns.db')
        : 'campaigns.db';
      
      console.log('Initializing database at:', dbPath);
      dbInstance = new Database(dbPath);
      dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS campaigns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          date TEXT NOT NULL,
          results TEXT NOT NULL,
          keyword TEXT,
          city TEXT,
          mapsUrl TEXT
        )
      `);
      console.log('Database initialized successfully');
    } catch (err) {
      console.error('Failed to initialize database:', err);
      throw err;
    }
  }
  return dbInstance;
}

const app = express();
app.use(express.json({ limit: '50mb' })); // Increased limit for large result sets

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

const angularApp = new AngularNodeAppEngine();

/**
 * Campaign Persistence Routes
 */
app.post('/api/campaigns', (req, res) => {
  try {
    const db = getDb();
    const { name, date, results, keyword, city, mapsUrl } = req.body;
    const stmt = db.prepare('INSERT INTO campaigns (name, date, results, keyword, city, mapsUrl) VALUES (?, ?, ?, ?, ?, ?)');
    const info = stmt.run(name, date, JSON.stringify(results), keyword, city, mapsUrl);
    res.json({ id: info.lastInsertRowid, success: true });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error saving campaign:', err);
    res.status(500).json({ error: 'Failed to save campaign', details: err.message });
  }
});

app.get('/api/campaigns', (req, res) => {
  try {
    const db = getDb();
    const stmt = db.prepare('SELECT id, name, date, keyword, city, mapsUrl FROM campaigns ORDER BY id DESC');
    const campaigns = stmt.all();
    console.log(`Fetched ${campaigns.length} campaigns`);
    res.json(campaigns);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error fetching campaigns:', err);
    res.status(500).json({ error: 'Failed to fetch campaigns', details: err.message });
  }
});

app.get('/api/campaigns/:id', (req, res) => {
  try {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM campaigns WHERE id = ?');
    const campaign = stmt.get(req.params.id) as { results: string };
    if (campaign) {
      const parsedCampaign = { ...campaign, results: JSON.parse(campaign.results) };
      res.json(parsedCampaign);
    } else {
      res.status(404).json({ error: 'Campaign not found' });
    }
  } catch {
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

app.delete('/api/campaigns/:id', (req, res) => {
  try {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM campaigns WHERE id = ?');
    stmt.run(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

/**
 * Serper API Proxy
 */
app.post('/api/search', async (req, res) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // Increased to 60s timeout

  try {
    const { keyword, city } = req.body;
    const apiKey = process.env['SERPER_API_KEY'];
    
    if (!apiKey) {
      console.error('SERPER_API_KEY is missing');
      return res.status(500).json({ error: 'SERPER_API_KEY is not configured' });
    }

    const query = `${keyword || ''} in ${city || ''}`.trim();
    if (!query || query === 'in') {
      return res.status(400).json({ error: 'Search query cannot be empty' });
    }

    console.log('Searching Serper for:', query);

    const response = await fetch('https://google.serper.dev/maps', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: query,
        gl: 'fr',
        hl: 'fr',
        num: 40 // Request more to ensure we get at least 20
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Serper API error:', response.status, errorText);
      return res.status(response.status).json({ error: 'Serper API error', details: errorText });
    }

    const data = await response.json();
    console.log(`Serper returned ${data.places?.length || 0} results`);
    return res.json(data);
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const err = error as Error;
    console.error('Search proxy error:', err.message);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Search timed out' });
    }
    return res.status(500).json({ error: 'Failed to fetch search results', details: err.message });
  }
});

/**
 * Image Scraper Route
 */
app.post('/api/scrape-images', async (req, res) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // Increased to 60s timeout

  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Referer': 'https://www.google.com/'
      }
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      return res.json({ images: [], warning: `Failed to fetch: ${response.status}` });
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const images: string[] = [];

    // Look for images in common places
    $('img, [style*="background-image"]').each((_, el) => {
      let src = '';
      if (el.name === 'img') {
        src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('srcset')?.split(' ')[0] || '';
      } else {
        const style = $(el).attr('style');
        const match = style?.match(/url\(['"]?([^'"]+?)['"]?\)/);
        if (match) src = match[1];
      }

      if (src && !src.startsWith('data:')) {
        try {
          const absoluteUrl = new URL(src, url).href;
          // Filter out icons, small images, and tracking pixels
          const isIcon = absoluteUrl.toLowerCase().match(/\/(icon|logo|favicon|social|fb|ig|tw|yt|pixel|tracking|loader|spinner)/);
          const isSmall = absoluteUrl.toLowerCase().match(/(16x16|32x32|64x64)/);
          
          if (!isIcon && !isSmall) {
            images.push(absoluteUrl);
          }
        } catch {
          // Ignore invalid URLs
        }
      }
    });

    // Also look for OpenGraph images
    $('meta[property="og:image"]').each((_, el) => {
      const src = $(el).attr('content');
      if (src) {
        try {
          images.unshift(new URL(src, url).href);
        } catch {
          // Ignore invalid URLs
        }
      }
    });

    const uniqueImages = Array.from(new Set(images)).slice(0, 15);
    return res.json({ images: uniqueImages });
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const err = error as Error;
    if (err.name === 'AbortError') {
      return res.json({ images: [], error: 'Timeout' });
    }
    return res.json({ images: [], error: 'Failed to scrape' });
  }
});

/**
 * Image Proxy Route to bypass CORS/Referrer issues
 */
app.get('/api/proxy-image', async (req, res) => {
  let imageUrl = req.query['url'] as string;
  if (!imageUrl) return res.status(400).send('URL is required');

  // Clean URL if it contains CSS junk (e.g. from background-image extraction)
  if (imageUrl.includes(');')) {
    imageUrl = imageUrl.split(');')[0];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // Increased to 60s timeout

  try {
    // Basic URL validation
    new URL(imageUrl);

    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://www.google.com/'
      }
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      // If it's a 403 or 404, we don't want to log it as a server error every time
      if (response.status === 403 || response.status === 404) {
        return res.status(response.status).send(`Image source returned ${response.status}`);
      }
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type');
    
    res.setHeader('Content-Type', contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(Buffer.from(buffer));
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const err = error as Error;
    
    if (err.name === 'AbortError') {
      return res.status(504).send('Proxy timeout');
    }

    // Only log real unexpected errors
    if (!err.message.includes('403') && !err.message.includes('404')) {
      console.error(`Proxy error for ${imageUrl}:`, err.message);
    }
    
    // Fallback: if proxy fails, try to redirect to original URL
    try {
      return res.redirect(imageUrl);
    } catch {
      return res.status(404).send('Not found');
    }
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Global Error Handler
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error', 
    message: err.message,
    stack: process.env['NODE_ENV'] === 'development' ? err.stack : undefined
  });
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 3000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

import { createServer } from 'http';
import { parse } from 'url';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 8080;
const distPath = join(__dirname, 'dist');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

const server = createServer((req, res) => {
  const parsedUrl = parse(req.url);
  let pathname = parsedUrl.pathname;

  // Serve runtime config
  if (pathname === '/config.js') {
    const config = `window.__APP_CONFIG__ = {
  VITE_SUPABASE_URL: "${process.env.VITE_SUPABASE_URL || ''}",
  VITE_SUPABASE_ANON_KEY: "${process.env.VITE_SUPABASE_ANON_KEY || ''}"
};`;

    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-cache'
    });
    res.end(config);
    return;
  }

  if (pathname === '/') {
    pathname = '/index.html';
  }

  let filePath = join(distPath, pathname);

  if (!existsSync(filePath)) {
    filePath = join(distPath, 'index.html');
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  try {
    let content = readFileSync(filePath);

    // Inject config script into HTML
    if (ext === '.html') {
      content = content.toString().replace(
        '<head>',
        '<head>\n    <script src="/config.js"></script>'
      );
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000'
    });
    res.end(content, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 Not Found</h1>', 'utf-8');
    } else {
      res.writeHead(500);
      res.end('Internal Server Error', 'utf-8');
    }
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Supabase URL configured: ${!!process.env.VITE_SUPABASE_URL}`);
  console.log(`Supabase Key configured: ${!!process.env.VITE_SUPABASE_ANON_KEY}`);
});

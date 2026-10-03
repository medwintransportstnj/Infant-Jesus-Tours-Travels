// Writes public/robots.txt and public/sitemap.xml from VITE_SITE_URL at build time,
// so no domain is ever hardcoded in the repository.
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

function readEnvFile(name) {
  const file = resolve(process.cwd(), name);
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8').split('\n')
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, '')]),
  );
}
const env = { ...readEnvFile('.env'), ...readEnvFile('.env.local'), ...readEnvFile('.env.production'), ...process.env };
const vercelUrl = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '';
const site = (env.VITE_SITE_URL || vercelUrl || '').replace(/\/+$/, '');
if (!site) console.warn('[seo] VITE_SITE_URL is not set — sitemap.xml will use relative paths. Set it before going live.');

const routes = ['/', '/vehicles', '/packages', '/destinations', '/offers', '/gallery', '/about', '/contact', '/book', '/instant-ride'];
const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map((r) => `  <url><loc>${site}${r}</loc><lastmod>${today}</lastmod><changefreq>${r === '/' ? 'weekly' : 'monthly'}</changefreq><priority>${r === '/' ? '1.0' : '0.7'}</priority></url>`).join('\n')}
</urlset>
`;
const robots = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /booking/confirmation
${site ? `\nSitemap: ${site}/sitemap.xml\n` : ''}`;

mkdirSync(resolve(process.cwd(), 'public'), { recursive: true });
writeFileSync(resolve(process.cwd(), 'public/sitemap.xml'), sitemap);
writeFileSync(resolve(process.cwd(), 'public/robots.txt'), robots);
console.log(`[seo] wrote robots.txt and sitemap.xml for ${site || '(no site url)'}`);

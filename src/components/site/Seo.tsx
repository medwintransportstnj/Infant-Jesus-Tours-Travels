import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSiteData } from '@/hooks/useSiteData';
import { publicImageUrl } from '@/lib/supabase';

const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? '').replace(/\/+$/, '');

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!content) { el?.remove(); return; }
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

interface Props { title?: string; description?: string; noindex?: boolean }

/** Keeps <title>, description, canonical, Open Graph, Twitter and JSON-LD in sync with Admin → SEO. */
export function Seo({ title, description, noindex }: Props) {
  const { seo, settings, social } = useSiteData();
  const { pathname } = useLocation();

  useEffect(() => {
    const company = settings?.company_name || 'Infant Jesus Tours & Travels';
    const baseTitle = seo?.title || company;
    const fullTitle = title ? `${title} | ${company}` : baseTitle;
    const desc = description || seo?.description || '';
    const base = (seo?.canonical_url || SITE_URL || window.location.origin).replace(/\/+$/, '');
    const url = `${base}${pathname === '/' ? '/' : pathname}`;
    const image = publicImageUrl('website-assets', seo?.og_image_path) ?? `${base}/og-image.png`;

    document.title = fullTitle;
    setMeta('name', 'description', desc);
    setMeta('name', 'keywords', seo?.keywords ?? '');
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    setMeta('property', 'og:title', title ? fullTitle : seo?.og_title || fullTitle);
    setMeta('property', 'og:description', description || seo?.og_description || desc);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', image);
    setMeta('property', 'og:site_name', company);
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', desc);
    setMeta('name', 'twitter:image', image);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = url;

    // Structured data uses only facts stored in settings — no ratings, prices or claims are invented.
    let ld = document.getElementById('ld-business') as HTMLScriptElement | null;
    if (!settings || noindex) { ld?.remove(); return; }
    if (!ld) { ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'ld-business'; document.head.appendChild(ld); }
    const sameAs = (['facebook', 'instagram', 'youtube', 'linkedin'] as const).map((p) => social[p]).filter(Boolean);
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'TravelAgency', name: company, url: `${base}/`, image,
      ...(settings.phone ? { telephone: settings.phone } : {}),
      ...(settings.email ? { email: settings.email } : {}),
      ...(settings.address ? { address: { '@type': 'PostalAddress', streetAddress: settings.address, addressCountry: 'IN' } } : {}),
      ...(sameAs.length ? { sameAs } : {}),
    });
  }, [title, description, noindex, seo, settings, social, pathname]);

  return null;
}

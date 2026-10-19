import { useSiteData } from '@/hooks/useSiteData';
import { publicImageUrl } from '@/lib/supabase';

/** The official logo shipped with the site. Used whenever no logo has been uploaded in Admin → Website Settings. */
export const DEFAULT_LOGO = '/ijt-logo.png';

/**
 * Brand mark: the admin-uploaded logo when present, otherwise the official logo.
 * alt is empty on purpose — the mark always sits beside the company name (or inside a link that is
 * labelled with it), so announcing it again would only repeat the name to screen-reader users.
 */
export function LogoMark({ size = 40 }: { size?: number }) {
  const { settings } = useSiteData();
  const src = publicImageUrl('logos', settings?.logo_main_path) ?? DEFAULT_LOGO;
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-white" style={{ width: size, height: size }}>
      <img src={src} alt="" width={size} height={size} decoding="async" className="h-full w-full object-contain"
        onError={(e) => { if (!e.currentTarget.src.endsWith(DEFAULT_LOGO)) e.currentTarget.src = DEFAULT_LOGO; }} />
    </span>
  );
}

export function Wordmark({ inverse = false }: { inverse?: boolean }) {
  const { settings } = useSiteData();
  const name = (settings?.company_name ?? 'Infant Jesus Tours & Travels').toUpperCase();
  // "INFANT JESUS TOURS & TRAVELS" -> two lines, split before "TOURS" when present.
  const idx = name.indexOf(' TOURS');
  const first = idx > 0 ? name.slice(0, idx) : name;
  const second = idx > 0 ? name.slice(idx + 1) : '';
  return (
    <span className="whitespace-nowrap leading-tight">
      <span className={`block text-[15px] font-bold tracking-wide ${inverse ? 'text-white' : 'text-ink'}`}>{first}</span>
      {second && <span className={`block text-[10px] font-semibold tracking-[0.14em] ${inverse ? 'text-white/70' : 'text-muted'}`}>{second}</span>}
    </span>
  );
}

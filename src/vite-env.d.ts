/// <reference types="vite/client" />
/// <reference types="vitest/config" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }

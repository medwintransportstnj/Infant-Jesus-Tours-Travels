import { useMemo } from 'react';
import { useSiteData } from './useSiteData';
import { buildWhatsAppUrl, GENERAL_ENQUIRY_MESSAGE } from '@/utils/whatsapp';

/** Single source for every call / WhatsApp action on the site — all derived from Supabase settings. */
export function useContact() {
  const { settings, social } = useSiteData();
  return useMemo(() => {
    const phone = settings?.phone ?? '';
    return {
      companyName: settings?.company_name ?? 'Infant Jesus Tours & Travels',
      phone,
      telHref: phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null,
      email: settings?.email ?? '',
      address: settings?.address ?? '',
      whatsappUrl: (message: string = GENERAL_ENQUIRY_MESSAGE) => buildWhatsAppUrl(social.whatsapp, message),
      hasWhatsApp: Boolean(buildWhatsAppUrl(social.whatsapp)),
    };
  }, [settings, social]);
}

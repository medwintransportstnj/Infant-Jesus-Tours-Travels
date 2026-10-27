import { Code2, MapPin, MessageCircle, MessageSquare, Phone } from 'lucide-react';
import { buildSmsUrl, buildTelUrl } from '@/utils/phone';
import { buildWhatsAppUrl } from '@/utils/whatsapp';

// The WEBSITE DEVELOPER's contact details. These are fixed and belong to the developer — they are
// unrelated to the travel company's own number, which always comes from Admin → WhatsApp & Social.
const DEVELOPER = {
  name: 'Medwin Levay E Freelancer',
  company: 'Medwin Montage | Freelancing Creative & Digital Services',
  phone: '+91 9487897160',
  location: 'Thanjavur, Tamilnadu',
  serviceArea: 'Providing Service Across Tamilnadu',
  message: 'Hi, I saw Infant Jesus Tours & Travels Website and would like to know more about your services.',
} as const;

export function DeveloperCard() {
  const tel = buildTelUrl(DEVELOPER.phone);
  const whatsapp = buildWhatsAppUrl(DEVELOPER.phone, DEVELOPER.message);
  const sms = buildSmsUrl(DEVELOPER.phone, DEVELOPER.message);
  const action = 'inline-flex min-h-11 items-center gap-2 rounded-md border border-white/15 px-3 text-[13px] font-medium text-white/85 hover:bg-white/10 hover:text-white';
  return (
    <section aria-labelledby="developer-heading" className="rounded-lg border border-white/10 bg-white/[0.04] p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 id="developer-heading" className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/60"><Code2 className="h-3.5 w-3.5" aria-hidden />Website developed by</h2>
          <p className="text-sm font-semibold text-white">{DEVELOPER.name}</p>
          <p className="text-[13px] text-white/75">{DEVELOPER.company}</p>
          <p className="mt-1 flex items-start gap-1.5 text-[13px] text-white/60"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span>{DEVELOPER.location} · {DEVELOPER.serviceArea}</span></p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {tel && <li><a href={tel} className={action} aria-label={`Call the developer on ${DEVELOPER.phone}`}><Phone className="h-4 w-4" aria-hidden />{DEVELOPER.phone}</a></li>}
          {whatsapp && <li><a href={whatsapp} target="_blank" rel="noopener noreferrer" className={action} aria-label={`WhatsApp the developer on ${DEVELOPER.phone}`}><MessageCircle className="h-4 w-4" aria-hidden />WhatsApp</a></li>}
          {sms && <li><a href={sms} className={action} aria-label={`Send an SMS to the developer on ${DEVELOPER.phone}`}><MessageSquare className="h-4 w-4" aria-hidden />SMS</a></li>}
        </ul>
      </div>
    </section>
  );
}

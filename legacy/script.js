/* ============================================================
   Infant Jesus Tours & Travels — index.html
   Backed by Supabase (Postgres + Realtime + Storage). See
   config.js for the connection values and schema.sql for the
   tables/RLS policies/functions this file talks to.
============================================================ */
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

function emptyContent(){
  return {
    company: {}, social: {}, logos: {}, theme: { mode:'dark' }, seo: {},
    vehicles: [], categories: [], destinations: [], offers: [], testimonials: [],
    vehicleCategories: [], moments: [],
  };
}
const STATUS_STEPS = ['Pending', 'Office Calling', 'Confirmed', 'Trip Completed'];
const THEME_PREF_KEY = 'ijt-theme-pref'; // visitor's own light/dark override only — not app data

/* A visitor's theme choice is a cosmetic UI preference, not application
   data, so it's fine to keep it in the browser rather than the database
   (same as most real production sites do for a dark-mode toggle). */
function loadPersonal(key, fallback){ try{ const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }catch(e){ return fallback; } }
function savePersonal(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} }

function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function daysLeft(dateStr){ if (!dateStr) return 0; const diff = new Date(dateStr+'T23:59:59') - new Date(); return Math.max(0, Math.ceil(diff/86400000)); }
function recommendVehicle(vehicles, members){
  const n = Number(members) || 0;
  const sorted = [...vehicles].filter(v=>v.status!=='Inactive').sort((a,b)=>a.capacity-b.capacity);
  const fit = sorted.find(v => v.capacity >= n);
  if (fit) return { vehicle: fit, note: null };
  const largest = sorted[sorted.length-1];
  if (!largest) return { vehicle: null, note: null };
  const count = Math.ceil(n / largest.capacity);
  return { vehicle: largest, note: `Group of ${n} — we'll arrange ${count} × ${largest.name}.` };
}
function resolveTheme(content){
  const override = loadPersonal(THEME_PREF_KEY, null);
  return override || (content?.theme?.mode) || 'dark';
}
function applyTheme(mode){ document.documentElement.classList.toggle('dark', mode !== 'light'); }

/* Postgres rows come back snake_case; the rest of this file (already
   written against camelCase field names) stays untouched by mapping
   at the boundary instead of touching every call site. */
function toCamelBooking(row){
  if (!row) return row;
  return {
    id: row.id, refId: row.ref_id, requestType: row.request_type, name: row.name, phone: row.phone, email: row.email,
    pickup: row.pickup, destination: row.destination, dropoff: row.dropoff, date: row.date, time: row.time, members: row.members,
    roundTrip: row.round_trip, returnDate: row.return_date, returnTime: row.return_time, notes: row.notes,
    recommendedVehicle: row.recommended_vehicle, offerTitle: row.offer_title, status: row.status,
    createdDate: row.created_date, createdTime: row.created_time, createdDay: row.created_day, createdAt: row.created_at,
  };
}

/* ---------------- Booking / enquiry / instant-ride creation ----------------
   Validation + the sequential IJT-0001 reference ID are handled inside
   the create_booking() Postgres function (schema.sql), not trusted from
   the client — see that function for the authoritative rules. */
async function createBooking(draft){
  const { data, error } = await sb.rpc('create_booking', { payload: draft });
  if (error) throw new Error(error.message.replace(/^.*?: /, ''));
  return toCamelBooking(data);
}
async function createMessage(name, email, message){
  const { error } = await sb.rpc('create_message', { p_name: name, p_email: email, p_message: message });
  if (error) throw new Error(error.message.replace(/^.*?: /, ''));
}


/* ---------------- Booking-confirmation image (canvas, no external libs) ---------------- */
function downloadReferenceImage(refId, meta){
  const w = 720, h = 420;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0,0,w,h);
  grad.addColorStop(0, '#111827'); grad.addColorStop(1, '#000000');
  ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle = '#DC2626'; ctx.lineWidth = 3; ctx.strokeRect(10,10,w-20,h-20);
  ctx.fillStyle = '#DC2626'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('INFANT JESUS TOURS & TRAVELS', w/2, 60);
  ctx.fillStyle = '#9CA3AF'; ctx.font = '13px sans-serif';
  ctx.fillText('Booking Reference', w/2, 90);
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 52px sans-serif';
  ctx.fillText(refId, w/2, 165);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(80,195); ctx.lineTo(w-80,195); ctx.stroke();
  ctx.fillStyle = '#E5E7EB'; ctx.font = '18px sans-serif';
  ctx.fillText(meta.createdDay + ',  ' + meta.createdDate, w/2, 250);
  ctx.fillStyle = '#DC2626'; ctx.font = 'bold 26px sans-serif';
  ctx.fillText(meta.createdTime, w/2, 295);
  ctx.fillStyle = '#6B7280'; ctx.font = '12px sans-serif';
  ctx.fillText('Show this reference when contacting our office', w/2, 350);
  ctx.fillText('+91 98424 87017', w/2, 372);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = refId + '-booking-reference.png';
  document.body.appendChild(a); a.click(); a.remove();
}

/* WhatsApp helpers — every button on this page derives from content.social.whatsapp,
   set once in Admin > Social Links, never hardcoded per-button. */
function buildWhatsAppUrl(raw, message){
  const text = message ? encodeURIComponent(message) : '';
  const suffix = text ? `?text=${text}` : '';
  if (!raw) return `https://wa.me/${suffix}`;
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)){
    if (!text) return trimmed;
    const sep = trimmed.includes('?') ? '&' : '?';
    return `${trimmed}${sep}text=${text}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  return `https://wa.me/${digits}${suffix}`;
}
function buildBookingMessage(b){
  const lines = [
    `Full Name: ${b.name}`,
    `Phone Number: ${b.phone}`,
  ];
  if (b.email) lines.push(`Email: ${b.email}`);
  lines.push(
    `Pickup Location: ${b.pickup}`,
    `Destination: ${b.destination}`,
    `Drop-off Location: ${b.dropoff || b.destination}`,
    `Pickup Date: ${b.date || ''}`,
    `Pickup Time: ${b.time || ''}`,
    `Number of Members: ${b.members}`,
    `Round Trip: ${b.roundTrip ? 'Yes' : 'No'}`,
  );
  if (b.roundTrip) lines.push(`Return: ${b.returnDate || ''} ${b.returnTime || ''}`.trim());
  if (b.notes) lines.push(`Special Requirements: ${b.notes}`);
  lines.push(
    `Reference ID: ${b.refId}`,
    `Date: ${b.createdDate}`,
    `Time: ${b.createdTime}`,
    `Day: ${b.createdDay}`,
  );
  return lines.join('\n');
}
function buildOfferEnquiryMessage(name, phone, offerTitle){
  return `Full Name: ${name}\nPhone Number: ${phone}\nNeed Enquiry About: ${offerTitle}`;
}
function buildInstantRideMessage(b){
  const lines = [
    `Full Name: ${b.name}`,
    `Phone Number: ${b.phone}`,
    `I Want To Book A Instant Ride`,
    `Reference ID: ${b.refId}`,
    `Date: ${b.createdDate}`,
    `Time: ${b.createdTime}`,
    `Day: ${b.createdDay}`,
  ];
  return lines.join('\n');
}

/* ---------------- India location autocomplete (starter dataset) ----------------
   Curated set covering Tamil Nadu in depth plus state capitals, major districts
   and popular destinations nationwide — NOT a full village-level gazetteer.
   Swap matchLocations() for a real Places/geocoding API for full national
   street/village coverage in production. */
const INDIA_LOCATIONS = [
  'Thanjavur','Thanjavur New Bus Stand','Thanjavur Old Bus Stand','Thanjavur Railway Station','Thanjavur Airport',
  'Thanjavur Medical College','Brihadeeswarar Temple, Thanjavur','Thanjavur Palace','Madhakottai, Thanjavur',
  'Vallam, Thanjavur','Budalur, Thanjavur','Orathanadu','Pattukkottai','Peravurani','Papanasam','Kumbakonam',
  'Chennai','Chennai Central Railway Station','Chennai International Airport','Chennai Koyambedu Bus Stand',
  'Coimbatore','Coimbatore Railway Station','Coimbatore International Airport','Madurai','Madurai Railway Station',
  'Madurai Airport','Meenakshi Amman Temple, Madurai','Tiruchirappalli (Trichy)','Trichy Railway Station',
  'Trichy International Airport','Salem','Salem Railway Station','Erode','Vellore','Tirunelveli','Tiruppur',
  'Thoothukudi (Tuticorin)','Dindigul','Karur','Namakkal','Nagapattinam','Thiruvarur','Pudukkottai','Ariyalur',
  'Perambalur','Cuddalore','Villupuram','Kallakurichi','Ranipet','Tirupathur','Krishnagiri','Dharmapuri','Theni',
  'Virudhunagar','Sivaganga','Ramanathapuram','Kanyakumari','Nagercoil','Tenkasi','Mayiladuthurai',
  'Rameswaram','Rameswaram Railway Station','Ramanathaswamy Temple, Rameswaram','Pamban Bridge',
  'Velankanni','Basilica of Our Lady of Good Health, Velankanni','Ooty (Udhagamandalam)','Ooty Bus Stand',
  'Coonoor','Kotagiri','Kodaikanal','Kodaikanal Lake','Munnar','Thekkady','Alleppey (Alappuzha)',
  'Vivekananda Rock Memorial, Kanyakumari','Chidambaram','Swamimalai','Darasuram','Gangaikonda Cholapuram',
  'Pondicherry (Puducherry)','Mahabalipuram (Mamallapuram)','Tirupati','Tirumala','Palani','Srirangam',
  'Rockfort Temple, Trichy','Yercaud','Hogenakkal Falls','Mysore','Coorg (Kodagu)','Wayanad','Bangalore (Bengaluru)',
  'Bengaluru International Airport','Kochi','Kochi International Airport','Thiruvananthapuram','Kozhikode',
  'Thrissur','Kollam','Kannur','Hyderabad','Hyderabad International Airport','Vijayawada','Visakhapatnam',
  'Tirupati Airport','Warangal','Guntur','Nellore','Delhi','New Delhi Railway Station','Indira Gandhi International Airport',
  'Gurugram','Noida','Faridabad','Mumbai','Mumbai Chhatrapati Shivaji Airport','Pune','Nagpur','Nashik','Thane',
  'Kolkata','Kolkata Airport','Howrah','Darjeeling','Siliguri','Bhubaneswar','Puri','Cuttack','Ahmedabad',
  'Surat','Vadodara','Rajkot','Jaipur','Jodhpur','Udaipur','Jaisalmer','Ajmer','Pushkar','Lucknow','Kanpur',
  'Agra','Taj Mahal, Agra','Varanasi','Prayagraj (Allahabad)','Amritsar','Golden Temple, Amritsar','Chandigarh',
  'Ludhiana','Shimla','Manali','Dharamshala','Srinagar (Kashmir)','Gulmarg','Leh Ladakh','Jammu','Haridwar',
  'Rishikesh','Dehradun','Kedarnath','Badrinath','Nainital','Patna','Ranchi','Raipur','Bhopal','Indore','Gwalior',
  'Guwahati','Shillong','Gangtok','Bhavnagar','Mangalore','Hubli','Belgaum','Vijayanagara (Hampi)',
];
function matchLocations(query, limit){
  const q = (query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const starts = INDIA_LOCATIONS.filter(l => l.toLowerCase().startsWith(q));
  const contains = INDIA_LOCATIONS.filter(l => !l.toLowerCase().startsWith(q) && l.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit || 8);
}
function wireLocationAutocomplete(inputEl, listEl){
  if (!inputEl || !listEl) return;
  function render(){
    const matches = matchLocations(inputEl.value, 8);
    if (!matches.length){ listEl.classList.add('hidden'); listEl.innerHTML = ''; return; }
    listEl.innerHTML = matches.map(m => `<button type="button" class="loc-option w-full text-left px-3.5 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-2.5"><i class="fa-solid fa-location-dot text-brand-600 dark:text-brand-500 text-xs"></i>${esc(m)}</button>`).join('');
    listEl.classList.remove('hidden');
    listEl.querySelectorAll('.loc-option').forEach(btn => {
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); inputEl.value = btn.textContent.trim(); listEl.classList.add('hidden'); inputEl.dispatchEvent(new Event('change')); if (inputEl.id==='bk-members'||true) updateRecPreviewIfBooking(); });
    });
  }
  inputEl.addEventListener('input', render);
  inputEl.addEventListener('focus', render);
  inputEl.addEventListener('blur', () => setTimeout(() => listEl.classList.add('hidden'), 120));
}
function updateRecPreviewIfBooking(){ /* placeholder, replaced by real fn once modal defined */ }

/* ---------------- State ---------------- */
let content = emptyContent();
let bookingDraft = {};
let toastTimer;

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
}
function setBtnLoading(btn, loading, loadingText){
  if (!btn) return;
  if (loading){
    btn.dataset.originalHtml = btn.dataset.originalHtml || btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('opacity-70','cursor-not-allowed');
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${loadingText}`;
  } else {
    btn.disabled = false;
    btn.classList.remove('opacity-70','cursor-not-allowed');
    if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
  }
}

/* ---------------- Renderers ---------------- */
function emptyState(icon, title, sub){
  return `<div class="reveal in col-span-full text-center py-10 border border-dashed border-black/10 dark:border-white/10 rounded-2xl">
    <i class="fa-solid ${icon} text-3xl text-brand-600/50 dark:text-brand-500/50 mb-3"></i>
    <div class="font-display font-bold text-gray-700 dark:text-gray-300 mb-1">${title}</div>
    <div class="text-sm text-gray-500 max-w-sm mx-auto">${sub}</div>
  </div>`;
}
function renderVehicles(){
  const el = document.getElementById('vehicles-grid');
  const active = content.vehicles.filter(v => v.status !== 'Inactive');
  if (!active.length){ el.innerHTML = emptyState('fa-car', 'Vehicles coming soon', 'Our fleet listing is being updated — check back shortly, or message us on WhatsApp to book directly.'); return; }
  el.innerHTML = active.map(v => `
    <div class="reveal card-hover bg-gray-50 dark:bg-gray-900/60 border border-black/5 dark:border-white/5 rounded-3xl overflow-hidden flex flex-col">
      <div class="h-44 bg-gradient-to-br from-gray-200 to-gray-100 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center overflow-hidden">
        ${v.image ? `<img src="${v.image}" alt="${esc(v.name)}" class="w-full h-full object-cover">` : `<i class="fa-solid ${v.capacity>12?'fa-bus':'fa-car-side'} text-5xl text-black/10 dark:text-white/15"></i>`}
      </div>
      <div class="p-5 flex-1 flex flex-col">
        <div class="font-display font-bold text-lg text-gray-900 dark:text-white mb-1">${esc(v.name)}</div>
        <div class="flex flex-wrap gap-3 text-xs text-gray-500 mb-4">
          <span class="inline-flex items-center gap-1.5"><i class="fa-solid fa-user text-brand-600 dark:text-brand-500"></i> ${v.capacity} Seater</span>
          <span class="inline-flex items-center gap-1.5"><i class="fa-solid fa-snowflake text-brand-600 dark:text-brand-500"></i> ${v.ac===false?'Non-AC':'AC'}</span>
          ${v.price ? `<span class="inline-flex items-center gap-1.5"><i class="fa-solid fa-tag text-brand-600 dark:text-brand-500"></i> ${esc(v.price)}</span>` : ''}
        </div>
        <button onclick="openBooking()" class="mt-auto inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold px-4 py-2.5 rounded-full transition-colors">Book Now</button>
      </div>
    </div>`).join('');
}
function renderOffers(){
  const el = document.getElementById('offers-list');
  const active = content.offers.filter(o => o.enabled !== false && daysLeft(o.expiry) > 0);
  if (!active.length){ el.innerHTML = emptyState('fa-tag', 'No active offers right now', 'Check back soon for seasonal packages and discounts.'); return; }
  el.innerHTML = active.map(o => `
    <div class="reveal relative rounded-3xl overflow-hidden border border-black/10 dark:border-white/10 bg-white dark:bg-gray-900/60 p-7 sm:p-9">
      <span class="inline-block bg-brand-600 text-white text-[11px] font-bold px-3 py-1 rounded-full mb-4">${daysLeft(o.expiry)} days left</span>
      <h3 class="font-display font-bold text-xl text-gray-900 dark:text-white mb-2">${esc(o.title)}</h3>
      <p class="text-gray-600 dark:text-gray-400 text-sm max-w-md mb-5">${esc(o.description)}</p>
      <div class="flex flex-wrap gap-3">
        <button onclick="openBooking()" class="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-bold px-5 py-2.5 rounded-full transition-colors"><i class="fa-solid fa-tag"></i> Book Now</button>
        <button onclick="openOfferEnquiry('${o.id}')" class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-full transition-colors"><i class="fa-brands fa-whatsapp"></i> Enquire on WhatsApp</button>
      </div>
    </div>`).join('');
}
function renderCategories(){
  const el = document.getElementById('categories-list');
  if (!content.categories.length){ el.innerHTML = '<p class="text-sm text-gray-500">Trip categories coming soon.</p>'; return; }
  el.innerHTML = content.categories.map(c => `
    <div class="reveal card-hover shrink-0 w-40 bg-white dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-2xl p-4 text-center">
      <div class="w-9 h-9 rounded-xl bg-brand-600/10 text-brand-600 dark:text-brand-500 grid place-items-center mx-auto mb-2"><i class="fa-solid fa-route text-sm"></i></div>
      <div class="text-sm font-semibold text-gray-700 dark:text-gray-200">${esc(c)}</div>
    </div>`).join('');
}
function renderSectionBanner(containerId, section){
  const el = document.getElementById(containerId);
  if (!el) return;
  const imgs = content.moments.filter(m => m.section === section && !m.hidden);
  if (!imgs.length){ el.innerHTML = ''; return; }
  const m = imgs[0];
  el.innerHTML = `<div class="section-banner reveal in"><img src="${m.image}" style="opacity:${(m.opacity ?? 100)/100}" alt="${esc(m.caption||'')}"></div>`;
}
function renderHeroSlideshow(){
  const el = document.getElementById('hero-slideshow');
  const imgs = content.moments.filter(m => m.section === 'landing' && !m.hidden);
  if (!imgs.length){ el.innerHTML = ''; return; }
  el.innerHTML = imgs.map((m,i) => `<div class="slide ${i===0?'active':''}" style="background-image:url('${m.image}'); opacity:${i===0 ? (m.opacity ?? 100)/100 : 0};"></div>`).join('');
  if (imgs.length > 1){
    let i = 0;
    clearInterval(window.__heroTimer);
    window.__heroTimer = setInterval(() => {
      const slides = el.querySelectorAll('.slide');
      slides[i].classList.remove('active');
      i = (i + 1) % slides.length;
      slides[i].classList.add('active');
      slides[i].style.opacity = (imgs[i].opacity ?? 100)/100;
    }, 5000);
  }
}
function renderDestinations(){
  const el = document.getElementById('destinations-grid');
  if (!content.destinations.length){ el.innerHTML = emptyState('fa-map-location-dot', 'Destinations coming soon', 'We are adding our most popular routes here shortly.'); return; }
  el.innerHTML = content.destinations.map(d => `
    <div class="reveal card-hover bg-gray-50 dark:bg-gray-900/60 border border-black/5 dark:border-white/5 rounded-2xl p-5">
      <div class="w-10 h-10 rounded-xl bg-brand-600/10 text-brand-600 dark:text-brand-500 grid place-items-center mb-3"><i class="fa-solid fa-location-dot"></i></div>
      <div class="font-display font-bold text-gray-900 dark:text-white mb-1">${esc(d.name)}</div>
      <p class="text-xs text-gray-500 mb-3">${esc(d.description||'')}</p>
      ${d.distance ? `<span class="text-[11px] bg-black/5 dark:bg-white/5 rounded-full px-2.5 py-1 text-gray-500">${esc(d.distance)}</span>` : ''}
    </div>`).join('');
}
function renderTestimonials(){
  const el = document.getElementById('testimonials-grid');
  if (!content.testimonials.length){ el.innerHTML = emptyState('fa-quote-left', 'Reviews coming soon', 'Customer testimonials will appear here as trips are completed.'); return; }
  el.innerHTML = content.testimonials.map(t => `
    <div class="reveal card-hover bg-white dark:bg-gray-900/60 border border-black/5 dark:border-white/5 rounded-2xl p-6">
      <i class="fa-solid fa-quote-left text-brand-600 dark:text-brand-500 text-xl mb-4"></i>
      <p class="text-sm text-gray-600 dark:text-gray-300 mb-5 leading-relaxed">${esc(t.review)}</p>
      <div class="flex items-center justify-between">
        <span class="font-semibold text-sm text-gray-900 dark:text-white">${esc(t.name)}</span>
        <span class="text-brand-600 dark:text-brand-500 text-xs">${Array.from({length:t.rating||5}).map(()=>'<i class="fa-solid fa-star"></i>').join('')}</span>
      </div>
    </div>`).join('');
}
function renderGallery(){
  const el = document.getElementById('gallery-grid');
  const imgs = content.moments.filter(m => m.section === 'gallery' && !m.hidden);
  if (!imgs.length){ el.innerHTML = emptyState('fa-images', 'Gallery coming soon', 'Photos from recent trips will be added here.'); return; }
  el.innerHTML = imgs.map(g => `
    <div class="reveal card-hover aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-900 border border-black/5 dark:border-white/5 relative group">
      <img src="${g.image}" alt="${esc(g.caption||'')}" class="w-full h-full object-cover" style="opacity:${(g.opacity ?? 100)/100}">
      ${g.caption ? `<div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-3"><span class="text-white text-xs font-semibold">${esc(g.caption)}</span></div>` : ''}
    </div>`).join('');
}
function renderCompanyInfo(){
  const c = content.company;
  document.getElementById('hero-phone').textContent = c.phone;
  document.getElementById('hero-call').href = 'tel:' + c.phone.replace(/\s/g,'');
  const waUrl = buildWhatsAppUrl(content.social.whatsapp, "Hi I need vehicle");
  document.getElementById('hero-whatsapp').href = waUrl;
  document.getElementById('wa-fab').href = waUrl;
  document.getElementById('contact-address').textContent = c.address;
  document.getElementById('contact-phone').textContent = c.phone;
  document.getElementById('contact-email').textContent = c.email;
  document.getElementById('footer-address').innerHTML = `<i class="fa-solid fa-location-dot text-brand-600 dark:text-brand-500 mt-1"></i> ${esc(c.address)}`;
  document.getElementById('footer-phone').innerHTML = `<i class="fa-solid fa-phone text-brand-600 dark:text-brand-500"></i> ${esc(c.phone)}`;
  document.getElementById('footer-email').innerHTML = `<i class="fa-solid fa-envelope text-brand-600 dark:text-brand-500"></i> ${esc(c.email)}`;
  document.getElementById('mono-phone').textContent = c.phone;
  document.getElementById('mono-vehicle-count').textContent = content.vehicles.length;
  document.getElementById('office-map').src = c.mapEmbed || '';

  const socialIcons = { facebook:'fa-brands fa-facebook-f', instagram:'fa-brands fa-instagram', youtube:'fa-brands fa-youtube', linkedin:'fa-brands fa-linkedin-in' };
  const socialLinks = Object.entries(content.social).filter(([k,v]) => k!=='whatsapp' && v);
  let socialHtml = socialLinks.map(([k,v]) => `<a href="${esc(v)}" target="_blank" rel="noopener" class="w-9 h-9 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-brand-600 hover:text-white text-gray-500 grid place-items-center transition-colors"><i class="${socialIcons[k]||'fa-solid fa-link'} text-sm"></i></a>`).join('');
  socialHtml += `<a href="${waUrl}" target="_blank" rel="noopener" class="w-9 h-9 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-emerald-600 hover:text-white text-gray-500 grid place-items-center transition-colors"><i class="fa-brands fa-whatsapp text-sm"></i></a>`;
  document.getElementById('footer-social').innerHTML = socialHtml;

  if (content.logos.main){ document.getElementById('logo-main-wrap').innerHTML = `<img src="${content.logos.main}" class="w-full h-full object-cover" alt="Logo">`; }
}

/* ---------------- Booking modal (round trip + autocomplete + WhatsApp) ---------------- */
function openBooking(){
  bookingDraft = {
    name:'', email:'', phone:'',
    pickup: document.getElementById('widget-from')?.value || '',
    destination: document.getElementById('widget-to')?.value || '',
    dropoff:'', date:'', time:'', members: document.getElementById('widget-members')?.value || '',
    roundTrip:false, returnDate:'', returnTime:'', notes:'',
  };
  renderModal(bookingModalHtml(1));
  wireLocationAutocomplete(document.getElementById('bk-pickup'), document.getElementById('bk-pickup-list'));
  wireLocationAutocomplete(document.getElementById('bk-destination'), document.getElementById('bk-destination-list'));
  document.getElementById('bk-members')?.addEventListener('input', updateRecPreview);
}
function renderModal(html){ document.getElementById('modal-root').innerHTML = html; }
function closeModal(){ document.getElementById('modal-root').innerHTML = ''; }

function renderRecBox(rec){
  if (!rec.vehicle) return `<div class="text-xs text-gray-500 mt-2">Add your group size to see a suggested vehicle.</div>`;
  return `<div class="bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl p-4 flex gap-3 items-center mt-3">
    <i class="fa-solid ${rec.vehicle.capacity>12?'fa-bus':'fa-car'} text-2xl text-brand-600 dark:text-brand-500"></i>
    <div>
      <div class="font-semibold text-sm text-gray-900 dark:text-white">Suggested: ${esc(rec.vehicle.name)}</div>
      <div class="text-xs text-gray-500">${rec.vehicle.capacity} seats${rec.vehicle.price ? ' · '+esc(rec.vehicle.price) : ''}</div>
      ${rec.note ? `<div class="text-xs text-brand-600 dark:text-brand-500 font-semibold mt-1">${esc(rec.note)}</div>` : ''}
    </div>
  </div>`;
}
function updateRecPreview(){
  bookingDraft.members = document.getElementById('bk-members').value;
  const box = document.getElementById('bk-rec-box');
  if (!box) return;
  const n = Number(bookingDraft.members);
  box.innerHTML = n ? renderRecBox(recommendVehicle(content.vehicles, n)) : '';
}

function bookingModalHtml(step){
  const d = bookingDraft;
  if (step === 1){
    return `
    <div class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 sm:p-8 overflow-y-auto" onclick="if(event.target===this) closeModal()">
      <div class="bg-white dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-3xl w-full max-w-xl p-6 sm:p-7 mt-6">
        <div class="flex items-center justify-between mb-1">
          <h3 class="font-display font-bold text-xl text-gray-900 dark:text-white">Book Your Vehicle</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i class="fa-solid fa-xmark text-lg"></i></button>
        </div>
        <p class="text-xs text-gray-500 mb-5">No account needed — we'll open WhatsApp with your details ready to send.</p>

        <div class="grid sm:grid-cols-2 gap-4">
          <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Full Name *</label><input id="bk-name" value="${esc(d.name)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
          <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Phone Number *</label><input id="bk-phone" value="${esc(d.phone)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
          <div class="sm:col-span-2"><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Email (optional)</label><input id="bk-email" value="${esc(d.email)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>

          <div class="relative"><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Pickup Location *</label><input id="bk-pickup" autocomplete="off" value="${esc(d.pickup)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600">
            <div id="bk-pickup-list" class="hidden absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl z-30 max-h-48 overflow-y-auto"></div>
          </div>
          <div class="relative"><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Destination *</label><input id="bk-destination" autocomplete="off" value="${esc(d.destination)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600">
            <div id="bk-destination-list" class="hidden absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl z-30 max-h-48 overflow-y-auto"></div>
          </div>
          <div class="sm:col-span-2"><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Drop-off Location (optional)</label><input id="bk-dropoff" value="${esc(d.dropoff)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>

          <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Pickup Date *</label><input id="bk-date" type="date" value="${esc(d.date)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
          <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Pickup Time *</label><input id="bk-time" type="time" value="${esc(d.time)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
          <div class="sm:col-span-2"><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Number of Members *</label><input id="bk-members" type="number" min="1" value="${esc(d.members)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
        </div>

        <div class="mt-4 bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl p-4">
          <label class="block text-[11px] font-bold text-gray-500 uppercase mb-2">Round Trip?</label>
          <div class="flex gap-2 mb-3">
            <button type="button" onclick="setRoundTrip(true)" id="rt-yes" class="flex-1 py-2 rounded-lg text-sm font-semibold border ${d.roundTrip ? 'bg-brand-600 text-white border-brand-600' : 'border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-300'}">Yes</button>
            <button type="button" onclick="setRoundTrip(false)" id="rt-no" class="flex-1 py-2 rounded-lg text-sm font-semibold border ${!d.roundTrip ? 'bg-brand-600 text-white border-brand-600' : 'border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-300'}">No</button>
          </div>
          <div id="rt-fields" class="grid grid-cols-2 gap-3 ${d.roundTrip ? '' : 'hidden'}">
            <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Return Date</label><input id="bk-return-date" type="date" value="${esc(d.returnDate)}" class="w-full bg-white dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
            <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Return Time</label><input id="bk-return-time" type="time" value="${esc(d.returnTime)}" class="w-full bg-white dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
          </div>
        </div>

        <div class="mt-4"><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Special Requirements (optional)</label><textarea id="bk-notes" rows="2" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600">${esc(d.notes)}</textarea></div>

        <div id="bk-rec-box">${Number(d.members) ? renderRecBox(recommendVehicle(content.vehicles, Number(d.members))) : ''}</div>
        <div id="bk-error" class="text-xs text-red-500 mt-2"></div>
        <button id="bk-continue" onclick="bookingGoStep2()" class="w-full inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-bold py-3.5 rounded-xl transition-colors mt-4">Continue <i class="fa-solid fa-arrow-right"></i></button>
      </div>
    </div>`;
  }

  const rec = recommendVehicle(content.vehicles, Number(d.members));
  return `
  <div class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 sm:p-8 overflow-y-auto" onclick="if(event.target===this) closeModal()">
    <div class="bg-white dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-3xl w-full max-w-md p-6 sm:p-7 mt-10">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-display font-bold text-xl text-gray-900 dark:text-white"><i class="fa-solid fa-circle-check text-emerald-500 mr-1"></i> Booking Saved</h3>
        <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i class="fa-solid fa-xmark text-lg"></i></button>
      </div>
      <div class="bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-5 text-center mb-4">
        <div class="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Reference ID</div>
        <div class="font-display font-extrabold text-2xl text-brand-600 dark:text-brand-500 mb-3">${esc(d.refId)}</div>
        <div class="flex justify-center gap-5 text-xs text-gray-600 dark:text-gray-300">
          <span><i class="fa-solid fa-calendar-day text-brand-600 dark:text-brand-500 mr-1"></i>${esc(d.createdDay)}, ${esc(d.createdDate)}</span>
          <span><i class="fa-solid fa-clock text-brand-600 dark:text-brand-500 mr-1"></i>${esc(d.createdTime)}</span>
        </div>
      </div>
      ${renderRecBox(rec)}
      <div class="text-sm bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl p-4 flex flex-col gap-2 my-4">
        <div class="flex justify-between"><span class="text-gray-500">Route</span><span class="text-gray-900 dark:text-white text-right">${esc(d.pickup)} → ${esc(d.destination)}</span></div>
        <div class="flex justify-between"><span class="text-gray-500">Trip Type</span><span class="text-gray-900 dark:text-white">${d.roundTrip ? 'Round Trip' : 'One Way'}</span></div>
        <div class="flex justify-between"><span class="text-gray-500">Pickup</span><span class="text-gray-900 dark:text-white">${esc(d.date)} ${esc(d.time)}</span></div>
        ${d.roundTrip ? `<div class="flex justify-between"><span class="text-gray-500">Return</span><span class="text-gray-900 dark:text-white">${esc(d.returnDate)} ${esc(d.returnTime)}</span></div>` : ''}
        <div class="flex justify-between"><span class="text-gray-500">Members</span><span class="text-gray-900 dark:text-white">${esc(d.members)}</span></div>
      </div>
      <button onclick="downloadReferenceImage('${esc(d.refId)}', {createdDate:'${esc(d.createdDate)}',createdTime:'${esc(d.createdTime)}',createdDay:'${esc(d.createdDay)}'})" class="w-full inline-flex items-center justify-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 font-semibold py-3 rounded-xl mb-3">
        <i class="fa-solid fa-download"></i> Download as Image
      </button>
      <p class="text-center text-xs text-gray-500 mb-3">You Need To Open Your WhatsApp to send your booking details.</p>
      <button id="bk-submit" onclick="sendBookingWhatsApp()" class="w-full inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1fbd5a] text-white font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-600/20">
        <i class="fa-brands fa-whatsapp text-xl"></i> Send Booking Via WhatsApp
      </button>
    </div>
  </div>`;
}
function setRoundTrip(val){
  bookingDraft.roundTrip = val;
  document.getElementById('rt-yes').className = `flex-1 py-2 rounded-lg text-sm font-semibold border ${val ? 'bg-brand-600 text-white border-brand-600' : 'border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-300'}`;
  document.getElementById('rt-no').className = `flex-1 py-2 rounded-lg text-sm font-semibold border ${!val ? 'bg-brand-600 text-white border-brand-600' : 'border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-300'}`;
  document.getElementById('rt-fields').classList.toggle('hidden', !val);
}
function readBookingForm(){
  const ids = ['name','email','phone','pickup','destination','dropoff','date','time','members','notes'];
  ids.forEach(id => { const el = document.getElementById('bk-'+id); if (el) bookingDraft[id] = el.value; });
  bookingDraft.returnDate = document.getElementById('bk-return-date')?.value || '';
  bookingDraft.returnTime = document.getElementById('bk-return-time')?.value || '';
}
async function bookingGoStep2(){
  readBookingForm();
  const d = bookingDraft;
  const errBox = document.getElementById('bk-error');
  const valid = d.name.trim() && /^[+\d][\d\s-]{7,14}$/.test(d.phone.trim())
    && d.pickup.trim() && d.destination.trim() && d.date && d.time && Number(d.members) > 0
    && (!d.roundTrip || (d.returnDate && d.returnTime));
  if (!valid){ errBox.textContent = 'Please fill all required fields (marked *) with valid details' + (d.roundTrip ? ', including your return date and time.' : '.'); return; }
  errBox.textContent = '';
  const btn = document.getElementById('bk-continue');
  setBtnLoading(btn, true, 'Saving…');
  try{
    const record = await createBooking({ requestType:'Vehicle Booking', ...bookingDraft });
    bookingDraft = record;
    renderModal(bookingModalHtml(2));
  }catch(err){
    errBox.textContent = err.message || 'Something went wrong saving your booking. Please try again.';
  }finally{
    setBtnLoading(btn, false);
  }
}
function sendBookingWhatsApp(){
  window.open(buildWhatsAppUrl(content.social.whatsapp, buildBookingMessage(bookingDraft)), '_blank');
}

/* ---------------- Offer enquiry (name + phone -> WhatsApp) ---------------- */
function openOfferEnquiry(offerId){
  const offer = content.offers.find(o => o.id === offerId);
  renderModal(`
  <div class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 sm:p-8 overflow-y-auto" onclick="if(event.target===this) closeModal()">
    <div class="bg-white dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-3xl w-full max-w-md p-6 sm:p-7 mt-10">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-display font-bold text-xl text-gray-900 dark:text-white">Enquire: ${esc(offer ? offer.title : 'Offer')}</h3>
        <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i class="fa-solid fa-xmark text-lg"></i></button>
      </div>
      <p class="text-xs text-gray-500 mb-5">We'll open WhatsApp with your enquiry ready to send.</p>
      <div class="flex flex-col gap-4">
        <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Full Name *</label><input id="oe-name" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
        <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Phone Number *</label><input id="oe-phone" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
        <div id="oe-error" class="text-xs text-red-500"></div>
        <button id="oe-submit" onclick="submitOfferEnquiry('${offerId}')" class="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl"><i class="fa-brands fa-whatsapp"></i> Send via WhatsApp</button>
      </div>
    </div>
  </div>`);
}
async function submitOfferEnquiry(offerId){
  const offer = content.offers.find(o => o.id === offerId);
  const name = document.getElementById('oe-name').value.trim();
  const phone = document.getElementById('oe-phone').value.trim();
  const errBox = document.getElementById('oe-error');
  if (!name || !/^[+\d][\d\s-]{7,14}$/.test(phone)){ errBox.textContent = 'Please enter your name and a valid phone number.'; return; }
  errBox.textContent = '';
  const btn = document.getElementById('oe-submit');
  setBtnLoading(btn, true, 'Saving…');
  try{
    const record = await createBooking({ requestType:'Offer Enquiry', name, phone, offerTitle: offer ? offer.title : '' });
    closeModal();
    showToast(`Enquiry saved (${record.refId}) — opening WhatsApp…`);
    window.open(buildWhatsAppUrl(content.social.whatsapp, buildOfferEnquiryMessage(name, phone, record.offerTitle)), '_blank');
  }catch(err){
    showToast(err.message || 'Something went wrong. Please try again.');
  }finally{
    setBtnLoading(btn, false);
  }
}

/* ---------------- Instant ride (name + phone -> WhatsApp) ---------------- */
function openInstantRide(){
  renderModal(`
  <div class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 sm:p-8 overflow-y-auto" onclick="if(event.target===this) closeModal()">
    <div class="bg-white dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-3xl w-full max-w-md p-6 sm:p-7 mt-10">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-display font-bold text-xl text-gray-900 dark:text-white"><i class="fa-solid fa-bolt text-emerald-500 mr-1"></i> Book Instant Ride</h3>
        <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i class="fa-solid fa-xmark text-lg"></i></button>
      </div>
      <p class="text-xs text-gray-500 mb-5">We'll open WhatsApp so our office can arrange a ride right away.</p>
      <div class="flex flex-col gap-4">
        <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Full Name *</label><input id="ir-name" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
        <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Phone Number *</label><input id="ir-phone" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
        <div id="ir-error" class="text-xs text-red-500"></div>
        <button id="ir-submit" onclick="submitInstantRide()" class="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl"><i class="fa-brands fa-whatsapp"></i> Send via WhatsApp</button>
      </div>
    </div>
  </div>`);
}
async function submitInstantRide(){
  const name = document.getElementById('ir-name').value.trim();
  const phone = document.getElementById('ir-phone').value.trim();
  const errBox = document.getElementById('ir-error');
  if (!name || !/^[+\d][\d\s-]{7,14}$/.test(phone)){ errBox.textContent = 'Please enter your name and a valid phone number.'; return; }
  errBox.textContent = '';
  const btn = document.getElementById('ir-submit');
  setBtnLoading(btn, true, 'Saving…');
  try{
    const record = await createBooking({ requestType:'Instant Ride', name, phone });
    const refId = record.refId, meta = record;
    renderModal(`
    <div class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 sm:p-8 overflow-y-auto" onclick="if(event.target===this) closeModal()">
      <div class="bg-white dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-3xl w-full max-w-md p-6 sm:p-7 mt-10">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-display font-bold text-xl text-gray-900 dark:text-white"><i class="fa-solid fa-circle-check text-emerald-500 mr-1"></i> Request Saved</h3>
          <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i class="fa-solid fa-xmark text-lg"></i></button>
        </div>
        <div class="bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-5 text-center mb-4">
          <div class="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Reference ID</div>
          <div class="font-display font-extrabold text-2xl text-brand-600 dark:text-brand-500 mb-3">${esc(refId)}</div>
          <div class="flex justify-center gap-5 text-xs text-gray-600 dark:text-gray-300">
            <span><i class="fa-solid fa-calendar-day text-brand-600 dark:text-brand-500 mr-1"></i>${esc(meta.createdDay)}, ${esc(meta.createdDate)}</span>
            <span><i class="fa-solid fa-clock text-brand-600 dark:text-brand-500 mr-1"></i>${esc(meta.createdTime)}</span>
          </div>
        </div>
        <button onclick="downloadReferenceImage('${esc(refId)}', {createdDate:'${esc(meta.createdDate)}',createdTime:'${esc(meta.createdTime)}',createdDay:'${esc(meta.createdDay)}'})" class="w-full inline-flex items-center justify-center gap-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 font-semibold py-3 rounded-xl mb-3">
          <i class="fa-solid fa-download"></i> Download as Image
        </button>
        <p class="text-center text-xs text-gray-500 mb-3">You Need To Open Your WhatsApp to send your request.</p>
        <button onclick='window.open(buildWhatsAppUrl(content.social.whatsapp, buildInstantRideMessage(${JSON.stringify(record)})), "_blank")' class="w-full inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1fbd5a] text-white font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-600/20">
          <i class="fa-brands fa-whatsapp text-xl"></i> Send Via WhatsApp
        </button>
      </div>
    </div>`);
  }catch(err){
    errBox.textContent = err.message || 'Something went wrong. Please try again.';
  }finally{
    setBtnLoading(btn, false);
  }
}

/* ---------------- Contact form ---------------- */
async function submitContact(){
  const name = document.getElementById('ct-name').value.trim();
  const email = document.getElementById('ct-email').value.trim();
  const message = document.getElementById('ct-message').value.trim();
  const errBox = document.getElementById('ct-error');
  if (!name || !message || !/^\S+@\S+\.\S+$/.test(email)){ errBox.textContent = 'Please enter your name, a valid email, and a message.'; return; }
  errBox.textContent = '';
  const btn = document.getElementById('ct-submit');
  setBtnLoading(btn, true, 'Sending…');
  try{
    await createMessage(name, email, message);
    showToast("Message sent — we'll get back to you soon.");
    document.getElementById('ct-name').value = '';
    document.getElementById('ct-email').value = '';
    document.getElementById('ct-message').value = '';
  }catch(err){
    errBox.textContent = err.message || 'Something went wrong sending your message. Please try again.';
  }finally{
    setBtnLoading(btn, false);
  }
}

/* ---------------- Chrome (menu/theme/reveal) ---------------- */
function wireChrome(){
  const menuBtn = document.getElementById('menu-btn');
  const menuIcon = document.getElementById('menu-icon');
  const mobileMenu = document.getElementById('mobile-menu');
  menuBtn.addEventListener('click', () => {
    const nowHidden = mobileMenu.classList.toggle('hidden');
    menuIcon.className = nowHidden ? 'fa-solid fa-bars' : 'fa-solid fa-xmark';
  });
  document.querySelectorAll('.mobile-link').forEach(a => a.addEventListener('click', () => { mobileMenu.classList.add('hidden'); menuIcon.className = 'fa-solid fa-bars'; }));

  document.getElementById('theme-toggle').addEventListener('click', async () => {
    const isDark = document.documentElement.classList.contains('dark');
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    await savePersonal(THEME_PREF_KEY, next);
  });

  const io = new IntersectionObserver((entries) => { entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('in'); }); }, { threshold:0.12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  document.getElementById('year').textContent = new Date().getFullYear();
}

/* ---------------- Init ---------------- */
async function loadAll(){
  const [settingsRes, vehiclesRes, categoriesRes, destinationsRes, offersRes, testimonialsRes, vehicleCategoriesRes, momentsRes] = await Promise.all([
    sb.from('settings').select('*').eq('id', 1).single(),
    sb.from('vehicles').select('*'),
    sb.from('trip_categories').select('name'),
    sb.from('destinations').select('*'),
    sb.from('offers').select('*'),
    sb.from('testimonials').select('*'),
    sb.from('vehicle_categories').select('*'),
    sb.from('moments').select('*'),
  ]);
  const s = settingsRes.data || {};
  content = {
    company: s.company || {}, social: s.social || {}, logos: s.logos || {}, theme: s.theme || { mode:'dark' }, seo: s.seo || {},
    vehicles: vehiclesRes.data || [],
    categories: (categoriesRes.data || []).map(r => r.name),
    destinations: destinationsRes.data || [],
    offers: offersRes.data || [],
    testimonials: testimonialsRes.data || [],
    vehicleCategories: vehicleCategoriesRes.data || [],
    moments: momentsRes.data || [],
  };
}
function renderAll(){
  renderCompanyInfo(); renderVehicles(); renderOffers(); renderCategories();
  renderDestinations(); renderTestimonials(); renderGallery();
  renderHeroSlideshow();
  renderSectionBanner('fleet-banner', 'fleet');
  renderSectionBanner('destinations-banner', 'destinations');
  renderSectionBanner('packages-banner', 'packages');
  document.querySelectorAll('.reveal').forEach(el => { if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('in'); });
}
async function refreshAndRender(){ await loadAll(); renderAll(); }
function wireRealtime(){
  const tables = ['settings','vehicles','trip_categories','destinations','offers','testimonials','vehicle_categories','moments'];
  let channel = sb.channel('public-site-content');
  tables.forEach(table => { channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, refreshAndRender); });
  channel.subscribe();
}
async function init(){
  await loadAll();
  applyTheme(resolveTheme(content));
  renderAll();
  wireChrome();
  wireRealtime();
  wireLocationAutocomplete(document.getElementById('widget-from'), document.getElementById('widget-from-list'));
  wireLocationAutocomplete(document.getElementById('widget-to'), document.getElementById('widget-to-list'));
}
init();
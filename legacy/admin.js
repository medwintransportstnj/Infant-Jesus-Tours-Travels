/* ============================================================
   Infant Jesus Tours & Travels — admin.html
   Fully self-contained. Reads/writes the SAME shared storage
   keys as index.html, so changes here reflect on the main site.
============================================================ */
const CONTENT_KEY = 'ijt-content';
const BOOKINGS_KEY = 'ijt-bookings';
const NOTIFS_KEY = 'ijt-notifications';
const MESSAGES_KEY = 'ijt-messages';
const ADMIN_SESSION_KEY = 'ijt-admin-session';
const STATUS_STEPS = ['Pending', 'Office Calling', 'Confirmed', 'Trip Completed'];

function emptyContent(){
  return {
    company: {
      name: 'Infant Jesus Tours & Travels',
      address: 'Sriram Nagar, R.R. Nagar Road, Madhakottai, Thanjavur, Tamil Nadu',
      phone: '+91 98424 87017',
      email: 'bookings@infantjesustours.in',
      mapEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3588.077729841336!2d79.11746107457458!3d10.747230659732516!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3baab9ce1fe09f59%3A0xd1137ef6b13dc08f!2sInfant%20Jesus%20tours%20%26%20travels!5e1!3m2!1sen!2sin!4v1786248286605!5m2!1sen!2sin',
    },
    social: { facebook:'', instagram:'', youtube:'', linkedin:'', whatsapp:'9842487017' },
    logos: { main:'', travels:'' },
    theme: { mode:'dark' },
    seo: { title:'', description:'', keywords:'' },
    adminPasscode: '',
    bookingCounter: 0,
    vehicles: [], categories: [], destinations: [], offers: [], testimonials: [],
    vehicleCategories: [], moments: [],
    pageContent: {},
  };
}
async function loadShared(key, fallback){
  try{ const res = await window.storage.get(key, true); return JSON.parse(res.value); }
  catch(e){ try{ await window.storage.set(key, JSON.stringify(fallback), true); }catch(e2){} return fallback; }
}
async function saveShared(key, val){ try{ await window.storage.set(key, JSON.stringify(val), true); }catch(e){} return val; }
async function loadPersonal(key, fallback){ try{ const res = await window.storage.get(key, false); return res.value ? JSON.parse(res.value) : fallback; }catch(e){ return fallback; } }
async function savePersonal(key, val){ try{ await window.storage.set(key, JSON.stringify(val), false); }catch(e){} return val; }
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function daysLeft(dateStr){ if (!dateStr) return 0; const diff = new Date(dateStr+'T23:59:59') - new Date(); return Math.max(0, Math.ceil(diff/86400000)); }
function notify(list, entry){ return [...list, { id:'n'+Date.now()+Math.random().toString(36).slice(2,7), read:false, createdAt:new Date().toISOString(), ...entry }]; }
async function resolveTheme(content){ const override = await loadPersonal('ijt-theme-pref', null); return override || (content?.theme?.mode) || 'dark'; }
function applyTheme(mode){ document.documentElement.classList.toggle('dark', mode !== 'light'); }

let content = emptyContent();
let requests = [];
let notifications = [];
let messages = [];
let toastTimer;

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
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

/* ---------------- Admin auth ---------------- */
async function adminLoginAttempt(){
  const btn = document.querySelector('#admin-gate button[onclick="adminLoginAttempt()"]');
  const pass = document.getElementById('admin-pass').value;
  const errBox = document.getElementById('admin-gate-error');
  errBox.textContent = '';
  if (btn){ btn.disabled = true; btn.dataset.originalHtml = btn.dataset.originalHtml || btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking…'; }
  try{
    content = await loadShared(CONTENT_KEY, content);
    const expected = content.adminPasscode || 'admin123';
    if (pass !== expected){ errBox.textContent = 'Incorrect passcode.'; return; }
    await savePersonal(ADMIN_SESSION_KEY, true);
    await enterAdmin();
  }catch(err){
    errBox.textContent = 'Something went wrong logging in. Please try again.';
  }finally{
    if (btn){ btn.disabled = false; btn.innerHTML = btn.dataset.originalHtml; }
  }
}
async function adminLogout(){ await savePersonal(ADMIN_SESSION_KEY, false); location.reload(); }
async function enterAdmin(){
  document.getElementById('admin-gate').classList.add('hidden');
  document.getElementById('admin-app').classList.remove('hidden');
  requests = await loadShared(BOOKINGS_KEY, []);
  notifications = await loadShared(NOTIFS_KEY, []);
  messages = await loadShared(MESSAGES_KEY, []);
  renderAllPanels();
  setInterval(async () => {
    content = await loadShared(CONTENT_KEY, content);
    requests = await loadShared(BOOKINGS_KEY, requests);
    notifications = await loadShared(NOTIFS_KEY, notifications);
    renderStats(); renderChart(); renderRecentBookings(); renderBookings(); renderNotifBadge();
  }, 20000);
}

/* ---------------- Sidebar / panels ---------------- */
function toggleSidebar(open){
  document.getElementById('sidebar').classList.toggle('open', open);
  document.getElementById('sidebar-overlay').classList.toggle('hidden', !open);
}
const PANEL_TITLES = {
  dashboard:'Dashboard', bookings:'Bookings & Enquiries', vehicles:'Vehicles', packages:'Packages',
  destinations:'Destinations', offers:'Offers', pages:'Pages', gallery:'Gallery', testimonials:'Testimonials',
  contacts:'Contacts', notifications:'Notifications', 'website-settings':'Website Settings',
  'social-links':'WhatsApp & Social', 'seo-settings':'SEO Settings', 'theme-settings':'Theme Settings', admins:'Admins',
};
function showPanel(name){
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + name)?.classList.add('active');
  document.querySelectorAll('.nav-item[data-panel]').forEach(n => n.classList.toggle('active', n.dataset.panel === name));
  document.getElementById('panel-title').textContent = PANEL_TITLES[name] || 'Dashboard';
  toggleSidebar(false);
  if (name === 'notifications'){
    notifications = notifications.map(n => n.audience==='admin' ? {...n, read:true} : n);
    saveShared(NOTIFS_KEY, notifications);
    renderNotifBadge(); renderNotifications();
  }
  if (name === 'website-settings') fillWebsiteSettingsForm();
  if (name === 'social-links') fillSocialLinksForm();
  if (name === 'seo-settings') fillSeoForm();
  if (name === 'theme-settings') fillThemeSettingsForm();
  window.scrollTo({ top: 0 });
}
function openModal(inner){
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this) closeModal()">
      <div class="bg-white dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-2xl w-full max-w-md p-6 mt-10">${inner}</div>
    </div>`;
}
function closeModal(){ document.getElementById('modal-root').innerHTML = ''; }

const statusColor = (s) => ({
  'Pending':'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
  'Office Calling':'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25',
  'Confirmed':'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
  'Trip Completed':'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/25',
}[s] || 'bg-gray-500/15 text-gray-500 border-gray-500/25');
const typeIcon = (t) => ({ 'Vehicle Booking':'fa-car', 'Offer Enquiry':'fa-tag', 'Instant Ride':'fa-bolt' }[t] || 'fa-calendar-days');

/* ---------------- Stats + chart ---------------- */
function renderStats(){
  const stats = [
    { label:'Total Requests', value: requests.length, icon:'fa-inbox' },
    { label:'Pending', value: requests.filter(b=>b.status==='Pending').length, icon:'fa-hourglass-half' },
    { label:'Confirmed', value: requests.filter(b=>b.status==='Confirmed').length, icon:'fa-circle-check' },
    { label:'Trip Completed', value: requests.filter(b=>b.status==='Trip Completed').length, icon:'fa-flag-checkered' },
  ];
  document.getElementById('stats-row').innerHTML = stats.map(s => `
    <div class="bg-gray-50 dark:bg-gray-900 border border-black/5 dark:border-white/5 rounded-2xl p-4 sm:p-5">
      <span class="w-9 h-9 rounded-xl bg-brand-600/10 text-brand-600 dark:text-brand-500 grid place-items-center mb-3"><i class="fa-solid ${s.icon} text-sm"></i></span>
      <div class="font-display font-extrabold text-xl sm:text-2xl text-gray-900 dark:text-white">${s.value}</div>
      <div class="text-[11px] text-gray-500 mt-0.5">${s.label}</div>
    </div>`).join('');
}
function renderChart(){
  const days = Array.from({length:7}).map((_,i) => { const d = new Date(); d.setDate(d.getDate()-(6-i)); return d; });
  const dayKey = (d) => d.toISOString().slice(0,10);
  const totals = days.map(d => requests.filter(b => (b.createdAt||'').slice(0,10) === dayKey(d)).length);
  const confirmed = days.map(d => requests.filter(b => (b.createdAt||'').slice(0,10) === dayKey(d) && b.status==='Confirmed').length);
  const max = Math.max(1, ...totals, ...confirmed);
  const w = 560, h = 200, pad = 30;
  const x = (i) => pad + (i * (w - pad*2)) / (days.length - 1);
  const y = (v) => h - pad - (v / max) * (h - pad*1.5);
  const path = (arr) => arr.map((v,i) => `${i===0?'M':'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const labels = days.map(d => d.toLocaleDateString(undefined,{day:'numeric',month:'short'}));
  if (requests.length === 0){ document.getElementById('chart-wrap').innerHTML = `<div class="text-center py-10 text-sm text-gray-500">No requests yet — this chart will populate as bookings/enquiries come in.</div>`; return; }
  document.getElementById('chart-wrap').innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" class="w-full h-48">
      ${[0,0.5,1].map(f => `<line x1="${pad}" y1="${(h-pad*1.5*f-pad).toFixed(1)}" x2="${w-pad}" y2="${(h-pad*1.5*f-pad).toFixed(1)}" stroke="currentColor" stroke-opacity="0.08"/>`).join('')}
      <path d="${path(totals)}" fill="none" stroke="#DC2626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${path(confirmed)}" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${totals.map((v,i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="#DC2626"/>`).join('')}
      ${labels.map((l,i) => `<text x="${x(i)}" y="${h-8}" fill="currentColor" fill-opacity="0.5" font-size="9" text-anchor="middle">${l}</text>`).join('')}
    </svg>`;
}
function renderRecentBookings(){
  const el = document.getElementById('recent-bookings');
  const recent = [...requests].reverse().slice(0,4);
  if (!recent.length){ el.innerHTML = '<p class="text-sm text-gray-500">No requests yet.</p>'; return; }
  el.innerHTML = recent.map(b => `
    <div class="flex items-center gap-3">
      <span class="w-9 h-9 rounded-full bg-white dark:bg-black border border-black/10 dark:border-white/10 grid place-items-center text-xs text-brand-600 dark:text-brand-500 shrink-0"><i class="fa-solid ${typeIcon(b.requestType)}"></i></span>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-gray-900 dark:text-white truncate">${esc(b.name)} <span class="text-[10px] font-normal text-gray-500">· ${esc(b.requestType||'Booking')}${b.refId ? ' · '+esc(b.refId) : ''}</span></div>
        <div class="text-[11px] text-gray-500">${b.pickup ? esc(b.pickup)+' → '+esc(b.destination) : (b.offerTitle || '')}</div>
      </div>
      <span class="text-[10px] font-bold border rounded-full px-2 py-1 shrink-0 ${statusColor(b.status)}">${esc(b.status)}</span>
    </div>`).join('');
}

/* ---------------- Vehicles CRUD (with image upload) ---------------- */
function vehicleTableHtml(){
  if (!content.vehicles.length) return '<p class="text-sm text-gray-500 py-4">No vehicles yet — add your first one.</p>';
  return `
  <table class="w-full text-sm min-w-[620px]">
    <thead><tr class="text-left text-[11px] text-gray-500 uppercase tracking-wide border-b border-black/5 dark:border-white/5">
      <th class="py-2.5 pr-4 font-semibold">Image</th><th class="py-2.5 pr-4 font-semibold">Vehicle</th><th class="py-2.5 pr-4 font-semibold">Category</th>
      <th class="py-2.5 pr-4 font-semibold">Capacity</th><th class="py-2.5 pr-4 font-semibold">Status</th>
      <th class="py-2.5 pr-2 font-semibold text-right">Actions</th></tr></thead>
    <tbody>
      ${content.vehicles.map(v => `
        <tr class="border-b border-black/5 dark:border-white/5 last:border-0">
          <td class="py-2.5 pr-4"><span class="w-12 h-9 rounded-lg overflow-hidden bg-black/5 dark:bg-white/5 grid place-items-center block">${v.image ? `<img src="${v.image}" class="w-full h-full object-cover">` : `<i class="fa-solid fa-car text-gray-400 text-xs"></i>`}</span></td>
          <td class="py-3 pr-4 font-semibold text-gray-900 dark:text-white">${esc(v.name)}</td>
          <td class="py-3 pr-4 text-gray-500">${esc(v.category||'')}</td>
          <td class="py-3 pr-4 text-gray-500">${v.capacity}</td>
          <td class="py-3 pr-4"><span class="text-[10px] font-bold border rounded-full px-2 py-1 ${v.status==='Inactive'?'bg-gray-500/15 text-gray-500 border-gray-500/25':'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'}">${esc(v.status||'Active')}</span></td>
          <td class="py-3 pr-2 text-right">
            <div class="inline-flex items-center gap-2">
              <button onclick="openVehicleModal('${v.id}')" class="w-7 h-7 grid place-items-center rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10"><i class="fa-solid fa-pen text-xs"></i></button>
              <button onclick="deleteVehicle('${v.id}')" class="w-7 h-7 grid place-items-center rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500"><i class="fa-solid fa-trash text-xs"></i></button>
            </div>
          </td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}
function renderVehicles(){
  const html = vehicleTableHtml();
  const a = document.getElementById('vehicle-table-dashboard'); if (a) a.innerHTML = html;
  const b = document.getElementById('vehicle-table-main'); if (b) b.innerHTML = html;
}
let vehicleImageDraft = null;
function openVehicleModal(id){
  const v = id ? content.vehicles.find(x=>x.id===id) : { id:'', name:'', category:'', capacity:4, ac:true, price:'', status:'Active', image:'' };
  vehicleImageDraft = v.image || null;
  const catOptions = content.vehicleCategories.filter(c => !c.hidden || c.name===v.category);
  openModal(`
    <h3 class="font-display font-bold text-lg text-gray-900 dark:text-white mb-5">${id?'Edit':'Add'} Vehicle</h3>
    <div class="flex flex-col gap-3.5 mb-5">
      <div>
        <label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Vehicle Image</label>
        <div class="flex items-center gap-3">
          <span id="vm-image-preview" class="w-16 h-12 rounded-lg overflow-hidden bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 grid place-items-center shrink-0">${v.image ? `<img src="${v.image}" class="w-full h-full object-cover">` : `<i class="fa-solid fa-image text-gray-400 text-xs"></i>`}</span>
          <label class="flex-1 flex items-center gap-2 bg-gray-50 dark:bg-black border border-dashed border-black/15 dark:border-white/15 hover:border-brand-600 rounded-xl px-3 py-2 cursor-pointer text-xs text-gray-500">
            <i class="fa-solid fa-cloud-arrow-up text-brand-600 dark:text-brand-500"></i> Upload / Replace
            <input type="file" accept="image/*" class="hidden" onchange="onVehicleImageChange(this)">
          </label>
          ${v.image ? `<button type="button" onclick="removeVehicleImage()" class="text-red-500 hover:text-red-600 text-xs" title="Remove image"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
      </div>
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Name</label><input id="vm-name" value="${esc(v.name)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Category</label>
          <select id="vm-category" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600">
            ${catOptions.length ? catOptions.map(c => `<option ${v.category===c.name?'selected':''}>${esc(c.name)}</option>`).join('') : `<option value="">No categories yet — add one above</option>`}
          </select>
        </div>
        <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Capacity</label><input id="vm-capacity" type="number" min="1" value="${v.capacity}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
      </div>
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Price (optional, e.g. ₹14/km)</label><input id="vm-price" value="${esc(v.price||'')}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Status</label>
        <select id="vm-status" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600">
          <option ${v.status==='Active'?'selected':''}>Active</option><option ${v.status==='Inactive'?'selected':''}>Inactive</option>
        </select>
      </div>
    </div>
    <div class="flex gap-3">
      <button onclick="closeModal()" class="flex-1 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 font-semibold py-2.5 rounded-xl">Cancel</button>
      <button id="vm-save-btn" onclick="saveVehicle('${id||''}')" class="flex-1 bg-brand-600 hover:bg-brand-500 text-white font-bold py-2.5 rounded-xl">Save</button>
    </div>`);
}

/* ---------------- Vehicle Categories CRUD ---------------- */
function renderVehicleCategories(){
  const el = document.getElementById('vehicle-categories-list');
  if (!el) return;
  if (!content.vehicleCategories.length){ el.innerHTML = '<p class="text-sm text-gray-500">No vehicle categories yet — add one above (e.g. Sedan, SUV, Traveller).</p>'; return; }
  el.innerHTML = content.vehicleCategories.map(c => `
    <span class="inline-flex items-center gap-2 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-full pl-4 pr-2 py-1.5 text-sm ${c.hidden ? 'opacity-50' : ''}">
      ${esc(c.name)} ${c.hidden ? '<span class="text-[9px] font-bold text-gray-500">(hidden)</span>' : ''}
      <button onclick="toggleVehicleCategoryHidden('${c.id}')" class="w-6 h-6 rounded-full hover:bg-black/5 dark:hover:bg-white/10 grid place-items-center" title="Hide/Unhide"><i class="fa-solid ${c.hidden?'fa-eye-slash':'fa-eye'} text-xs text-gray-500"></i></button>
      <button onclick="deleteVehicleCategory('${c.id}')" class="w-6 h-6 rounded-full hover:bg-red-500/10 grid place-items-center text-red-500"><i class="fa-solid fa-xmark text-xs"></i></button>
    </span>`).join('');
}
async function addVehicleCategory(){
  const input = document.getElementById('vcat-input');
  const val = input.value.trim();
  if (!val) return;
  content.vehicleCategories = [...content.vehicleCategories, { id:'vc'+Date.now(), name: val, hidden:false }];
  await saveShared(CONTENT_KEY, content);
  input.value = ''; renderVehicleCategories();
}
async function toggleVehicleCategoryHidden(id){
  content.vehicleCategories = content.vehicleCategories.map(c => c.id===id ? {...c, hidden: !c.hidden} : c);
  await saveShared(CONTENT_KEY, content); renderVehicleCategories();
}
async function deleteVehicleCategory(id){
  content.vehicleCategories = content.vehicleCategories.filter(c => c.id !== id);
  await saveShared(CONTENT_KEY, content); renderVehicleCategories();
  showToast('Category deleted.');
}
function readFileAsDataUrl(file){
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
}
async function onVehicleImageChange(input){
  if (!input.files[0]) return;
  vehicleImageDraft = await readFileAsDataUrl(input.files[0]);
  document.getElementById('vm-image-preview').innerHTML = `<img src="${vehicleImageDraft}" class="w-full h-full object-cover">`;
}
function removeVehicleImage(){
  vehicleImageDraft = null;
  document.getElementById('vm-image-preview').innerHTML = `<i class="fa-solid fa-image text-gray-400 text-xs"></i>`;
}
async function saveVehicle(id){
  const name = document.getElementById('vm-name').value.trim();
  if (!name){ showToast('Vehicle name is required.'); return; }
  const btn = document.getElementById('vm-save-btn');
  setBtnLoading(btn, true, 'Saving…');
  try{
    const data = { name, category: document.getElementById('vm-category').value, capacity: Number(document.getElementById('vm-capacity').value)||1, price: document.getElementById('vm-price').value.trim(), status: document.getElementById('vm-status').value, ac:true, image: vehicleImageDraft || '' };
    content.vehicles = id ? content.vehicles.map(v => v.id===id ? {...v,...data} : v) : [...content.vehicles, { id:'v'+Date.now(), ...data }];
    await saveShared(CONTENT_KEY, content);
    closeModal(); renderVehicles(); showToast('Vehicle saved — now live on the website.');
  }catch(err){
    showToast('Something went wrong saving the vehicle.');
  }finally{ setBtnLoading(btn, false); }
}
async function deleteVehicle(id){ content.vehicles = content.vehicles.filter(v=>v.id!==id); await saveShared(CONTENT_KEY, content); renderVehicles(); showToast('Vehicle deleted.'); }

/* ---------------- Bookings & Enquiries (unified) ---------------- */
function filteredRequests(){
  let rows = [...requests];
  const q = (document.getElementById('filter-search')?.value || '').trim().toLowerCase();
  const type = document.getElementById('filter-type')?.value;
  const status = document.getElementById('filter-status')?.value;
  const from = document.getElementById('filter-from')?.value;
  const to = document.getElementById('filter-to')?.value;
  if (q) rows = rows.filter(b => [b.name, b.phone, b.refId, b.pickup, b.destination].some(v => (v||'').toLowerCase().includes(q)));
  if (type) rows = rows.filter(b => b.requestType === type);
  if (status) rows = rows.filter(b => b.status === status);
  if (from) rows = rows.filter(b => (b.createdAt||'').slice(0,10) >= from);
  if (to) rows = rows.filter(b => (b.createdAt||'').slice(0,10) <= to);
  return rows.reverse();
}
function clearBookingFilters(){
  ['filter-search','filter-type','filter-status','filter-from','filter-to'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderBookings();
}
function renderBookings(){
  const el = document.getElementById('bookings-table');
  if (!el) return;
  const rows = filteredRequests();
  if (!requests.length){ el.innerHTML = '<p class="text-sm text-gray-500 py-4">No bookings or enquiries yet.</p>'; return; }
  if (!rows.length){ el.innerHTML = '<p class="text-sm text-gray-500 py-4">No requests match the search/filters.</p>'; return; }
  el.innerHTML = `
  <table class="w-full text-sm min-w-[920px]">
    <thead><tr class="text-left text-[11px] text-gray-500 uppercase tracking-wide border-b border-black/5 dark:border-white/5">
      <th class="py-2.5 pr-4 font-semibold">Ref ID</th><th class="py-2.5 pr-4 font-semibold">Type</th><th class="py-2.5 pr-4 font-semibold">Customer</th><th class="py-2.5 pr-4 font-semibold">Details</th>
      <th class="py-2.5 pr-4 font-semibold">Date</th><th class="py-2.5 pr-4 font-semibold">Status</th><th class="py-2.5 pr-2 font-semibold text-right">Actions</th></tr></thead>
    <tbody>
      ${rows.map(b => `
        <tr class="border-b border-black/5 dark:border-white/5 last:border-0">
          <td class="py-3 pr-4 font-mono text-xs text-brand-600 dark:text-brand-500 font-bold">${esc(b.refId||'—')}</td>
          <td class="py-3 pr-4"><span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300"><i class="fa-solid ${typeIcon(b.requestType)} text-brand-600 dark:text-brand-500"></i>${esc(b.requestType||'Booking')}</span></td>
          <td class="py-3 pr-4 font-semibold text-gray-900 dark:text-white">${esc(b.name)}<div class="text-[11px] text-gray-500 font-normal">${esc(b.phone||'')}</div></td>
          <td class="py-3 pr-4 text-gray-500">
            ${b.requestType==='Vehicle Booking' ? `${esc(b.pickup)} → ${esc(b.destination)}${b.roundTrip?' (Round Trip)':''}<div class="text-[11px]">Vehicle: ${esc(b.recommendedVehicle||'—')}</div>` : ''}
            ${b.requestType==='Offer Enquiry' ? `${esc(b.offerTitle||'')}` : ''}
            ${b.requestType==='Instant Ride' ? `Instant ride request` : ''}
          </td>
          <td class="py-3 pr-4 text-gray-500">${b.createdDate || (b.createdAt ? new Date(b.createdAt).toLocaleDateString() : '')}${b.createdTime ? '<div class="text-[11px]">'+esc(b.createdTime)+'</div>' : ''}</td>
          <td class="py-3 pr-4"><span class="text-[10px] font-bold border rounded-full px-2 py-1 ${statusColor(b.status)}">${esc(b.status)}</span></td>
          <td class="py-3 pr-2 text-right">
            <div class="inline-flex items-center gap-1.5">
              <select onchange="updateBookingStatus('${b.id}', this.value)" class="bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-lg text-xs px-2 py-1.5 outline-none">
                ${STATUS_STEPS.map(s => `<option ${b.status===s?'selected':''}>${s}</option>`).join('')}
              </select>
              <button onclick="viewBooking('${b.id}')" class="w-7 h-7 grid place-items-center rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10" title="View"><i class="fa-solid fa-eye text-xs"></i></button>
              <button onclick="editBooking('${b.id}')" class="w-7 h-7 grid place-items-center rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10" title="Edit"><i class="fa-solid fa-pen text-xs"></i></button>
              <button onclick="deleteBooking('${b.id}')" class="w-7 h-7 grid place-items-center rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500" title="Delete"><i class="fa-solid fa-trash text-xs"></i></button>
            </div>
          </td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}
async function updateBookingStatus(id, status){
  requests = requests.map(x => x.id===id ? {...x, status} : x);
  await saveShared(BOOKINGS_KEY, requests);
  renderBookings(); renderRecentBookings(); renderStats(); renderChart();
  showToast('Status updated.');
}
function bookingDetailRows(b){
  const rows = [
    ['Reference ID', b.refId], ['Request Type', b.requestType], ['Full Name', b.name], ['Phone', b.phone],
    ['Email', b.email], ['Pickup Location', b.pickup], ['Destination', b.destination], ['Drop-off Location', b.dropoff],
    ['Pickup Date', b.date], ['Pickup Time', b.time], ['Number of Members', b.members],
    ['Round Trip', b.requestType==='Vehicle Booking' ? (b.roundTrip?'Yes':'No') : ''],
    ['Return Date', b.returnDate], ['Return Time', b.returnTime], ['Selected Vehicle', b.recommendedVehicle],
    ['Package/Offer', b.offerTitle], ['Special Requirements', b.notes], ['Status', b.status],
    ['Created', [b.createdDay, b.createdDate, b.createdTime].filter(Boolean).join(' · ')],
  ];
  return rows.filter(([,v]) => v);
}
function viewBooking(id){
  const b = requests.find(x => x.id === id);
  if (!b) return;
  openModal(`
    <h3 class="font-display font-bold text-lg text-gray-900 dark:text-white mb-5">${esc(b.refId||'Request')} Details</h3>
    <div class="flex flex-col gap-2 text-sm mb-5 max-h-[60vh] overflow-y-auto">
      ${bookingDetailRows(b).map(([k,v]) => `<div class="flex justify-between gap-4 border-b border-black/5 dark:border-white/5 py-2"><span class="text-gray-500">${esc(k)}</span><span class="text-gray-900 dark:text-white text-right">${esc(v)}</span></div>`).join('')}
    </div>
    <button onclick="closeModal()" class="w-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 font-semibold py-2.5 rounded-xl">Close</button>
  `);
}
function editBooking(id){
  const b = requests.find(x => x.id === id);
  if (!b) return;
  const isBooking = b.requestType === 'Vehicle Booking';
  openModal(`
    <h3 class="font-display font-bold text-lg text-gray-900 dark:text-white mb-5">Edit ${esc(b.refId||'Request')}</h3>
    <div class="flex flex-col gap-3.5 mb-5 max-h-[60vh] overflow-y-auto pr-1">
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Full Name</label><input id="eb-name" value="${esc(b.name)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Phone</label><input id="eb-phone" value="${esc(b.phone)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
      ${isBooking ? `
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Pickup Location</label><input id="eb-pickup" value="${esc(b.pickup||'')}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Destination</label><input id="eb-destination" value="${esc(b.destination||'')}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Pickup Date</label><input id="eb-date" type="date" value="${esc(b.date||'')}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
        <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Pickup Time</label><input id="eb-time" type="time" value="${esc(b.time||'')}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
      </div>
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Members</label><input id="eb-members" type="number" min="1" value="${esc(b.members||'')}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Special Requirements</label><textarea id="eb-notes" rows="2" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600">${esc(b.notes||'')}</textarea></div>
      ` : ''}
    </div>
    <div class="flex gap-3">
      <button onclick="closeModal()" class="flex-1 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 font-semibold py-2.5 rounded-xl">Cancel</button>
      <button onclick="saveBookingEdit('${id}')" class="flex-1 bg-brand-600 hover:bg-brand-500 text-white font-bold py-2.5 rounded-xl">Save</button>
    </div>`);
}
async function saveBookingEdit(id){
  const get = (i) => document.getElementById(i)?.value;
  requests = requests.map(b => {
    if (b.id !== id) return b;
    const updated = { ...b, name: get('eb-name') ?? b.name, phone: get('eb-phone') ?? b.phone };
    if (b.requestType === 'Vehicle Booking'){
      updated.pickup = get('eb-pickup') ?? b.pickup;
      updated.destination = get('eb-destination') ?? b.destination;
      updated.date = get('eb-date') ?? b.date;
      updated.time = get('eb-time') ?? b.time;
      updated.members = get('eb-members') ?? b.members;
      updated.notes = get('eb-notes') ?? b.notes;
    }
    return updated;
  });
  await saveShared(BOOKINGS_KEY, requests);
  closeModal(); renderBookings(); renderRecentBookings(); showToast('Request updated.');
}
async function deleteBooking(id){
  requests = requests.filter(x => x.id !== id);
  await saveShared(BOOKINGS_KEY, requests);
  renderBookings(); renderRecentBookings(); renderStats(); renderChart();
  showToast('Request deleted.');
}

/* ---------------- Excel export ---------------- */
function exportBookingsToExcel(){
  const rows = filteredRequests();
  if (!rows.length){ showToast('No bookings match the current filters — nothing to export.'); return; }
  const data = rows.slice().reverse().map(b => ({
    'Reference ID': b.refId || '',
    'Request Type': b.requestType || 'Vehicle Booking',
    'Full Name': b.name || '',
    'Phone Number': b.phone || '',
    'Pickup Location': b.pickup || '',
    'Destination': b.destination || '',
    'Drop-off Location': b.dropoff || '',
    'Members Count': b.members || '',
    'Selected Vehicle': b.recommendedVehicle || '',
    'Round Trip': b.roundTrip ? 'Yes' : (b.requestType==='Vehicle Booking' ? 'No' : ''),
    'Return Date': b.returnDate || '',
    'Return Time': b.returnTime || '',
    'Package/Offer': b.offerTitle || '',
    'Pickup Date': b.date || '',
    'Pickup Time': b.time || '',
    'Status': b.status || '',
    'Notes': b.notes || '',
    'Created At': b.createdAt ? new Date(b.createdAt).toLocaleString() : '',
  }));
  try{
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bookings');
    XLSX.writeFile(wb, `IJT-Bookings-${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast(`Exported ${rows.length} record(s) to Excel.`);
  }catch(err){
    showToast('Excel export failed to generate. Please try again.');
  }
}

/* ---------------- Packages ---------------- */
function renderPackages(){
  const el = document.getElementById('packages-list');
  if (!content.categories.length){ el.innerHTML = '<p class="text-sm text-gray-500">No packages yet — add one above.</p>'; return; }
  el.innerHTML = content.categories.map((p,i) => `
    <span class="inline-flex items-center gap-2 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-full px-4 py-2 text-sm">
      ${esc(p)} <button onclick="deletePackage(${i})" class="text-gray-400 hover:text-red-500"><i class="fa-solid fa-xmark text-xs"></i></button>
    </span>`).join('');
}
async function addPackage(){
  const input = document.getElementById('package-input');
  const val = input.value.trim();
  if (!val) return;
  content.categories = [...content.categories, val];
  await saveShared(CONTENT_KEY, content);
  input.value = ''; renderPackages();
}
async function deletePackage(i){ content.categories = content.categories.filter((_,idx)=>idx!==i); await saveShared(CONTENT_KEY, content); renderPackages(); }

/* ---------------- Destinations ---------------- */
function renderDestinations(){
  const el = document.getElementById('destinations-grid');
  if (!content.destinations.length){ el.innerHTML = '<p class="text-sm text-gray-500">No destinations yet.</p>'; return; }
  el.innerHTML = content.destinations.map(d => `
    <div class="bg-white dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl p-4">
      <div class="font-display font-bold text-gray-900 dark:text-white mb-1">${esc(d.name)}</div>
      <div class="text-xs text-gray-500 mb-2">${esc(d.description||'')}</div>
      <div class="flex items-center justify-between">
        <span class="text-[10px] bg-black/5 dark:bg-white/5 rounded-full px-2.5 py-1 text-gray-500">${esc(d.distance||'')}</span>
        <div class="flex gap-2">
          <button onclick="openDestinationModal('${d.id}')" class="w-7 h-7 grid place-items-center rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10"><i class="fa-solid fa-pen text-xs"></i></button>
          <button onclick="deleteDestination('${d.id}')" class="w-7 h-7 grid place-items-center rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500"><i class="fa-solid fa-trash text-xs"></i></button>
        </div>
      </div>
    </div>`).join('');
}
function openDestinationModal(id){
  const d = id ? content.destinations.find(x=>x.id===id) : { id:'', name:'', description:'', distance:'' };
  openModal(`
    <h3 class="font-display font-bold text-lg text-gray-900 dark:text-white mb-5">${id?'Edit':'Add'} Destination</h3>
    <div class="flex flex-col gap-3.5 mb-5">
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Name</label><input id="dm-name" value="${esc(d.name)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Description</label><input id="dm-description" value="${esc(d.description||'')}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Distance</label><input id="dm-distance" value="${esc(d.distance||'')}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
    </div>
    <div class="flex gap-3">
      <button onclick="closeModal()" class="flex-1 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 font-semibold py-2.5 rounded-xl">Cancel</button>
      <button onclick="saveDestination('${id||''}')" class="flex-1 bg-brand-600 hover:bg-brand-500 text-white font-bold py-2.5 rounded-xl">Save</button>
    </div>`);
}
async function saveDestination(id){
  const name = document.getElementById('dm-name').value.trim();
  if (!name){ showToast('Destination name is required.'); return; }
  const data = { name, description: document.getElementById('dm-description').value.trim(), distance: document.getElementById('dm-distance').value.trim() };
  content.destinations = id ? content.destinations.map(d=>d.id===id?{...d,...data}:d) : [...content.destinations, { id:'d'+Date.now(), ...data }];
  await saveShared(CONTENT_KEY, content);
  closeModal(); renderDestinations(); showToast('Destination saved.');
}
async function deleteDestination(id){ content.destinations = content.destinations.filter(d=>d.id!==id); await saveShared(CONTENT_KEY, content); renderDestinations(); showToast('Destination deleted.'); }

/* ---------------- Offers (Enable/Disable) ---------------- */
function renderOffers(){
  const el = document.getElementById('offers-grid');
  if (!content.offers.length){ el.innerHTML = '<p class="text-sm text-gray-500">No offers yet.</p>'; return; }
  el.innerHTML = content.offers.map(o => {
    const enabled = o.enabled !== false;
    const left = daysLeft(o.expiry);
    return `
    <div class="bg-white dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl p-4">
      <div class="flex items-start justify-between mb-1">
        <div class="font-display font-bold text-gray-900 dark:text-white">${esc(o.title)}</div>
        <label class="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 cursor-pointer select-none" title="Hide/Unhide on website">
          <input type="checkbox" ${enabled?'':'checked'} onchange="toggleOfferEnabled('${o.id}')" class="accent-brand-600 w-3.5 h-3.5 rounded"> Hide
        </label>
      </div>
      <div class="text-xs text-gray-500 mb-3">${esc(o.description)}</div>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-bold border rounded-full px-2.5 py-1 ${left>0 ? 'bg-brand-600/10 text-brand-600 dark:text-brand-500 border-brand-600/25' : 'bg-red-500/15 text-red-500 border-red-500/25'}">${left>0 ? left+' days left' : 'Expired'}</span>
          ${!enabled ? '<span class="text-[10px] font-bold border rounded-full px-2.5 py-1 bg-gray-500/15 text-gray-500 border-gray-500/25">Hidden</span>' : ''}
        </div>
        <div class="flex gap-2">
          <button onclick="openOfferModal('${o.id}')" class="w-7 h-7 grid place-items-center rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10"><i class="fa-solid fa-pen text-xs"></i></button>
          <button onclick="deleteOffer('${o.id}')" class="w-7 h-7 grid place-items-center rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500"><i class="fa-solid fa-trash text-xs"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}
async function toggleOfferEnabled(id){
  content.offers = content.offers.map(o => o.id===id ? {...o, enabled: o.enabled===false} : o);
  await saveShared(CONTENT_KEY, content); renderOffers();
  showToast('Offer visibility updated.');
}
function openOfferModal(id){
  const o = id ? content.offers.find(x=>x.id===id) : { id:'', title:'', description:'', expiry:'', enabled:true };
  openModal(`
    <h3 class="font-display font-bold text-lg text-gray-900 dark:text-white mb-5">${id?'Edit':'Add'} Offer</h3>
    <div class="flex flex-col gap-3.5 mb-5">
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Title</label><input id="om-title" value="${esc(o.title)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Description</label><input id="om-description" value="${esc(o.description)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Expiry Date</label><input id="om-expiry" type="date" value="${esc(o.expiry)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
    </div>
    <div class="flex gap-3">
      <button onclick="closeModal()" class="flex-1 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 font-semibold py-2.5 rounded-xl">Cancel</button>
      <button onclick="saveOffer('${id||''}')" class="flex-1 bg-brand-600 hover:bg-brand-500 text-white font-bold py-2.5 rounded-xl">Save</button>
    </div>`);
}
async function saveOffer(id){
  const title = document.getElementById('om-title').value.trim();
  const expiry = document.getElementById('om-expiry').value;
  if (!title || !expiry){ showToast('Offer title and expiry date are required.'); return; }
  const data = { title, description: document.getElementById('om-description').value.trim(), expiry };
  content.offers = id ? content.offers.map(o=>o.id===id?{...o,...data}:o) : [...content.offers, { id:'o'+Date.now(), enabled:true, ...data }];
  await saveShared(CONTENT_KEY, content);
  closeModal(); renderOffers(); showToast('Offer saved.');
}
async function deleteOffer(id){ content.offers = content.offers.filter(o=>o.id!==id); await saveShared(CONTENT_KEY, content); renderOffers(); showToast('Offer deleted.'); }

/* ---------------- Pages ---------------- */
const pageDefs = [
  { id:'home', name:'Home', desc:'Hero, booking widget, key features' },
  { id:'about', name:'About Us', desc:'Company story & credentials' },
  { id:'contact', name:'Contact', desc:'Address, phone, contact form' },
  { id:'gallery', name:'Gallery', desc:'Moments on the Road grid' },
];
function renderPages(){
  document.getElementById('pages-list').innerHTML = pageDefs.map(p => `
    <div class="flex items-center justify-between bg-white dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl p-4">
      <div><div class="font-semibold text-gray-900 dark:text-white text-sm">${esc(p.name)}</div><div class="text-xs text-gray-500">${esc(p.desc)}</div></div>
      <button onclick="editPageContent('${p.id}')" class="inline-flex items-center gap-1.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 text-xs font-semibold px-3.5 py-2 rounded-full"><i class="fa-solid fa-pen"></i> Edit Content</button>
    </div>`).join('');
}
function editPageContent(id){
  const p = pageDefs.find(x=>x.id===id);
  const current = (content.pageContent && content.pageContent[id]) || '';
  openModal(`
    <h3 class="font-display font-bold text-lg text-gray-900 dark:text-white mb-5">Edit "${esc(p.name)}" Content</h3>
    <textarea id="pg-content" rows="5" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 mb-5">${esc(current)}</textarea>
    <div class="flex gap-3">
      <button onclick="closeModal()" class="flex-1 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 font-semibold py-2.5 rounded-xl">Cancel</button>
      <button onclick="savePageContent('${id}')" class="flex-1 bg-brand-600 hover:bg-brand-500 text-white font-bold py-2.5 rounded-xl">Save</button>
    </div>`);
}
async function savePageContent(id){
  content.pageContent = content.pageContent || {};
  content.pageContent[id] = document.getElementById('pg-content').value;
  await saveShared(CONTENT_KEY, content);
  closeModal(); showToast('Page content saved.');
}

/* ---------------- Gallery — Add Moment ---------------- */
let momentImageDraft = null;
let momentsActiveTab = 'all';
const MOMENT_SECTIONS = [
  { id:'gallery', label:'Website Gallery' },
  { id:'landing', label:'Landing Page' },
  { id:'fleet', label:'Our Fleet Vehicles We Have' },
  { id:'destinations', label:'Destination Section' },
  { id:'packages', label:'Package Section' },
];
function renderMomentTabs(){
  const el = document.getElementById('moments-section-tabs');
  if (!el) return;
  const tabs = [{ id:'all', label:'All' }, ...MOMENT_SECTIONS];
  el.innerHTML = tabs.map(t => `
    <button onclick="setMomentsTab('${t.id}')" class="text-xs font-semibold px-3.5 py-2 rounded-full border ${momentsActiveTab===t.id ? 'bg-brand-600 text-white border-brand-600' : 'border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-300'}">${t.label} <span class="opacity-60">(${content.moments.filter(m=>t.id==='all'||m.section===t.id).length})</span></button>`).join('');
}
function setMomentsTab(id){ momentsActiveTab = id; renderMomentTabs(); renderGallery(); }
function renderGallery(){
  renderMomentTabs();
  const el = document.getElementById('gallery-grid');
  const list = content.moments.filter(m => momentsActiveTab==='all' || m.section===momentsActiveTab);
  if (!list.length){ el.innerHTML = '<p class="text-sm text-gray-500">No moments in this section yet — click "Add Moment" to publish one.</p>'; return; }
  el.innerHTML = list.map(g => `
    <div class="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 dark:bg-black border border-black/5 dark:border-white/5 group ${g.hidden ? 'opacity-40' : ''}">
      <img src="${g.image}" class="w-full h-full object-cover" alt="${esc(g.caption||'')}" style="opacity:${(g.opacity ?? 100)/100}">
      <span class="absolute top-2 left-2 text-[9px] font-bold bg-black/60 text-white px-2 py-0.5 rounded-full">${esc((MOMENT_SECTIONS.find(s=>s.id===g.section)||{}).label || g.section)}</span>
      ${g.caption ? `<div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2"><span class="text-white text-[10px] font-semibold">${esc(g.caption)}</span></div>` : ''}
      <div class="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onclick="toggleMomentHidden('${g.id}')" class="w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 text-white grid place-items-center" title="Hide/Unhide"><i class="fa-solid ${g.hidden?'fa-eye-slash':'fa-eye'} text-xs"></i></button>
        <button onclick="openMomentModal('${g.id}')" class="w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 text-white grid place-items-center"><i class="fa-solid fa-pen text-xs"></i></button>
        <button onclick="deleteMoment('${g.id}')" class="w-7 h-7 rounded-lg bg-black/60 hover:bg-red-500/80 text-white grid place-items-center"><i class="fa-solid fa-trash text-xs"></i></button>
      </div>
    </div>`).join('');
}
function openMomentModal(id){
  const g = id ? content.moments.find(x=>x.id===id) : { id:'', caption:'', image:'', section: momentsActiveTab!=='all' ? momentsActiveTab : 'gallery', opacity:100, hidden:false };
  momentImageDraft = g.image || null;
  openModal(`
    <h3 class="font-display font-bold text-lg text-gray-900 dark:text-white mb-5">${id?'Edit':'Add'} Moment</h3>
    <div class="flex flex-col gap-3.5 mb-5">
      <div>
        <label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Image</label>
        <div class="flex items-center gap-3">
          <span id="mm-image-preview" class="w-16 h-16 rounded-lg overflow-hidden bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 grid place-items-center shrink-0">${g.image ? `<img src="${g.image}" class="w-full h-full object-cover" style="opacity:${(g.opacity??100)/100}">` : `<i class="fa-solid fa-image text-gray-400"></i>`}</span>
          <label class="flex-1 flex items-center gap-2 bg-gray-50 dark:bg-black border border-dashed border-black/15 dark:border-white/15 hover:border-brand-600 rounded-xl px-3 py-2.5 cursor-pointer text-sm text-gray-500">
            <i class="fa-solid fa-cloud-arrow-up text-brand-600 dark:text-brand-500"></i> Upload
            <input type="file" accept="image/*" class="hidden" onchange="onMomentImageChange(this)">
          </label>
        </div>
      </div>
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Title / Caption</label><input id="mm-caption" value="${esc(g.caption||'')}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Display In</label>
        <select id="mm-section" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600">
          ${MOMENT_SECTIONS.map(s => `<option value="${s.id}" ${g.section===s.id?'selected':''}>${s.label}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Opacity — <span id="mm-opacity-value">${g.opacity ?? 100}</span>%</label>
        <input id="mm-opacity" type="range" min="10" max="100" value="${g.opacity ?? 100}" oninput="onMomentOpacityInput(this)" class="w-full accent-brand-600">
      </div>
      <label class="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
        <input id="mm-hidden" type="checkbox" ${g.hidden?'checked':''} class="accent-brand-600 w-4 h-4 rounded"> Hide from website (keeps it saved, just not shown)
      </label>
    </div>
    <div class="flex gap-3">
      <button onclick="closeModal()" class="flex-1 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 font-semibold py-2.5 rounded-xl">Cancel</button>
      <button id="mm-save-btn" onclick="saveMoment('${id||''}')" class="flex-1 bg-brand-600 hover:bg-brand-500 text-white font-bold py-2.5 rounded-xl">${id?'Save':'Publish'}</button>
    </div>`);
}
function onMomentOpacityInput(input){
  document.getElementById('mm-opacity-value').textContent = input.value;
  const img = document.querySelector('#mm-image-preview img');
  if (img) img.style.opacity = input.value/100;
}
async function onMomentImageChange(input){
  if (!input.files[0]) return;
  momentImageDraft = await readFileAsDataUrl(input.files[0]);
  const opacity = document.getElementById('mm-opacity')?.value || 100;
  document.getElementById('mm-image-preview').innerHTML = `<img src="${momentImageDraft}" class="w-full h-full object-cover" style="opacity:${opacity/100}">`;
}
async function saveMoment(id){
  if (!momentImageDraft){ showToast('Please upload an image for this moment.'); return; }
  const btn = document.getElementById('mm-save-btn');
  setBtnLoading(btn, true, 'Publishing…');
  try{
    const data = {
      caption: document.getElementById('mm-caption').value.trim(),
      section: document.getElementById('mm-section').value,
      opacity: Number(document.getElementById('mm-opacity').value) || 100,
      hidden: document.getElementById('mm-hidden').checked,
      image: momentImageDraft,
    };
    content.moments = id ? content.moments.map(g=>g.id===id?{...g,...data}:g) : [...content.moments, { id:'g'+Date.now(), ...data }];
    await saveShared(CONTENT_KEY, content);
    closeModal(); renderGallery(); showToast('Moment published — now live on the website.');
  }catch(err){
    showToast('Something went wrong publishing this moment.');
  }finally{ setBtnLoading(btn, false); }
}
async function toggleMomentHidden(id){
  content.moments = content.moments.map(g => g.id===id ? {...g, hidden: !g.hidden} : g);
  await saveShared(CONTENT_KEY, content); renderGallery();
}
async function deleteMoment(id){ content.moments = content.moments.filter(g=>g.id!==id); await saveShared(CONTENT_KEY, content); renderGallery(); showToast('Moment removed.'); }

/* ---------------- Testimonials ---------------- */
function renderTestimonials(){
  const el = document.getElementById('testimonials-grid');
  if (!content.testimonials.length){ el.innerHTML = '<p class="text-sm text-gray-500">No testimonials yet.</p>'; return; }
  el.innerHTML = content.testimonials.map(t => `
    <div class="bg-white dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl p-4">
      <div class="text-brand-600 dark:text-brand-500 mb-2">${Array.from({length:t.rating||5}).map(()=>'<i class="fa-solid fa-star text-xs"></i>').join('')}</div>
      <div class="text-xs text-gray-500 mb-3">${esc(t.review)}</div>
      <div class="flex items-center justify-between">
        <span class="font-semibold text-sm text-gray-900 dark:text-white">${esc(t.name)}</span>
        <div class="flex gap-2">
          <button onclick="openTestimonialModal('${t.id}')" class="w-7 h-7 grid place-items-center rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10"><i class="fa-solid fa-pen text-xs"></i></button>
          <button onclick="deleteTestimonial('${t.id}')" class="w-7 h-7 grid place-items-center rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500"><i class="fa-solid fa-trash text-xs"></i></button>
        </div>
      </div>
    </div>`).join('');
}
function openTestimonialModal(id){
  const t = id ? content.testimonials.find(x=>x.id===id) : { id:'', name:'', rating:5, review:'' };
  openModal(`
    <h3 class="font-display font-bold text-lg text-gray-900 dark:text-white mb-5">${id?'Edit':'Add'} Testimonial</h3>
    <div class="flex flex-col gap-3.5 mb-5">
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Name</label><input id="tm-name" value="${esc(t.name)}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Rating (1-5)</label><input id="tm-rating" type="number" min="1" max="5" value="${t.rating||5}" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600"></div>
      <div><label class="block text-[11px] font-bold text-gray-500 uppercase mb-1.5">Review</label><textarea id="tm-review" rows="3" class="w-full bg-gray-50 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-brand-600">${esc(t.review)}</textarea></div>
    </div>
    <div class="flex gap-3">
      <button onclick="closeModal()" class="flex-1 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 font-semibold py-2.5 rounded-xl">Cancel</button>
      <button onclick="saveTestimonial('${id||''}')" class="flex-1 bg-brand-600 hover:bg-brand-500 text-white font-bold py-2.5 rounded-xl">Save</button>
    </div>`);
}
async function saveTestimonial(id){
  const name = document.getElementById('tm-name').value.trim();
  const review = document.getElementById('tm-review').value.trim();
  if (!name || !review){ showToast('Name and review are required.'); return; }
  const data = { name, rating: Number(document.getElementById('tm-rating').value)||5, review };
  content.testimonials = id ? content.testimonials.map(t=>t.id===id?{...t,...data}:t) : [...content.testimonials, { id:'t'+Date.now(), ...data }];
  await saveShared(CONTENT_KEY, content);
  closeModal(); renderTestimonials(); showToast('Testimonial saved.');
}
async function deleteTestimonial(id){ content.testimonials = content.testimonials.filter(t=>t.id!==id); await saveShared(CONTENT_KEY, content); renderTestimonials(); showToast('Testimonial deleted.'); }

/* ---------------- Contacts ---------------- */
function renderContacts(){
  const el = document.getElementById('contacts-list');
  if (!messages.length){ el.innerHTML = '<p class="text-sm text-gray-500">No messages yet.</p>'; return; }
  el.innerHTML = [...messages].reverse().map(c => `
    <div class="bg-white dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl p-4">
      <div class="flex items-center justify-between mb-2">
        <span class="font-semibold text-sm text-gray-900 dark:text-white">${esc(c.name)} <span class="text-gray-500 font-normal">· ${esc(c.email)}</span></span>
        <button onclick="deleteContact('${c.id}')" class="text-gray-400 hover:text-red-500"><i class="fa-solid fa-trash text-xs"></i></button>
      </div>
      <div class="text-sm text-gray-600 dark:text-gray-400 mb-2">${esc(c.message)}</div>
      <div class="text-[11px] text-gray-500">${c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}</div>
    </div>`).join('');
}
async function deleteContact(id){ messages = messages.filter(c=>c.id!==id); await saveShared(MESSAGES_KEY, messages); renderContacts(); showToast('Message deleted.'); }

/* ---------------- Notifications ---------------- */
function renderNotifBadge(){
  const count = notifications.filter(n=>n.audience==='admin' && !n.read).length;
  [document.getElementById('notif-badge'), document.getElementById('bell-badge')].forEach(b => { if (!b) return; b.textContent = count; b.classList.toggle('hidden', count===0); });
}
function renderNotifications(){
  const el = document.getElementById('notifications-list');
  const list = notifications.filter(n=>n.audience==='admin').reverse();
  if (!list.length){ el.innerHTML = '<p class="text-sm text-gray-500">All caught up — no notifications.</p>'; return; }
  el.innerHTML = list.map(n => `
    <div class="flex items-start gap-3 bg-white dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl p-4 ${n.read?'opacity-60':''}">
      <i class="fa-solid fa-bell text-brand-600 dark:text-brand-500 mt-0.5"></i>
      <div class="flex-1"><div class="text-sm text-gray-800 dark:text-gray-200">${esc(n.message)}</div><div class="text-[11px] text-gray-500 mt-1">${n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</div></div>
      <button onclick="dismissNotification('${n.id}')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><i class="fa-solid fa-xmark text-xs"></i></button>
    </div>`).join('');
}
async function dismissNotification(id){ notifications = notifications.filter(n=>n.id!==id); await saveShared(NOTIFS_KEY, notifications); renderNotifications(); renderNotifBadge(); }
async function clearNotifications(){ notifications = notifications.filter(n=>n.audience!=='admin'); await saveShared(NOTIFS_KEY, notifications); renderNotifications(); renderNotifBadge(); showToast('Notifications cleared.'); }

/* ---------------- Logo upload / Website settings ---------------- */
async function uploadLogo(kind, inputEl){
  if (!inputEl.files[0]) return;
  const dataUrl = await readFileAsDataUrl(inputEl.files[0]);
  content.logos[kind] = dataUrl;
  await saveShared(CONTENT_KEY, content);
  document.getElementById('logo-'+kind+'-preview').innerHTML = `<img src="${dataUrl}" class="w-full h-full object-cover">`;
  showToast((kind==='main'?'Main website logo':'Travels logo') + ' updated — now live on the site.');
}
function fillWebsiteSettingsForm(){
  document.getElementById('ws-name').value = content.company.name;
  document.getElementById('ws-phone').value = content.company.phone;
  document.getElementById('ws-address').value = content.company.address;
  document.getElementById('ws-email').value = content.company.email;
  document.getElementById('ws-map').value = content.company.mapEmbed || '';
  document.getElementById('logo-main-preview').innerHTML = content.logos.main ? `<img src="${content.logos.main}" class="w-full h-full object-cover">` : '<i class="fa-solid fa-cross text-brand-600 dark:text-brand-500"></i>';
  document.getElementById('logo-travels-preview').innerHTML = content.logos.travels ? `<img src="${content.logos.travels}" class="w-full h-full object-cover">` : '<i class="fa-solid fa-plane text-brand-600 dark:text-brand-500"></i>';
}
async function saveWebsiteSettings(){
  const btn = document.getElementById('ws-save');
  setBtnLoading(btn, true, 'Saving…');
  try{
    content.company.name = document.getElementById('ws-name').value.trim();
    content.company.phone = document.getElementById('ws-phone').value.trim();
    content.company.address = document.getElementById('ws-address').value.trim();
    content.company.email = document.getElementById('ws-email').value.trim();
    content.company.mapEmbed = document.getElementById('ws-map').value.trim();
    await saveShared(CONTENT_KEY, content);
    showToast('Website settings saved.');
  }finally{ setBtnLoading(btn, false); }
}

/* ---------------- WhatsApp & Social ---------------- */
function fillSocialLinksForm(){
  document.getElementById('sl-whatsapp').value = content.social.whatsapp || '';
  document.getElementById('sl-facebook').value = content.social.facebook || '';
  document.getElementById('sl-instagram').value = content.social.instagram || '';
  document.getElementById('sl-youtube').value = content.social.youtube || '';
  document.getElementById('sl-linkedin').value = content.social.linkedin || '';
}
async function saveSocialLinks(){
  const btn = document.getElementById('sl-save');
  setBtnLoading(btn, true, 'Saving…');
  try{
    content.social.whatsapp = document.getElementById('sl-whatsapp').value.trim();
    content.social.facebook = document.getElementById('sl-facebook').value.trim();
    content.social.instagram = document.getElementById('sl-instagram').value.trim();
    content.social.youtube = document.getElementById('sl-youtube').value.trim();
    content.social.linkedin = document.getElementById('sl-linkedin').value.trim();
    await saveShared(CONTENT_KEY, content);
    showToast('WhatsApp & social links saved — every WhatsApp button on the site now uses this.');
  }finally{ setBtnLoading(btn, false); }
}

/* ---------------- SEO ---------------- */
function fillSeoForm(){
  document.getElementById('seo-title').value = content.seo.title || '';
  document.getElementById('seo-description').value = content.seo.description || '';
  document.getElementById('seo-keywords').value = content.seo.keywords || '';
}
async function saveSeoSettings(){
  const btn = document.getElementById('seo-save');
  setBtnLoading(btn, true, 'Saving…');
  try{
    content.seo.title = document.getElementById('seo-title').value.trim();
    content.seo.description = document.getElementById('seo-description').value.trim();
    content.seo.keywords = document.getElementById('seo-keywords').value.trim();
    await saveShared(CONTENT_KEY, content);
    showToast('SEO settings saved.');
  }finally{ setBtnLoading(btn, false); }
}

/* ---------------- Theme settings ---------------- */
function fillThemeSettingsForm(){
  const mode = content.theme.mode || 'dark';
  document.getElementById('theme-opt-dark').className = 'flex-1 flex items-center justify-center gap-2 border rounded-xl py-3 text-sm font-semibold ' + (mode==='dark' ? 'border-brand-600 text-brand-600 dark:text-brand-500 bg-brand-600/10' : 'border-black/10 dark:border-white/10 text-gray-500');
  document.getElementById('theme-opt-light').className = 'flex-1 flex items-center justify-center gap-2 border rounded-xl py-3 text-sm font-semibold ' + (mode==='light' ? 'border-brand-600 text-brand-600 dark:text-brand-500 bg-brand-600/10' : 'border-black/10 dark:border-white/10 text-gray-500');
}
async function setSiteDefaultTheme(mode){
  content.theme.mode = mode;
  await saveShared(CONTENT_KEY, content);
  fillThemeSettingsForm();
  document.getElementById('theme-saved-note').textContent = `Site-wide default set to ${mode}. New visitors will see this unless they toggle it themselves.`;
}

/* ---------------- Admin passcode ---------------- */
async function changePasscode(){
  const val = document.getElementById('new-passcode').value.trim();
  if (val.length < 4){ showToast('Passcode should be at least 4 characters.'); return; }
  content.adminPasscode = val;
  await saveShared(CONTENT_KEY, content);
  document.getElementById('new-passcode').value = '';
  showToast('Admin passcode updated.');
}

/* ---------------- Init ---------------- */
function renderAllPanels(){
  renderStats(); renderChart(); renderRecentBookings(); renderVehicleCategories(); renderVehicles();
  renderBookings(); renderPackages(); renderDestinations();
  renderOffers(); renderPages(); renderGallery(); renderTestimonials();
  renderContacts(); renderNotifications(); renderNotifBadge();
}
async function init(){
  content = await loadShared(CONTENT_KEY, emptyContent());
  const theme = await resolveTheme(content);
  applyTheme(theme);
  const alreadyIn = await loadPersonal(ADMIN_SESSION_KEY, false);
  if (alreadyIn){ await enterAdmin(); }
}
init();
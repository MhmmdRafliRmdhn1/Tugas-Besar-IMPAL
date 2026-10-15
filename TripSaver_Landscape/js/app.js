'use strict';

/* ---------- STORAGE ---------- */
const DB = {
  load(k, fb) { try { const v = localStorage.getItem('ts_' + k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  save(k, v) { try { localStorage.setItem('ts_' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('ts_' + k); } catch {} },
};

const state = {
  users: DB.load('users', []),           // {nama,email,pass}
  session: DB.load('session', null),     // email
  trips: [], transactions: [], catatan: [], pesan: [],
  activeTrip: 0, selectedHapus: [], nextId: 1,
  get user() { return this.users.find(u => u.email === this.session) || null; },
  get trip() { return this.trips[this.activeTrip]; },
  get income() { return this.transactions.filter(t => t.type === 'pemasukan' && t.tripId === this.trip?.id); },
  get expense() { return this.transactions.filter(t => t.type === 'pengeluaran' && t.tripId === this.trip?.id); },
  get totalIncome() { return this.income.reduce((s, t) => s + t.nominal, 0); },
  get totalExpense() { return this.expense.reduce((s, t) => s + t.nominal, 0); },
  get sisa() { return (this.trip?.budget || 0) + this.totalIncome - this.totalExpense; },
};

function userKey() { return state.session || 'guest'; }
function persist() {
  DB.save('data_' + userKey(), { trips: state.trips, transactions: state.transactions, catatan: state.catatan, pesan: state.pesan, activeTrip: state.activeTrip, nextId: state.nextId });
}
function restore(email) {
  const d = DB.load('data_' + email, null);
  if (d) { state.trips = d.trips || []; state.transactions = d.transactions || []; state.catatan = d.catatan || []; state.pesan = d.pesan || []; state.activeTrip = d.activeTrip || 0; state.nextId = d.nextId || 1; }
  else seedDemo();
}

/* ---------- NAV ---------- */
const AUTH_PAGES = ['pg-welcome', 'pg-login', 'pg-register', 'pg-input-trip'];
function goto(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById(pageId);
  if (pg) { pg.classList.add('active'); pg.scrollTop = 0; }
  document.getElementById('app-shell').classList.toggle('auth-mode', AUTH_PAGES.includes(pageId));
  document.querySelectorAll('.side-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === pageId));
  if (pageId === 'pg-home') renderHome();
  if (pageId === 'pg-laporan') renderLaporan();
  if (pageId === 'pg-catatan') renderCatatan();
  if (pageId === 'pg-pesan') renderPesan();
  if (pageId === 'pg-trip' || pageId === 'pg-hapus-trip') renderTripList();
  if (pageId === 'pg-edit-trip') openEditTrip();
  updateBadge();
}
function setNav(btn, pageId) {
  if (!requireAuth()) return;
  goto(pageId);
}
function setNavDirect(pageId) { if (requireAuth()) goto(pageId); }
function requireAuth() {
  if (!state.session) { goto('pg-login'); showToast('Silakan login dulu'); return false; }
  return true;
}

/* ---------- AUTH ---------- */
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function doRegister() {
  const nama = document.getElementById('reg-nama').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const p1 = document.getElementById('reg-pass').value;
  const p2 = document.getElementById('reg-pass2').value;
  if (nama.length < 2) return showToast('Masukkan nama lengkap');
  if (!validEmail(email)) return showToast('Email tidak valid');
  if (p1.length < 4) return showToast('Password min. 4 karakter');
  if (p1 !== p2) return showToast('Konfirmasi password tidak sama');
  if (state.users.some(u => u.email === email)) return showToast('Email sudah terdaftar, silakan login');
  state.users.push({ nama, email, pass: btoa(p1) });
  DB.save('users', state.users);
  state.session = email; DB.save('session', email);
  restore(email);
  afterLogin(`Selamat datang, ${nama}! Silakan buat trip pertamamu.`);
  goto('pg-input-trip');
}
function doLogin() {
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;
  if (!validEmail(email)) return showToast('Email tidak valid');
  if (!pass) return showToast('Masukkan password');
  const u = state.users.find(x => x.email === email);
  if (!u) return showToast('Akun tidak ditemukan, daftar dulu yuk');
  if (u.pass !== btoa(pass)) return showToast('Password salah');
  state.session = email; DB.save('session', email);
  restore(email);
  afterLogin(`Halo, ${u.nama}! Selamat datang kembali.`);
  if (state.trips.length === 0) goto('pg-input-trip'); else goto('pg-home');
}
function doLogout() {
  persist();
  state.session = null; DB.del('session');
  state.trips = []; state.transactions = []; state.catatan = []; state.pesan = []; state.activeTrip = 0;
  document.getElementById('login-email').value = '';
  document.getElementById('login-pass').value = '';
  goto('pg-welcome');
  showToast('Kamu sudah keluar. Sampai jumpa!');
}
function afterLogin(msg) {
  const u = state.user;
  document.getElementById('user-name').textContent = u?.nama || 'Traveler';
  document.getElementById('user-email').textContent = u?.email || '-';
  document.getElementById('user-avatar').textContent = (u?.nama || 'T').charAt(0).toUpperCase();
  showToast(msg);
}

/* ---------- HELPERS ---------- */
function rupiah(n) { return 'Rp' + (Number(n) || 0).toLocaleString('id-ID'); }
function todayStr() { return new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); }
function groupLabel(date) {
  if (date === todayStr()) return 'Hari ini';
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yStr = y.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  if (date === yStr) return 'Kemarin';
  return date;
}
function katIcon(kat) {
  const map = { Makanan: '🍔', Transportasi: '🚌', Transport: '🚌', Hiburan: '🎡', Hotel: '🏨', Belanja: '🛍️', Lainnya: '➕', Pemasukan: '💰' };
  return map[kat] || '💵';
}

/* ---------- TRIP ---------- */
function konfirmasiTrip() {
  if (!requireAuth()) return;
  const kota = document.getElementById('inp-kota').value.trim();
  const tanggal = document.getElementById('inp-tanggal').value.trim();
  const budget = parseFloat(document.getElementById('inp-budget').value);
  if (!kota) return showToast('Masukkan nama kota');
  if (!tanggal) return showToast('Masukkan tanggal');
  if (!budget || budget <= 0) return showToast('Masukkan budget yang valid');
  const i = state.trips.findIndex(t => t.kota.toLowerCase() === kota.toLowerCase());
  if (i >= 0) state.activeTrip = i;
  else { state.trips.unshift({ id: Date.now(), kota, tanggal, budget, desc: '' }); state.activeTrip = 0; }
  persist(); goto('pg-home');
  showToast(`Trip ke ${kota} siap!`);
}

/* ---------- HOME ---------- */
function renderHome() {
  if (!state.session) return;
  const trip = state.trip;
  if (!trip) { goto('pg-input-trip'); return; }
  document.getElementById('home-kota').textContent = trip.kota;
  document.getElementById('home-budget').textContent = rupiah(trip.budget);
  document.getElementById('home-range').textContent = trip.tanggal;
  document.getElementById('home-sisa').textContent = `Sisa: ${rupiah(state.sisa)}`;
  const pct = trip.budget > 0 ? Math.min(100, Math.round((state.totalExpense / trip.budget) * 100)) : 0;
  document.getElementById('pct-used').textContent = pct + '%';
  document.getElementById('pct-used-2').textContent = pct + '%';
  document.getElementById('budget-fill').style.width = pct + '%';
  const all = state.transactions.filter(t => t.tripId === trip.id);
  const recent = [...all].reverse().slice(0, 6);
  document.getElementById('home-transaksi').innerHTML = recent.length ? recent.map(t => `
    <div class="trx-item"><div class="trx-left"><div class="trx-dot">${katIcon(t.kat)}</div>
    <div><div class="trx-name">${t.kat}</div><div class="trx-date">${t.desc ? t.desc + ' · ' : ''}${t.date}</div></div></div>
    <div class="trx-amount ${t.type === 'pemasukan' ? 'plus' : 'minus'}">${t.type === 'pemasukan' ? '+' : '-'}${rupiah(t.nominal)}</div></div>`).join('')
    : '<p class="empty-msg">Belum ada transaksi. Klik kategori untuk menambah.</p>';
}

/* ---------- TAMBAH ---------- */
function openTambah(kat) {
  if (!requireAuth()) return;
  goto('pg-tambah');
  switchTambahTab(document.getElementById('tab-keluar-btn'), 'pengeluaran');
  document.querySelectorAll('.kat-sel-item').forEach(el => el.classList.toggle('selected', el.dataset.kat === kat));
}
function switchTambahTab(btn, tab) {
  document.querySelectorAll('#pg-tambah .seg-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('form-pemasukan').style.display = tab === 'pemasukan' ? 'flex' : 'none';
  document.getElementById('form-pengeluaran').style.display = tab === 'pengeluaran' ? 'flex' : 'none';
}
function tambahTransaksi(type) {
  const trip = state.trip;
  if (!trip) { showToast('Buat trip dulu'); goto('pg-input-trip'); return; }
  let nominal, desc, kat;
  if (type === 'pemasukan') {
    nominal = parseFloat(document.getElementById('inp-nominal-masuk').value);
    desc = document.getElementById('inp-desc-masuk').value.trim();
    kat = 'Pemasukan';
  } else {
    nominal = parseFloat(document.getElementById('inp-nominal-keluar').value);
    desc = document.getElementById('inp-desc-keluar').value.trim();
    const sel = document.querySelector('.kat-sel-item.selected');
    kat = sel ? sel.dataset.kat : 'Lainnya';
  }
  if (!nominal || nominal <= 0) return showToast('Masukkan nominal yang valid');
  state.transactions.push({ id: state.nextId++, type, kat, nominal, desc, date: todayStr(), tripId: trip.id });
  state.pesan.push({ id: state.nextId++, text: type === 'pemasukan' ? `Pemasukan ${rupiah(nominal)} berhasil dicatat.` : `Pengeluaran ${kat} ${rupiah(nominal)} berhasil dicatat.`, date: todayStr() });
  persist();
  ['inp-nominal-masuk', 'inp-desc-masuk', 'inp-nominal-keluar', 'inp-desc-keluar'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('success-msg').textContent = type === 'pemasukan' ? 'Pemasukan berhasil' : 'Pengeluaran berhasil';
  goto('pg-success');
  setTimeout(() => goto('pg-home'), 1800);
}

/* ---------- LAPORAN ---------- */
let chartMasuk = null, chartKeluar = null;
function renderLaporan() { renderLapSection('pemasukan'); renderLapSection('pengeluaran'); }
function renderLapSection(type) {
  const data = type === 'pemasukan' ? state.income : state.expense;
  const grouped = {};
  data.forEach(t => { grouped[t.kat] = (grouped[t.kat] || 0) + t.nominal; });
  const keys = Object.keys(grouped), vals = keys.map(k => grouped[k]);
  const colors = ['#8e44ad', '#e9a8e8', '#5b2a86', '#c39bd3', '#f3c6f1', '#a06cd5'];
  const cid = type === 'pemasukan' ? 'chart-masuk' : 'chart-keluar';
  const lid = type === 'pemasukan' ? 'legend-masuk' : 'legend-keluar';
  const list = type === 'pemasukan' ? 'list-masuk' : 'list-keluar';
  const cv = document.getElementById(cid);
  if (cv) {
    if (type === 'pemasukan' && chartMasuk) { chartMasuk.destroy(); chartMasuk = null; }
    if (type === 'pengeluaran' && chartKeluar) { chartKeluar.destroy(); chartKeluar = null; }
    const nc = new Chart(cv.getContext('2d'), {
      type: 'pie',
      data: { labels: keys.length ? keys : ['Kosong'], datasets: [{ data: keys.length ? vals : [1], backgroundColor: keys.length ? colors.slice(0, keys.length) : ['#eee'], borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: false, plugins: { legend: { display: false }, tooltip: { enabled: keys.length > 0 } } },
    });
    if (type === 'pemasukan') chartMasuk = nc; else chartKeluar = nc;
  }
  document.getElementById(lid).innerHTML = keys.length
    ? keys.map((k, i) => `<div class="legend-item"><div class="legend-dot" style="background:${colors[i % colors.length]}"></div><span>${k} — ${rupiah(grouped[k])}</span></div>`).join('')
    : '<div class="legend-item"><div class="legend-dot" style="background:#eee"></div><span>Belum ada data</span></div>';
  const el = document.getElementById(list);
  if (!data.length) { el.innerHTML = `<p class="empty-msg">Belum ada ${type}</p>`; return; }
  const byDate = {};
  data.forEach(t => { (byDate[t.date] = byDate[t.date] || []).push(t); });
  el.innerHTML = Object.keys(byDate).reverse().map(d => `
    <div><div class="lap-date-label">${groupLabel(d)}</div>
    ${[...byDate[d]].reverse().map(t => `
      <div class="lap-trx-item"><div><div class="trx-name">${t.kat}</div><div class="trx-date">${t.desc || ''} · ${t.date}</div></div>
      <div class="trx-amount" style="color:${type === 'pemasukan' ? '#27ae60' : '#e74c3c'}">${type === 'pemasukan' ? '+' : '-'}${rupiah(t.nominal)}</div></div>`).join('')}</div>`).join('');
}
function switchLapTab(btn, tab) {
  document.querySelectorAll('#pg-laporan .seg-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('lap-pemasukan').style.display = tab === 'pemasukan' ? 'block' : 'none';
  document.getElementById('lap-pengeluaran').style.display = tab === 'pengeluaran' ? 'block' : 'none';
  renderLaporan();
}

/* ---------- CATATAN & PESAN ---------- */
function openAddCatatan() { document.getElementById('inp-catatan').value = ''; document.getElementById('modal-catatan').style.display = 'flex'; }
function saveCatatan() {
  const text = document.getElementById('inp-catatan').value.trim();
  if (!text) return showToast('Tulis catatan dulu');
  state.catatan.push({ id: state.nextId++, text, date: todayStr() });
  persist(); closeModal('modal-catatan'); renderCatatan();
  showToast('Catatan disimpan');
}
function renderCatatan() {
  const el = document.getElementById('catatan-list');
  if (!el) return;
  if (!state.catatan.length) { el.innerHTML = '<p class="empty-msg">Belum ada catatan</p>'; return; }
  const byDate = {};
  state.catatan.forEach(c => { (byDate[c.date] = byDate[c.date] || []).push(c); });
  el.innerHTML = Object.entries(byDate).reverse().map(([d, items]) => `
    <div><div class="msg-date">${groupLabel(d)}</div>
    ${items.map(c => `<div class="msg-card"><b>New Note</b>${escapeHtml(c.text)}<br/><small>${d}<span class="x" onclick="deleteCatatan(${c.id})"> ✕ hapus</span></small></div>`).join('')}</div>`).join('');
}
function deleteCatatan(id) { state.catatan = state.catatan.filter(c => c.id !== id); persist(); renderCatatan(); }
function renderPesan() {
  const el = document.getElementById('pesan-list');
  if (!el) return;
  if (!state.pesan.length) { el.innerHTML = '<p class="empty-msg">Belum ada pesan</p>'; return; }
  const byDate = {};
  state.pesan.forEach(p => { (byDate[p.date] = byDate[p.date] || []).push(p); });
  el.innerHTML = Object.entries(byDate).reverse().map(([d, items]) => `
    <div><div class="msg-date">${groupLabel(d)}</div>
    ${items.map(p => `<div class="msg-card">${escapeHtml(p.text)}<br/><small>${d}</small></div>`).join('')}</div>`).join('');
  updateBadge();
}
function updateBadge() {
  const b = document.getElementById('badge-pesan');
  if (!b) return;
  const n = state.pesan.length;
  b.style.display = n ? 'flex' : 'none';
  b.textContent = n > 99 ? '99+' : n;
}

/* ---------- TRIP CRUD ---------- */
function renderTripList() {
  const el = document.getElementById('trip-list');
  if (el) el.innerHTML = state.trips.length ? state.trips.map((t, i) => `
    <div class="t-line ${i === state.activeTrip ? 'active' : ''}" onclick="selectTrip(${i})">
      <div class="t-dot"></div><div><div class="t-city">${escapeHtml(t.kota)}</div><div class="t-sub">${escapeHtml(t.tanggal)} · ${rupiah(t.budget)}</div></div>
    </div>`).join('') : '<p class="empty-msg">Belum ada trip</p>';
  const h = document.getElementById('hapus-trip-list');
  if (h) h.innerHTML = state.trips.map(t => `
    <div class="t-line"><div class="t-dot"></div>
      <div style="flex:1"><div class="t-city">${escapeHtml(t.kota)}</div><div class="t-sub">${escapeHtml(t.tanggal)}</div></div>
      <input type="checkbox" ${state.selectedHapus.includes(t.id) ? 'checked' : ''} onchange="toggleHapus(${t.id})" />
    </div>`).join('');
}
function selectTrip(i) { state.activeTrip = i; persist(); goto('pg-home'); showToast(`Trip ke ${state.trip.kota} dipilih`); }
function toggleHapus(id) {
  const i = state.selectedHapus.indexOf(id);
  if (i >= 0) state.selectedHapus.splice(i, 1); else state.selectedHapus.push(id);
}
function hapusTrip() {
  if (!state.selectedHapus.length) return showToast('Pilih trip yang ingin dihapus');
  state.trips = state.trips.filter(t => !state.selectedHapus.includes(t.id));
  state.selectedHapus = [];
  if (state.activeTrip >= state.trips.length) state.activeTrip = 0;
  persist(); renderTripList(); goto('pg-trip');
  showToast('Trip dihapus');
}
function openEditTrip() {
  const t = state.trip; if (!t) return;
  document.getElementById('seb-kota').textContent = t.kota;
  document.getElementById('seb-info').textContent = `${t.tanggal} · ${rupiah(t.budget)}`;
}
function konfirmasiEdit() {
  const t = state.trip; if (!t) return;
  const kota = document.getElementById('edit-kota').value.trim();
  const tanggal = document.getElementById('edit-tanggal').value.trim();
  const budget = parseFloat(document.getElementById('edit-budget').value);
  const desc = document.getElementById('edit-desc').value.trim();
  if (!kota && !tanggal && !budget && !desc) return showToast('Isi minimal satu field');
  if (kota) t.kota = kota;
  if (tanggal) t.tanggal = tanggal;
  if (budget && budget > 0) t.budget = budget;
  if (desc) t.desc = desc;
  persist(); goto('pg-trip');
  showToast('Trip diperbarui');
}
function tambahTrip() {
  const kota = document.getElementById('new-kota').value.trim();
  const tanggal = document.getElementById('new-tanggal').value.trim();
  const budget = parseFloat(document.getElementById('new-budget').value);
  const desc = document.getElementById('new-desc').value.trim();
  if (!kota) return showToast('Masukkan nama kota');
  if (!budget || budget <= 0) return showToast('Masukkan budget yang valid');
  state.trips.push({ id: Date.now(), kota, tanggal: tanggal || todayStr(), budget, desc });
  ['new-kota', 'new-tanggal', 'new-budget', 'new-desc'].forEach(id => { document.getElementById(id).value = ''; });
  persist(); goto('pg-trip');
  showToast(`Trip ke ${kota} ditambahkan!`);
}

/* ---------- UTIL ---------- */
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
let _toastTimer;
function showToast(msg) {
  let t = document.getElementById('_toast');
  if (!t) {
    t = document.createElement('div'); t.id = '_toast';
    t.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#2c1654;color:#fff;border-radius:30px;padding:11px 24px;font-size:.82rem;font-family:Poppins,sans-serif;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.35);transition:opacity .25s;max-width:90vw;text-align:center;';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 2300);
}
function seedDemo() {
  const trip = { id: 1, kota: 'Bandung', tanggal: '23 Januari 2025', budget: 5400000, desc: 'Liburan' };
  state.trips = [trip,
    { id: 2, kota: 'Surabaya', tanggal: '5 Februari 2025', budget: 4000000, desc: 'Bisnis' },
    { id: 3, kota: 'Makassar', tanggal: '15 Maret 2025', budget: 6000000, desc: 'Wisata' }];
  state.activeTrip = 0; state.nextId = 1;
  state.transactions = [
    { id: state.nextId++, type: 'pengeluaran', kat: 'Makanan', nominal: 1200000, desc: 'Kuliner', date: '14 Januari 2025', tripId: 1 },
    { id: state.nextId++, type: 'pengeluaran', kat: 'Transportasi', nominal: 800000, desc: 'Kereta', date: '13 Januari 2025', tripId: 1 },
    { id: state.nextId++, type: 'pengeluaran', kat: 'Hotel', nominal: 1300000, desc: 'Hotel', date: '11 Januari 2025', tripId: 1 },
    { id: state.nextId++, type: 'pemasukan', kat: 'Pemasukan', nominal: 1300000, desc: 'Top up', date: '9 Januari 2025', tripId: 1 },
  ];
  state.pesan = [{ id: state.nextId++, text: 'Selamat datang di TripSaver! Catat setiap pemasukan & pengeluaran trip-mu di sini.', date: todayStr() }];
  state.catatan = [{ id: state.nextId++, text: 'Jangan lupa siapkan budget darurat 10% dari total anggaran.', date: todayStr() }];
  persist();
}

/* ---------- INIT ---------- */
document.addEventListener('DOMContentLoaded', function () {
  const sel = document.getElementById('kat-selector');
  if (sel) sel.addEventListener('click', e => {
    const item = e.target.closest('.kat-sel-item');
    if (!item) return;
    document.querySelectorAll('.kat-sel-item').forEach(el => el.classList.remove('selected'));
    item.classList.add('selected');
  });
  document.getElementById('login-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('reg-pass2')?.addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
  if (state.session && state.user) {
    restore(state.session);
    afterLogin(`Halo, ${state.user.nama}!`);
    if (!state.trips.length) seedDemo();
    goto(state.trips.length ? 'pg-home' : 'pg-input-trip');
  } else {
    goto('pg-welcome');
  }
});

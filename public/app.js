// ===================================================
// AYSA GLOBAL GAYRİMENKUL - MOBİL OFİS MOTORU
// Balıkesir Altıeylül Portföy & Talep Havuzu
// ===================================================

let state = {
  currentUser: null,
  isAdminLoggedIn: false,
  isClientView: false,
  users: [],
  listings: [],
  demands: [],
  matches: [],
  notifications: [],
  lastNotifId: null,
  stats: null,
  activeTab: 'havuz',
  filters: {
    search: '',
    type: 'all',
    status: 'all',
    consultantId: 'all'
  },
  newPhotos: [],
  editPhotos: [],
  isUploading: false,
  serverInfo: null
};

// Turkish Character Normalization for Search & Filter
function trNormalize(str) {
  if (!str) return '';
  return String(str)
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  await fetchServerInfo();
  await loadUsers();
  await loadListings();
  await loadDemands();
  await loadMatches();
  await loadStats();
  await loadNotifications();

  // Check if admin was previously logged in
  if (localStorage.getItem('aysa_admin_token')) {
    state.isAdminLoggedIn = true;
  }

  // Periodic notification check (every 5 seconds)
  setInterval(checkNewNotifications, 5000);

  // Check URL params for direct listing sharing (?listing=lst-XX or #lst-XX)
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get('listing') || (window.location.hash ? window.location.hash.substring(1) : null);
  if (urlParams.get('client') === '1') {
    state.isClientView = true;
  }
  if (targetId) {
    setTimeout(() => {
      openListingDetail(targetId);
    }, 400);
  }

  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('SW note:', err);
    });
  }
});

// Format Currency
function formatTL(num) {
  if (num === null || num === undefined) return '0 ₺';
  return Number(num).toLocaleString('tr-TR') + ' ₺';
}

// Fetch Server Info (QR Code & IP)
async function fetchServerInfo() {
  try {
    const res = await fetch('/api/info');
    state.serverInfo = await res.json();
    if (state.serverInfo.qrCodeData) {
      document.getElementById('qr-code-img').src = state.serverInfo.qrCodeData;
    }
    if (state.serverInfo.networkUrl) {
      document.getElementById('qr-network-url').innerText = state.serverInfo.networkUrl;
    }
  } catch (e) {
    console.error('Info fetch failed:', e);
  }
}

// Load Users & Set Active User
async function loadUsers() {
  try {
    const res = await fetch('/api/users');
    state.users = await res.json();

    const savedUserId = localStorage.getItem('aysa_active_user_id');
    const matched = state.users.find(u => u.id === savedUserId);
    // Default to Murat Özcan (Admin)
    state.currentUser = matched || state.users[0] || { name: 'Murat Özcan', role: 'MURAT ÖZCAN (ADMİN)', id: 'u1', avatar: 'MÖ', isAdmin: true };

    updateCurrentUserUI();
    populateConsultantDropdowns();
  } catch (e) {
    console.error('Failed to load users:', e);
  }
}

function updateCurrentUserUI() {
  if (!state.currentUser) return;
  const avatarEl = document.getElementById('current-user-avatar');
  if (avatarEl) avatarEl.innerText = state.currentUser.avatar || state.currentUser.name.substring(0, 2);
  const nameEl = document.getElementById('current-user-name');
  if (nameEl) {
    if (state.currentUser.isAdmin || state.currentUser.id === 'u1') {
      nameEl.innerText = 'MURAT ÖZCAN (ADMİN)';
    } else {
      nameEl.innerText = `${state.currentUser.name} (${state.currentUser.role || 'Danışman'})`;
    }
  }
}

function handleUserBtnClick() {
  if (!state.isAdminLoggedIn && (!state.currentUser || !state.currentUser.isAdmin)) {
    document.getElementById('admin-user-input').value = '';
    document.getElementById('admin-pass-input').value = '';
    openModal('modal-admin-login');
  } else {
    // If admin is active, allow switching user
    const list = state.users.map((u, i) => `${i + 1}) ${u.name} - ${u.role}`).join('\n');
    const input = prompt(`Aktif Kullanıcı: ${state.currentUser.name}\n\nKullanıcı değiştirmek için sıra no yazın:\n${list}\n\n(Yönetici oturumunu kapatmak için 'cikis' yazın)`);
    if (input === 'cikis') {
      state.isAdminLoggedIn = false;
      localStorage.removeItem('aysa_admin_token');
      const nonAdmin = state.users.find(u => !u.isAdmin) || state.users[1] || state.users[0];
      state.currentUser = nonAdmin;
      localStorage.setItem('aysa_active_user_id', nonAdmin.id);
      updateCurrentUserUI();
      populateConsultantDropdowns();
      alert('Yönetici oturumu kapatıldı.');
    } else if (input) {
      const idx = parseInt(input.trim()) - 1;
      if (idx >= 0 && idx < state.users.length) {
        state.currentUser = state.users[idx];
        localStorage.setItem('aysa_active_user_id', state.currentUser.id);
        updateCurrentUserUI();
        populateConsultantDropdowns();
        alert(`Aktif kullanıcı: ${state.currentUser.name}`);
      }
    }
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const username = document.getElementById('admin-user-input').value.trim();
  const password = document.getElementById('admin-pass-input').value.trim();

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      state.isAdminLoggedIn = true;
      state.currentUser = data.user;
      localStorage.setItem('aysa_active_user_id', data.user.id);
      localStorage.setItem('aysa_admin_token', data.token);

      updateCurrentUserUI();
      populateConsultantDropdowns();
      closeModal('modal-admin-login');
      alert('Yönetim Girişi Başarılı! (Admin yetkileri aktif)');
      await loadListings();
      await loadStats();
    } else {
      alert(data.error || 'Hatalı kullanıcı adı veya şifre!');
      document.getElementById('admin-pass-input').value = '';
    }
  } catch (err) {
    console.error('Login error:', err);
    alert('Giriş yapılırken sunucu hatası oluştu.');
  }
}

function openAddConsultantModal() {
  if (!state.isAdminLoggedIn && (!state.currentUser || !state.currentUser.isAdmin)) {
    alert('Danışman eklemek için lütfen önce Yönetim Girişi yapınız.');
    openModal('modal-admin-login');
    return;
  }
  document.getElementById('new-consultant-name').value = '';
  document.getElementById('new-consultant-phone').value = '';
  openModal('modal-add-consultant');
}

async function handleAddConsultant(e) {
  e.preventDefault();
  const name = document.getElementById('new-consultant-name').value.trim();
  const role = document.getElementById('new-consultant-role').value.trim();
  const phone = document.getElementById('new-consultant-phone').value.trim();

  if (!name) return alert('Danışman adı zorunludur.');

  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role, phone })
    });

    if (res.ok) {
      closeModal('modal-add-consultant');
      await loadUsers();
      await loadStats();
      alert(`Danışman "${name}" başarıyla eklendi!`);
    } else {
      const err = await res.json();
      alert(err.error || 'Danışman eklenirken hata oluştu.');
    }
  } catch (err) {
    console.error('Add consultant error:', err);
  }
}

async function deleteConsultant(id) {
  if (!state.isAdminLoggedIn && (!state.currentUser || !state.currentUser.isAdmin)) {
    alert('Danışman silmek için Yönetim Girişi yapmalısınız.');
    openModal('modal-admin-login');
    return;
  }
  if (!confirm('Bu danışmanı ofis kadrosundan silmek istediğinize emin misiniz?')) return;

  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadUsers();
      await loadStats();
      alert('Danışman silindi.');
    } else {
      const err = await res.json();
      alert(err.error || 'Danışman silinemedi.');
    }
  } catch (err) {
    console.error('Delete consultant error:', err);
  }
}

let activeClientQrInfo = null;

async function openListingQrModal(listingId) {
  const item = state.listings.find(l => l.id === listingId);
  if (!item) return;

  try {
    const res = await fetch(`/api/listings/${listingId}/qr`);
    const data = await res.json();
    if (data.success && data.qrData) {
      activeClientQrInfo = data;
      document.getElementById('listing-qr-image').src = data.qrData;
      document.getElementById('listing-qr-modal-title').innerText = `📲 ${item.title.substring(0, 24)}... QR Kodu`;
      openModal('modal-listing-qr');
    } else {
      alert('QR kod oluşturulamadı.');
    }
  } catch (err) {
    console.error('QR fetch error:', err);
    alert('QR kod sunucu hatası.');
  }
}

function copyClientLinkFromQR() {
  if (!activeClientQrInfo || !activeClientQrInfo.clientUrl) return;
  navigator.clipboard.writeText(activeClientQrInfo.clientUrl).then(() => {
    alert('Müşteri sunum linki panoya kopyalandı:\n' + activeClientQrInfo.clientUrl);
  }).catch(() => {
    prompt('Müşteri linkini kopyalayabilirsiniz:', activeClientQrInfo.clientUrl);
  });
}

function shareWhatsAppFromQR() {
  if (!activeClientQrInfo || !activeClientQrInfo.clientUrl) return;
  const msg = encodeURIComponent(
    `🏢 *AYSA GAYRİMENKUL PORTFÖY SUNUMU*\n\n` +
    `📍 *${activeClientQrInfo.title}*\n` +
    `💰 *Fiyat:* ${formatTL(activeClientQrInfo.price)}\n` +
    `👤 *Danışman:* ${activeClientQrInfo.consultantName || 'Murat Özcan'} (${activeClientQrInfo.consultantPhone || ''})\n\n` +
    `🔗 *Detaylı Fotoğraf ve Parsel Bilgileri:*\n${activeClientQrInfo.clientUrl}`
  );
  window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
}

function populateConsultantDropdowns() {
  const selects = ['new-consultant', 'demand-consultant'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = state.users.map(u => `
      <option value="${u.id}" ${state.currentUser && state.currentUser.id === u.id ? 'selected' : ''}>
        ${u.name} (${u.role})
      </option>
    `).join('');
  });
}

// --- NOTIFICATIONS SYSTEM ---
async function loadNotifications() {
  try {
    const res = await fetch('/api/notifications');
    state.notifications = await res.json();
    updateNotifBadge();
    if (state.notifications.length > 0) {
      state.lastNotifId = state.notifications[0].id;
    }
  } catch (e) {
    console.error('Failed to load notifications:', e);
  }
}

async function checkNewNotifications() {
  try {
    const res = await fetch('/api/notifications');
    const list = await res.json();
    if (!state.lastNotifId && list.length > 0) {
      state.lastNotifId = list[0].id;
      return;
    }
    if (list.length > 0 && state.lastNotifId && list[0].id !== state.lastNotifId) {
      state.lastNotifId = list[0].id;
      state.notifications = list;
      updateNotifBadge();
      showToastNotification(list[0]);
    }
  } catch (e) {
    // silently ignore background poll errors
  }
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-badge-count');
  if (badge) {
    badge.innerText = state.notifications.length;
    badge.style.display = state.notifications.length > 0 ? 'flex' : 'none';
  }
}

function showToastNotification(notif) {
  const toast = document.getElementById('toast-notification-banner');
  document.getElementById('toast-title').innerText = notif.title;
  document.getElementById('toast-desc').innerText = notif.message;
  toast.classList.add('show');
  
  // Auto hide after 6 seconds
  setTimeout(() => {
    toast.classList.remove('show');
  }, 6000);
}

function openNotificationsModal() {
  const body = document.getElementById('notifications-body');
  if (state.notifications.length === 0) {
    body.innerHTML = '<p style="color: #94a3b8; text-align: center;">Henüz bildirim bulunmuyor.</p>';
  } else {
    body.innerHTML = state.notifications.map(n => `
      <div style="background: #111316; border: 1px solid #2e3540; border-radius: 10px; padding: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <strong style="color: #fff; font-size: 0.95rem;">${n.title}</strong>
          <small style="color: var(--primary-light); font-size: 0.75rem;">${new Date(n.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</small>
        </div>
        <p style="color: #cbd5e1; font-size: 0.85rem; margin-bottom: 6px;">${n.message}</p>
        <div style="font-size: 0.75rem; color: #64748b;">Gönderen: ${n.sender}</div>
      </div>
    `).join('');
  }
  openModal('modal-notifications-list');
}

function openBroadcastModal() {
  if (!state.isAdminLoggedIn && (!state.currentUser || !state.currentUser.isAdmin)) {
    alert('Bu özelliği sadece MURAT ÖZCAN (ADMİN) kullanabilir. Lütfen önce Yönetim Girişi yapın.');
    openModal('modal-admin-login');
    return;
  }
  openModal('modal-broadcast-notif');
}

async function handleSendBroadcast(e) {
  e.preventDefault();
  const title = document.getElementById('broadcast-title').value.trim();
  const message = document.getElementById('broadcast-msg').value.trim();

  try {
    const res = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        message,
        sender: 'MURAT ÖZCAN (ADMİN)'
      })
    });

    if (res.ok) {
      closeModal('modal-broadcast-notif');
      document.getElementById('broadcast-title').value = '';
      document.getElementById('broadcast-msg').value = '';
      await loadNotifications();
      alert('🚀 Bildirim tüm ekibe başarıyla gönderildi!');
    }
  } catch (err) {
    console.error('Broadcast error:', err);
    alert('Bildirim gönderilirken hata oluştu.');
  }
}

// --- DATA LOADERS ---
async function loadListings() {
  try {
    let url = '/api/listings?';
    if (state.filters.type !== 'all') url += `type=${state.filters.type}&`;
    if (state.filters.status !== 'all') url += `status=${state.filters.status}&`;
    if (state.filters.search) url += `search=${encodeURIComponent(state.filters.search)}&`;

    const res = await fetch(url);
    state.listings = await res.json();
    renderListings();
    renderStories();
    updateBadges();
  } catch (e) {
    console.error('Failed to load listings:', e);
  }
}

async function loadDemands() {
  try {
    const res = await fetch('/api/demands');
    state.demands = await res.json();
    renderDemands();
    updateBadges();
  } catch (e) {
    console.error('Failed to load demands:', e);
  }
}

async function loadMatches() {
  try {
    const res = await fetch('/api/matches');
    state.matches = await res.json();
    renderMatches();
    updateBadges();
  } catch (e) {
    console.error('Failed to load matches:', e);
  }
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    state.stats = await res.json();
    renderMuratDashboard();
  } catch (e) {
    console.error('Failed to load stats:', e);
  }
}

function updateBadges() {
  document.getElementById('badge-listings-count').innerText = state.listings.length;
  document.getElementById('badge-demands-count').innerText = state.demands.length;
  document.getElementById('badge-matches-count').innerText = state.matches.length;
  document.getElementById('filtered-stats-label').innerText = `${state.listings.length} Altıeylül Portföyü Listeleniyor`;
}

// --- TAB NAVIGATION ---
function switchTab(tabId) {
  state.activeTab = tabId;
  const tabs = ['havuz', 'talepler', 'eslesmeler', 'murat'];

  tabs.forEach(t => {
    const view = document.getElementById(`view-${t}`);
    const btn = document.getElementById(`tab-${t}`);
    const bnav = document.getElementById(`bnav-${t}`);

    if (t === tabId) {
      if (view) view.style.display = 'block';
      if (btn) btn.classList.add('active');
      if (bnav) bnav.classList.add('active');
    } else {
      if (view) view.style.display = 'none';
      if (btn) btn.classList.remove('active');
      if (bnav) bnav.classList.remove('active');
    }
  });

  const filterBox = document.getElementById('filter-container');
  const storiesBox = document.getElementById('new-listings-section');
  if (tabId === 'havuz') {
    filterBox.style.display = 'flex';
    storiesBox.style.display = 'block';
    document.getElementById('fab-label').innerText = 'Yeni İlan';
  } else if (tabId === 'talepler') {
    filterBox.style.display = 'none';
    storiesBox.style.display = 'none';
    document.getElementById('fab-label').innerText = 'Yeni Talep';
  } else {
    filterBox.style.display = 'none';
    storiesBox.style.display = 'none';
    document.getElementById('fab-label').innerText = 'Yeni İlan';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleFabClick() {
  if (state.activeTab === 'talepler') {
    openAddDemandModal();
  } else {
    openAddListingModal();
  }
}

// --- FILTERING ---
function handleSearch() {
  const query = document.getElementById('search-input').value.trim();
  state.filters.search = query;
  updateFilterResetButton();
  loadListings();
}

function setChipFilter(key, value, el) {
  if (state.filters[key] === value && value !== 'all') {
    state.filters[key] = 'all';
    if (el) el.classList.remove('active');
  } else {
    state.filters[key] = value;
    const parent = el.parentElement;
    parent.querySelectorAll(`[data-${key}]`).forEach(chip => chip.classList.remove('active'));
    el.classList.add('active');
  }
  updateFilterResetButton();
  loadListings();
}

function updateFilterResetButton() {
  const isAnyFilter = state.filters.type !== 'all' || state.filters.status !== 'all' || (state.filters.search && state.filters.search.length > 0);
  const chipAll = document.getElementById('chip-all');
  const btnClear = document.getElementById('btn-clear-filters');
  if (chipAll) chipAll.classList.toggle('active', !isAnyFilter);
  if (btnClear) btnClear.style.display = isAnyFilter ? 'inline-block' : 'none';
}

function clearAllFilters() {
  state.filters.type = 'all';
  state.filters.status = 'all';
  state.filters.search = '';
  state.filters.consultantId = 'all';

  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  document.querySelectorAll('.chip-item').forEach(c => c.classList.remove('active'));
  const chipAll = document.getElementById('chip-all');
  if (chipAll) chipAll.classList.add('active');
  const btnClear = document.getElementById('btn-clear-filters');
  if (btnClear) btnClear.style.display = 'none';

  loadListings();
}

// --- RENDER STORIES (YENİ EKLENENLER) ---
function renderStories() {
  const container = document.getElementById('stories-strip');
  if (!container) return;

  const newest = [...state.listings].slice(0, 6);
  if (newest.length === 0) {
    container.innerHTML = '<div style="color: #64748b; font-size: 0.85rem; padding: 10px;">Henüz ilan eklenmedi.</div>';
    return;
  }

  container.innerHTML = newest.map(item => {
    const hasPhoto = item.photos && item.photos.length > 0;
    return `
      <div class="story-card" onclick="openListingDetail('${item.id}')">
        <div class="story-badge">YENİ</div>
        ${hasPhoto ? `
          <img src="${item.photos[0]}" class="story-img" alt="${item.title}" onerror="this.onerror=null;this.src='/aysa_logo.png'">
        ` : `
          <div class="story-img" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
            <img src="/aysa_logo.png" style="width: 38px; height: 38px; object-fit: contain; opacity: 0.85;">
          </div>
        `}
        <div class="story-info">
          <div class="story-price">${formatTL(item.price)}</div>
          <div class="story-title">${item.title}</div>
        </div>
      </div>
    `;
  }).join('');
}

// --- RENDER LISTINGS (İLAN HAVUZU) ---
function renderListings() {
  const container = document.getElementById('listings-grid');
  if (!container) return;

  if (state.listings.length === 0) {
    const isFiltered = (state.filterType && state.filterType !== 'all') || 
                       (state.filterStatus && state.filterStatus !== 'all') || 
                       (state.filterDistrict && state.filterDistrict !== 'all') || 
                       (state.searchQuery && state.searchQuery.trim().length > 0);
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: #1a1e24; border-radius: 16px; border: 1px dashed #2e3540;">
        <div style="font-size: 3rem; margin-bottom: 12px;">${isFiltered ? '🔍' : '🏢'}</div>
        <h3 style="color: #fff; margin-bottom: 8px; font-size: 1.25rem;">${isFiltered ? 'Kriterlere Uygun İlan Bulunamadı' : 'AYSA Gayrimenkul Portföy Havuzu'}</h3>
        <p style="color: #94a3b8; font-size: 0.92rem; margin-bottom: 20px; max-width: 420px; margin-left: auto; margin-right: auto;">
          ${isFiltered ? 'Arama kriterlerini temizleyerek tüm ilanları tekrar listeleyebilirsiniz.' : 'Sisteminiz kullanıma hazırdır. İlk satılık veya kiralık gayrimenkulünüzü ekleyerek başlayabilirsiniz.'}
        </p>
        ${isFiltered 
          ? '<button class="btn-primary" onclick="clearAllFilters()">Filtreleri Temizle</button>' 
          : '<button class="btn-primary" onclick="openAddListingModal()" style="padding: 12px 24px; font-size: 1rem;">➕ İlk İlanı Ekle</button>'}
      </div>
    `;
    return;
  }

  container.innerHTML = state.listings.map(item => {
    const hasPhoto = item.photos && item.photos.length > 0;
    const hasAdaParsel = item.ada || item.parsel;
    const parselText = hasAdaParsel ? `Ada: ${item.ada || '-'} / Parsel: ${item.parsel || '-'}` : null;
    const isSatilik = trNormalize(item.status).includes('sat');

    return `
      <div class="property-card" onclick="openListingDetail('${item.id}')">
        ${hasPhoto ? `
          <div class="card-image-box">
            <img src="${item.photos[0]}" class="card-image" alt="${item.title}" loading="lazy" onerror="this.onerror=null;this.src='/aysa_logo.png'">
            <div class="card-overlay-badges">
              <span class="badge-tag ${isSatilik ? 'satilik' : 'kiralik'}">${item.status}</span>
              <span class="badge-tag">${item.type}</span>
            </div>
            ${parselText ? `<div class="parsel-badge">📐 ${parselText}</div>` : ''}
          </div>
        ` : `
          <div class="card-image-box" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); display: flex; flex-direction: column; align-items: center; justify-content: center; height: 180px; position: relative;">
            <img src="/aysa_logo.png" style="height: 48px; object-fit: contain; opacity: 0.85; margin-bottom: 6px;">
            <span style="font-size: 0.72rem; color: #94a3b8; background: rgba(0,0,0,0.5); padding: 3px 8px; border-radius: 6px;">📷 Fotoğraf Bekleniyor</span>
            <div class="card-overlay-badges">
              <span class="badge-tag ${isSatilik ? 'satilik' : 'kiralik'}">${item.status}</span>
              <span class="badge-tag">${item.type}</span>
            </div>
            ${parselText ? `<div class="parsel-badge">📐 ${parselText}</div>` : ''}
          </div>
        `}

        <div class="card-body">
          <div class="card-price-row">
            <div class="card-price">${formatTL(item.price)}</div>
            ${item.sira ? `<span style="font-size: 0.75rem; color: #64748b;">Sıra #${item.sira}</span>` : ''}
          </div>

          <div class="card-location">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            ${item.district || 'Altıeylül'} • <strong>${item.neighborhood || ''}</strong>
          </div>

          <h3 class="card-title">${item.title}</h3>

          <div class="card-specs-row">
            <div class="spec-item">
              <span>📐</span>
              <strong>${item.m2} m²</strong>
            </div>
            ${item.rooms && item.rooms !== '-' ? `
              <div class="spec-item">
                <span>🛏️</span>
                <strong>${item.rooms}</strong>
              </div>
            ` : ''}
            ${item.floor && item.floor !== '-' ? `
              <div class="spec-item">
                <span>🏢</span>
                <strong>${item.floor}</strong>
              </div>
            ` : ''}
          </div>

          <div class="card-footer-row">
            <div class="consultant-pill" title="Portföy Sorumlusu Danışman">
              <span class="consultant-dot"></span>
              <span>Danışman: ${item.consultantName}</span>
            </div>

            <div class="card-quick-actions" onclick="event.stopPropagation()">
              <button class="icon-btn" title="WhatsApp ile Paylaş" style="color: #10b981;" onclick="shareListingWhatsApp('${item.id}')">
                💬
              </button>
              <button class="icon-btn" title="Müşteri Linkini Kopyala" onclick="copyListingLink('${item.id}')">
                🔗
              </button>
              <button class="icon-btn" title="İlanı Düzenle" style="color: #f59e0b;" onclick="openEditListingModal('${item.id}')">
                ✏️
              </button>
              <button class="icon-btn" title="PDF Broşür Çıktısı" onclick="printSingleListingPDF('${item.id}')">
                🖨️
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// --- RENDER DEMANDS (MÜŞTERİ TALEPLERİ) ---
function renderDemands() {
  const container = document.getElementById('demands-container');
  if (!container) return;

  if (state.demands.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 50px 20px; background: #1a1e24; border-radius: 16px; border: 1px dashed #2e3540;">
        <div style="font-size: 2.8rem; margin-bottom: 12px;">📋</div>
        <h3 style="color: #fff; margin-bottom: 8px; font-size: 1.15rem;">Henüz Kayıtlı Müşteri Talebi Yok</h3>
        <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 18px; max-width: 420px; margin-left: auto; margin-right: auto;">
          Müşterilerinizin aradığı bütçe ve gayrimenkul kriterlerini buraya kaydedin; sistem mevcut ve yeni eklenen ilanlarla otomatik eşleştirsin.
        </p>
        <button class="btn-primary" onclick="openAddDemandModal()">➕ İlk Müşteri Talebini Gir</button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.demands.map(demand => {
    const matchInfo = state.matches.find(m => m.demandId === demand.id);
    const hasMatch = matchInfo && matchInfo.matchedCount > 0;

    return `
      <div class="demand-card">
        <div class="demand-header">
          <div class="client-info">
            <h4>${demand.clientName} ${demand.sira ? `<span style="font-size: 0.75rem; color: #64748b;">(#${demand.sira})</span>` : ''}</h4>
            <div class="client-phone">📞 ${demand.clientPhone || 'Telefon belirtilmedi'}</div>
          </div>
          <div>
            ${hasMatch ? `
              <div class="match-status-badge matched">
                ✓ ${matchInfo.matchedCount} Uygun Arsa/Portföy Bulundu
              </div>
            ` : `
              <div class="match-status-badge searching">
                🔍 Havuzda Eşleşme Aranıyor
              </div>
            `}
          </div>
        </div>

        <div class="demand-tags">
          <span class="demand-tag" style="background: rgba(27, 117, 187, 0.2); color: var(--primary-light); font-weight: 700;">
            ${demand.status} ${demand.type}
          </span>
          <span class="demand-tag">📍 ${demand.district || 'Altıeylül'}</span>
          ${demand.rooms && demand.rooms !== '-' ? `<span class="demand-tag">🛏️ ${demand.rooms}</span>` : ''}
          <span class="demand-tag" style="color: #10b981; font-weight: 700;">
            💰 Bütçe: ${formatTL(demand.budgetMin)} - ${formatTL(demand.budgetMax)}
          </span>
          <span class="demand-tag" style="margin-left: auto; color: #94a3b8;">
            👤 Takip: ${demand.consultantName}
          </span>
        </div>

        ${demand.notes ? `
          <div class="demand-notes">
            <strong>Kriter Notu:</strong> ${demand.notes}
          </div>
        ` : ''}

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <small style="color: #64748b;">Kayıt: ${new Date(demand.createdAt).toLocaleDateString('tr-TR')}</small>
          <div style="display: flex; gap: 8px;">
            ${demand.clientPhone ? `
              <a href="tel:${demand.clientPhone}" class="icon-btn" title="Müşteriyi Ara">📞</a>
              <a href="https://wa.me/90${demand.clientPhone.replace(/[^0-9]/g, '')}" target="_blank" class="icon-btn" title="WhatsApp Mesajı" style="color: #10b981;">💬</a>
            ` : ''}
            <button class="icon-btn" style="color: #ef4444;" title="Talebi Sil" onclick="deleteDemand('${demand.id}')">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// --- RENDER MATCHES (AKILLI EŞLEŞMELER) ---
function renderMatches() {
  const container = document.getElementById('matches-container');
  if (!container) return;

  if (state.matches.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 50px 20px; background: #1a1e24; border-radius: 16px; border: 1px dashed #2e3540;">
        <div style="font-size: 2.8rem; margin-bottom: 12px;">🎯</div>
        <h4 style="color: #fff; margin-bottom: 8px; font-size: 1.15rem;">Henüz Otomatik Eşleşme Bulunmuyor</h4>
        <p style="color: #94a3b8; font-size: 0.9rem; max-width: 440px; margin-left: auto; margin-right: auto;">
          Sisteme müşteri talebi ve portföy girildiğinde; bütçe, ilçe ve gayrimenkul türüne göre uyumlu olanlar burada anında eşleştirilir.
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.matches.map(m => `
    <div style="background: #1a1e24; border: 1px solid #2e3540; border-radius: 14px; padding: 18px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #2e3540; padding-bottom: 10px;">
        <div>
          <span style="font-size: 0.75rem; color: #10b981; font-weight: 700; text-transform: uppercase;">Müşteri Talebi</span>
          <h4 style="color: #fff; font-size: 1.1rem; font-weight: 700;">${m.demandClient} (${m.demandDistrict})</h4>
          <span style="font-size: 0.8rem; color: #94a3b8;">Danışman: ${m.demandConsultant} ${m.demandNotes ? '• ' + m.demandNotes : ''}</span>
        </div>
        <span style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #10b981; font-weight: 700; padding: 6px 14px; border-radius: 9999px; font-size: 0.85rem;">
          🎯 ${m.matchedCount} Uygun Portföy
        </span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px;">
        ${m.matchedListings.map(l => `
          <div style="background: #111316; border: 1px solid #2e3540; border-radius: 10px; padding: 10px; display: flex; gap: 10px; align-items: center; cursor: pointer;" onclick="openListingDetail('${l.id}')">
            <img src="${l.photo || '/aysa_logo.png'}" style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover;">
            <div style="overflow: hidden;">
              <div style="font-size: 0.88rem; font-weight: 700; color: #fff;">${formatTL(l.price)}</div>
              <div style="font-size: 0.78rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${l.title}</div>
              <div style="font-size: 0.72rem; color: var(--primary-light);">${l.neighborhood || l.district} • ${l.m2} m² (${l.type})</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

// --- RENDER MURAT ÖZCAN DASHBOARD ---
function renderMuratDashboard() {
  if (!state.stats) return;

  const statsContainer = document.getElementById('stats-grid');
  statsContainer.innerHTML = `
    <div class="stat-card">
      <span class="stat-label">Toplam Aktif Altıeylül Portföyü</span>
      <span class="stat-num">${state.stats.totalListings} Adet</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Toplam Portföy Hacmi</span>
      <span class="stat-num" style="color: #10b981; font-size: 1.45rem;">${formatTL(state.stats.totalPortfolioValue)}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Bekleyen Müşteri Talebi</span>
      <span class="stat-num" style="color: var(--primary-light);">${state.stats.totalDemands} Talep</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Otomatik Eşleşen Fırsat</span>
      <span class="stat-num" style="color: var(--accent-gold);">${state.stats.totalMatches} Eşleşme</span>
    </div>
  `;

  const tbody = document.getElementById('consultant-table-body');
  if (state.stats.consultantBreakdown) {
    tbody.innerHTML = state.stats.consultantBreakdown.map(c => `
      <tr>
        <td style="font-weight: 700; color: #fff;">${c.name}</td>
        <td style="color: #94a3b8;">${c.role}</td>
        <td><span style="font-weight: 700; color: var(--primary-light);">${c.listingCount} İlan</span></td>
        <td><span style="font-weight: 700; color: var(--accent-gold);">${c.demandCount} Talep</span></td>
        <td style="font-weight: 700; color: #10b981;">${formatTL(c.totalVolume)}</td>
        <td style="display: flex; gap: 6px; align-items: center;">
          <button class="btn-primary" style="padding: 4px 10px; font-size: 0.75rem;" onclick="filterByConsultant('${c.userId}')">
            İlanlarını Gör
          </button>
          ${(c.userId !== 'u1' && (state.isAdminLoggedIn || (state.currentUser && state.currentUser.isAdmin))) ? `
            <button class="icon-btn" style="color: #ef4444; padding: 4px 8px; font-size: 0.75rem;" title="Danışmanı Sil" onclick="deleteConsultant('${c.userId}')">
              🗑️ Sil
            </button>
          ` : ''}
        </td>
      </tr>
    `).join('');
  }
}

function filterByConsultant(userId) {
  state.filters.consultantId = userId;
  switchTab('havuz');
  loadListings();
}

// --- MODAL CONTROLS ---
function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('open');
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('open');
}

function openAddListingModal() {
  state.newPhotos = [];
  renderPhotoPreviews('new');
  updatePhotoPills();
  const input = document.getElementById('new-photos-input');
  if (input) input.value = '';
  const urlInput = document.getElementById('new-photo-url-input');
  if (urlInput) urlInput.value = '';
  document.getElementById('form-new-listing').reset();
  populateConsultantDropdowns();
  openModal('modal-add-listing');
}

function openAddDemandModal() {
  document.getElementById('form-new-demand').reset();
  populateConsultantDropdowns();
  openModal('modal-add-demand');
}

function openQrModal() {
  openModal('modal-qr-connect');
}

function openUserModal() {
  const list = document.getElementById('user-picker-list');
  list.innerHTML = state.users.map(u => `
    <div style="background: #111316; border: 1px solid ${state.currentUser && state.currentUser.id === u.id ? 'var(--primary)' : '#2e3540'}; border-radius: 10px; padding: 12px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="selectUser('${u.id}')">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="user-avatar-circle">${u.avatar}</div>
        <div>
          <div style="color: #fff; font-weight: 700; font-size: 0.95rem;">${u.name}</div>
          <div style="color: #94a3b8; font-size: 0.8rem;">${u.role}</div>
        </div>
      </div>
      ${state.currentUser && state.currentUser.id === u.id ? '<span style="color: var(--primary-light); font-weight: 700;">✓ Aktif</span>' : ''}
    </div>
  `).join('');
  openModal('modal-user-picker');
}

function selectUser(userId) {
  const user = state.users.find(u => u.id === userId);
  if (user) {
    state.currentUser = user;
    localStorage.setItem('aysa_active_user_id', user.id);
    updateCurrentUserUI();
    populateConsultantDropdowns();
    closeModal('modal-user-picker');
  }
}

// --- CLIENT-SIDE IMAGE COMPRESSION (Fast & Zero Failures) ---
async function compressImageFile(file) {
  return new Promise((resolve) => {
    // If not image or smaller than 350KB, use original
    if (!file.type || !file.type.startsWith('image/') || file.size < 350 * 1024) {
      return resolve(file);
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1920;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

// --- ADVANCED PHOTO SELECTION & UPLOAD HANDLING ---
async function handlePhotoSelect(event, mode = 'new') {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  state.isUploading = true;
  const countBadge = document.getElementById(mode === 'new' ? 'new-photo-count-pill' : 'edit-photo-count-pill');
  if (countBadge) countBadge.innerText = 'Fotoğraflar yükleniyor... ⏳';

  try {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      const compressed = await compressImageFile(files[i]);
      formData.append('photos', compressed);
    }

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (data.urls && data.urls.length > 0) {
      if (mode === 'new') {
        state.newPhotos = [...state.newPhotos, ...data.urls];
      } else {
        state.editPhotos = [...state.editPhotos, ...data.urls];
      }
      renderPhotoPreviews(mode);
    } else if (data.error) {
      alert('Fotoğraf yükleme uyarısı: ' + data.error);
    }
  } catch (err) {
    console.error('Photo upload error:', err);
    alert('Fotoğraf sunucuya yüklenirken hata oluştu. Lütfen tekrar deneyin.');
  } finally {
    state.isUploading = false;
    updatePhotoPills();
    event.target.value = '';
  }
}

function addPhotoByUrl(mode = 'new') {
  const input = document.getElementById(mode === 'new' ? 'new-photo-url-input' : 'edit-photo-url-input');
  const url = input ? input.value.trim() : '';
  if (!url) {
    alert('Lütfen geçerli bir görsel web linki girin.');
    return;
  }
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/uploads/')) {
    alert('Geçerli bir web adresi girin (http:// veya https:// ile başlamalı)');
    return;
  }
  if (mode === 'new') {
    state.newPhotos.push(url);
  } else {
    state.editPhotos.push(url);
  }
  if (input) input.value = '';
  renderPhotoPreviews(mode);
  updatePhotoPills();
}

function removePhoto(index, mode = 'new') {
  if (mode === 'new') {
    state.newPhotos.splice(index, 1);
  } else {
    state.editPhotos.splice(index, 1);
  }
  renderPhotoPreviews(mode);
  updatePhotoPills();
}

function renderPhotoPreviews(mode = 'new') {
  const photos = mode === 'new' ? state.newPhotos : state.editPhotos;
  const container = document.getElementById(mode === 'new' ? 'new-upload-preview-strip' : 'edit-upload-preview-strip');
  if (!container) return;

  if (photos.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = photos.map((url, idx) => `
    <div class="photo-preview-card ${idx === 0 ? 'cover' : ''}">
      <img src="${url}" alt="Fotoğraf ${idx + 1}" onerror="this.onerror=null;this.src='/aysa_logo.png'">
      ${idx === 0 ? '<div class="photo-cover-badge">Kapak</div>' : ''}
      <button type="button" class="photo-remove-btn" onclick="removePhoto(${idx}, '${mode}')" title="Fotoğrafı Kaldır">✕</button>
    </div>
  `).join('');
}

function updatePhotoPills() {
  const newPill = document.getElementById('new-photo-count-pill');
  if (newPill) {
    newPill.innerText = `${state.newPhotos.length} Fotoğraf Eklendi`;
  }
  const editPill = document.getElementById('edit-photo-count-pill');
  if (editPill) {
    editPill.innerText = `${state.editPhotos.length} Fotoğraf`;
  }
}

function handleTypeChange() {
  const type = document.getElementById('new-type').value;
  const rowRooms = document.getElementById('row-rooms-floor');
  if (type === 'Arsa' || type === 'Tarla') {
    rowRooms.style.display = 'none';
  } else {
    rowRooms.style.display = 'grid';
  }
}

// --- SUBMIT NEW LISTING (Fotoğraf Garantili) ---
async function submitNewListing(e) {
  e.preventDefault();

  if (state.isUploading) {
    alert('Fotoğraflarınız henüz yükleniyor. Lütfen 1-2 saniye bekleyin...');
    return;
  }

  const btn = document.getElementById('btn-submit-listing');
  const originalText = btn.innerText;
  btn.disabled = true;
  btn.innerText = 'Portföy Kaydediliyor... ⏳';

  const consultantId = document.getElementById('new-consultant').value;
  const consultant = state.users.find(u => u.id === consultantId) || state.currentUser;

  const payload = {
    title: document.getElementById('new-title').value.trim(),
    type: document.getElementById('new-type').value,
    status: document.getElementById('new-status').value,
    price: Number(document.getElementById('new-price').value),
    m2: Number(document.getElementById('new-m2').value),
    rooms: document.getElementById('new-rooms') ? document.getElementById('new-rooms').value : '-',
    floor: document.getElementById('new-floor') ? document.getElementById('new-floor').value : '-',
    city: 'Balıkesir',
    district: document.getElementById('new-district').value.trim() || 'Altıeylül',
    neighborhood: document.getElementById('new-neighborhood').value.trim(),
    ada: document.getElementById('new-ada').value.trim(),
    parsel: document.getElementById('new-parsel').value.trim(),
    consultantId: consultant.id,
    consultantName: consultant.name,
    consultantPhone: consultant.phone,
    internalNotes: document.getElementById('new-internal-notes').value.trim(),
    photos: state.newPhotos.length > 0 ? state.newPhotos : undefined
  };

  try {
    const res = await fetch('/api/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      closeModal('modal-add-listing');
      state.newPhotos = [];
      renderPhotoPreviews('new');
      updatePhotoPills();
      document.getElementById('form-new-listing').reset();
      await loadListings();
      await loadMatches();
      await loadStats();
      showToastNotification({
        title: '✅ Portföy Eklendi',
        message: `${payload.title} başarıyla havuza kaydedildi!`
      });
      alert('✅ Portföy fotoğraflarıyla birlikte başarıyla havuza eklendi!');
    } else {
      const err = await res.json();
      alert('İlan kaydedilemedi: ' + (err.error || 'Bilinmeyen hata'));
    }
  } catch (err) {
    console.error('Submit listing error:', err);
    alert('Hata oluştu, lütfen internet bağlantınızı kontrol edip tekrar deneyin.');
  } finally {
    btn.disabled = false;
    btn.innerText = originalText;
  }
}

// --- EDIT LISTING FUNCTIONS ---
function openEditListingModal(id) {
  const item = state.listings.find(l => l.id === id);
  if (!item) return;

  document.getElementById('edit-listing-id').value = item.id;
  document.getElementById('edit-title').value = item.title || '';
  document.getElementById('edit-type').value = item.type || 'Konut';
  document.getElementById('edit-status').value = item.status || 'Satılık';
  document.getElementById('edit-price').value = item.price || '';
  document.getElementById('edit-m2').value = item.m2 || '';
  if (document.getElementById('edit-rooms')) document.getElementById('edit-rooms').value = item.rooms || '-';
  if (document.getElementById('edit-floor')) document.getElementById('edit-floor').value = item.floor || '';
  document.getElementById('edit-district').value = item.district || 'Altıeylül';
  document.getElementById('edit-neighborhood').value = item.neighborhood || '';
  document.getElementById('edit-ada').value = item.ada || '';
  document.getElementById('edit-parsel').value = item.parsel || '';
  document.getElementById('edit-internal-notes').value = item.internalNotes || '';

  const select = document.getElementById('edit-consultant');
  if (select) {
    select.innerHTML = state.users.map(u => `
      <option value="${u.id}" ${item.consultantId === u.id ? 'selected' : ''}>
        ${u.name} (${u.role})
      </option>
    `).join('');
  }

  handleEditTypeChange();

  state.editPhotos = Array.isArray(item.photos) ? [...item.photos] : [];
  renderPhotoPreviews('edit');
  updatePhotoPills();

  openModal('modal-edit-listing');
}

function handleEditTypeChange() {
  const type = document.getElementById('edit-type').value;
  const rowRooms = document.getElementById('row-edit-rooms-floor');
  if (rowRooms) {
    if (type === 'Arsa' || type === 'Tarla') {
      rowRooms.style.display = 'none';
    } else {
      rowRooms.style.display = 'grid';
    }
  }
}

async function submitEditListing(e) {
  e.preventDefault();

  if (state.isUploading) {
    alert('Fotoğraflarınız henüz yükleniyor. Lütfen bekleyin...');
    return;
  }

  const id = document.getElementById('edit-listing-id').value;
  const btn = document.getElementById('btn-submit-edit');
  const originalText = btn.innerText;
  btn.disabled = true;
  btn.innerText = 'Güncelleniyor... ⏳';

  const consultantId = document.getElementById('edit-consultant').value;
  const consultant = state.users.find(u => u.id === consultantId) || state.currentUser;

  const payload = {
    title: document.getElementById('edit-title').value.trim(),
    type: document.getElementById('edit-type').value,
    status: document.getElementById('edit-status').value,
    price: Number(document.getElementById('edit-price').value),
    m2: Number(document.getElementById('edit-m2').value),
    rooms: document.getElementById('edit-rooms') ? document.getElementById('edit-rooms').value : '-',
    floor: document.getElementById('edit-floor') ? document.getElementById('edit-floor').value : '-',
    district: document.getElementById('edit-district').value.trim() || 'Altıeylül',
    neighborhood: document.getElementById('edit-neighborhood').value.trim(),
    ada: document.getElementById('edit-ada').value.trim(),
    parsel: document.getElementById('edit-parsel').value.trim(),
    consultantId: consultant.id,
    consultantName: consultant.name,
    consultantPhone: consultant.phone,
    internalNotes: document.getElementById('edit-internal-notes').value.trim(),
    photos: state.editPhotos
  };

  try {
    const res = await fetch(`/api/listings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      closeModal('modal-edit-listing');
      await loadListings();
      await loadMatches();
      await loadStats();
      openListingDetail(id);
      showToastNotification({
        title: '✅ Portföy Güncellendi',
        message: `${payload.title} güncellendi!`
      });
      alert('✅ Portföy başarıyla güncellendi!');
    } else {
      const err = await res.json();
      alert('Güncelleme hatası: ' + (err.error || 'Bilinmeyen hata'));
    }
  } catch (err) {
    console.error('Edit error:', err);
    alert('Bağlantı hatası.');
  } finally {
    btn.disabled = false;
    btn.innerText = originalText;
  }
}

// --- SUBMIT NEW DEMAND ---
async function submitNewDemand(e) {
  e.preventDefault();

  const consultantId = document.getElementById('demand-consultant').value;
  const consultant = state.users.find(u => u.id === consultantId) || state.currentUser;

  const payload = {
    clientName: document.getElementById('demand-client').value.trim(),
    clientPhone: document.getElementById('demand-phone').value.trim(),
    type: document.getElementById('demand-type').value,
    status: document.getElementById('demand-status').value,
    district: document.getElementById('demand-district').value.trim(),
    rooms: document.getElementById('demand-rooms').value,
    budgetMin: Number(document.getElementById('demand-bmin').value) || 0,
    budgetMax: Number(document.getElementById('demand-bmax').value) || 0,
    consultantId: consultant.id,
    consultantName: consultant.name,
    notes: document.getElementById('demand-notes').value.trim()
  };

  try {
    const res = await fetch('/api/demands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      closeModal('modal-add-demand');
      await loadDemands();
      await loadMatches();
      await loadStats();
      switchTab('talepler');
      alert('✅ Müşteri talebi başarıyla eklendi ve havuzla eşleştirildi!');
    }
  } catch (err) {
    console.error('Submit demand error:', err);
    alert('Hata oluştu, lütfen tekrar deneyin.');
  }
}

async function deleteDemand(id) {
  if (!confirm('Bu müşteri talebini silmek istediğinize emin misiniz?')) return;
  try {
    const res = await fetch(`/api/demands/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadDemands();
      await loadMatches();
      await loadStats();
    }
  } catch (e) {
    console.error('Delete error:', e);
  }
}

// --- CLIENT SHARING & WHATSAPP GENERATOR ---
function getListingShareUrl(listingId) {
  const isCloud = window.location.origin && !window.location.origin.includes('localhost') && !window.location.origin.includes('127.0.0.1');
  const origin = isCloud ? window.location.origin : ((state.serverInfo && state.serverInfo.networkUrl) ? state.serverInfo.networkUrl : window.location.origin);
  return `${origin}/?listing=${listingId}&client=1`;
}

function shareListingWhatsApp(id) {
  const item = state.listings.find(l => l.id === id);
  if (!item) return;

  const shareUrl = getListingShareUrl(id);
  const specs = [];
  if (item.m2) specs.push(`${item.m2} m²`);
  if (item.rooms && item.rooms !== '-') specs.push(item.rooms);
  if (item.floor && item.floor !== '-') specs.push(item.floor);
  if (item.ada || item.parsel) specs.push(`Ada: ${item.ada || '-'}/Parsel: ${item.parsel || '-'}`);

  const msg = 
`🏢 *AYSA GLOBAL GAYRİMENKUL*
📍 *Balıkesir / ${item.district || 'Altıeylül'} - ${item.neighborhood || ''}*

🌟 *${item.title}*
🏷️ *Durum:* ${item.status} ${item.type}
💰 *Fiyat:* ${formatTL(item.price)}
📐 *Özellikler:* ${specs.join(' • ')}

👤 *Portföy Danışmanı:* ${item.consultantName}
📞 *İletişim:* ${item.consultantPhone || '0532 111 22 33'}

🔗 *Fotoğraflar ve Detaylar İçin İnceleyin:*
${shareUrl}`;

  const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
}

async function copyListingLink(id) {
  const shareUrl = getListingShareUrl(id);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(shareUrl);
    } else {
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    showToastNotification({
      title: '📋 Link Kopyalandı',
      message: 'Müşteriye paylaşabileceğiniz direkt ilan linki panoya kopyalandı!'
    });
    alert('📋 Müşteri paylaşım linki panoya kopyalandı:\n\n' + shareUrl);
  } catch (err) {
    prompt('Müşteri paylaşım linki:', shareUrl);
  }
}

// --- LISTING DETAIL MODAL ---
function openListingDetail(id) {
  const item = state.listings.find(l => l.id === id);
  if (!item) return;

  const content = document.getElementById('detail-modal-content');
  const hasPhotos = item.photos && item.photos.length > 0;
  const photos = hasPhotos ? item.photos : [];
  const hasAdaParsel = item.ada || item.parsel;
  const isSatilik = trNormalize(item.status).includes('sat');

  content.innerHTML = `
    <!-- Fotoğraf Galerisi / Görsel Durumu -->
    ${hasPhotos ? `
      <div class="detail-gallery">
        <img id="detail-main-img" src="${photos[0]}" alt="${item.title}" onerror="this.onerror=null;this.src='/aysa_logo.png'">
      </div>
      ${photos.length > 1 ? `
        <div style="display: flex; gap: 8px; overflow-x: auto; padding: 6px 0;">
          ${photos.map((p, idx) => `
            <img src="${p}" style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover; cursor: pointer; border: 2px solid ${idx === 0 ? 'var(--primary)' : '#2e3540'};" onclick="document.getElementById('detail-main-img').src='${p}'" onerror="this.onerror=null;this.src='/aysa_logo.png'">
          `).join('')}
        </div>
      ` : ''}
    ` : `
      <div class="detail-gallery" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px; border-radius: 12px; border: 1px dashed #334155; padding: 20px; text-align: center;">
        <img src="/aysa_logo.png" style="height: 52px; object-fit: contain; opacity: 0.9; margin-bottom: 10px;">
        <div style="font-weight: 700; color: #fff; font-size: 1.05rem;">Bu İlanda Henüz Fotoğraf Yok</div>
        <p style="font-size: 0.85rem; color: #94a3b8; margin: 4px 0 12px 0;">Saha fotoğraflarını yüklemek için aşağıdaki 'Portföyü Düzenle' butonunu kullanabilirsiniz.</p>
        ${!state.isClientView ? `
          <button class="btn-primary" onclick="openEditListingModal('${item.id}')" style="font-size: 0.85rem; padding: 8px 18px;">
            📷 Fotoğraf Ekle / Düzenle
          </button>
        ` : ''}
      </div>
    `}

    <!-- Fiyat & Kategori Başlığı -->
    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 14px;">
      <h2 style="font-size: 1.7rem; font-weight: 800; color: #fff;">${formatTL(item.price)}</h2>
      <span class="badge-tag ${isSatilik ? 'satilik' : 'kiralik'}">${item.status} ${item.type}</span>
    </div>

    <h3 style="font-size: 1.18rem; font-weight: 700; color: var(--text-main); line-height: 1.35; margin-top: 2px;">${item.title}</h3>
    
    <div style="color: #94a3b8; font-size: 0.9rem; display: flex; align-items: center; gap: 6px; margin-top: 4px;">
      📍 Balıkesir / ${item.district || 'Altıeylül'} • <strong>${item.neighborhood || ''}</strong>
    </div>

    <!-- Özellik Kutusu -->
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: #111316; padding: 14px; border-radius: 12px; border: 1px solid #2e3540; margin-top: 12px;">
      <div>
        <span style="font-size: 0.75rem; color: #94a3b8;">Alan:</span>
        <div style="font-weight: 700; color: #fff;">${item.m2} m²</div>
      </div>
      <div>
        <span style="font-size: 0.75rem; color: #94a3b8;">Cinsi:</span>
        <div style="font-weight: 700; color: #fff;">${item.type}</div>
      </div>
      <div>
        <span style="font-size: 0.75rem; color: #94a3b8;">Oda:</span>
        <div style="font-weight: 700; color: #fff;">${item.rooms || '-'}</div>
      </div>
      <div>
        <span style="font-size: 0.75rem; color: #94a3b8;">Ada / Parsel:</span>
        <div style="font-weight: 700; color: var(--primary-light);">${item.ada || '-'} / ${item.parsel || '-'}</div>
      </div>
      <div>
        <span style="font-size: 0.75rem; color: #94a3b8;">Kat:</span>
        <div style="font-weight: 700; color: #fff;">${item.floor || '-'}</div>
      </div>
      <div>
        <span style="font-size: 0.75rem; color: #94a3b8;">Sıra No:</span>
        <div style="font-weight: 700; color: #fff;">#${item.sira || '-'}</div>
      </div>
    </div>

    <!-- MÜŞTERİ PAYLAŞIM & AKSIYON SUITI -->
    <div class="detail-actions-suite" style="margin-top: 14px;">
      <button class="btn-action-suite" style="background: #2563eb; color: #fff;" onclick="openListingQrModal('${item.id}')">
        📱 Müşteri Sunum QR Kodu
      </button>
      <button class="btn-action-suite btn-whatsapp-suite" onclick="shareListingWhatsApp('${item.id}')">
        💬 Müşteriye WhatsApp ile Gönder
      </button>
      <button class="btn-action-suite btn-copy-suite" onclick="copyListingLink('${item.id}')">
        🔗 Müşteri Linkini Kopyala
      </button>
      ${!state.isClientView ? `
        <button class="btn-action-suite btn-edit-suite" onclick="openEditListingModal('${item.id}')">
          ✏️ Portföyü Düzenle
        </button>
        <button class="btn-action-suite btn-pdf-suite" onclick="printSingleListingPDF('${item.id}')">
          🖨️ PDF Broşür Yazdır
        </button>
      ` : ''}
    </div>

    ${hasAdaParsel ? `
      <div style="margin-top: 10px;">
        <a href="https://parselsorgu.tkgm.gov.tr/" target="_blank" class="parsel-btn-tkgm" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
          🔍 TKGM Parsel Sorgu Sayfasında Aç (Ada: ${item.ada} / Parsel: ${item.parsel})
        </a>
      </div>
    ` : ''}

    <!-- Ofis İçi Gizli Notlar (Müşteriye paylaşılmaz) -->
    ${(!state.isClientView && item.internalNotes) ? `
      <div class="detail-notes-box" style="margin-top: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <h5 style="color: var(--accent-gold); font-size: 0.85rem; font-weight: 700;">🔒 Ofis İçi Gizli Notlar</h5>
          <small style="color: #64748b; font-size: 0.72rem;">Sadece ekip görür, müşteriye gönderilmez</small>
        </div>
        <p style="color: #cbd5e1; font-size: 0.88rem; margin: 0;">${item.internalNotes}</p>
      </div>
    ` : ''}

    <!-- Portföy Sorumlusu Danışman Künyesi -->
    <div style="background: #111316; border: 1px solid #2e3540; border-radius: 12px; padding: 14px; display: flex; align-items: center; justify-content: space-between; margin-top: 14px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="user-avatar-circle" style="width: 42px; height: 42px; font-size: 1rem;">${item.consultantName ? item.consultantName.substring(0, 2) : 'AY'}</div>
        <div>
          <span style="font-size: 0.72rem; color: #94a3b8; text-transform: uppercase;">Portföy Sahibi Danışman</span>
          <div style="color: #fff; font-weight: 700; font-size: 0.95rem;">${item.consultantName}</div>
          <div style="color: var(--primary-light); font-size: 0.82rem;">${item.consultantPhone || ''}</div>
        </div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        ${item.consultantPhone ? `
          <a href="tel:${item.consultantPhone}" class="icon-btn" title="Telefonla Ara">📞</a>
          <a href="https://wa.me/90${item.consultantPhone.replace(/[^0-9]/g, '')}" target="_blank" class="icon-btn" title="WhatsApp" style="color: #10b981;">💬</a>
        ` : ''}
        ${(!state.isClientView && (state.isAdminLoggedIn || (state.currentUser && state.currentUser.isAdmin))) ? `
          <button class="icon-btn" style="color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 6px 10px; border-radius: 8px;" title="İlanı Kaldır (Yönetici Yetkisi)" onclick="deleteListing('${item.id}')">
            🗑️ Kaldır
          </button>
        ` : ''}
      </div>
    </div>
  `;

  openModal('modal-listing-detail');
}

async function deleteListing(id) {
  if (!state.isAdminLoggedIn && (!state.currentUser || !state.currentUser.isAdmin)) {
    alert('İlan kaldırma yetkisi sadece MURAT ÖZCAN (ADMİN) kullanıcısına aittir.\nLütfen Yönetim Girişi yapınız.');
    openModal('modal-admin-login');
    return;
  }
  if (!confirm('Bu portföyü havuzdan tamamen kaldırmak istediğinize emin misiniz?')) return;
  try {
    const res = await fetch(`/api/listings/${id}`, { method: 'DELETE' });
    if (res.ok) {
      closeModal('modal-listing-detail');
      await loadListings();
      await loadMatches();
      await loadStats();
      alert('İlan başarıyla kaldırıldı.');
    }
  } catch (e) {
    console.error('Delete error:', e);
  }
}

// ===================================================
// MURAT ÖZCAN PDF & BROŞÜR YAZDIRMA MOTORU
// ===================================================

function printSingleListingPDF(listingId) {
  const item = state.listings.find(l => l.id === listingId);
  if (!item) return;

  const printDiv = document.getElementById('print-container');
  const photos = item.photos && item.photos.length > 0 ? item.photos : ['/aysa_logo.png'];

  printDiv.innerHTML = `
    <div class="print-header">
      <div style="display: flex; align-items: center; gap: 15px;">
        <img src="/aysa_logo.png" alt="AYSA Global Logo">
        <div>
          <h1 style="font-size: 20pt; margin: 0; color: #1b75bb;">AYSA GLOBAL GAYRİMENKUL</h1>
          <p style="margin: 0; font-size: 9pt; color: #666;">Balıkesir Altıeylül Portföy & Gayrimenkul Danışmanlığı</p>
        </div>
      </div>
      <div class="print-header-info">
        <h2>PORTFÖY BROŞÜRÜ</h2>
        <p>Tarih: ${new Date().toLocaleDateString('tr-TR')}</p>
        <p>Portföy Sıra No: #${item.sira || item.id}</p>
      </div>
    </div>

    <div class="print-title">${item.title}</div>
    <div class="print-price">${formatTL(item.price)} <span style="font-size: 12pt; color: #666;">(${item.status})</span></div>

    <div class="print-photos-grid">
      <img src="${photos[0]}" alt="Fotoğraf">
      ${photos[1] ? `<img src="${photos[1]}" alt="İkinci Fotoğraf">` : `<img src="${photos[0]}" alt="Fotoğraf">`}
    </div>

    <table class="print-specs-table">
      <tr>
        <td style="width: 25%;"><strong>Gayrimenkul Cinsi:</strong></td>
        <td style="width: 25%;">${item.type} (${item.status})</td>
        <td style="width: 25%;"><strong>Kullanım Alanı:</strong></td>
        <td style="width: 25%;">${item.m2} m²</td>
      </tr>
      <tr>
        <td><strong>Oda Sayısı:</strong></td>
        <td>${item.rooms || '-'}</td>
        <td><strong>Bulunduğu Kat:</strong></td>
        <td>${item.floor || '-'}</td>
      </tr>
      <tr>
        <td><strong>İlçe / Mahalle:</strong></td>
        <td>Balıkesir / ${item.district} • ${item.neighborhood || '-'}</td>
        <td><strong>TKGM Ada / Parsel:</strong></td>
        <td>${item.ada || '-'}/${item.parsel || '-'}</td>
      </tr>
    </table>

    <div class="print-footer-card">
      <div>
        <div style="font-weight: bold; color: #1b75bb; font-size: 12pt;">AYSA GLOBAL GAYRİMENKUL</div>
        <div style="color: #666; font-size: 9pt;">Balıkesir Altıeylül Merkez Ofis</div>
      </div>
      <div style="text-align: right;">
        <div style="font-weight: bold; font-size: 11pt;">Portföy Sorumlusu: ${item.consultantName}</div>
        <div style="color: #1b75bb; font-size: 10pt;">Tel: ${item.consultantPhone || '0532 111 22 33'}</div>
      </div>
    </div>
  `;

  window.print();
}

function printAllPortfolioPDF() {
  const printDiv = document.getElementById('print-container');
  const now = new Date().toLocaleDateString('tr-TR');

  printDiv.innerHTML = `
    <div class="print-header">
      <div style="display: flex; align-items: center; gap: 15px;">
        <img src="/aysa_logo.png" alt="AYSA Global Logo">
        <div>
          <h1 style="font-size: 20pt; margin: 0; color: #1b75bb;">AYSA GLOBAL GAYRİMENKUL</h1>
          <p style="margin: 0; font-size: 9pt; color: #666;">Balıkesir Altıeylül Güncel Portföy Listesi</p>
        </div>
      </div>
      <div class="print-header-info">
        <h2>YÖNETİCİ PORTFÖY RAPORU</h2>
        <p>Rapor Alan: MURAT ÖZCAN (ADMİN)</p>
        <p>Tarih: ${now}</p>
      </div>
    </div>

    <div style="margin-bottom: 15px; font-size: 10pt;">
      <strong>Aktif Portföy:</strong> ${state.listings.length} Adet | 
      <strong>Toplam Portföy Değeri:</strong> ${state.stats ? formatTL(state.stats.totalPortfolioValue) : '-'}
    </div>

    <table class="print-batch-table">
      <thead>
        <tr>
          <th>Sıra</th>
          <th>Cinsi</th>
          <th>Durum</th>
          <th>Mahalle</th>
          <th>Ada/Parsel</th>
          <th>m²</th>
          <th>Fiyat</th>
          <th>Danışman</th>
        </tr>
      </thead>
      <tbody>
        ${state.listings.map((l, i) => `
          <tr>
            <td>${l.sira || i + 1}</td>
            <td style="font-weight: bold;">${l.type} ${l.rooms && l.rooms !== '-' ? `(${l.rooms})` : ''}</td>
            <td>${l.status}</td>
            <td>${l.neighborhood}</td>
            <td>${l.ada || '-'}/${l.parsel || '-'}</td>
            <td>${l.m2} m²</td>
            <td style="font-weight: bold; color: #1b75bb;">${formatTL(l.price)}</td>
            <td>${l.consultantName}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div style="margin-top: 30px; display: flex; justify-content: space-between; font-size: 9pt; color: #666; border-top: 1px solid #ccc; padding-top: 10px;">
      <span>AYSA Global Gayrimenkul Gizli Ofis İçi Çalışma Belgesidir.</span>
      <span>Sayfa 1 / 1</span>
    </div>
  `;

  window.print();
}

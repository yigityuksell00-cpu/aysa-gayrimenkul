// ===================================================
// AYSA GLOBAL GAYRİMENKUL - MOBİL OFİS MOTORU
// Balıkesir Altıeylül Portföy & Talep Havuzu
// ===================================================

let state = {
  currentUser: null,
  isAdminLoggedIn: false,
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
  serverInfo: null
};

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
    // Default to Murat Özcan (Patron)
    state.currentUser = matched || state.users[0] || { name: 'Murat Özcan', role: 'Patron', id: 'u1', avatar: 'MÖ' };

    updateCurrentUserUI();
    populateConsultantDropdowns();
  } catch (e) {
    console.error('Failed to load users:', e);
  }
}

function updateCurrentUserUI() {
  if (!state.currentUser) return;
  document.getElementById('current-user-avatar').innerText = state.currentUser.avatar || state.currentUser.name.substring(0, 2);
  const adminBadge = state.currentUser.id === 'u1' && state.isAdminLoggedIn ? ' 👑 (Patron)' : '';
  document.getElementById('current-user-name').innerText = state.currentUser.name + adminBadge;
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
  if (!state.isAdminLoggedIn && state.currentUser.id !== 'u1') {
    alert('Bu özelliği sadece Patron Murat Özcan kullanabilir. Lütfen önce patron girişi yapın.');
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
        sender: 'Murat Özcan (Patron)'
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

// --- ADMIN AUTH (MURAT ÖZCAN LOGIN) ---
function handleUserBtnClick() {
  if (state.currentUser.id === 'u1' && !state.isAdminLoggedIn) {
    openModal('modal-admin-login');
  } else {
    openUserModal();
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
    if (data.success) {
      state.isAdminLoggedIn = true;
      localStorage.setItem('aysa_admin_token', data.token);
      state.currentUser = state.users.find(u => u.id === 'u1') || state.currentUser;
      localStorage.setItem('aysa_active_user_id', 'u1');
      updateCurrentUserUI();
      closeModal('modal-admin-login');
      alert('👑 Hoş geldiniz Murat Bey! Patron yetkileriniz aktif edildi.');
      switchTab('murat');
    } else {
      alert('❌ ' + (data.error || 'Giriş başarısız'));
    }
  } catch (err) {
    console.error('Admin login error:', err);
    alert('Sunucuya bağlanılamadı.');
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
  loadListings();
}

function setChipFilter(key, value, el) {
  if (state.filters[key] === value && value !== 'all') {
    state.filters[key] = 'all';
    el.classList.remove('active');
  } else {
    state.filters[key] = value;
    const parent = el.parentElement;
    parent.querySelectorAll(`[data-${key}]`).forEach(chip => chip.classList.remove('active'));
    el.classList.add('active');
  }
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

  container.innerHTML = newest.map(item => `
    <div class="story-card" onclick="openListingDetail('${item.id}')">
      <div class="story-badge">YENİ</div>
      <img src="${(item.photos && item.photos[0]) || '/aysa_logo.png'}" class="story-img" alt="${item.title}">
      <div class="story-info">
        <div class="story-price">${formatTL(item.price)}</div>
        <div class="story-title">${item.title}</div>
      </div>
    </div>
  `).join('');
}

// --- RENDER LISTINGS (İLAN HAVUZU) ---
function renderListings() {
  const container = document.getElementById('listings-grid');
  if (!container) return;

  if (state.listings.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 50px 20px; background: #1a1e24; border-radius: 16px; border: 1px dashed #2e3540;">
        <div style="font-size: 2.5rem; margin-bottom: 10px;">🔍</div>
        <h3 style="color: #fff; margin-bottom: 6px;">Eşleşen Portföy Bulunamadı</h3>
        <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 16px;">Arama kriterlerini temizleyin veya yeni bir ilan ekleyin.</p>
        <button class="btn-primary" onclick="openAddListingModal()">+ İlk İlanı Ekle</button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.listings.map(item => {
    const photo = (item.photos && item.photos[0]) || '/aysa_logo.png';
    const hasAdaParsel = item.ada || item.parsel;
    const parselText = hasAdaParsel ? `Ada: ${item.ada || '-'} / Parsel: ${item.parsel || '-'}` : null;
    const isSatilik = (item.status || '').toLowerCase() === 'satılık';

    return `
      <div class="property-card" onclick="openListingDetail('${item.id}')">
        <div class="card-image-box">
          <img src="${photo}" class="card-image" alt="${item.title}" loading="lazy">
          <div class="card-overlay-badges">
            <span class="badge-tag ${isSatilik ? 'satilik' : 'kiralik'}">${item.status}</span>
            <span class="badge-tag">${item.type}</span>
          </div>
          ${parselText ? `<div class="parsel-badge">📐 ${parselText}</div>` : ''}
        </div>

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
              <button class="icon-btn" title="PDF Broşür Çıktısı" onclick="printSingleListingPDF('${item.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              </button>
              ${hasAdaParsel ? `
                <a class="icon-btn" title="TKGM Parsel Sorgula" href="https://parselsorgu.tkgm.gov.tr/" target="_blank">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>
                </a>
              ` : ''}
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
      <div style="text-align: center; padding: 40px; background: #1a1e24; border-radius: 16px;">
        <p style="color: #94a3b8;">Henüz kayıtlı müşteri talebi yok.</p>
        <button class="btn-primary" style="margin-top: 10px;" onclick="openAddDemandModal()">+ İlk Talebi Gir</button>
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
      <div style="text-align: center; padding: 40px; background: #1a1e24; border-radius: 16px;">
        <div style="font-size: 2.2rem; margin-bottom: 8px;">🎯</div>
        <h4 style="color: #fff; margin-bottom: 4px;">Henüz Otomatik Eşleşme Bulunmuyor</h4>
        <p style="color: #94a3b8; font-size: 0.88rem;">Mustafa Konuk veya Ahmet Bey'in arsa talepleri havuzdaki uygun tarla ve arsalarla otomatik eşleştirilir.</p>
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
        <td>
          <button class="btn-primary" style="padding: 4px 10px; font-size: 0.75rem;" onclick="filterByConsultant('${c.userId}')">
            İlanlarını Gör
          </button>
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
  document.getElementById('upload-preview-strip').innerHTML = '';
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

// --- PHOTO UPLOAD HANDLING ---
async function handlePhotoUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('photos', files[i]);
  }

  const previewStrip = document.getElementById('upload-preview-strip');
  previewStrip.innerHTML = '<span style="color: var(--primary-light); font-size: 0.8rem;">Fotoğraflar yükleniyor...</span>';

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.urls) {
      state.newPhotos = [...state.newPhotos, ...data.urls];
      previewStrip.innerHTML = state.newPhotos.map(url => `
        <img src="${url}" style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover; border: 1px solid var(--primary);">
      `).join('');
    }
  } catch (err) {
    console.error('Photo upload error:', err);
    previewStrip.innerHTML = '<span style="color: #ef4444; font-size: 0.8rem;">Fotoğraf yüklenemedi.</span>';
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

// --- SUBMIT NEW LISTING ---
async function submitNewListing(e) {
  e.preventDefault();

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
    district: document.getElementById('new-district').value.trim(),
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
      await loadListings();
      await loadMatches();
      await loadStats();
      alert('✅ Portföy başarıyla havuza eklendi!');
    }
  } catch (err) {
    console.error('Submit listing error:', err);
    alert('Hata oluştu, lütfen tekrar deneyin.');
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

// --- LISTING DETAIL MODAL ---
function openListingDetail(id) {
  const item = state.listings.find(l => l.id === id);
  if (!item) return;

  const content = document.getElementById('detail-modal-content');
  const photos = item.photos && item.photos.length > 0 ? item.photos : ['/aysa_logo.png'];
  const hasAdaParsel = item.ada || item.parsel;

  content.innerHTML = `
    <div class="detail-gallery">
      <img id="detail-main-img" src="${photos[0]}" alt="${item.title}">
    </div>
    ${photos.length > 1 ? `
      <div style="display: flex; gap: 8px; overflow-x: auto; padding: 4px 0;">
        ${photos.map((p, idx) => `
          <img src="${p}" style="width: 55px; height: 55px; border-radius: 6px; object-fit: cover; cursor: pointer; border: 2px solid ${idx === 0 ? 'var(--primary)' : 'transparent'};" onclick="document.getElementById('detail-main-img').src='${p}'">
        `).join('')}
      </div>
    ` : ''}

    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px;">
      <h2 style="font-size: 1.6rem; font-weight: 800; color: #fff;">${formatTL(item.price)}</h2>
      <span class="badge-tag ${item.status.toLowerCase() === 'satılık' ? 'satilik' : 'kiralik'}">${item.status} ${item.type}</span>
    </div>

    <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); line-height: 1.35;">${item.title}</h3>
    
    <div style="color: #94a3b8; font-size: 0.88rem; display: flex; align-items: center; gap: 6px;">
      📍 Balıkesir / ${item.district || 'Altıeylül'} • <strong>${item.neighborhood || ''}</strong>
    </div>

    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: #111316; padding: 12px; border-radius: 10px; border: 1px solid #2e3540;">
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
        <span style="font-size: 0.75rem; color: #94a3b8;">Excel Sıra No:</span>
        <div style="font-weight: 700; color: #fff;">#${item.sira || '-'}</div>
      </div>
    </div>

    <!-- Murat Özcan Özel Butonları -->
    <div class="detail-actions-bar">
      <button class="btn-detail-pdf" onclick="printSingleListingPDF('${item.id}')">
        🖨️ Murat Özcan İçin PDF Portföy Yazdır
      </button>
      ${hasAdaParsel ? `
        <a href="https://parselsorgu.tkgm.gov.tr/" target="_blank" class="btn-detail-tkgm">
          🔍 TKGM Parsel Sorgu (Ada: ${item.ada} / Parsel: ${item.parsel})
        </a>
      ` : ''}
    </div>

    <!-- Ofis İçi Gizli Notlar -->
    ${item.internalNotes ? `
      <div class="detail-notes-box">
        <h5>🔒 Ofis İçi Özel Notlar (Müşteriye Gösterilmez)</h5>
        <p>${item.internalNotes}</p>
      </div>
    ` : ''}

    <!-- Portföy Sorumlusu Danışman Künyesi -->
    <div style="background: #111316; border: 1px solid #2e3540; border-radius: 12px; padding: 14px; display: flex; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="user-avatar-circle" style="width: 38px; height: 38px; font-size: 0.95rem;">${item.consultantName.substring(0, 2)}</div>
        <div>
          <span style="font-size: 0.72rem; color: #94a3b8; text-transform: uppercase;">Portföy Sahibi Danışman</span>
          <div style="color: #fff; font-weight: 700; font-size: 0.95rem;">${item.consultantName}</div>
          <div style="color: var(--primary-light); font-size: 0.8rem;">${item.consultantPhone || ''}</div>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        ${item.consultantPhone ? `
          <a href="tel:${item.consultantPhone}" class="icon-btn" title="Telefonla Ara">📞</a>
          <a href="https://wa.me/90${item.consultantPhone.replace(/[^0-9]/g, '')}" target="_blank" class="icon-btn" title="WhatsApp" style="color: #10b981;">💬</a>
        ` : ''}
        ${state.isAdminLoggedIn || (state.currentUser && state.currentUser.name === item.consultantName) ? `
          <button class="icon-btn" style="color: #ef4444;" title="İlanı Sil" onclick="deleteListing('${item.id}')">🗑️</button>
        ` : ''}
      </div>
    </div>
  `;

  openModal('modal-listing-detail');
}

async function deleteListing(id) {
  if (!confirm('Bu portföyü havuzdan silmek istediğinize emin misiniz?')) return;
  try {
    const res = await fetch(`/api/listings/${id}`, { method: 'DELETE' });
    if (res.ok) {
      closeModal('modal-listing-detail');
      await loadListings();
      await loadMatches();
      await loadStats();
      alert('İlan silindi.');
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
          <p style="margin: 0; font-size: 9pt; color: #666;">Balıkesir Altıeylül Güncel Excel Portföy Listesi</p>
        </div>
      </div>
      <div class="print-header-info">
        <h2>YÖNETİCİ PORTFÖY RAPORU</h2>
        <p>Rapor Alan: Murat Özcan (Patron)</p>
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

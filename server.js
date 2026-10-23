const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'data', 'uploads')));

// Ensure directories
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Configure Multer for photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueName = 'aysa_' + Date.now() + '_' + Math.round(Math.random() * 1e5) + ext;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }
});

// Database Helper
const dbPath = path.join(dataDir, 'database.json');
function readDB() {
  try {
    if (!fs.existsSync(dbPath)) {
      return { users: [], listings: [], demands: [], notifications: [] };
    }
    const raw = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Database read error:', err);
    return { users: [], listings: [], demands: [], notifications: [] };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Database write error:', err);
    return false;
  }
}

// Improved Get Local Wi-Fi / LAN IP (strictly filters out virtual & APIPA 169.254 adapters)
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    // Skip virtual Hyper-V, WSL, VirtualBox adapters if possible
    const lowerName = name.toLowerCase();
    const isVirtual = lowerName.includes('vethernet') || lowerName.includes('virtual') || lowerName.includes('wsl');

    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        // Exclude Windows APIPA automatic private IP
        if (net.address.startsWith('169.254.')) continue;

        if (net.address.startsWith('192.168.')) {
          // Standard Home / Office Wi-Fi / Ethernet - top priority!
          return net.address;
        } else if (net.address.startsWith('10.')) {
          // Class A private network
          return net.address;
        } else if (!isVirtual) {
          candidates.push(net.address);
        }
      }
    }
  }

  if (candidates.length > 0) return candidates[0];
  return 'localhost';
}

// Helper: Calculate Matches between Demands and Listings
function calculateMatches(listings, demands) {
  const matches = [];

  demands.forEach(demand => {
    const matchedListings = listings.filter(item => {
      // Filter category (Konut / Arsa / Tarla / Ticari)
      if (demand.type && item.type) {
        const dType = demand.type.toLowerCase();
        const iType = item.type.toLowerCase();
        if (dType === 'arsa' && (iType === 'arsa' || iType === 'tarla')) {
          // Arsa seekers are interested in arsa & tarla
        } else if (dType !== iType && !iType.includes(dType)) {
          return false;
        }
      }
      // Status (Satılık / Kiralık)
      if (demand.status && item.status.toLowerCase() !== demand.status.toLowerCase()) {
        return false;
      }
      // District / City match
      if (demand.district) {
        const itemLocation = `${item.city || ''} ${item.district || ''} ${item.neighborhood || ''}`.toLowerCase();
        const demandLoc = demand.district.toLowerCase();
        if (!itemLocation.includes(demandLoc) && !demandLoc.includes((item.district || '').toLowerCase())) {
          return false;
        }
      }
      // Budget check
      if (demand.budgetMax && item.price > demand.budgetMax * 1.2) { // 20% bargaining room
        return false;
      }
      if (demand.budgetMin && item.price < demand.budgetMin * 0.5) {
        return false;
      }
      return true;
    });

    if (matchedListings.length > 0) {
      matches.push({
        demandId: demand.id,
        demandClient: demand.clientName,
        demandDistrict: demand.district,
        demandConsultant: demand.consultantName,
        demandNotes: demand.notes,
        matchedCount: matchedListings.length,
        matchedListings: matchedListings.map(l => ({
          id: l.id,
          title: l.title,
          price: l.price,
          consultantName: l.consultantName,
          photo: (l.photos && l.photos[0]) || null,
          district: l.district,
          neighborhood: l.neighborhood,
          m2: l.m2,
          type: l.type
        }))
      });
    }
  });

  return matches;
}

// --- API ENDPOINTS ---

// Server Info & Mobile Connection QR Code
app.get('/api/info', async (req, res) => {
  const localIP = getLocalIP();
  const localUrl = `http://localhost:${PORT}`;
  const networkUrl = `http://${localIP}:${PORT}`;
  
  let qrCodeData = null;
  try {
    qrCodeData = await QRCode.toDataURL(networkUrl, {
      margin: 2,
      width: 256,
      color: {
        dark: '#111316',
        light: '#ffffff'
      }
    });
  } catch (e) {
    console.error('QR code generation failed:', e);
  }

  res.json({
    appName: 'AYSA Gayrimenkul Mobil Ofis Havuzu',
    port: PORT,
    localUrl,
    networkUrl,
    localIP,
    qrCodeData
  });
});

// Admin Auth Endpoint (Murat Özcan Patron Login)
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const creds = db.adminCredentials || { username: 'murat', password: '123' };

  if (username === creds.username && password === creds.password) {
    const muratUser = (db.users || []).find(u => u.id === 'u1') || {
      id: 'u1',
      name: 'Murat Özcan',
      role: 'Patron / Ofis Sahibi',
      isAdmin: true
    };
    return res.json({
      success: true,
      token: 'admin-murat-token-' + Date.now(),
      user: muratUser
    });
  }

  return res.status(401).json({ success: false, error: 'Hatalı kullanıcı adı veya şifre!' });
});

// Notifications Endpoint (Patron Ekibe Mobil Bildirim Gönderme)
app.get('/api/notifications', (req, res) => {
  const db = readDB();
  res.json(db.notifications || []);
});

app.post('/api/notifications', (req, res) => {
  const { title, message, sender } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: 'Başlık ve mesaj zorunludur' });
  }

  const db = readDB();
  const newNotif = {
    id: 'notif-' + Date.now(),
    sender: sender || 'Murat Özcan (Patron)',
    title,
    message,
    createdAt: new Date().toISOString()
  };

  db.notifications = db.notifications || [];
  db.notifications.unshift(newNotif);
  // Keep last 30
  if (db.notifications.length > 30) db.notifications = db.notifications.slice(0, 30);
  writeDB(db);

  res.status(201).json(newNotif);
});

// Users (Murat Özcan, Deniz Özdemir, Şamil Deniz, Oğuz İnşaat)
app.get('/api/users', (req, res) => {
  const db = readDB();
  res.json(db.users || []);
});

// Listings (İlan Havuzu)
app.get('/api/listings', (req, res) => {
  const db = readDB();
  let list = db.listings || [];

  const { search, type, status, consultantId, minPrice, maxPrice, sort } = req.query;

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(item => 
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.district && item.district.toLowerCase().includes(q)) ||
      (item.neighborhood && item.neighborhood.toLowerCase().includes(q)) ||
      (item.ada && item.ada.includes(q)) ||
      (item.parsel && item.parsel.includes(q)) ||
      (item.consultantName && item.consultantName.toLowerCase().includes(q))
    );
  }

  if (type && type !== 'all') {
    list = list.filter(item => item.type.toLowerCase() === type.toLowerCase());
  }

  if (status && status !== 'all') {
    list = list.filter(item => item.status.toLowerCase() === status.toLowerCase());
  }

  if (consultantId && consultantId !== 'all') {
    list = list.filter(item => item.consultantId === consultantId);
  }

  if (minPrice) {
    list = list.filter(item => item.price >= Number(minPrice));
  }
  if (maxPrice) {
    list = list.filter(item => item.price <= Number(maxPrice));
  }

  // Sort
  if (sort === 'price_asc') {
    list.sort((a, b) => a.price - b.price);
  } else if (sort === 'price_desc') {
    list.sort((a, b) => b.price - a.price);
  } else {
    // Default newest or by sira
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  res.json(list);
});

// Single Listing
app.get('/api/listings/:id', (req, res) => {
  const db = readDB();
  const item = (db.listings || []).find(l => l.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'İlan bulunamadı' });
  res.json(item);
});

// Create Listing
app.post('/api/listings', (req, res) => {
  const db = readDB();
  const newListing = {
    id: 'lst-' + Date.now(),
    sira: (db.listings && db.listings.length ? db.listings.length + 1 : 1),
    title: req.body.title || 'Yeni Portföy',
    type: req.body.type || 'Konut',
    status: req.body.status || 'Satılık',
    price: Number(req.body.price) || 0,
    m2: Number(req.body.m2) || 0,
    rooms: req.body.rooms || '-',
    floor: req.body.floor || '-',
    city: req.body.city || 'Balıkesir',
    district: req.body.district || 'Altıeylül',
    neighborhood: req.body.neighborhood || '',
    ada: req.body.ada || '',
    parsel: req.body.parsel || '',
    consultantId: req.body.consultantId || 'u1',
    consultantName: req.body.consultantName || 'Murat Özcan',
    consultantPhone: req.body.consultantPhone || '0532 111 22 33',
    features: Array.isArray(req.body.features) ? req.body.features : [],
    internalNotes: req.body.internalNotes || '',
    photos: Array.isArray(req.body.photos) && req.body.photos.length > 0 ? req.body.photos : [
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80'
    ],
    createdAt: new Date().toISOString(),
    isNew: true
  };

  db.listings = db.listings || [];
  db.listings.unshift(newListing);
  writeDB(db);

  res.status(201).json(newListing);
});

// Update Listing
app.put('/api/listings/:id', (req, res) => {
  const db = readDB();
  const idx = (db.listings || []).findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'İlan bulunamadı' });

  db.listings[idx] = {
    ...db.listings[idx],
    ...req.body,
    updatedAt: new Date().toISOString()
  };
  writeDB(db);

  res.json(db.listings[idx]);
});

// Delete Listing
app.delete('/api/listings/:id', (req, res) => {
  const db = readDB();
  db.listings = (db.listings || []).filter(l => l.id !== req.params.id);
  writeDB(db);
  res.json({ success: true, message: 'İlan silindi' });
});

// Demands (Müşteri Talepleri)
app.get('/api/demands', (req, res) => {
  const db = readDB();
  res.json(db.demands || []);
});

app.post('/api/demands', (req, res) => {
  const db = readDB();
  const newDemand = {
    id: 'dmd-' + Date.now(),
    sira: (db.demands && db.demands.length ? db.demands.length + 1 : 1),
    clientName: req.body.clientName || 'İsimsiz Müşteri',
    clientPhone: req.body.clientPhone || '',
    type: req.body.type || 'Arsa',
    status: req.body.status || 'Satılık',
    district: req.body.district || 'Altıeylül',
    rooms: req.body.rooms || '-',
    budgetMin: Number(req.body.budgetMin) || 0,
    budgetMax: Number(req.body.budgetMax) || 0,
    consultantId: req.body.consultantId || 'u1',
    consultantName: req.body.consultantName || 'Murat Özcan',
    notes: req.body.notes || '',
    createdAt: new Date().toISOString()
  };

  db.demands = db.demands || [];
  db.demands.unshift(newDemand);
  writeDB(db);

  res.status(201).json(newDemand);
});

app.delete('/api/demands/:id', (req, res) => {
  const db = readDB();
  db.demands = (db.demands || []).filter(d => d.id !== req.params.id);
  writeDB(db);
  res.json({ success: true, message: 'Talep silindi' });
});

// Matches API
app.get('/api/matches', (req, res) => {
  const db = readDB();
  const matches = calculateMatches(db.listings || [], db.demands || []);
  res.json(matches);
});

// Stats API (Murat Özcan Yönetim Paneli)
app.get('/api/stats', (req, res) => {
  const db = readDB();
  const listings = db.listings || [];
  const demands = db.demands || [];
  const users = db.users || [];

  const totalValue = listings.reduce((sum, item) => sum + (item.price || 0), 0);
  const matches = calculateMatches(listings, demands);

  const consultantBreakdown = users.map(user => {
    const userListings = listings.filter(l => l.consultantId === user.id);
    const userDemands = demands.filter(d => d.consultantId === user.id);
    return {
      userId: user.id,
      name: user.name,
      role: user.role,
      listingCount: userListings.length,
      demandCount: userDemands.length,
      totalVolume: userListings.reduce((s, l) => s + (l.price || 0), 0)
    };
  });

  res.json({
    totalListings: listings.length,
    totalDemands: demands.length,
    totalMatches: matches.length,
    totalPortfolioValue: totalValue,
    consultantBreakdown
  });
});

// Image Upload Endpoint (Multer)
app.post('/api/upload', upload.array('photos', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Yüklenecek dosya seçilmedi' });
  }

  const fileUrls = req.files.map(file => `/uploads/${file.filename}`);
  res.json({ urls: fileUrls });
});

// Fallback to index.html (Express 5 compatible)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('====================================================');
  console.log('  🏢 AYSA GLOBAL GAYRİMENKUL MOBİL OFİS SİSTEMİ');
  console.log('====================================================');
  console.log(`  🖥️  Bu Bilgisayardan:    http://localhost:${PORT}`);
  console.log(`  📱 Cep Telefonlarından:  http://${localIP}:${PORT}`);
  console.log('  (Murat Özcan ve tüm ekip aynı Wi-Fi ağından');
  console.log(`   http://${localIP}:${PORT} adresine girerek kullanabilir!)`);
  console.log('====================================================\n');
});

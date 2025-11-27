import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Mock data store (in-memory)
const mockParts = [];
const mockUsers = new Map(); // email -> user object

// Initialize with dummy data
initializeDummyData();

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'EECAR Local API',
    timestamp: new Date().toISOString(),
    partsCount: mockParts.length
  });
});

// ==================== AUTHENTICATION API ====================
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name, role, companyName } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (mockUsers.has(email)) {
      return res.status(400).json({ error: '이미 등록된 이메일입니다' });
    }

    const user = {
      id: `user-${Date.now()}`,
      email,
      name,
      role,
      companyName: companyName || undefined,
      createdAt: new Date().toISOString(),
    };

    mockUsers.set(email, { ...user, password });
    const token = Buffer.from(`${user.id}:${email}:${Date.now()}`).toString('base64');

    console.log(`[AUTH] User registered: ${email} (${role})`);
    res.status(201).json({ message: 'User registered successfully', token, user });
  } catch (error) {
    console.error('[AUTH ERROR]', error);
    res.status(500).json({ error: 'Failed to register user', message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const storedUser = mockUsers.get(email);
    if (!storedUser || storedUser.password !== password) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 잘못되었습니다' });
    }

    const token = Buffer.from(`${storedUser.id}:${email}:${Date.now()}`).toString('base64');
    const { password: _, ...user } = storedUser;

    console.log(`[AUTH] User logged in: ${email}`);
    res.json({ message: 'Login successful', token, user });
  } catch (error) {
    console.error('[AUTH ERROR]', error);
    res.status(500).json({ error: 'Failed to login', message: error.message });
  }
});

// ==================== SEARCH API ====================
app.post('/api/search', async (req, res) => {
  try {
    const { query, filters, topK = 10 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log(`[SEARCH] Query: "${query}", Filters:`, filters);

    let results = mockParts.filter(part => {
      const searchText = `${part.name} ${part.description} ${part.category} ${part.manufacturer}`.toLowerCase();
      return searchText.includes(query.toLowerCase());
    });

    // Apply filters
    if (filters) {
      if (filters.category) {
        results = results.filter(p => p.category === filters.category);
      }
      if (filters.maxPrice) {
        results = results.filter(p => p.price <= filters.maxPrice);
      }
      if (filters.minQuantity) {
        results = results.filter(p => p.quantity >= filters.minQuantity);
      }
    }

    results = results.slice(0, topK);

    const searchResults = results.map((part, index) => ({
      partId: part.partId,
      score: 0.9 - (index * 0.05),
      part,
      reason: `"${query}"와 관련된 ${part.category} 부품입니다.`,
    }));

    res.json({ results: searchResults, cached: false, count: searchResults.length });
  } catch (error) {
    console.error('[SEARCH ERROR]', error);
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

// ==================== MATERIAL PROPERTY SEARCH API ====================
app.post('/api/material-search', async (req, res) => {
  try {
    const { materialFilters, category, topK = 10 } = req.body;

    console.log('[MATERIAL SEARCH] Filters:', materialFilters);

    if (!materialFilters) {
      return res.status(400).json({
        success: false,
        error: 'materialFilters is required'
      });
    }

    let results = mockParts.filter(part => {
      if (category && part.category !== category) return false;

      const materialComp = part.specifications?.materialComposition;
      if (!materialComp) return false;

      return checkMaterialFilters(materialComp, materialFilters);
    });

    results = results.slice(0, topK).map(part => ({
      partId: part.partId,
      score: 95,
      part,
      reason: generateMaterialReason(part.specifications.materialComposition, materialFilters),
    }));

    res.json({
      success: true,
      data: {
        results,
        cached: false,
        count: results.length,
      }
    });
  } catch (error) {
    console.error('[MATERIAL SEARCH ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Material search failed',
      message: error.message
    });
  }
});

// ==================== BATTERY HEALTH ASSESSMENT API ====================
app.post('/api/battery-assessment', async (req, res) => {
  try {
    const { batteryFilters, topK = 10 } = req.body;

    console.log('[BATTERY ASSESSMENT] Filters:', batteryFilters);

    let results = mockParts.filter(part => {
      if (part.category !== 'battery') return false;

      if (batteryFilters) {
        return checkBatteryFilters(part.batteryHealth, batteryFilters);
      }

      return true;
    });

    results = results.slice(0, topK).map(part => ({
      partId: part.partId,
      score: part.batteryHealth?.soh || 70,
      part,
      reason: generateBatteryReason(part.batteryHealth),
    }));

    res.json({
      success: true,
      data: {
        results,
        cached: false,
        count: results.length,
      }
    });
  } catch (error) {
    console.error('[BATTERY ASSESSMENT ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Battery assessment failed',
      message: error.message
    });
  }
});

// ==================== PARTS API ====================
app.post('/api/parts', async (req, res) => {
  try {
    const partData = req.body;
    const partId = `part-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newPart = {
      partId,
      ...partData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockParts.push(newPart);
    console.log(`[PARTS] Created part: ${partId}`);

    res.status(201).json({
      message: 'Part registered successfully',
      partId,
      metadata: newPart,
    });
  } catch (error) {
    console.error('[PARTS ERROR]', error);
    res.status(500).json({ error: 'Failed to register part', message: error.message });
  }
});

app.get('/api/parts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const part = mockParts.find(p => p.partId === id);

    if (!part) {
      return res.status(404).json({ error: 'Part not found' });
    }

    res.json(part);
  } catch (error) {
    console.error('[PARTS ERROR]', error);
    res.status(500).json({ error: 'Failed to get part', message: error.message });
  }
});

app.get('/api/parts', async (req, res) => {
  try {
    const { category, limit = 20 } = req.query;

    let parts = mockParts;

    if (category) {
      parts = parts.filter(p => p.category === category);
    }

    parts = parts.slice(0, parseInt(limit));

    res.json({ parts, count: parts.length });
  } catch (error) {
    console.error('[PARTS ERROR]', error);
    res.status(500).json({ error: 'Failed to list parts', message: error.message });
  }
});

// ==================== HELPER FUNCTIONS ====================

function checkMaterialFilters(material, filters) {
  if (filters.tensileStrengthMPa) {
    const value = material.tensileStrengthMPa;
    if (!value) return false;
    if (filters.tensileStrengthMPa.min && value < filters.tensileStrengthMPa.min) return false;
    if (filters.tensileStrengthMPa.max && value > filters.tensileStrengthMPa.max) return false;
  }

  if (filters.alloyNumber && material.alloyNumber !== filters.alloyNumber) {
    return false;
  }

  if (filters.recyclability?.min && material.recyclability < filters.recyclability.min) {
    return false;
  }

  return true;
}

function checkBatteryFilters(batteryHealth, filters) {
  if (!batteryHealth) return false;

  if (filters.soh) {
    const soh = batteryHealth.soh;
    if (filters.soh.min && soh < filters.soh.min) return false;
    if (filters.soh.max && soh > filters.soh.max) return false;
  }

  if (filters.cathodeType?.length > 0) {
    if (!filters.cathodeType.includes(batteryHealth.cathodeType)) return false;
  }

  if (filters.recommendedUse?.length > 0) {
    if (!filters.recommendedUse.includes(batteryHealth.recommendedUse)) return false;
  }

  return true;
}

function generateMaterialReason(material, filters) {
  const reasons = [];

  if (material.alloyNumber) {
    reasons.push(`합금 번호: ${material.alloyNumber}`);
  }
  if (material.tensileStrengthMPa) {
    reasons.push(`인장강도: ${material.tensileStrengthMPa} MPa`);
  }
  if (material.recyclability) {
    reasons.push(`재활용성: ${material.recyclability}%`);
  }

  return reasons.join(' | ');
}

function generateBatteryReason(batteryHealth) {
  if (!batteryHealth) return '배터리 정보 없음';

  const reasons = [];
  reasons.push(`SOH ${batteryHealth.soh}%`);
  reasons.push(batteryHealth.recommendedUse === 'reuse' ? '재사용 추천' : '재활용 권장');

  if (batteryHealth.suitableApplications?.length > 0) {
    reasons.push(`활용: ${batteryHealth.suitableApplications.slice(0, 2).join(', ')}`);
  }

  return reasons.join(' | ');
}

// ==================== DUMMY DATA INITIALIZATION ====================

// 랜덤 이미지 선택 헬퍼 함수
function getRandomImage(category) {
  const imageMap = {
    'battery': ['batterypack_1.jpg', 'batterypack_2.jpeg', 'batterypack_3.jpg'],
    'motor': ['motor_1.jpg', 'motor_2.jpg', 'motor_3.jpg'],
    'inverter': ['inverter_1.png', 'inverter_2.jpg', 'inverter_3.png'],
    'body-chassis-frame': ['car_body_1.jpg', 'car_body_2.jpg', 'car_body_3.png'],
    'body-panel': ['car_body_1.jpg', 'car_body_2.jpg', 'car_body_3.png'],
    'body-door': ['car_body_1.jpg', 'car_body_2.jpg', 'car_body_3.png'],
    'body-window': ['car_body_1.jpg', 'car_body_2.jpg', 'car_body_3.png'],
    'charger': ['batterypack_1.jpg', 'batterypack_2.jpeg'],
    'electronics': ['inverter_1.png', 'inverter_2.jpg', 'inverter_3.png'],
  };

  const images = imageMap[category] || ['car_body_1.jpg'];
  const randomImage = images[Math.floor(Math.random() * images.length)];
  return [`/image/${randomImage}`];
}

function initializeDummyData() {
  // Battery parts with health info
  mockParts.push({
    partId: 'battery-001',
    name: '현대 아이오닉5 배터리 팩',
    category: 'battery',
    manufacturer: '현대자동차',
    model: '아이오닉5',
    year: 2022,
    condition: 'used',
    price: 4500000,
    quantity: 2,
    sellerId: 'seller-001',
    description: '2022년식 아이오닉5 배터리 팩, 주행거리 30,000km',
    images: getRandomImage('battery'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    batteryHealth: {
      soh: 92,
      soc: 85,
      cycleCount: 450,
      estimatedMileageKm: 150000,
      cathodeType: 'NCM Ni 80%',
      manufacturer: '현대자동차',
      model: '아이오닉5',
      year: 2022,
      recommendedUse: 'reuse',
      suitableApplications: ['EV 재사용', 'ESS', '전동킥보드'],
      degradationRate: 2.5,
      recyclingMethod: ['wet_metallurgy'],
      vendorRecommendations: ['성일하이텍', 'SungEel'],
    },
  });

  mockParts.push({
    partId: 'battery-002',
    name: '테슬라 Model 3 배터리 모듈',
    category: 'battery',
    manufacturer: 'Tesla',
    model: 'Model 3',
    year: 2020,
    condition: 'used',
    price: 1800000,
    quantity: 5,
    sellerId: 'seller-002',
    description: '2020년식 Model 3 배터리 모듈, SOH 75%',
    images: getRandomImage('battery'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    batteryHealth: {
      soh: 75,
      soc: 70,
      cycleCount: 1200,
      estimatedMileageKm: 80000,
      cathodeType: 'NCA',
      manufacturer: 'Tesla',
      model: 'Model 3',
      year: 2020,
      recommendedUse: 'reuse',
      suitableApplications: ['ESS', '전동킥보드', '소형 전동기기'],
      degradationRate: 5.0,
      recyclingMethod: ['wet_metallurgy', 'direct_recycling'],
      vendorRecommendations: ['Redwood Materials', '성일하이텍'],
    },
  });

  mockParts.push({
    partId: 'battery-003',
    name: '기아 EV6 배터리 팩',
    category: 'battery',
    manufacturer: '기아',
    model: 'EV6',
    year: 2023,
    condition: 'refurbished',
    price: 5200000,
    quantity: 1,
    sellerId: 'seller-003',
    description: '2023년식 EV6 배터리 팩, 재생품',
    images: getRandomImage('battery'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    batteryHealth: {
      soh: 88,
      soc: 90,
      cycleCount: 200,
      estimatedMileageKm: 180000,
      cathodeType: 'NCM Ni 80%',
      manufacturer: '기아',
      model: 'EV6',
      year: 2023,
      recommendedUse: 'reuse',
      suitableApplications: ['EV 재사용', 'ESS'],
      degradationRate: 3.0,
      recyclingMethod: ['wet_metallurgy'],
      vendorRecommendations: ['성일하이텍'],
    },
  });

  // Body parts with material properties
  mockParts.push({
    partId: 'body-chassis-001',
    name: 'BMW i3 카본 프레임',
    category: 'body-chassis-frame',
    manufacturer: 'BMW',
    model: 'i3',
    year: 2019,
    condition: 'used',
    price: 1200000,
    quantity: 1,
    sellerId: 'seller-004',
    description: 'BMW i3 CFRP 카본 섀시 프레임',
    images: getRandomImage('body-chassis-frame'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      materialComposition: {
        primary: 'CFRP',
        secondary: ['Epoxy Resin', 'Carbon Fiber'],
        percentage: { 'Carbon Fiber': 60, 'Epoxy': 40 },
        tensileStrengthMPa: 3500,
        yieldStrengthMPa: 3000,
        elasticModulusGPa: 230,
        elongationPercent: 1.5,
        density: 1.6,
        recyclability: 40,
      },
      dimensions: { length: 2500, width: 1500, height: 400, unit: 'mm' },
      weight: 45,
    },
  });

  mockParts.push({
    partId: 'body-panel-001',
    name: '테슬라 Model S 알루미늄 후드',
    category: 'body-panel',
    manufacturer: 'Tesla',
    model: 'Model S',
    year: 2021,
    condition: 'used',
    price: 450000,
    quantity: 3,
    sellerId: 'seller-005',
    description: '알루미늄 6061 합금 후드 패널',
    images: getRandomImage('body-panel'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      materialComposition: {
        primary: 'Aluminum',
        secondary: ['Al 6061'],
        percentage: { Al: 97.9, Mg: 1.0, Si: 0.6, Cu: 0.28, Cr: 0.2 },
        tensileStrengthMPa: 310,
        yieldStrengthMPa: 276,
        elasticModulusGPa: 68.9,
        elongationPercent: 12,
        hardness: 'HB 95',
        density: 2.7,
        meltingPoint: 582,
        alloyNumber: '6061',
        recyclability: 95,
      },
      dimensions: { length: 1400, width: 1200, height: 50, unit: 'mm' },
      weight: 15,
    },
  });

  mockParts.push({
    partId: 'body-door-001',
    name: '아우디 e-tron 알루미늄 도어',
    category: 'body-door',
    manufacturer: 'Audi',
    model: 'e-tron',
    year: 2020,
    condition: 'used',
    price: 680000,
    quantity: 2,
    sellerId: 'seller-006',
    description: '알루미늄 5754 합금 도어 패널',
    images: getRandomImage('body-door'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      materialComposition: {
        primary: 'Aluminum',
        secondary: ['Al 5754'],
        percentage: { Al: 95.4, Mg: 3.1, Mn: 0.5, Cr: 0.3 },
        tensileStrengthMPa: 220,
        yieldStrengthMPa: 80,
        elasticModulusGPa: 70,
        elongationPercent: 27,
        hardness: 'HB 62',
        density: 2.66,
        meltingPoint: 607,
        alloyNumber: '5754',
        recyclability: 93,
      },
      dimensions: { length: 1100, width: 800, height: 60, unit: 'mm' },
      weight: 22,
    },
  });

  mockParts.push({
    partId: 'body-panel-002',
    name: '포르쉐 Taycan 알루미늄 루프',
    category: 'body-panel',
    manufacturer: 'Porsche',
    model: 'Taycan',
    year: 2022,
    condition: 'refurbished',
    price: 950000,
    quantity: 1,
    sellerId: 'seller-007',
    description: '알루미늄 7075 고강도 루프 패널',
    images: getRandomImage('body-panel'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      materialComposition: {
        primary: 'Aluminum',
        secondary: ['Al 7075'],
        percentage: { Al: 90, Zn: 5.6, Mg: 2.5, Cu: 1.6, Cr: 0.23 },
        tensileStrengthMPa: 572,
        yieldStrengthMPa: 503,
        elasticModulusGPa: 71.7,
        elongationPercent: 11,
        hardness: 'HB 150',
        density: 2.81,
        meltingPoint: 477,
        alloyNumber: '7075',
        recyclability: 90,
      },
      dimensions: { length: 1800, width: 1300, height: 40, unit: 'mm' },
      weight: 18,
    },
  });

  // ==================== ADDITIONAL BATTERIES (Based on ref doc) ====================

  // 닛산 리프 - LMO, SOH 65% (재활용 권장)
  mockParts.push({
    partId: 'battery-004',
    name: '닛산 리프 배터리 팩 (재활용 등급)',
    category: 'battery',
    manufacturer: 'Nissan',
    model: 'Leaf',
    year: 2010,
    condition: 'used',
    price: 3200000,
    quantity: 2,
    sellerId: 'seller-008',
    description: 'LMO 양극재, SOH 65%, ESS 전환용 추천',
    images: getRandomImage('battery'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      batterySoh: 65,
      capacity: 24.0,
      voltage: 360,
      cathodeType: 'LMO',
      cycleCount: 1100,
      warrantyMonths: 6,
    },
  });

  // BMW i3 - NCM, SOH 72%
  mockParts.push({
    partId: 'battery-005',
    name: 'BMW i3 배터리 팩',
    category: 'battery',
    manufacturer: 'BMW',
    model: 'i3',
    year: 2013,
    condition: 'used',
    price: 5500000,
    quantity: 1,
    sellerId: 'seller-009',
    description: 'NCM 양극재, SOH 72%, 재사용 가능',
    images: getRandomImage('battery'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      batterySoh: 72,
      capacity: 33.0,
      voltage: 360,
      cathodeType: 'NCM Ni 60%',
      cycleCount: 850,
      warrantyMonths: 12,
    },
  });

  // 쉐보레 스파크 EV - LMO, SOH 68%
  mockParts.push({
    partId: 'battery-006',
    name: '쉐보레 스파크 EV 배터리',
    category: 'battery',
    manufacturer: 'Chevrolet',
    model: 'Spark EV',
    year: 2013,
    condition: 'used',
    price: 3800000,
    quantity: 1,
    sellerId: 'seller-010',
    description: 'LMO 양극재, 소형차용 배터리',
    images: getRandomImage('battery'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      batterySoh: 68,
      capacity: 19.0,
      voltage: 327,
      cathodeType: 'LMO',
      cycleCount: 920,
      warrantyMonths: 6,
    },
  });

  // 테슬라 Model S 85 - NCA, SOH 88% (재사용 최적)
  mockParts.push({
    partId: 'battery-007',
    name: 'Tesla Model S 85 배터리 팩 (재사용 최적)',
    category: 'battery',
    manufacturer: 'Tesla',
    model: 'Model S 85',
    year: 2014,
    condition: 'used',
    price: 14500000,
    quantity: 1,
    sellerId: 'seller-011',
    description: 'NCA 양극재, SOH 88%, 213,000km 예측 주행 가능',
    images: getRandomImage('battery'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      batterySoh: 88,
      capacity: 85.0,
      voltage: 375,
      cathodeType: 'NCA',
      cycleCount: 450,
      warrantyMonths: 24,
    },
  });

  // 르노 조에 - NCM, SOH 78%
  mockParts.push({
    partId: 'battery-008',
    name: '르노 조에 Q210 배터리',
    category: 'battery',
    manufacturer: 'Renault',
    model: 'Zoe Q210',
    year: 2012,
    condition: 'used',
    price: 4200000,
    quantity: 1,
    sellerId: 'seller-012',
    description: 'NCM 양극재, 105,000km 예측 주행',
    images: getRandomImage('battery'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      batterySoh: 78,
      capacity: 22.0,
      voltage: 360,
      cathodeType: 'NCM Ni 60%',
      cycleCount: 780,
      warrantyMonths: 12,
    },
  });

  // 기아 쏘울 EV - NCM Ni 33%, SOH 75%
  mockParts.push({
    partId: 'battery-009',
    name: '기아 쏘울 EV 배터리 (재생 완료)',
    category: 'battery',
    manufacturer: 'Kia',
    model: 'Soul EV',
    year: 2014,
    condition: 'refurbished',
    price: 6800000,
    quantity: 2,
    sellerId: 'seller-013',
    description: 'NCM Ni 33%, SOH 75%, 재생 처리 완료',
    images: getRandomImage('battery'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      batterySoh: 75,
      capacity: 27.0,
      voltage: 360,
      cathodeType: 'NCM Ni 33%',
      cycleCount: 650,
      warrantyMonths: 18,
    },
  });

  // 폭스바겐 e-골프 - NCM, SOH 71%
  mockParts.push({
    partId: 'battery-010',
    name: '폭스바겐 e-골프 배터리',
    category: 'battery',
    manufacturer: 'Volkswagen',
    model: 'e-Golf',
    year: 2014,
    condition: 'used',
    price: 5100000,
    quantity: 1,
    sellerId: 'seller-014',
    description: 'NCM 양극재, 67,000km 예측 주행',
    images: getRandomImage('battery'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      batterySoh: 71,
      capacity: 24.2,
      voltage: 323,
      cathodeType: 'NCM Ni 60%',
      cycleCount: 720,
      warrantyMonths: 12,
    },
  });

  // ==================== MOTORS ====================

  mockParts.push({
    partId: 'motor-001',
    name: '현대 아이오닉 Electric 모터',
    category: 'motor',
    manufacturer: 'Hyundai',
    model: 'Ioniq Electric',
    year: 2016,
    condition: 'used',
    price: 2800000,
    quantity: 1,
    sellerId: 'seller-015',
    description: '88kW PMSM 영구자석 동기 모터',
    images: getRandomImage('motor'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      powerOutputKW: 88,
      torqueNm: 295,
      rpmMax: 10500,
      efficiency: 94.5,
      coolingType: 'liquid',
      weight: 58,
    },
  });

  mockParts.push({
    partId: 'motor-002',
    name: '기아 EV6 후륜 모터',
    category: 'motor',
    manufacturer: 'Kia',
    model: 'EV6',
    year: 2022,
    condition: 'refurbished',
    price: 4200000,
    quantity: 1,
    sellerId: 'seller-016',
    description: '168kW PMSM, 재생 처리 완료',
    images: getRandomImage('motor'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      powerOutputKW: 168,
      torqueNm: 350,
      rpmMax: 13500,
      efficiency: 95.8,
      coolingType: 'liquid',
      weight: 72,
    },
  });

  mockParts.push({
    partId: 'motor-003',
    name: 'Tesla Model 3 전륜 모터 (유도)',
    category: 'motor',
    manufacturer: 'Tesla',
    model: 'Model 3',
    year: 2019,
    condition: 'used',
    price: 3900000,
    quantity: 1,
    sellerId: 'seller-017',
    description: '147kW AC 유도 모터',
    images: getRandomImage('motor'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      powerOutputKW: 147,
      torqueNm: 375,
      rpmMax: 15000,
      efficiency: 92.5,
      coolingType: 'liquid',
      weight: 68,
    },
  });

  mockParts.push({
    partId: 'motor-004',
    name: '닛산 리프 모터',
    category: 'motor',
    manufacturer: 'Nissan',
    model: 'Leaf',
    year: 2018,
    condition: 'used',
    price: 2500000,
    quantity: 2,
    sellerId: 'seller-018',
    description: '110kW PMSM 모터',
    images: getRandomImage('motor'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      powerOutputKW: 110,
      torqueNm: 320,
      rpmMax: 10390,
      efficiency: 94.0,
      coolingType: 'liquid',
      weight: 60,
    },
  });

  mockParts.push({
    partId: 'motor-005',
    name: 'BMW i3 모터 유닛',
    category: 'motor',
    manufacturer: 'BMW',
    model: 'i3',
    year: 2015,
    condition: 'refurbished',
    price: 3200000,
    quantity: 1,
    sellerId: 'seller-019',
    description: '125kW PMSM, 재생 처리',
    images: getRandomImage('motor'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      powerOutputKW: 125,
      torqueNm: 250,
      rpmMax: 11400,
      efficiency: 93.8,
      coolingType: 'liquid',
      weight: 55,
    },
  });

  mockParts.push({
    partId: 'motor-006',
    name: '현대 코나 Electric 모터',
    category: 'motor',
    manufacturer: 'Hyundai',
    model: 'Kona Electric',
    year: 2020,
    condition: 'used',
    price: 3500000,
    quantity: 1,
    sellerId: 'seller-020',
    description: '150kW PMSM 모터',
    images: getRandomImage('motor'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      powerOutputKW: 150,
      torqueNm: 395,
      rpmMax: 11000,
      efficiency: 95.2,
      coolingType: 'liquid',
      weight: 65,
    },
  });

  // ==================== INVERTERS ====================

  mockParts.push({
    partId: 'inverter-001',
    name: '현대 아이오닉 5 인버터 (800V)',
    category: 'inverter',
    manufacturer: 'Hyundai',
    model: 'Ioniq 5',
    year: 2022,
    condition: 'used',
    price: 1950000,
    quantity: 1,
    sellerId: 'seller-021',
    description: '800V 고전압 SiC 인버터',
    images: getRandomImage('inverter'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      voltageRating: 800,
      currentRating: 400,
      efficiency: 97.8,
      coolingType: 'liquid',
      weight: 16,
    },
  });

  mockParts.push({
    partId: 'inverter-002',
    name: '기아 EV6 인버터 (800V)',
    category: 'inverter',
    manufacturer: 'Kia',
    model: 'EV6',
    year: 2023,
    condition: 'new',
    price: 2650000,
    quantity: 2,
    sellerId: 'seller-022',
    description: '800V 초고속충전 대응, 신품',
    images: getRandomImage('inverter'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      voltageRating: 800,
      currentRating: 450,
      efficiency: 98.2,
      coolingType: 'liquid',
      weight: 17,
    },
  });

  mockParts.push({
    partId: 'inverter-003',
    name: 'Tesla Model 3 인버터',
    category: 'inverter',
    manufacturer: 'Tesla',
    model: 'Model 3',
    year: 2020,
    condition: 'refurbished',
    price: 2100000,
    quantity: 1,
    sellerId: 'seller-023',
    description: '400V SiC 인버터, 재생 완료',
    images: getRandomImage('inverter'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      voltageRating: 400,
      currentRating: 500,
      efficiency: 96.9,
      coolingType: 'liquid',
      weight: 18,
    },
  });

  mockParts.push({
    partId: 'inverter-004',
    name: '닛산 리프 인버터',
    category: 'inverter',
    manufacturer: 'Nissan',
    model: 'Leaf',
    year: 2018,
    condition: 'used',
    price: 1400000,
    quantity: 1,
    sellerId: 'seller-024',
    description: '360V 인버터 모듈',
    images: getRandomImage('inverter'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      voltageRating: 360,
      currentRating: 350,
      efficiency: 95.5,
      coolingType: 'liquid',
      weight: 14,
    },
  });

  mockParts.push({
    partId: 'inverter-005',
    name: 'BMW i3 인버터',
    category: 'inverter',
    manufacturer: 'BMW',
    model: 'i3',
    year: 2016,
    condition: 'used',
    price: 1650000,
    quantity: 1,
    sellerId: 'seller-025',
    description: '360V 인버터',
    images: getRandomImage('inverter'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      voltageRating: 360,
      currentRating: 380,
      efficiency: 96.2,
      coolingType: 'liquid',
      weight: 15,
    },
  });

  mockParts.push({
    partId: 'inverter-006',
    name: '폭스바겐 ID.4 인버터',
    category: 'inverter',
    manufacturer: 'Volkswagen',
    model: 'ID.4',
    year: 2021,
    condition: 'refurbished',
    price: 1880000,
    quantity: 1,
    sellerId: 'seller-026',
    description: '400V MEB 플랫폼 인버터',
    images: getRandomImage('inverter'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      voltageRating: 400,
      currentRating: 380,
      efficiency: 96.7,
      coolingType: 'liquid',
      weight: 15,
    },
  });

  // ==================== BODY PARTS (차체 부품 - 알루미늄 합금) ====================

  // 추가 샤시/프레임
  mockParts.push({
    partId: 'body-chassis-002',
    name: 'Tesla Model S 서브프레임',
    category: 'body-chassis-frame',
    manufacturer: 'Tesla',
    model: 'Model S',
    year: 2021,
    condition: 'used',
    price: 2850000,
    quantity: 1,
    sellerId: 'seller-027',
    description: '알루미늄 7075 고강도 서브프레임',
    images: getRandomImage('body-chassis-frame'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      materialComposition: {
        primary: 'Aluminum',
        secondary: ['Al 7075'],
        percentage: { Al: 90, Zn: 5.6, Mg: 2.5, Cu: 1.6, Cr: 0.23 },
        tensileStrengthMPa: 572,
        yieldStrengthMPa: 503,
        elasticModulusGPa: 71.7,
        elongationPercent: 11,
        hardness: 'HB 150',
        density: 2.81,
        meltingPoint: 477,
        alloyNumber: '7075',
        recyclability: 90,
      },
      dimensions: { length: 2200, width: 700, height: 250, unit: 'mm' },
      weight: 125,
    },
  });

  mockParts.push({
    partId: 'body-chassis-003',
    name: '아우디 e-tron 알루미늄 스페이스 프레임',
    category: 'body-chassis-frame',
    manufacturer: 'Audi',
    model: 'e-tron',
    year: 2020,
    condition: 'used',
    price: 4500000,
    quantity: 1,
    sellerId: 'seller-028',
    description: 'ASF 알루미늄 6061 프레임',
    images: getRandomImage('body-chassis-frame'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      materialComposition: {
        primary: 'Aluminum',
        secondary: ['Al 6061'],
        percentage: { Al: 97.9, Mg: 1.0, Si: 0.6, Cu: 0.28, Cr: 0.2 },
        tensileStrengthMPa: 310,
        yieldStrengthMPa: 276,
        elasticModulusGPa: 68.9,
        elongationPercent: 12,
        hardness: 'HB 95',
        density: 2.70,
        meltingPoint: 582,
        alloyNumber: '6061',
        recyclability: 95,
      },
      dimensions: { length: 2400, width: 800, height: 300, unit: 'mm' },
      weight: 180,
    },
  });

  // 추가 외판/패널
  mockParts.push({
    partId: 'body-panel-003',
    name: '현대 아이오닉 5 후드',
    category: 'body-panel',
    manufacturer: 'Hyundai',
    model: 'Ioniq 5',
    year: 2022,
    condition: 'refurbished',
    price: 780000,
    quantity: 1,
    sellerId: 'seller-029',
    description: '알루미늄 5754 후드, 재도색 완료',
    images: getRandomImage('body-panel'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      materialComposition: {
        primary: 'Aluminum',
        secondary: ['Al 5754'],
        percentage: { Al: 95.5, Mg: 3.1, Mn: 0.5, Cr: 0.3, Fe: 0.4, Si: 0.2 },
        tensileStrengthMPa: 220,
        yieldStrengthMPa: 80,
        elasticModulusGPa: 70,
        elongationPercent: 27,
        hardness: 'HB 62',
        density: 2.66,
        meltingPoint: 607,
        alloyNumber: '5754',
        recyclability: 93,
      },
      dimensions: { length: 1650, width: 1200, height: 55, unit: 'mm' },
      weight: 26,
    },
  });

  mockParts.push({
    partId: 'body-panel-004',
    name: 'BMW i4 트렁크 리드',
    category: 'body-panel',
    manufacturer: 'BMW',
    model: 'i4',
    year: 2022,
    condition: 'used',
    price: 650000,
    quantity: 1,
    sellerId: 'seller-030',
    description: '알루미늄 6061 트렁크',
    images: getRandomImage('body-panel'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      materialComposition: {
        primary: 'Aluminum',
        secondary: ['Al 6061'],
        percentage: { Al: 97.9, Mg: 1.0, Si: 0.6, Cu: 0.28, Cr: 0.2 },
        tensileStrengthMPa: 310,
        yieldStrengthMPa: 276,
        elasticModulusGPa: 68.9,
        elongationPercent: 12,
        hardness: 'HB 95',
        density: 2.70,
        meltingPoint: 582,
        alloyNumber: '6061',
        recyclability: 95,
      },
      dimensions: { length: 1300, width: 1100, height: 50, unit: 'mm' },
      weight: 20,
    },
  });

  // 도어 부품
  mockParts.push({
    partId: 'body-door-002',
    name: 'Tesla Model 3 운전석 도어',
    category: 'body-door',
    manufacturer: 'Tesla',
    model: 'Model 3',
    year: 2020,
    condition: 'used',
    price: 980000,
    quantity: 1,
    sellerId: 'seller-031',
    description: '알루미늄 6061 도어',
    images: getRandomImage('body-door'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      materialComposition: {
        primary: 'Aluminum',
        secondary: ['Al 6061'],
        percentage: { Al: 97.9, Mg: 1.0, Si: 0.6, Cu: 0.28, Cr: 0.2 },
        tensileStrengthMPa: 310,
        yieldStrengthMPa: 276,
        elasticModulusGPa: 68.9,
        elongationPercent: 12,
        hardness: 'HB 95',
        density: 2.70,
        meltingPoint: 582,
        alloyNumber: '6061',
        recyclability: 95,
      },
      dimensions: { length: 1150, width: 850, height: 140, unit: 'mm' },
      weight: 32,
    },
  });

  mockParts.push({
    partId: 'body-door-003',
    name: '기아 EV6 뒷좌석 도어',
    category: 'body-door',
    manufacturer: 'Kia',
    model: 'EV6',
    year: 2023,
    condition: 'new',
    price: 1150000,
    quantity: 2,
    sellerId: 'seller-032',
    description: '알루미늄 5754 도어, 신품',
    images: getRandomImage('body-door'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      materialComposition: {
        primary: 'Aluminum',
        secondary: ['Al 5754'],
        percentage: { Al: 95.5, Mg: 3.1, Mn: 0.5, Cr: 0.3, Fe: 0.4, Si: 0.2 },
        tensileStrengthMPa: 220,
        yieldStrengthMPa: 80,
        elasticModulusGPa: 70,
        elongationPercent: 27,
        hardness: 'HB 62',
        density: 2.66,
        meltingPoint: 607,
        alloyNumber: '5754',
        recyclability: 93,
      },
      dimensions: { length: 1050, width: 800, height: 130, unit: 'mm' },
      weight: 28,
    },
  });

  // 윈도우/유리
  mockParts.push({
    partId: 'body-window-001',
    name: 'Tesla Model 3 프론트 윈드쉴드',
    category: 'body-window',
    manufacturer: 'Tesla',
    model: 'Model 3',
    year: 2021,
    condition: 'used',
    price: 450000,
    quantity: 1,
    sellerId: 'seller-027',
    description: '강화유리, UV 차단 코팅',
    images: getRandomImage('body-window'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      dimensions: { length: 1450, width: 850, height: 5, unit: 'mm' },
      weight: 12,
    },
  });

  mockParts.push({
    partId: 'body-window-002',
    name: 'Tesla Model Y 파노라마 선루프',
    category: 'body-window',
    manufacturer: 'Tesla',
    model: 'Model Y',
    year: 2022,
    condition: 'used',
    price: 850000,
    quantity: 1,
    sellerId: 'seller-033',
    description: '파노라마 글래스 루프',
    images: getRandomImage('body-window'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      dimensions: { length: 1400, width: 1000, height: 6, unit: 'mm' },
      weight: 18,
    },
  });

  mockParts.push({
    partId: 'body-window-003',
    name: '현대 코나 Electric 프론트 윈드쉴드',
    category: 'body-window',
    manufacturer: 'Hyundai',
    model: 'Kona Electric',
    year: 2021,
    condition: 'new',
    price: 520000,
    quantity: 2,
    sellerId: 'seller-034',
    description: '강화유리, UV/IR 차단 코팅, 신품',
    images: getRandomImage('body-window'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: {
      dimensions: { length: 1380, width: 820, height: 5, unit: 'mm' },
      weight: 11,
    },
  });

  console.log(`[INIT] Loaded ${mockParts.length} dummy parts`);
  console.log(`  - Batteries: ${mockParts.filter(p => p.category === 'battery').length}`);
  console.log(`  - Body parts: ${mockParts.filter(p => p.category.startsWith('body-')).length}`);
}

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`\n🚀 EECAR Local Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📦 Parts loaded: ${mockParts.length}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  POST /api/auth/signup`);
  console.log(`  POST /api/auth/login`);
  console.log(`  POST /api/search`);
  console.log(`  POST /api/material-search (NEW)`);
  console.log(`  POST /api/battery-assessment (NEW)`);
  console.log(`  GET  /api/parts`);
  console.log(`  POST /api/parts`);
  console.log(`  GET  /api/parts/:id`);
  console.log(`\n`);
});

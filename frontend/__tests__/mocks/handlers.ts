import { http, HttpResponse } from 'msw';

// Mock parts data
export const mockParts = [
  {
    partId: 'battery-001',
    name: '현대 아이오닉5 배터리 팩',
    category: 'battery',
    manufacturer: 'SK온',
    model: 'NCM811-72kWh',
    price: 8500000,
    quantity: 2,
    condition: 'excellent',
    description: '2023년식 아이오닉5에서 분리된 72kWh 배터리 팩. SOH 92%, 350 사이클',
    imageUrl: '/images/battery.jpg',
    batteryHealth: {
      soh: 92,
      cycles: 350,
      cathodeType: 'NCM Ni 80%',
    },
  },
  {
    partId: 'motor-001',
    name: '테슬라 모델3 구동 모터',
    category: 'motor',
    manufacturer: 'Tesla',
    model: 'Model3-RWD',
    price: 4200000,
    quantity: 1,
    condition: 'good',
    description: '테슬라 모델3 RWD 버전의 리어 구동 모터. 정상 작동 확인',
    imageUrl: '/images/motor.jpg',
  },
  {
    partId: 'inverter-001',
    name: 'LG 인버터 컨버터',
    category: 'inverter',
    manufacturer: 'LG전자',
    model: 'INV-200',
    price: 2800000,
    quantity: 3,
    condition: 'excellent',
    description: 'LG 전기차용 인버터. 최신 IGBT 기술 적용',
    imageUrl: '/images/inverter.jpg',
  },
];

// Mock search results
export const mockSearchResults = {
  results: mockParts.map((part, index) => ({
    partId: part.partId,
    name: part.name,
    category: part.category,
    manufacturer: part.manufacturer,
    price: part.price,
    condition: part.condition,
    matchScore: 0.95 - index * 0.1,
    matchReason: `${part.category} 카테고리에서 높은 유사도로 검색됨`,
  })),
  total: 3,
  query: '배터리',
  searchMethod: 'ai',
  cached: false,
};

// Use wildcard pattern to match any base URL (works with both relative and absolute URLs)
export const handlers = [
  // GET /api/parts - Get all parts (matches any base URL)
  http.get('*/api/parts', ({ request }) => {
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    let filteredParts = mockParts;
    if (category && category !== 'all') {
      filteredParts = mockParts.filter((p) => p.category === category);
    }

    return HttpResponse.json({
      parts: filteredParts.slice(0, limit),
      total: filteredParts.length,
    });
  }),

  // GET /api/parts/:id - Get single part
  http.get('*/api/parts/:partId', ({ params }) => {
    const { partId } = params;
    const part = mockParts.find((p) => p.partId === partId);

    if (!part) {
      return HttpResponse.json({ error: 'Part not found' }, { status: 404 });
    }

    return HttpResponse.json(part);
  }),

  // POST /api/search/explain - 검색 결과 설명 (검색 응답과 분리)
  http.post('*/api/search/explain', async ({ request }) => {
    const body = await request.json() as { query: string; partIds: string[] };
    return HttpResponse.json({
      explanations: Object.fromEntries(body.partIds.map(id => [id, `${body.query}: ${id} 설명`])),
      cached: false,
    });
  }),

  // POST /api/search - Search parts
  http.post('*/api/search', async ({ request }) => {
    const body = await request.json() as { query?: string; filters?: { category?: string } };
    const query = body.query || '';
    const filters = body.filters || {};

    let results = mockSearchResults.results;

    // Apply category filter
    if (filters.category) {
      results = results.filter((r) => r.category === filters.category);
    }

    // Simple query matching
    if (query) {
      results = results.filter(
        (r) =>
          r.name.toLowerCase().includes(query.toLowerCase()) ||
          r.category.toLowerCase().includes(query.toLowerCase())
      );
    }

    return HttpResponse.json({
      ...mockSearchResults,
      results,
      total: results.length,
      query,
    });
  }),

  // POST /api/auth/login
  http.post('*/api/auth/login', async ({ request }) => {
    const body = await request.json() as { email?: string; password?: string };
    const { email, password } = body;

    if (email === 'test@test.com' && password === 'password123') {
      return HttpResponse.json({
        user: {
          id: 'user-001',
          email: 'test@test.com',
          name: 'Test User',
          role: 'buyer',
        },
        token: 'mock-jwt-token',
      });
    }

    return HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }),

  // POST /api/auth/signup
  http.post('*/api/auth/signup', async ({ request }) => {
    const body = await request.json() as { email?: string; name?: string; role?: string };
    const { email, name, role } = body;

    return HttpResponse.json({
      user: {
        id: 'user-new',
        email,
        name,
        role,
      },
      token: 'mock-jwt-token',
    });
  }),

  // POST /api/contact - Contact inquiry
  http.post('*/api/contact', () => {
    return HttpResponse.json({
      success: true,
      message: '문의가 성공적으로 전송되었습니다.',
    });
  }),

  // POST /api/proposals - Create proposal
  http.post('*/api/proposals', () => {
    return HttpResponse.json({
      proposalId: 'proposal-001',
      status: 'pending',
      message: '제안이 성공적으로 생성되었습니다.',
    });
  }),
];

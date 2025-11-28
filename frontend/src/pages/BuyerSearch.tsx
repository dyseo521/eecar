import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { SearchRequest, SearchResponse, Part, WatchCriteria } from '@shared/index';
import { mockParts } from '../data/mockParts';
import { getApiUrl } from '../config';

// 카테고리 매핑 (한글 -> 영문)
const categoryMap: Record<string, string> = {
  '배터리': 'battery',
  '모터': 'motor',
  '인버터': 'inverter',
  '충전기': 'charger',
  '전장 부품': 'electronics',
  '차체-섀시/프레임': 'body-chassis-frame',
  '차체-패널': 'body-panel',
  '차체-도어': 'body-door',
  '차체-창/유리': 'body-window',
  '내장재': 'interior',
  '기타': 'other',
};

// 카테고리별 기본 이미지
const categoryDefaultImages: Record<string, string> = {
  'battery': '/image/batterypack_1.jpg',
  'motor': '/image/motor_1.jpg',
  'inverter': '/image/inverter_1.png',
  'body-chassis-frame': '/image/car_body_1.jpg',
  'body-panel': '/image/car_body_1.jpg',
  'body-door': '/image/car_body_1.jpg',
  'body-window': '/image/car_body_1.jpg',
  'charger': '/image/batterypack_1.jpg',
  'electronics': '/image/inverter_1.png',
  'interior': '/image/car_body_1.jpg',
  'other': '/image/car_body_1.jpg',
};

// 이미지 URL 가져오기 헬퍼 함수
const getPartImageUrl = (part: Part): string => {
  if (part.images && part.images.length > 0 && part.images[0]) {
    return part.images[0];
  }
  return categoryDefaultImages[part.category] || '/image/car_body_1.jpg';
};

// mockParts를 Part 타입으로 변환하는 헬퍼 함수
const convertMockPartToPart = (mockPart: any): Part => {
  // 한글 카테고리를 영문으로 변환
  const categoryEng = Object.entries(categoryMap).find(
    ([kor, _]) => mockPart.category === kor
  )?.[1] || 'other';

  return {
    partId: mockPart.id,
    name: mockPart.name,
    category: categoryEng as any,
    manufacturer: mockPart.manufacturer,
    model: mockPart.model,
    year: mockPart.year,
    condition: 'used' as any,
    price: mockPart.price,
    quantity: mockPart.quantity,
    sellerId: mockPart.seller?.company || 'demo-seller',
    description: mockPart.description,
    images: mockPart.images,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    specifications: mockPart.specifications,
    useCases: mockPart.useCases
  };
};

export default function BuyerSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchParams, setSearchParams] = useState<SearchRequest | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 20000000]);

  // 고급 검색 필터 상태
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [searchMode, setSearchMode] = useState<'ai' | 'battery' | 'material'>('ai');

  // AI 검색 모드 토글
  const [isAIMode, setIsAIMode] = useState(true);

  // 배터리 필터
  const [batterySohMin, setBatterySohMin] = useState<number>(70);
  const [batterySohMax, setBatterySohMax] = useState<number>(100);
  const [selectedCathodeTypes, setSelectedCathodeTypes] = useState<string[]>([]);

  // 재질 필터
  const [alloyNumber, setAlloyNumber] = useState<string>('');
  const [tensileStrengthMin, setTensileStrengthMin] = useState<number | ''>('');
  const [recyclabilityMin, setRecyclabilityMin] = useState<number | ''>('');

  // Watch 모달 상태
  const [showWatchModal, setShowWatchModal] = useState(false);
  const [watchEmail, setWatchEmail] = useState('');
  const [watchCategory, setWatchCategory] = useState<string>('');
  const [watchMaxPrice, setWatchMaxPrice] = useState<number>(10000000);
  const [watchKeywords, setWatchKeywords] = useState<string>('');

  // AI 검색
  const { data, error, isLoading: isSearching } = useQuery({
    queryKey: ['search', searchParams],
    queryFn: async () => {
      if (!searchParams) return null;

      const response = await fetch(getApiUrl('search'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchParams),
      });

      if (!response.ok) {
        throw new Error('검색에 실패했습니다');
      }

      return response.json() as Promise<SearchResponse>;
    },
    enabled: !!searchParams && searchMode === 'ai',
  });

  // 배터리 SOH 검색
  const { data: batteryData, error: batteryError } = useQuery({
    queryKey: ['battery-assessment', batterySohMin, batterySohMax, selectedCathodeTypes],
    queryFn: async () => {
      const batteryFilters: any = {
        soh: { min: batterySohMin, max: batterySohMax }
      };

      if (selectedCathodeTypes.length > 0) {
        batteryFilters.cathodeType = selectedCathodeTypes;
      }

      const response = await fetch(getApiUrl('battery-health'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batteryFilters, topK: 20 }),
      });

      if (!response.ok) {
        throw new Error('배터리 검색에 실패했습니다');
      }

      const result = await response.json();
      return result.data as SearchResponse;
    },
    enabled: searchMode === 'battery' && !!searchParams,
  });

  // 재질 물성 검색
  const { data: materialData, error: materialError } = useQuery({
    queryKey: ['material-search', alloyNumber, tensileStrengthMin, recyclabilityMin, selectedCategory],
    queryFn: async () => {
      const materialFilters: any = {};

      if (alloyNumber) {
        materialFilters.alloyNumber = alloyNumber;
      }
      if (tensileStrengthMin !== '') {
        materialFilters.tensileStrengthMPa = { min: Number(tensileStrengthMin) };
      }
      if (recyclabilityMin !== '') {
        materialFilters.recyclability = { min: Number(recyclabilityMin) };
      }

      const payload: any = { materialFilters, topK: 20 };
      if (selectedCategory !== 'all') {
        payload.category = categoryMap[selectedCategory] || selectedCategory;
      }

      const response = await fetch(getApiUrl('material-search'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('재질 검색에 실패했습니다');
      }

      const result = await response.json();
      return result.data as SearchResponse;
    },
    enabled: searchMode === 'material' && !!searchParams && (!!alloyNumber || tensileStrengthMin !== '' || recyclabilityMin !== ''),
  });

  // 부품 목록 조회 (카테고리별)
  const { data: partsData, isLoading: isPartsLoading } = useQuery({
    queryKey: ['parts', selectedCategory],
    queryFn: async () => {
      try {
        // 전체 카테고리인 경우 카테고리 필터 없이 모든 부품 조회
        let url: string;
        if (selectedCategory !== 'all') {
          const category = categoryMap[selectedCategory] || selectedCategory;
          url = getApiUrl(`parts?category=${category}&limit=50`);
        } else {
          url = getApiUrl('parts?limit=50');
        }

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error('부품 목록을 불러오는데 실패했습니다');
        }

        return response.json() as Promise<{ parts: Part[]; count: number }>;
      } catch (error) {
        // API 호출 실패 시 mock 데이터 사용 (정적 호스팅 대응)
        console.log('API 호출 실패, mock 데이터 사용:', error);

        // mockParts를 Part 타입으로 변환
        const convertedParts = mockParts.map(convertMockPartToPart);

        // 카테고리 필터링
        let filteredParts = convertedParts;
        if (selectedCategory !== 'all') {
          const category = categoryMap[selectedCategory] || selectedCategory;
          filteredParts = convertedParts.filter(part => part.category === category);
        }

        return {
          parts: filteredParts,
          count: filteredParts.length
        };
      }
    },
    enabled: !searchParams, // AI 검색 중이 아닐 때만 실행
  });

  // Watch 생성 mutation
  const createWatchMutation = useMutation({
    mutationFn: async (watchData: {
      buyerId: string;
      email: string;
      criteria: WatchCriteria;
    }) => {
      const response = await fetch(getApiUrl('watch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(watchData),
      });

      if (!response.ok) {
        throw new Error('알림 설정에 실패했습니다');
      }

      return response.json();
    },
    onSuccess: () => {
      alert('✅ 알림이 설정되었습니다! 조건에 맞는 부품이 등록되면 이메일로 알려드립니다.');
      setShowWatchModal(false);
      // Reset form
      setWatchEmail('');
      setWatchCategory('');
      setWatchMaxPrice(10000000);
      setWatchKeywords('');
    },
    onError: (error: Error) => {
      alert(`❌ 알림 설정 실패: ${error.message}`);
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (isAIMode) {
      // AI 모드: AI 검색 실행
      setSearchMode('ai');
      setSearchParams({ query: query.trim(), topK: 10 });
    } else {
      // 기본 모드: 일반 검색 (카테고리/가격 필터만 적용)
      setSearchParams(null);
    }
  };

  const handleAdvancedSearch = () => {
    if (searchMode === 'battery') {
      setSearchParams({ query: 'battery-search', topK: 20 });
    } else if (searchMode === 'material') {
      setSearchParams({ query: 'material-search', topK: 20 });
    }
  };

  // 검색 조건 초기화 함수
  const handleReset = () => {
    setQuery('');
    setSearchParams(null);
    setSelectedCategory('all');
    setPriceRange([0, 20000000]);
    setBatterySohMin(70);
    setBatterySohMax(100);
    setSelectedCathodeTypes([]);
    setAlloyNumber('');
    setTensileStrengthMin('');
    setRecyclabilityMin('');
    setSearchMode('ai');
    setIsAIMode(false);
  };

  const handleCreateWatch = () => {
    if (!watchEmail) {
      alert('이메일을 입력해주세요.');
      return;
    }

    const criteria: WatchCriteria = {
      ...(watchCategory && { category: categoryMap[watchCategory] as any }),
      ...(watchMaxPrice && { maxPrice: watchMaxPrice }),
      ...(watchKeywords && { keywords: watchKeywords.split(',').map(k => k.trim()) }),
    };

    createWatchMutation.mutate({
      buyerId: 'demo-buyer', // TODO: 실제 사용자 ID로 교체
      email: watchEmail,
      criteria,
    });
  };

  // 검색 모드별 데이터 통합
  const currentData = searchMode === 'battery' ? batteryData :
                      searchMode === 'material' ? materialData :
                      data;
  const currentError = searchMode === 'battery' ? batteryError :
                       searchMode === 'material' ? materialError :
                       error;

  // 가격 및 검색어 필터링된 부품 목록
  const filteredParts = partsData?.parts.filter(part => {
    // 가격 필터
    const priceMatch = part.price >= priceRange[0] && part.price <= priceRange[1];

    // 기본 모드에서 검색어가 있을 경우 필터링
    if (!isAIMode && query.trim()) {
      const searchTerm = query.toLowerCase();
      const nameMatch = part.name.toLowerCase().includes(searchTerm);
      const manufacturerMatch = part.manufacturer.toLowerCase().includes(searchTerm);
      const modelMatch = part.model.toLowerCase().includes(searchTerm);
      const textMatch = nameMatch || manufacturerMatch || modelMatch;
      return priceMatch && textMatch;
    }

    return priceMatch;
  }) || [];

  const categories = ['all', '배터리', '모터', '인버터', '충전기', '전장 부품', '차체-섀시/프레임', '차체-패널', '차체-도어', '차체-창/유리', '내장재', '기타'];

  // 예시 사례 데이터
  const exampleCases = [
    {
      query: "ESS 에너지 저장 시스템에 사용할 배터리를 찾고 있어요. 60kWh 이상이면 좋겠습니다.",
      result: {
        name: "Tesla Model S 배터리 팩",
        capacity: "85kWh",
        score: 0.94
      }
    },
    {
      query: "전기 트럭 개조 프로젝트를 위한 고성능 모터가 필요합니다.",
      result: {
        name: "Nissan Leaf 구동 모터",
        power: "110kW",
        score: 0.89
      }
    },
    {
      query: "태양광 연계 ESS 구축용 인버터를 구하고 있습니다. 3상 전력 지원 필요.",
      result: {
        name: "BMW i3 인버터",
        type: "3상 AC/DC",
        score: 0.92
      }
    },
    {
      query: "소형 전기차 DIY 프로젝트. 20kWh 정도의 배터리면 충분할 것 같아요.",
      result: {
        name: "Renault Zoe 배터리 모듈",
        capacity: "22kWh",
        score: 0.88
      }
    },
    {
      query: "전기 보트 전환 프로젝트를 진행 중입니다. 방수 처리된 모터가 필요해요.",
      result: {
        name: "Chevrolet Bolt 구동 모터",
        power: "150kW",
        score: 0.85
      }
    }
  ];

  return (
    <div className="buyer-search">
      <header className="page-header">
        <div className="header-left">
          <button onClick={() => navigate('/')} className="back-button">
            ← 홈으로
          </button>
          <h1>부품 검색</h1>
        </div>

        {/* 검색창 - AI 모드 토글 포함 */}
        <div className="header-search">
          <form onSubmit={handleSearch} className={`search-form ${isAIMode ? 'ai-mode' : 'basic-mode'}`}>
            {/* AI 모드 배경 효과 */}
            {isAIMode && (
              <>
                <div className="ai-glow-effect"></div>
                <div className="ai-particles">
                  <span className="particle"></span>
                  <span className="particle"></span>
                  <span className="particle"></span>
                </div>
              </>
            )}

            {/* 검색 모드 토글 버튼 */}
            <button
              type="button"
              className={`search-mode-toggle ${isAIMode ? 'ai-active' : ''}`}
              onClick={() => setIsAIMode(!isAIMode)}
              title={isAIMode ? 'AI 검색 모드' : '기본 검색 모드'}
            >
              {isAIMode ? (
                <svg className="toggle-icon ai-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                  <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3"/>
                </svg>
              ) : (
                <svg className="toggle-icon basic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="M21 21L16.65 16.65"/>
                </svg>
              )}
              <span className="toggle-label">{isAIMode ? 'AI' : '기본'}</span>
            </button>

            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isAIMode
                ? "✨ AI에게 물어보세요: ESS 구축용 안전한 배터리를 찾습니다. 60kWh 이상, 5년 이상 사용 가능한 제품"
                : "부품명, 제조사, 모델명으로 검색..."
              }
              className="search-input"
            />
            <button
              type="submit"
              disabled={!query.trim()}
              className="search-arrow-btn"
            >
              →
            </button>
          </form>
        </div>

        <button onClick={() => setShowWatchModal(true)} className="watch-button">
          🔔 관심 부품 알림 설정
        </button>
      </header>

      <main className="search-layout">
        {/* 왼쪽 필터 영역 */}
        <aside className="filter-sidebar">
          <div className="filter-sticky">
            <section className="filter-section">
              <h3>카테고리</h3>
              <div className="category-filters">
                {categories.map(cat => (
                  <button
                    key={cat}
                    className={`category-btn ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat === 'all' ? '전체' : cat}
                  </button>
                ))}
              </div>
            </section>

            <section className="filter-section">
              <h3>가격 범위</h3>
              <div className="price-filters">
                <button
                  className={`price-btn ${priceRange[0] === 0 && priceRange[1] === 20000000 ? 'active' : ''}`}
                  onClick={() => setPriceRange([0, 20000000])}
                >
                  전체
                </button>
                <button
                  className={`price-btn ${priceRange[0] === 0 && priceRange[1] === 5000000 ? 'active' : ''}`}
                  onClick={() => setPriceRange([0, 5000000])}
                >
                  500만원 이하
                </button>
                <button
                  className={`price-btn ${priceRange[0] === 5000000 && priceRange[1] === 10000000 ? 'active' : ''}`}
                  onClick={() => setPriceRange([5000000, 10000000])}
                >
                  500만원-1000만원
                </button>
                <button
                  className={`price-btn ${priceRange[0] === 10000000 && priceRange[1] === 20000000 ? 'active' : ''}`}
                  onClick={() => setPriceRange([10000000, 20000000])}
                >
                  1000만원 이상
                </button>
              </div>
            </section>

            {/* 고급 검색 필터 */}
            <section className="filter-section">
              <div className="advanced-search-header">
                <h3>고급 검색</h3>
                <button
                  className="toggle-advanced-btn"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                >
                  {showAdvancedFilters ? '−' : '+'}
                </button>
              </div>

              {showAdvancedFilters && (
                <>
                  {/* 검색 모드 선택 */}
                  <div className="search-mode-selector">
                    <button
                      className={`mode-btn ${searchMode === 'battery' ? 'active' : ''}`}
                      onClick={() => setSearchMode('battery')}
                    >
                      배터리 SOH
                    </button>
                    <button
                      className={`mode-btn ${searchMode === 'material' ? 'active' : ''}`}
                      onClick={() => setSearchMode('material')}
                    >
                      재질 물성
                    </button>
                  </div>

                  {/* 초기화 버튼 */}
                  <button
                    className="reset-filter-btn"
                    onClick={handleReset}
                    title="모든 검색 조건 초기화"
                  >
                    🔄 초기화
                  </button>

                  {/* 배터리 SOH 필터 */}
                  {searchMode === 'battery' && (
                    <div className="battery-filters">
                      <div className="filter-group">
                        <label>SOH 범위 (%)</label>
                        <div className="range-inputs">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={batterySohMin}
                            onChange={(e) => setBatterySohMin(Number(e.target.value))}
                            className="filter-input"
                          />
                          <span>~</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={batterySohMax}
                            onChange={(e) => setBatterySohMax(Number(e.target.value))}
                            className="filter-input"
                          />
                        </div>
                      </div>

                      <div className="filter-group">
                        <label>양극재 타입</label>
                        <div className="cathode-types">
                          {['NCM Ni 80%', 'NCM Ni 60%', 'NCA', 'LFP'].map(type => (
                            <label key={type} className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={selectedCathodeTypes.includes(type)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedCathodeTypes([...selectedCathodeTypes, type]);
                                  } else {
                                    setSelectedCathodeTypes(selectedCathodeTypes.filter(t => t !== type));
                                  }
                                }}
                              />
                              {type}
                            </label>
                          ))}
                        </div>
                      </div>

                      <button
                        className="apply-filter-btn"
                        onClick={handleAdvancedSearch}
                      >
                        검색
                      </button>
                    </div>
                  )}

                  {/* 재질 물성 필터 */}
                  {searchMode === 'material' && (
                    <div className="material-filters">
                      <div className="filter-group">
                        <label>합금 번호</label>
                        <input
                          type="text"
                          placeholder="예: 6061, 7075"
                          value={alloyNumber}
                          onChange={(e) => setAlloyNumber(e.target.value)}
                          className="filter-input"
                        />
                      </div>

                      <div className="filter-group">
                        <label>최소 인장강도 (MPa)</label>
                        <input
                          type="number"
                          placeholder="예: 300"
                          value={tensileStrengthMin}
                          onChange={(e) => setTensileStrengthMin(e.target.value ? Number(e.target.value) : '')}
                          className="filter-input"
                        />
                      </div>

                      <div className="filter-group">
                        <label>최소 재활용성 (%)</label>
                        <input
                          type="number"
                          placeholder="예: 90"
                          min="0"
                          max="100"
                          value={recyclabilityMin}
                          onChange={(e) => setRecyclabilityMin(e.target.value ? Number(e.target.value) : '')}
                          className="filter-input"
                        />
                      </div>

                      <button
                        className="apply-filter-btn"
                        onClick={handleAdvancedSearch}
                      >
                        검색
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </aside>

        {/* 중앙 부품 그리드 */}
        <div className="parts-main">

          {currentError && (
            <div className="error-message">
              검색 중 오류가 발생했습니다: {(currentError as Error).message}
            </div>
          )}

          {/* AI 검색 로딩 */}
          {isSearching && (
            <div className="ai-search-loading">
              <div className="loading-spinner">
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
              </div>
              <div className="loading-text-container">
                <h3>AI 검색 중</h3>
                <p className="loading-step">벡터 임베딩 생성 중...</p>
                <p className="loading-step">유사도 분석 중...</p>
                <p className="loading-step">최적 매칭 부품 선정 중...</p>
              </div>
            </div>
          )}

          {/* 고급 검색 결과 */}
          {currentData && !isSearching && (
            <section className="ai-results">
              <div className="results-header">
                <h2>
                  {searchMode === 'battery' ? '배터리 SOH 검색 결과' :
                   searchMode === 'material' ? '재질 물성 검색 결과' :
                   'AI 검색 결과'} ({currentData.count}개)
                </h2>
                {currentData.cached && <span className="cached-badge">⚡ 캐시됨</span>}
              </div>

              <div className="parts-grid">
                {currentData.results.map((result, index) => {
                  const accuracy = result.score * 100;
                  const isTopMatch = accuracy >= 80;
                  const isEliteMatch = index < 3 && accuracy >= 85;

                  return (
                    <div
                      key={result.partId}
                      className={`part-card-ai ${isEliteMatch ? 'elite-match' : isTopMatch ? 'top-match' : ''}`}
                      onClick={() => navigate(`/parts/${result.partId}`)}
                    >
                      {isEliteMatch && <div className="elite-badge">✨ 최고 매칭</div>}
                      <div className={`ai-score-badge ${isEliteMatch ? 'elite' : isTopMatch ? 'high' : ''}`}>
                        정확도 {accuracy.toFixed(0)}%
                      </div>
                      <div className="part-info">
                        <h4>{result.part.name}</h4>
                        <p className="manufacturer">{result.part.manufacturer} · {result.part.model}</p>
                        <p className="price">{result.part.price?.toLocaleString()}원</p>
                        <p className="ai-reason">{result.reason}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 기본 부품 목록 */}
          {!currentData && (
            <>
              <div className="parts-header">
                <h2>등록된 부품 ({filteredParts.length}개)</h2>
                {isPartsLoading && <span className="loading-text">로딩 중...</span>}
              </div>

              {isPartsLoading ? (
                <div className="loading-message">부품 목록을 불러오는 중...</div>
              ) : filteredParts.length === 0 ? (
                <div className="empty-message">
                  <p>등록된 부품이 없습니다.</p>
                  <p className="empty-hint">다른 카테고리를 선택해보세요.</p>
                </div>
              ) : (
                <div className="parts-grid">
                  {filteredParts.map((part) => (
                    <div
                      key={part.partId}
                      className="part-card"
                      onClick={() => navigate(`/parts/${part.partId}`)}
                    >
                      <div className="part-image">
                        <img
                          src={getPartImageUrl(part)}
                          alt={part.name}
                          onError={(e) => {
                            // 카테고리별 기본 이미지로 재시도
                            const defaultImg = categoryDefaultImages[part.category] || '/image/car_body_1.jpg';
                            if (e.currentTarget.src !== window.location.origin + defaultImg) {
                              e.currentTarget.src = defaultImg;
                            }
                          }}
                        />
                        <div className="quantity-badge">{part.quantity}개 재고</div>
                      </div>
                      <div className="part-info">
                        <h4>{part.name}</h4>
                        <p className="manufacturer">{part.manufacturer} · {part.model}</p>
                        <p className="price">{part.price.toLocaleString()}원</p>
                        <div className="spec-tags">
                          <span className="spec-tag">{part.category}</span>
                          <span className="year-tag">{part.year}년식</span>
                          <span className="condition-tag">{part.condition}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 예시 사이드바 (축소) */}
        <aside className="examples-sidebar-compact">
          <div className="sidebar-sticky">
            <h3>검색 예시</h3>
            <div className="examples-list">
              {exampleCases.slice(0, 3).map((example, index) => (
                <div key={index} className="example-card-compact">
                  <div className="example-query">
                    <p>{example.query}</p>
                  </div>
                  <div className="example-result">
                    <strong>{example.result.name}</strong>
                    <span className="score-badge">
                      정확도 {(example.result.score * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {/* Watch 모달 */}
      {showWatchModal && (
        <div className="modal-overlay" onClick={() => setShowWatchModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>관심 부품 알림 설정</h3>
              <button className="close-button" onClick={() => setShowWatchModal(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-description">
                원하는 조건에 맞는 부품이 등록되면 이메일로 알려드립니다.
              </p>

              <div className="form-group">
                <label>이메일 주소 *</label>
                <input
                  type="email"
                  placeholder="example@email.com"
                  value={watchEmail}
                  onChange={(e) => setWatchEmail(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>카테고리</label>
                <select
                  value={watchCategory}
                  onChange={(e) => setWatchCategory(e.target.value)}
                  className="form-select"
                >
                  <option value="">전체</option>
                  {categories.filter(c => c !== 'all').map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>최대 가격 (원)</label>
                <input
                  type="number"
                  placeholder="10000000"
                  value={watchMaxPrice}
                  onChange={(e) => setWatchMaxPrice(Number(e.target.value))}
                  className="form-input"
                  step="100000"
                />
              </div>

              <div className="form-group">
                <label>키워드 (쉼표로 구분)</label>
                <input
                  type="text"
                  placeholder="예: Tesla, 고성능, ESS"
                  value={watchKeywords}
                  onChange={(e) => setWatchKeywords(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="modal-tip">
                조건을 입력하지 않으면 모든 부품에 대해 알림을 받습니다.
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="cancel-button"
                onClick={() => setShowWatchModal(false)}
              >
                취소
              </button>
              <button
                className="submit-button"
                onClick={handleCreateWatch}
                disabled={createWatchMutation.isPending}
              >
                {createWatchMutation.isPending ? '설정 중...' : '알림 설정하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .buyer-search {
          min-height: 100vh;
          background: linear-gradient(180deg, #f0f4ff 0%, #ffffff 100%);
        }

        .page-header {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          padding: 1.5rem 2rem;
          box-shadow: 0 4px 20px rgba(58, 0, 187, 0.1);
          position: sticky;
          top: 0;
          z-index: 100;
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 1.5rem;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .header-search {
          max-width: 800px;
          justify-self: center;
          width: 100%;
        }

        .watch-button {
          justify-self: end;
        }

        .search-form {
          position: relative;
          display: flex;
          align-items: center;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        /* 검색 모드 토글 버튼 */
        .search-mode-toggle {
          position: absolute;
          left: 0.75rem;
          z-index: 10;
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.5rem 0.875rem;
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 50px;
          cursor: pointer;
          font-size: 0.75rem;
          font-weight: 700;
          color: #6b7280;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .search-mode-toggle:hover {
          transform: scale(1.05);
          border-color: #0055f4;
        }

        .search-mode-toggle.ai-active {
          background: linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%);
          border-color: transparent;
          color: white;
          box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4),
                      0 0 40px rgba(6, 182, 212, 0.2);
          animation: aiPulse 2s ease-in-out infinite;
        }

        @keyframes aiPulse {
          0%, 100% {
            box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4),
                        0 0 40px rgba(6, 182, 212, 0.2);
          }
          50% {
            box-shadow: 0 6px 30px rgba(139, 92, 246, 0.6),
                        0 0 60px rgba(6, 182, 212, 0.4);
          }
        }

        .toggle-icon {
          width: 16px;
          height: 16px;
          transition: all 0.3s ease;
        }

        .search-mode-toggle.ai-active .ai-icon {
          animation: aiSpin 3s linear infinite;
        }

        @keyframes aiSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .toggle-label {
          font-size: 0.6875rem;
          font-weight: 600;
        }

        /* AI 모드 효과 */
        .ai-glow-effect {
          position: absolute;
          inset: -2px;
          background: linear-gradient(135deg, #8b5cf6, #06b6d4, #8b5cf6);
          background-size: 200% 200%;
          border-radius: 50px;
          opacity: 0;
          animation: aiGlowPulse 3s ease-in-out infinite;
          pointer-events: none;
          z-index: 0;
        }

        .search-form.ai-mode .ai-glow-effect {
          opacity: 0.15;
        }

        @keyframes aiGlowPulse {
          0%, 100% {
            background-position: 0% 50%;
            opacity: 0.1;
          }
          50% {
            background-position: 100% 50%;
            opacity: 0.2;
          }
        }

        /* AI 입자 효과 */
        .ai-particles {
          position: absolute;
          inset: 0;
          border-radius: 50px;
          overflow: hidden;
          pointer-events: none;
          z-index: 1;
        }

        .particle {
          position: absolute;
          width: 3px;
          height: 3px;
          background: linear-gradient(135deg, #8b5cf6, #06b6d4);
          border-radius: 50%;
          opacity: 0;
        }

        .search-form.ai-mode .particle {
          animation: particleFloat 4s ease-in-out infinite;
        }

        .particle:nth-child(1) {
          left: 20%;
          animation-delay: 0s;
        }

        .particle:nth-child(2) {
          left: 50%;
          animation-delay: 1.5s;
        }

        .particle:nth-child(3) {
          left: 80%;
          animation-delay: 3s;
        }

        @keyframes particleFloat {
          0%, 100% {
            transform: translateY(100%) scale(0);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(-100%) scale(1.5);
            opacity: 0;
          }
        }

        /* 검색 입력창 */
        .search-input {
          width: 100%;
          padding: 0.875rem 4rem 0.875rem 6.5rem;
          border: 2px solid #d1d5db;
          border-radius: 50px;
          font-size: 1rem;
          font-family: inherit;
          background: white;
          color: #1f2937;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          line-height: 1.5;
          height: 3.25rem;
          position: relative;
          z-index: 5;
        }

        .search-form.ai-mode .search-input {
          border: 2px solid transparent;
          background: linear-gradient(white, white) padding-box,
                      linear-gradient(135deg, #8b5cf6, #06b6d4) border-box;
          box-shadow: 0 4px 20px rgba(139, 92, 246, 0.15),
                      0 0 60px rgba(6, 182, 212, 0.1);
        }

        .search-input:focus {
          outline: none;
          border-color: #0055f4;
          box-shadow: 0 4px 16px rgba(0, 85, 244, 0.15);
        }

        .search-form.ai-mode .search-input:focus {
          border-color: transparent;
          box-shadow: 0 6px 30px rgba(139, 92, 246, 0.3),
                      0 0 80px rgba(6, 182, 212, 0.2);
        }

        .search-input::placeholder {
          color: #9ca3af;
          font-size: 0.9375rem;
        }

        .search-form.ai-mode .search-input::placeholder {
          background: linear-gradient(135deg, #8b5cf6, #06b6d4);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          font-weight: 500;
        }

        .search-arrow-btn {
          position: absolute;
          right: 0.5rem;
          top: 50%;
          transform: translateY(-50%);
          width: 2.25rem;
          height: 2.25rem;
          background: #0055f4;
          color: white;
          border: none;
          border-radius: 50%;
          font-size: 1rem;
          font-weight: 300;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          line-height: 1;
          z-index: 10;
        }

        .search-arrow-btn:hover:not(:disabled) {
          background: #0040c0;
          transform: translateY(-50%) scale(1.1);
        }

        .search-arrow-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* AI Mode Search Arrow Button */
        .search-form.ai-mode .search-arrow-btn {
          background: linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%);
          box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4),
                      0 0 30px rgba(6, 182, 212, 0.2);
          animation: aiButtonPulse 2s ease-in-out infinite;
        }

        .search-form.ai-mode .search-arrow-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #7c3aed 0%, #0891b2 100%);
          transform: translateY(-50%) scale(1.15);
          box-shadow: 0 6px 25px rgba(139, 92, 246, 0.6),
                      0 0 50px rgba(6, 182, 212, 0.4);
        }

        @keyframes aiButtonPulse {
          0%, 100% {
            box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4),
                        0 0 30px rgba(6, 182, 212, 0.2);
          }
          50% {
            box-shadow: 0 6px 20px rgba(139, 92, 246, 0.5),
                        0 0 40px rgba(6, 182, 212, 0.3);
          }
        }

        .page-header h1 {
          margin: 0;
          color: #0055f4;
          font-size: 1.8rem;
          white-space: nowrap;
        }

        .watch-button {
          padding: 0.75rem 1.5rem;
          background: linear-gradient(135deg, #0055f4, #0080ff);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 600;
          transition: all 0.3s ease;
          box-shadow: 0 2px 8px rgba(0, 85, 244, 0.2);
        }

        .watch-button:hover {
          background: linear-gradient(135deg, #0040c0, #0060dd);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 85, 244, 0.3);
        }

        .back-button {
          padding: 0.75rem 1.5rem;
          border: 2px solid #0055f4;
          background: white;
          color: #0055f4;
          border-radius: 8px;
          cursor: pointer;
          font-size: 1rem;
          font-weight: 600;
          transition: all 0.3s ease;
        }

        .back-button:hover {
          background: #0055f4;
          color: white;
          transform: translateX(-4px);
        }

        .search-layout {
          max-width: 1600px;
          margin: 0 auto;
          padding: 2rem;
          display: grid;
          grid-template-columns: 300px 1fr 280px;
          gap: 1.5rem;
          align-items: start;
        }

        /* 왼쪽 필터 사이드바 */
        .filter-sidebar {
          position: relative;
        }

        .filter-sticky {
          position: sticky;
          top: 100px;
          background: white;
          border-radius: 16px;
          padding: 1.5rem;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
        }

        /* 필터 섹션 */
        .filter-section {
          padding-bottom: 1.5rem;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .filter-section:last-child {
          border-bottom: none;
          margin-bottom: 0;
          padding-bottom: 0;
        }

        .filter-section h3 {
          margin: 0 0 1rem 0;
          color: #1f2937;
          font-size: 1rem;
          font-weight: 700;
        }

        .category-filters,
        .price-filters {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .category-btn,
        .price-btn {
          padding: 0.75rem 1rem;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
        }

        .category-btn:hover,
        .price-btn:hover {
          border-color: #0055f4;
          color: #0055f4;
        }

        .category-btn.active,
        .price-btn.active {
          background: #0055f4;
          border-color: #0055f4;
          color: white;
          font-weight: 600;
        }

        /* 중앙 메인 영역 */
        .parts-main {
          min-width: 0;
        }

        .error-message {
          background: rgba(255, 82, 82, 0.1);
          color: #d32f2f;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          border-left: 4px solid #d32f2f;
          font-size: 0.875rem;
        }

        .parts-header,
        .results-header {
          margin-bottom: 1.5rem;
        }

        .parts-header h2,
        .results-header h2 {
          margin: 0;
          color: #1f2937;
          font-size: 1.5rem;
          font-weight: 700;
        }

        .loading-text {
          color: #6b7280;
          font-size: 0.875rem;
          margin-left: 1rem;
        }

        .loading-message {
          text-align: center;
          padding: 3rem;
          color: #6b7280;
          font-size: 1rem;
        }

        .empty-message {
          text-align: center;
          padding: 3rem;
          color: #6b7280;
        }

        .empty-message p {
          margin: 0.5rem 0;
          font-size: 1rem;
        }

        .empty-hint {
          font-size: 0.875rem;
          color: #9ca3af;
        }

        .cached-badge {
          background: #0080ff;
          color: white;
          padding: 0.375rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          margin-left: 0.75rem;
        }

        /* 부품 그리드 - 당근 스타일 */
        .parts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.25rem;
        }

        .part-card {
          background: white;
          border-radius: 12px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid #e5e7eb;
        }

        .part-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.12);
          border-color: #0055f4;
        }

        .part-image {
          position: relative;
          width: 100%;
          height: 200px;
          overflow: hidden;
          background: #f3f4f6;
        }

        .part-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .quantity-badge {
          position: absolute;
          bottom: 8px;
          right: 8px;
          background: rgba(0, 0, 0, 0.75);
          color: white;
          padding: 0.375rem 0.75rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .part-card .part-info {
          padding: 1rem;
        }

        .part-card .part-info h4 {
          margin: 0 0 0.5rem 0;
          color: #1f2937;
          font-size: 1rem;
          font-weight: 700;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .part-card .manufacturer {
          margin: 0 0 0.5rem 0;
          color: #6b7280;
          font-size: 0.875rem;
        }

        .part-card .price {
          margin: 0 0 0.75rem 0;
          color: #1f2937;
          font-size: 1.125rem;
          font-weight: 700;
        }

        .spec-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
        }

        .spec-tag,
        .year-tag,
        .condition-tag {
          padding: 0.25rem 0.625rem;
          background: #f3f4f6;
          color: #374151;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .year-tag {
          background: #dbeafe;
          color: #1e40af;
        }

        .condition-tag {
          background: #dcfce7;
          color: #166534;
        }

        /* AI 검색 결과 카드 */
        .part-card-ai {
          position: relative;
          background: white;
          border: 2px solid #0080ff;
          border-radius: 12px;
          padding: 1.25rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .part-card-ai:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px rgba(0, 128, 255, 0.2);
        }

        .ai-score-badge {
          position: absolute;
          top: -10px;
          right: 12px;
          background: linear-gradient(135deg, #0055f4, #0080ff);
          color: white;
          padding: 0.375rem 0.875rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 700;
          box-shadow: 0 4px 8px rgba(0, 85, 244, 0.3);
        }

        .part-card-ai .part-info h4 {
          margin: 0 0 0.5rem 0;
          color: #1f2937;
          font-size: 1.125rem;
          font-weight: 700;
        }

        .part-card-ai .manufacturer {
          margin: 0 0 0.5rem 0;
          color: #6b7280;
          font-size: 0.875rem;
        }

        .part-card-ai .price {
          margin: 0 0 0.75rem 0;
          color: #0055f4;
          font-size: 1.25rem;
          font-weight: 700;
        }

        .part-card-ai .ai-reason {
          margin: 0;
          padding: 0.75rem;
          background: rgba(0, 128, 255, 0.08);
          border-radius: 8px;
          color: #374151;
          font-size: 0.875rem;
          line-height: 1.5;
        }

        /* AI 검색 로딩 애니메이션 */
        .ai-search-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4rem 2rem;
          gap: 2rem;
        }

        .loading-spinner {
          position: relative;
          width: 100px;
          height: 100px;
        }

        .spinner-ring {
          position: absolute;
          width: 100%;
          height: 100%;
          border: 4px solid transparent;
          border-top-color: #0055f4;
          border-radius: 50%;
          animation: spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
        }

        .spinner-ring:nth-child(1) {
          animation-delay: -0.45s;
          border-top-color: #0055f4;
        }

        .spinner-ring:nth-child(2) {
          animation-delay: -0.3s;
          border-top-color: #0080ff;
          width: 80%;
          height: 80%;
          top: 10%;
          left: 10%;
        }

        .spinner-ring:nth-child(3) {
          animation-delay: -0.15s;
          border-top-color: #00aaff;
          width: 60%;
          height: 60%;
          top: 20%;
          left: 20%;
        }

        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        .loading-text-container {
          text-align: center;
        }

        .loading-text-container h3 {
          margin: 0 0 1rem 0;
          font-size: 1.5rem;
          font-weight: 700;
          background: linear-gradient(135deg, #0055f4, #0080ff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .loading-step {
          margin: 0.5rem 0;
          color: #6b7280;
          font-size: 0.875rem;
          animation: fadeInOut 2s ease-in-out infinite;
        }

        .loading-step:nth-child(2) {
          animation-delay: 0.3s;
        }

        .loading-step:nth-child(3) {
          animation-delay: 0.6s;
        }

        .loading-step:nth-child(4) {
          animation-delay: 0.9s;
        }

        @keyframes fadeInOut {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 1;
          }
        }

        /* 엘리트 매칭 (상위 3개, 85%+) */
        .part-card-ai.elite-match {
          border: 2px solid #f59e0b;
          background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
          box-shadow: 0 8px 16px rgba(245, 158, 11, 0.2);
          animation: elitePulse 2s ease-in-out infinite;
        }

        .part-card-ai.elite-match:hover {
          transform: translateY(-6px) scale(1.01);
          box-shadow: 0 16px 32px rgba(245, 158, 11, 0.3);
        }

        @keyframes elitePulse {
          0%, 100% {
            box-shadow: 0 8px 16px rgba(245, 158, 11, 0.2);
          }
          50% {
            box-shadow: 0 12px 24px rgba(245, 158, 11, 0.35);
          }
        }

        .elite-badge {
          position: absolute;
          top: -14px;
          left: 12px;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: white;
          padding: 0.4rem 0.75rem;
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 700;
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
          letter-spacing: 0.5px;
        }

        .ai-score-badge.elite {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
          transform: scale(1.1);
        }

        /* 상위 매칭 (80%+) */
        .part-card-ai.top-match {
          border-color: #10b981;
          background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
        }

        .part-card-ai.top-match:hover {
          box-shadow: 0 12px 24px rgba(16, 185, 129, 0.2);
        }

        .ai-score-badge.high {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          box-shadow: 0 4px 8px rgba(16, 185, 129, 0.3);
        }

        /* 오른쪽 예시 사이드바 (축소) */
        .examples-sidebar-compact {
          position: relative;
        }

        .examples-sidebar-compact .sidebar-sticky {
          position: sticky;
          top: 100px;
          background: white;
          border-radius: 12px;
          padding: 1.25rem;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
          max-height: calc(100vh - 120px);
          overflow-y: auto;
        }

        .examples-sidebar-compact h3 {
          margin: 0 0 1rem 0;
          color: #1f2937;
          font-size: 1rem;
          font-weight: 700;
        }

        .examples-sidebar-compact .examples-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .example-card-compact {
          padding: 0.875rem;
          background: #f9fafb;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          transition: all 0.2s ease;
        }

        .example-card-compact:hover {
          background: #f3f4f6;
          border-color: #d1d5db;
        }

        .example-card-compact .example-query {
          margin-bottom: 0.625rem;
        }

        .example-card-compact .example-query p {
          margin: 0;
          color: #4b5563;
          font-size: 0.75rem;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .example-card-compact .example-result {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px solid #e5e7eb;
        }

        .example-card-compact .example-result strong {
          color: #1f2937;
          font-size: 0.75rem;
          font-weight: 600;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .example-card-compact .score-badge {
          padding: 0.25rem 0.5rem;
          background: #dbeafe;
          color: #1e40af;
          border-radius: 6px;
          font-size: 0.6875rem;
          font-weight: 700;
          flex-shrink: 0;
        }

        @media (max-width: 1024px) {
          .page-header {
            padding: 1.25rem 1.5rem;
            gap: 1rem;
          }

          .page-header h1 {
            font-size: 1.5rem;
          }

          .search-form input[type="text"] {
            font-size: 0.9375rem;
            height: 3rem;
          }

          .search-form input[type="text"]::placeholder {
            font-size: 0.875rem;
          }

          .search-layout {
            grid-template-columns: 250px 1fr;
            gap: 1rem;
          }

          .examples-sidebar-compact {
            display: none;
          }

          .parts-grid {
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          }
        }

        @media (max-width: 768px) {
          .page-header {
            padding: 1rem;
            gap: 0.75rem;
            grid-template-columns: 1fr auto;
            grid-template-rows: auto auto;
          }

          .header-left {
            grid-column: 1;
            grid-row: 1;
          }

          .page-header h1 {
            font-size: 1.4rem;
          }

          .watch-button {
            grid-column: 2;
            grid-row: 1;
          }

          .header-search {
            grid-column: 1 / -1;
            grid-row: 2;
            max-width: 100%;
          }

          .search-form input[type="text"] {
            font-size: 0.9375rem;
            padding: 0.75rem 3.5rem 0.75rem 1.25rem;
            height: 2.75rem;
          }

          .search-form input[type="text"]::placeholder {
            font-size: 0.875rem;
          }

          .search-arrow-btn {
            width: 2rem;
            height: 2rem;
            font-size: 0.9375rem;
            right: 0.5rem;
          }

          .search-layout {
            grid-template-columns: 1fr;
            padding: 1rem;
            gap: 1rem;
          }

          .filter-sidebar {
            order: 2;
          }

          .parts-main {
            order: 1;
          }

          .filter-sticky {
            position: static;
          }

          .parts-grid {
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 0.875rem;
          }

          .part-image {
            height: 150px;
          }

          .back-button {
            padding: 0.6rem 1rem;
            font-size: 0.9rem;
          }

          .watch-button {
            display: none;
          }
        }

        @media (max-width: 480px) {
          .page-header {
            padding: 0.875rem 0.75rem 0.625rem 0.75rem;
          }

          .search-form input[type="text"] {
            padding: 0.625rem 3rem 0.625rem 1rem;
            font-size: 0.875rem;
            border-radius: 40px;
            height: 2.5rem;
          }

          .search-form input[type="text"]::placeholder {
            font-size: 0.8125rem;
          }

          .search-arrow-btn {
            width: 1.75rem;
            height: 1.75rem;
            font-size: 0.875rem;
            right: 0.5rem;
          }

          .parts-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .part-card .part-info h4 {
            font-size: 0.875rem;
          }

          .part-card .price {
            font-size: 1rem;
          }
        }

        /* Watch Modal */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
          padding: 1rem;
        }

        .modal-content {
          background: white;
          border-radius: 16px;
          max-width: 500px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .modal-header h3 {
          margin: 0;
          color: #1f2937;
          font-size: 1.25rem;
          font-weight: 700;
        }

        .close-button {
          background: none;
          border: none;
          font-size: 1.5rem;
          color: #9ca3af;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .close-button:hover {
          background: #f3f4f6;
          color: #1f2937;
        }

        .modal-body {
          padding: 1.5rem;
        }

        .modal-description {
          margin: 0 0 1.5rem 0;
          color: #6b7280;
          font-size: 0.9375rem;
          line-height: 1.6;
        }

        .form-group {
          margin-bottom: 1.25rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          color: #374151;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .form-input,
        .form-select {
          width: 100%;
          padding: 0.75rem;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 0.9375rem;
          color: #1f2937;
          font-family: inherit;
          transition: all 0.2s;
        }

        .form-input:focus,
        .form-select:focus {
          outline: none;
          border-color: #0055f4;
          box-shadow: 0 0 0 3px rgba(0, 85, 244, 0.1);
        }

        .modal-tip {
          background: #fef3c7;
          border-left: 4px solid #f59e0b;
          padding: 1rem;
          border-radius: 6px;
          color: #92400e;
          font-size: 0.875rem;
          line-height: 1.5;
        }

        .modal-footer {
          padding: 1.5rem;
          border-top: 1px solid #e5e7eb;
          display: flex;
          gap: 0.75rem;
        }

        .cancel-button,
        .submit-button {
          flex: 1;
          padding: 0.875rem;
          border-radius: 8px;
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cancel-button {
          background: white;
          border: 1px solid #d1d5db;
          color: #374151;
        }

        .cancel-button:hover {
          background: #f9fafb;
        }

        .submit-button {
          background: linear-gradient(135deg, #0055f4, #0080ff);
          border: none;
          color: white;
        }

        .submit-button:hover:not(:disabled) {
          background: linear-gradient(135deg, #0040c0, #0060dd);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 85, 244, 0.3);
        }

        .submit-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* 고급 검색 필터 스타일 */
        .advanced-search-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .toggle-advanced-btn {
          width: 28px;
          height: 28px;
          background: #f3f4f6;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 1.25rem;
          color: #374151;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .toggle-advanced-btn:hover {
          background: #e5e7eb;
        }

        .search-mode-selector {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.375rem;
          margin-bottom: 1rem;
        }

        .mode-btn {
          padding: 0.5rem;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s;
        }

        .mode-btn:hover {
          border-color: #0055f4;
          color: #0055f4;
        }

        .mode-btn.active {
          background: #0055f4;
          border-color: #0055f4;
          color: white;
          font-weight: 600;
        }

        .battery-filters,
        .material-filters {
          display: flex;
          flex-direction: column;
          gap: 0.875rem;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }

        .filter-group label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #374151;
        }

        .filter-input {
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.875rem;
          color: #1f2937;
          font-family: inherit;
        }

        .filter-input:focus {
          outline: none;
          border-color: #0055f4;
          box-shadow: 0 0 0 2px rgba(0, 85, 244, 0.1);
        }

        .range-inputs {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .range-inputs input {
          flex: 1;
        }

        .range-inputs span {
          color: #6b7280;
          font-size: 0.875rem;
        }

        .cathode-types {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8125rem;
          color: #374151;
          cursor: pointer;
        }

        .checkbox-label input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }

        .apply-filter-btn {
          margin-top: 0.5rem;
          padding: 0.625rem;
          background: linear-gradient(135deg, #0055f4, #0080ff);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .apply-filter-btn:hover {
          background: linear-gradient(135deg, #0040c0, #0060dd);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 85, 244, 0.3);
        }

        /* 초기화 버튼 */
        .reset-filter-btn {
          width: 100%;
          margin-top: 0.75rem;
          padding: 0.625rem;
          background: #f3f4f6;
          color: #374151;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
        }

        .reset-filter-btn:hover {
          background: #e5e7eb;
          border-color: #9ca3af;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
      `}</style>
    </div>
  );
}

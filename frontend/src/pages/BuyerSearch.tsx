import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { SearchRequest, SearchResponse, Part, WatchCriteria } from '@shared/index';

// 카테고리 매핑 (한글 -> 영문)
const categoryMap: Record<string, string> = {
  '배터리': 'battery',
  '모터': 'motor',
  '인버터': 'inverter',
  '차체': 'body',
};

// 카테고리별 기본 이미지
const categoryDefaultImages: Record<string, string> = {
  'battery': '/image/batterypack_1.jpg',
  'motor': '/image/motor_1.jpg',
  'inverter': '/image/inverter_1.png',
  'body': '/image/car_body_1.jpg',
  'charger': '/image/batterypack_1.jpg', // 충전기는 배터리 이미지 사용
  'electronics': '/image/inverter_1.png', // 전장부품은 인버터 이미지 사용
  'interior': '/image/car_body_1.jpg', // 내장재는 차체 이미지 사용
  'other': '/image/car_body_1.jpg', // 기타는 차체 이미지 사용
};

// 이미지 URL 가져오기 헬퍼 함수
const getPartImageUrl = (part: Part): string => {
  if (part.images && part.images.length > 0 && part.images[0]) {
    return part.images[0];
  }
  return categoryDefaultImages[part.category] || '/image/car_body_1.jpg';
};

export default function BuyerSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchParams, setSearchParams] = useState<SearchRequest | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 20000000]);

  // Watch 모달 상태
  const [showWatchModal, setShowWatchModal] = useState(false);
  const [watchEmail, setWatchEmail] = useState('');
  const [watchCategory, setWatchCategory] = useState<string>('');
  const [watchMaxPrice, setWatchMaxPrice] = useState<number>(10000000);
  const [watchKeywords, setWatchKeywords] = useState<string>('');

  // AI 검색
  const { data, isLoading, error } = useQuery({
    queryKey: ['search', searchParams],
    queryFn: async () => {
      if (!searchParams) return null;

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchParams),
      });

      if (!response.ok) {
        throw new Error('검색에 실패했습니다');
      }

      return response.json() as Promise<SearchResponse>;
    },
    enabled: !!searchParams,
  });

  // 부품 목록 조회 (카테고리별)
  const { data: partsData, isLoading: isPartsLoading } = useQuery({
    queryKey: ['parts', selectedCategory],
    queryFn: async () => {
      // 전체 카테고리인 경우 카테고리 필터 없이 모든 부품 조회
      let url = '/api/parts?limit=50';
      if (selectedCategory !== 'all') {
        const category = categoryMap[selectedCategory] || selectedCategory;
        url = `/api/parts?category=${category}&limit=50`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('부품 목록을 불러오는데 실패했습니다');
      }

      return response.json() as Promise<{ parts: Part[]; count: number }>;
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
      const response = await fetch('/api/watch', {
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
    if (query.trim()) {
      setSearchParams({ query: query.trim(), topK: 10 });
    }
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

  // 가격 필터링된 부품 목록
  const filteredParts = partsData?.parts.filter(part => {
    return part.price >= priceRange[0] && part.price <= priceRange[1];
  }) || [];

  const categories = ['all', '배터리', '모터', '인버터', '차체'];

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
        <button onClick={() => navigate('/')} className="back-button">
          ← 홈으로
        </button>
        <h1>부품 검색</h1>
        <button onClick={() => setShowWatchModal(true)} className="watch-button">
          🔔 관심 부품 알림 설정
        </button>
      </header>

      {/* AI 검색창 - 상단 */}
      <section className="search-section-top">
        <div className="search-container">
          <div className="search-header">
            <h2>🤖 AI 검색</h2>
            <p className="search-subtitle">자연어로 원하는 부품을 설명해보세요</p>
          </div>
          <form onSubmit={handleSearch} className="search-form">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="예: ESS 구축용 안전한 배터리를 찾습니다. 5년 이상 사용 가능하고 60kWh 이상이면 좋겠어요."
              rows={3}
            />
            <button type="submit" disabled={!query.trim() || isLoading}>
              {isLoading ? '🔍 검색 중...' : '🔍 AI 검색 시작'}
            </button>
          </form>
        </div>
      </section>

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
          </div>
        </aside>

        {/* 중앙 부품 그리드 */}
        <div className="parts-main">

          {error && (
            <div className="error-message">
              검색 중 오류가 발생했습니다: {(error as Error).message}
            </div>
          )}

          {/* AI 검색 결과 */}
          {data && (
            <section className="ai-results">
              <div className="results-header">
                <h2>AI 검색 결과 ({data.count}개)</h2>
                {data.cached && <span className="cached-badge">⚡ 캐시됨</span>}
              </div>

              <div className="parts-grid">
                {data.results.map((result) => (
                  <div
                    key={result.partId}
                    className="part-card-ai"
                    onClick={() => navigate(`/parts/${result.partId}`)}
                  >
                    <div className="ai-score-badge">
                      정확도 {(result.score * 100).toFixed(0)}%
                    </div>
                    <div className="part-info">
                      <h4>{result.part.name}</h4>
                      <p className="manufacturer">{result.part.manufacturer} · {result.part.model}</p>
                      <p className="price">{result.part.price?.toLocaleString()}원</p>
                      <p className="ai-reason">{result.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 기본 부품 목록 */}
          {!data && (
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
              <h3>🔔 관심 부품 알림 설정</h3>
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
                💡 조건을 입력하지 않으면 모든 부품에 대해 알림을 받습니다.
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
          display: flex;
          align-items: center;
          gap: 1rem;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        /* 상단 AI 검색 섹션 */
        .search-section-top {
          background: linear-gradient(135deg, #0055f4 0%, #0080ff 100%);
          padding: 3rem 2rem;
          box-shadow: 0 8px 32px rgba(0, 85, 244, 0.2);
        }

        .search-container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .search-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .search-header h2 {
          margin: 0 0 0.75rem 0;
          color: white;
          font-size: 2.5rem;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .search-subtitle {
          margin: 0;
          color: rgba(255, 255, 255, 0.9);
          font-size: 1.125rem;
          font-weight: 400;
        }

        .search-form {
          display: flex;
          gap: 1rem;
          align-items: flex-end;
        }

        .search-form textarea {
          flex: 1;
          padding: 1.25rem;
          border: 3px solid rgba(255, 255, 255, 0.2);
          border-radius: 16px;
          font-size: 1rem;
          font-family: inherit;
          resize: none;
          background: rgba(255, 255, 255, 0.95);
          color: #1f2937;
          transition: all 0.3s ease;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
        }

        .search-form textarea:focus {
          outline: none;
          border-color: white;
          background: white;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
          transform: translateY(-2px);
        }

        .search-form textarea::placeholder {
          color: #9ca3af;
        }

        .search-form button[type="submit"] {
          padding: 1.25rem 2.5rem;
          background: white;
          color: #0055f4;
          border: 3px solid transparent;
          border-radius: 16px;
          font-size: 1.0625rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          white-space: nowrap;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
        }

        .search-form button[type="submit"]:hover:not(:disabled) {
          background: #f8f9fa;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        }

        .search-form button[type="submit"]:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .page-header h1 {
          margin: 0;
          color: #0055f4;
          font-size: 1.8rem;
          flex: 1;
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
          .search-section-top {
            padding: 2.5rem 1.5rem;
          }

          .search-header h2 {
            font-size: 2rem;
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
            padding: 1rem 1.5rem;
          }

          .page-header h1 {
            font-size: 1.4rem;
          }

          .search-section-top {
            padding: 2rem 1rem;
          }

          .search-header h2 {
            font-size: 1.75rem;
          }

          .search-subtitle {
            font-size: 0.9375rem;
          }

          .search-form {
            flex-direction: column;
            gap: 0.75rem;
          }

          .search-form button[type="submit"] {
            width: 100%;
            padding: 1rem;
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
          .search-section-top {
            padding: 1.5rem 1rem;
          }

          .search-header h2 {
            font-size: 1.5rem;
          }

          .search-subtitle {
            font-size: 0.875rem;
          }

          .search-form textarea {
            padding: 1rem;
            font-size: 0.9375rem;
          }

          .search-form button[type="submit"] {
            font-size: 0.9375rem;
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
      `}</style>
    </div>
  );
}

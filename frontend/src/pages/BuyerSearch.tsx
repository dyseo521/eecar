import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SearchRequest, SearchResponse } from '@shared/index';

// 임시 부품 데이터
const mockParts = [
  {
    id: '1',
    name: 'Tesla Model S 배터리 팩',
    image: '/image/batterypack_1.jpg',
    manufacturer: 'Tesla',
    model: 'Model S',
    price: 15000000,
    quantity: 3,
    capacity: '85kWh',
    category: '배터리',
    year: 2018
  },
  {
    id: '2',
    name: 'Nissan Leaf 구동 모터',
    image: '/image/motor1.jpg',
    manufacturer: 'Nissan',
    model: 'Leaf',
    price: 3500000,
    quantity: 5,
    power: '110kW',
    category: '모터',
    year: 2019
  },
  {
    id: '3',
    name: 'BMW i3 인버터',
    image: '/image/inverter_1.png',
    manufacturer: 'BMW',
    model: 'i3',
    price: 2800000,
    quantity: 2,
    type: '3상 AC/DC',
    category: '인버터',
    year: 2017
  },
  {
    id: '4',
    name: 'Chevrolet Bolt 구동 모터',
    image: '/image/motor2.jpg',
    manufacturer: 'Chevrolet',
    model: 'Bolt',
    price: 4200000,
    quantity: 4,
    power: '150kW',
    category: '모터',
    year: 2020
  },
  {
    id: '5',
    name: 'Hyundai Kona 차체 부품',
    image: '/image/car_body.jpg',
    manufacturer: 'Hyundai',
    model: 'Kona Electric',
    price: 5500000,
    quantity: 1,
    category: '차체',
    year: 2021
  },
  {
    id: '6',
    name: 'Renault Zoe 고성능 모터',
    image: '/image/motor3.jpg',
    manufacturer: 'Renault',
    model: 'Zoe',
    price: 3200000,
    quantity: 6,
    power: '92kW',
    category: '모터',
    year: 2019
  }
];

export default function BuyerSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchParams, setSearchParams] = useState<SearchRequest | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 20000000]);

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchParams({ query: query.trim(), topK: 10 });
    }
  };

  // 필터링된 부품 목록
  const filteredParts = mockParts.filter(part => {
    const categoryMatch = selectedCategory === 'all' || part.category === selectedCategory;
    const priceMatch = part.price >= priceRange[0] && part.price <= priceRange[1];
    return categoryMatch && priceMatch;
  });

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
      </header>

      <main className="search-layout">
        {/* 왼쪽 필터 영역 */}
        <aside className="filter-sidebar">
          <div className="filter-sticky">
            <section className="search-box-compact">
              <h3>AI 검색</h3>
              <form onSubmit={handleSearch}>
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="예: ESS 구축용 안전한 배터리를 찾습니다. 5년 이상 사용 가능하고 60kWh 이상이면 좋겠어요."
                  rows={3}
                />
                <button type="submit" disabled={!query.trim() || isLoading}>
                  {isLoading ? '검색 중...' : '검색하기'}
                </button>
              </form>
            </section>

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
                  className={`price-btn ${priceRange[1] === 20000000 ? 'active' : ''}`}
                  onClick={() => setPriceRange([0, 20000000])}
                >
                  전체
                </button>
                <button
                  className={`price-btn ${priceRange[1] === 5000000 ? 'active' : ''}`}
                  onClick={() => setPriceRange([0, 5000000])}
                >
                  500만원 이하
                </button>
                <button
                  className={`price-btn ${priceRange[1] === 10000000 && priceRange[0] === 5000000 ? 'active' : ''}`}
                  onClick={() => setPriceRange([5000000, 10000000])}
                >
                  500만원-1000만원
                </button>
                <button
                  className={`price-btn ${priceRange[0] === 10000000 ? 'active' : ''}`}
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
              </div>

              <div className="parts-grid">
                {filteredParts.map((part) => (
                  <div
                    key={part.id}
                    className="part-card"
                    onClick={() => navigate(`/parts/${part.id}`)}
                  >
                    <div className="part-image">
                      <img src={part.image} alt={part.name} />
                      <div className="quantity-badge">{part.quantity}개 재고</div>
                    </div>
                    <div className="part-info">
                      <h4>{part.name}</h4>
                      <p className="manufacturer">{part.manufacturer} · {part.model}</p>
                      <p className="price">{part.price.toLocaleString()}원</p>
                      <div className="spec-tags">
                        {part.capacity && <span className="spec-tag">{part.capacity}</span>}
                        {part.power && <span className="spec-tag">{part.power}</span>}
                        {part.type && <span className="spec-tag">{part.type}</span>}
                        <span className="year-tag">{part.year}년식</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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

        .page-header h1 {
          margin: 0;
          color: #0055f4;
          font-size: 1.8rem;
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

        .search-box-compact {
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .search-box-compact h3 {
          margin: 0 0 1rem 0;
          color: #0055f4;
          font-size: 1.1rem;
          font-weight: 700;
        }

        .search-box-compact form {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .search-box-compact textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 0.875rem;
          font-family: inherit;
          resize: none;
          transition: all 0.2s ease;
        }

        .search-box-compact textarea:focus {
          outline: none;
          border-color: #0055f4;
          box-shadow: 0 0 0 3px rgba(0, 85, 244, 0.1);
        }

        .search-box-compact button[type="submit"] {
          padding: 0.75rem 1rem;
          background: #0055f4;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .search-box-compact button[type="submit"]:hover:not(:disabled) {
          background: #0040c0;
        }

        .search-box-compact button[type="submit"]:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* 필터 섹션 */
        .filter-section {
          margin-bottom: 2rem;
        }

        .filter-section h3 {
          margin: 0 0 1rem 0;
          color: #1f2937;
          font-size: 0.95rem;
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
        .year-tag {
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
        }

        @media (max-width: 480px) {
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
      `}</style>
    </div>
  );
}

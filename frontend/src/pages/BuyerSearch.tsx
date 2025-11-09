import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SearchRequest, SearchResponse } from '@shared/index';

export default function BuyerSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchParams, setSearchParams] = useState<SearchRequest | null>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
        <div className="search-main">
        <section className="search-box">
          <h2>어떤 부품을 찾으시나요?</h2>
          <form onSubmit={handleSearch}>
            <div className="input-group">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="예: ESS 에너지 저장 시스템에 사용할 수 있는 배터리를 찾고 있어요.
60kWh 이상, 리튬 이온 배터리이면 좋겠습니다."
                rows={4}
              />
              <button type="submit" disabled={!query.trim() || isLoading}>
                {isLoading ? '검색 중...' : 'AI 검색'}
              </button>
            </div>
          </form>

          <div className="search-tips">
            <p><strong>검색 팁:</strong></p>
            <ul>
              <li>자연어로 자유롭게 질문하세요</li>
              <li>활용처, 필요한 스펙, 조건 등을 명시하면 더 정확합니다</li>
              <li>AI가 유사한 활용 사례를 바탕으로 추천해드립니다</li>
            </ul>
          </div>
        </section>

        {error && (
          <div className="error-message">
            검색 중 오류가 발생했습니다: {(error as Error).message}
          </div>
        )}

        {data && (
          <section className="results">
            <div className="results-header">
              <h3>검색 결과 ({data.count}개)</h3>
              {data.cached && <span className="cached-badge">⚡ 캐시됨</span>}
            </div>

            <div className="results-grid">
              {data.results.map((result) => (
                <div
                  key={result.partId}
                  className="part-card"
                  onClick={() => navigate(`/parts/${result.partId}`)}
                >
                  <div className="part-header">
                    <h4>{result.part.name}</h4>
                    <span className="score">
                      유사도: {(result.score * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="part-info">
                    <p><strong>제조사:</strong> {result.part.manufacturer}</p>
                    <p><strong>모델:</strong> {result.part.model}</p>
                    <p><strong>가격:</strong> {result.part.price?.toLocaleString()}원</p>
                    <p><strong>수량:</strong> {result.part.quantity}개</p>
                  </div>

                  <div className="ai-reason">
                    <strong>🤖 AI 추천 이유:</strong>
                    <p>{result.reason}</p>
                  </div>

                  <button className="detail-button">자세히 보기 →</button>
                </div>
              ))}
            </div>
          </section>
        )}
        </div>

        {/* 예시 사례 사이드바 */}
        <aside className="examples-sidebar">
          <div className="sidebar-sticky">
            <h3 className="sidebar-title">검색 예시</h3>
            <p className="sidebar-subtitle">다른 사용자들의 검색 사례를 참고하세요</p>

            <div className="examples-list">
              {exampleCases.map((example, index) => (
                <div key={index} className="example-card">
                  <div className="example-query">
                    <span className="query-icon">💬</span>
                    <p>{example.query}</p>
                  </div>
                  <div className="example-arrow">↓</div>
                  <div className="example-result">
                    <div className="result-header">
                      <span className="result-icon">✓</span>
                      <strong>{example.result.name}</strong>
                    </div>
                    <div className="result-details">
                      {example.result.capacity && (
                        <span className="detail-badge">{example.result.capacity}</span>
                      )}
                      {example.result.power && (
                        <span className="detail-badge">{example.result.power}</span>
                      )}
                      {example.result.type && (
                        <span className="detail-badge">{example.result.type}</span>
                      )}
                      <span className="score-badge">
                        {(example.result.score * 100).toFixed(0)}% 일치
                      </span>
                    </div>
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
          color: #3a00bb;
          font-size: 1.8rem;
        }

        .search-layout {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
          display: grid;
          grid-template-columns: 1fr 400px;
          gap: 2rem;
          align-items: start;
        }

        .search-main {
          min-width: 0;
        }

        .search-box {
          background: white;
          border-radius: 16px;
          padding: 2.5rem;
          margin-bottom: 2rem;
          box-shadow: 0 8px 32px rgba(58, 0, 187, 0.12);
          border: 1px solid rgba(0, 85, 244, 0.1);
          transform: translateY(${scrollY * -0.1}px);
          transition: transform 0.3s ease;
        }

        .search-box h2 {
          margin: 0 0 1.5rem 0;
          color: #3a00bb;
          font-size: 1.6rem;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        textarea {
          width: 100%;
          padding: 1.25rem;
          border: 2px solid #00a2ff;
          border-radius: 12px;
          font-size: 1rem;
          font-family: inherit;
          resize: vertical;
          transition: all 0.3s ease;
          background: rgba(0, 162, 255, 0.02);
        }

        textarea:focus {
          outline: none;
          border-color: #0055f4;
          box-shadow: 0 0 0 4px rgba(0, 85, 244, 0.1);
          background: white;
        }

        button[type="submit"] {
          padding: 1.25rem 2.5rem;
          background: linear-gradient(135deg, #3a00bb 0%, #0055f4 50%, #0080ff 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 16px rgba(58, 0, 187, 0.3);
        }

        button[type="submit"]:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(58, 0, 187, 0.4);
        }

        button[type="submit"]:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .search-tips {
          margin-top: 1.5rem;
          padding: 1.25rem;
          background: rgba(0, 128, 255, 0.08);
          border-radius: 12px;
          border-left: 4px solid #0080ff;
          font-size: 0.95rem;
        }

        .search-tips strong {
          color: #0055f4;
        }

        .search-tips ul {
          margin: 0.5rem 0 0 1.5rem;
          padding: 0;
        }

        .search-tips li {
          margin: 0.5rem 0;
          color: #333;
        }

        .error-message {
          background: rgba(255, 82, 82, 0.1);
          color: #d32f2f;
          padding: 1.25rem;
          border-radius: 12px;
          margin-bottom: 1rem;
          border-left: 4px solid #d32f2f;
        }

        .results {
          background: white;
          border-radius: 16px;
          padding: 2.5rem;
          box-shadow: 0 8px 32px rgba(58, 0, 187, 0.12);
          border: 1px solid rgba(0, 85, 244, 0.1);
        }

        .results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid rgba(0, 162, 255, 0.2);
        }

        .results-header h3 {
          margin: 0;
          color: #3a00bb;
          font-size: 1.5rem;
        }

        .cached-badge {
          background: linear-gradient(135deg, #0080ff 0%, #00a2ff 100%);
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(0, 128, 255, 0.3);
        }

        .results-grid {
          display: grid;
          gap: 1.5rem;
        }

        .part-card {
          border: 2px solid rgba(0, 162, 255, 0.2);
          border-radius: 16px;
          padding: 1.75rem;
          cursor: pointer;
          transition: all 0.3s ease;
          background: white;
        }

        .part-card:hover {
          border-color: #0055f4;
          box-shadow: 0 8px 32px rgba(0, 85, 244, 0.2);
          transform: translateY(-4px);
        }

        .part-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.25rem;
          gap: 1rem;
        }

        .part-header h4 {
          margin: 0;
          color: #3a00bb;
          font-size: 1.3rem;
        }

        .score {
          background: #0080ff;
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 600;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(0, 128, 255, 0.3);
        }

        .part-info {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
          margin-bottom: 1.25rem;
          padding-bottom: 1.25rem;
          border-bottom: 2px solid rgba(0, 162, 255, 0.1);
        }

        .part-info p {
          margin: 0;
          color: #555;
          font-size: 0.95rem;
        }

        .part-info strong {
          color: #0055f4;
        }

        .ai-reason {
          background: rgba(0, 162, 255, 0.08);
          padding: 1.25rem;
          border-radius: 12px;
          margin-bottom: 1.25rem;
          border-left: 4px solid #00a2ff;
        }

        .ai-reason strong {
          display: block;
          margin-bottom: 0.75rem;
          color: #0055f4;
          font-size: 1rem;
        }

        .ai-reason p {
          margin: 0;
          color: #333;
          line-height: 1.6;
        }

        .detail-button {
          width: 100%;
          padding: 1rem;
          background: white;
          border: 2px solid #0055f4;
          color: #0055f4;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          font-size: 1rem;
        }

        .detail-button:hover {
          background: #0055f4;
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(0, 85, 244, 0.3);
        }

        /* Examples Sidebar */
        .examples-sidebar {
          position: relative;
        }

        .sidebar-sticky {
          position: sticky;
          top: 100px;
          background: white;
          border-radius: 16px;
          padding: 1.5rem;
          box-shadow: 0 8px 32px rgba(58, 0, 187, 0.12);
          border: 1px solid rgba(0, 85, 244, 0.1);
          max-height: calc(100vh - 120px);
          overflow-y: auto;
        }

        .sidebar-sticky::-webkit-scrollbar {
          width: 6px;
        }

        .sidebar-sticky::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }

        .sidebar-sticky::-webkit-scrollbar-thumb {
          background: #0080ff;
          border-radius: 10px;
        }

        .sidebar-sticky::-webkit-scrollbar-thumb:hover {
          background: #0055f4;
        }

        .sidebar-title {
          margin: 0 0 0.5rem 0;
          color: #3a00bb;
          font-size: 1.3rem;
          font-weight: 700;
        }

        .sidebar-subtitle {
          margin: 0 0 1.5rem 0;
          color: #64748b;
          font-size: 0.875rem;
        }

        .examples-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .example-card {
          padding: 1.25rem;
          background: rgba(0, 128, 255, 0.03);
          border-radius: 12px;
          border: 1px solid rgba(0, 128, 255, 0.15);
          transition: all 0.3s ease;
        }

        .example-card:hover {
          background: rgba(0, 128, 255, 0.06);
          border-color: #0080ff;
          transform: translateX(-4px);
        }

        .example-query {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .query-icon {
          font-size: 1.25rem;
          flex-shrink: 0;
        }

        .example-query p {
          margin: 0;
          color: #333;
          font-size: 0.875rem;
          line-height: 1.5;
        }

        .example-arrow {
          text-align: center;
          color: #0080ff;
          font-size: 1.25rem;
          font-weight: bold;
          margin: 0.5rem 0;
        }

        .example-result {
          background: white;
          padding: 1rem;
          border-radius: 8px;
          border: 1px solid rgba(0, 162, 255, 0.2);
        }

        .result-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }

        .result-icon {
          color: #00dcb4;
          font-size: 1.125rem;
        }

        .result-header strong {
          color: #0055f4;
          font-size: 0.95rem;
        }

        .result-details {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .detail-badge {
          padding: 0.25rem 0.75rem;
          background: rgba(0, 128, 255, 0.1);
          color: #0080ff;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .score-badge {
          padding: 0.25rem 0.75rem;
          background: rgba(0, 220, 180, 0.15);
          color: #00a88f;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 700;
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
          }

          .search-main {
            order: 2;
          }

          .examples-sidebar {
            order: 1;
            margin-bottom: 2rem;
          }

          .sidebar-sticky {
            position: static;
            max-height: 500px;
          }

          .search-box {
            padding: 1.5rem;
          }

          .search-box h2 {
            font-size: 1.3rem;
          }

          .results {
            padding: 1.5rem;
          }

          .results-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }

          .part-info {
            grid-template-columns: 1fr;
            gap: 0.5rem;
          }

          .part-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
          }

          .back-button {
            padding: 0.6rem 1rem;
            font-size: 0.9rem;
          }
        }

        @media (max-width: 480px) {
          .search-box h2 {
            font-size: 1.1rem;
          }

          button[type="submit"] {
            padding: 1rem 1.5rem;
            font-size: 1rem;
          }

          .part-header h4 {
            font-size: 1.1rem;
          }
        }
      `}</style>
    </div>
  );
}

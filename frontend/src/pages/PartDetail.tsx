import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

export default function PartDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['part', id],
    queryFn: async () => {
      const response = await fetch(`/api/parts/${id}`);
      if (!response.ok) {
        throw new Error('부품 정보를 불러올 수 없습니다');
      }
      return response.json();
    },
  });

  if (isLoading) {
    return <div className="loading">로딩 중...</div>;
  }

  if (error || !data) {
    return (
      <div className="error">
        <h2>오류가 발생했습니다</h2>
        <p>{(error as Error)?.message}</p>
        <button onClick={() => navigate(-1)}>돌아가기</button>
      </div>
    );
  }

  return (
    <div className="part-detail">
      <header className="page-header">
        <button onClick={() => navigate(-1)} className="back-button">
          ← 뒤로가기
        </button>
        <h1>부품 상세 정보</h1>
      </header>

      <main className="detail-content">
        <section className="part-info">
          <h2>{data.name}</h2>

          <div className="info-grid">
            <div className="info-item">
              <strong>카테고리:</strong>
              <span>{data.category}</span>
            </div>
            <div className="info-item">
              <strong>제조사:</strong>
              <span>{data.manufacturer}</span>
            </div>
            <div className="info-item">
              <strong>모델:</strong>
              <span>{data.model || '-'}</span>
            </div>
            <div className="info-item">
              <strong>연식:</strong>
              <span>{data.year || '-'}</span>
            </div>
            <div className="info-item">
              <strong>가격:</strong>
              <span>{data.price?.toLocaleString()}원</span>
            </div>
            <div className="info-item">
              <strong>수량:</strong>
              <span>{data.quantity}개</span>
            </div>
          </div>

          {data.description && (
            <div className="description">
              <h3>설명</h3>
              <p>{data.description}</p>
            </div>
          )}
        </section>

        {data.specifications && (
          <section className="specifications">
            <h3>사양</h3>
            <pre>{JSON.stringify(data.specifications, null, 2)}</pre>
          </section>
        )}

        {data.useCases && data.useCases.length > 0 && (
          <section className="use-cases">
            <h3>활용 사례</h3>
            {data.useCases.map((useCase: any, index: number) => (
              <div key={index} className="use-case-card">
                <h4>{useCase.industry} - {useCase.application}</h4>
                <p>{useCase.description}</p>
              </div>
            ))}
          </section>
        )}

        <section className="actions">
          <button className="primary-button">구매 제안하기</button>
          <button className="secondary-button">알림 등록</button>
        </section>
      </main>

      <style>{`
        .part-detail {
          min-height: 100vh;
          background: linear-gradient(180deg, #f0f4ff 0%, #ffffff 100%);
        }

        .loading, .error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          gap: 1.5rem;
          padding: 2rem;
        }

        .loading {
          color: #3a00bb;
          font-size: 1.3rem;
          font-weight: 600;
        }

        .error {
          background: rgba(255, 82, 82, 0.1);
          border-radius: 16px;
          padding: 3rem;
          max-width: 500px;
          margin: 2rem auto;
        }

        .error h2 {
          color: #d32f2f;
          margin: 0 0 1rem 0;
        }

        .error p {
          color: #666;
          margin: 0 0 1.5rem 0;
        }

        .error button {
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

        .error button:hover {
          background: #0055f4;
          color: white;
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

        .detail-content {
          max-width: 1100px;
          margin: 0 auto;
          padding: 2rem;
        }

        .part-info, .specifications, .use-cases, .actions {
          background: white;
          border-radius: 16px;
          padding: 2.5rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 8px 32px rgba(58, 0, 187, 0.12);
          border: 1px solid rgba(0, 85, 244, 0.1);
          transform: translateY(${scrollY * -0.03}px);
          transition: transform 0.3s ease;
        }

        .part-info h2 {
          margin: 0 0 2rem 0;
          color: #3a00bb;
          font-size: 2rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid rgba(0, 162, 255, 0.2);
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .info-item {
          display: flex;
          gap: 1rem;
          padding: 1rem;
          background: rgba(0, 162, 255, 0.02);
          border-radius: 8px;
        }

        .info-item strong {
          color: #0055f4;
          min-width: 90px;
          font-weight: 600;
        }

        .info-item span {
          color: #333;
        }

        .description {
          padding-top: 2rem;
          border-top: 2px solid rgba(0, 162, 255, 0.1);
        }

        .description h3 {
          margin: 0 0 1rem 0;
          color: #0055f4;
          font-size: 1.3rem;
        }

        .description p {
          color: #333;
          line-height: 1.7;
        }

        .specifications h3 {
          margin: 0 0 1.5rem 0;
          color: #0055f4;
          font-size: 1.3rem;
        }

        .specifications pre {
          background: rgba(0, 162, 255, 0.05);
          padding: 1.5rem;
          border-radius: 12px;
          overflow-x: auto;
          border-left: 4px solid #00a2ff;
          color: #333;
          font-size: 0.95rem;
        }

        .use-cases h3 {
          margin: 0 0 1.5rem 0;
          color: #0055f4;
          font-size: 1.3rem;
        }

        .use-case-card {
          padding: 1.5rem;
          background: rgba(0, 128, 255, 0.05);
          border-radius: 12px;
          margin-bottom: 1.25rem;
          border-left: 4px solid #0080ff;
          transition: all 0.3s ease;
        }

        .use-case-card:hover {
          transform: translateX(4px);
          box-shadow: 0 4px 16px rgba(0, 128, 255, 0.15);
        }

        .use-case-card h4 {
          margin: 0 0 0.75rem 0;
          color: #0080ff;
          font-size: 1.1rem;
        }

        .use-case-card p {
          margin: 0;
          color: #333;
          line-height: 1.6;
        }

        .actions {
          display: flex;
          gap: 1.5rem;
        }

        .primary-button, .secondary-button {
          flex: 1;
          padding: 1.25rem;
          border-radius: 12px;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .primary-button {
          background: linear-gradient(135deg, #3a00bb 0%, #0055f4 50%, #0080ff 100%);
          color: white;
          border: none;
          box-shadow: 0 4px 16px rgba(58, 0, 187, 0.3);
        }

        .secondary-button {
          background: white;
          border: 2px solid #0055f4;
          color: #0055f4;
        }

        .primary-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(58, 0, 187, 0.4);
        }

        .secondary-button:hover {
          background: #0055f4;
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(0, 85, 244, 0.3);
        }

        @media (max-width: 768px) {
          .page-header {
            padding: 1rem 1.5rem;
          }

          .page-header h1 {
            font-size: 1.4rem;
          }

          .detail-content {
            padding: 1rem;
          }

          .part-info, .specifications, .use-cases, .actions {
            padding: 1.5rem;
          }

          .part-info h2 {
            font-size: 1.5rem;
          }

          .info-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .actions {
            flex-direction: column;
            gap: 1rem;
          }

          .back-button {
            padding: 0.6rem 1rem;
            font-size: 0.9rem;
          }
        }

        @media (max-width: 480px) {
          .part-info h2 {
            font-size: 1.3rem;
          }

          .description h3,
          .specifications h3,
          .use-cases h3 {
            font-size: 1.1rem;
          }

          .primary-button,
          .secondary-button {
            padding: 1rem;
            font-size: 1rem;
          }
        }
      `}</style>
    </div>
  );
}

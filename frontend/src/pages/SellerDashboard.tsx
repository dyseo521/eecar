import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SellerDashboard() {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    category: 'battery',
    manufacturer: '',
    model: '',
    price: '',
    quantity: '1',
    description: '',
  });

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
          quantity: parseInt(formData.quantity),
          sellerId: 'demo-seller',
        }),
      });

      if (!response.ok) {
        throw new Error('부품 등록에 실패했습니다');
      }

      alert('부품이 성공적으로 등록되었습니다!');
      // Reset form
      setFormData({
        name: '',
        category: 'battery',
        manufacturer: '',
        model: '',
        price: '',
        quantity: '1',
        description: '',
      });
    } catch (error) {
      alert((error as Error).message);
    }
  };

  return (
    <div className="seller-dashboard">
      <header className="page-header">
        <button onClick={() => navigate('/')} className="back-button">
          ← 홈으로
        </button>
        <h1>판매자 대시보드</h1>
      </header>

      <main className="dashboard-content">
        <section className="registration-form">
          <h2>부품 등록</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name">부품명 *</label>
              <input
                id="name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="예: Tesla Model S 배터리 팩"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="category">카테고리 *</label>
                <select
                  id="category"
                  required
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="battery">배터리</option>
                  <option value="motor">모터</option>
                  <option value="inverter">인버터</option>
                  <option value="charger">충전기</option>
                  <option value="electronics">전장 부품</option>
                  <option value="body">차체</option>
                  <option value="interior">내장재</option>
                  <option value="other">기타</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="manufacturer">제조사 *</label>
                <input
                  id="manufacturer"
                  type="text"
                  required
                  value={formData.manufacturer}
                  onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                  placeholder="예: Tesla"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="model">차량 모델</label>
              <input
                id="model"
                type="text"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder="예: Model S"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="price">가격 (원) *</label>
                <input
                  id="price"
                  type="number"
                  required
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="1000000"
                />
              </div>

              <div className="form-group">
                <label htmlFor="quantity">수량 *</label>
                <input
                  id="quantity"
                  type="number"
                  required
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="description">설명</label>
              <textarea
                id="description"
                rows={4}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="부품의 상태, 특징 등을 설명해주세요"
              />
            </div>

            <button type="submit" className="submit-button">
              부품 등록하기
            </button>
          </form>

          <div className="info-box">
            <h3>ℹ️ 등록 안내</h3>
            <ul>
              <li>부품 등록 시 자동으로 규성 검증이 수행됩니다</li>
              <li>AI가 임베딩을 생성하여 검색 가능하게 합니다</li>
              <li>구매자의 니즈와 자동 매칭됩니다</li>
            </ul>
          </div>
        </section>
      </main>

      <style>{`
        .seller-dashboard {
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

        .dashboard-content {
          max-width: 900px;
          margin: 0 auto;
          padding: 2rem;
        }

        .registration-form {
          background: white;
          border-radius: 16px;
          padding: 2.5rem;
          box-shadow: 0 8px 32px rgba(58, 0, 187, 0.12);
          border: 1px solid rgba(0, 85, 244, 0.1);
          transform: translateY(${scrollY * -0.05}px);
          transition: transform 0.3s ease;
        }

        .registration-form h2 {
          margin: 0 0 2rem 0;
          color: #3a00bb;
          font-size: 1.8rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid rgba(0, 162, 255, 0.2);
        }

        .form-group {
          margin-bottom: 1.75rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.75rem;
          font-weight: 600;
          color: #0055f4;
          font-size: 1rem;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 1rem;
          border: 2px solid #00a2ff;
          border-radius: 12px;
          font-size: 1rem;
          font-family: inherit;
          background: rgba(0, 162, 255, 0.02);
          transition: all 0.3s ease;
        }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #0055f4;
          box-shadow: 0 0 0 4px rgba(0, 85, 244, 0.1);
          background: white;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }

        .submit-button {
          width: 100%;
          padding: 1.25rem;
          background: linear-gradient(135deg, #3a00bb 0%, #0055f4 50%, #0080ff 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 1.2rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 16px rgba(58, 0, 187, 0.3);
          margin-top: 0.5rem;
        }

        .submit-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(58, 0, 187, 0.4);
        }

        .info-box {
          margin-top: 2rem;
          padding: 1.75rem;
          background: rgba(0, 162, 255, 0.08);
          border-radius: 12px;
          border-left: 4px solid #00a2ff;
        }

        .info-box h3 {
          margin: 0 0 1rem 0;
          color: #0055f4;
          font-size: 1.1rem;
        }

        .info-box ul {
          margin: 0;
          padding-left: 1.75rem;
        }

        .info-box li {
          margin: 0.75rem 0;
          color: #333;
          line-height: 1.5;
        }

        @media (max-width: 768px) {
          .page-header {
            padding: 1rem 1.5rem;
          }

          .page-header h1 {
            font-size: 1.4rem;
          }

          .dashboard-content {
            padding: 1rem;
          }

          .registration-form {
            padding: 1.5rem;
          }

          .registration-form h2 {
            font-size: 1.4rem;
          }

          .form-row {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .back-button {
            padding: 0.6rem 1rem;
            font-size: 0.9rem;
          }
        }

        @media (max-width: 480px) {
          .registration-form h2 {
            font-size: 1.2rem;
          }

          .submit-button {
            padding: 1rem;
            font-size: 1rem;
          }
        }
      `}</style>
    </div>
  );
}

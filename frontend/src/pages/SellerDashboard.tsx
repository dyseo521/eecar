import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UseCase } from '@shared/index';

export default function SellerDashboard() {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    category: 'battery',
    manufacturer: '',
    model: '',
    year: new Date().getFullYear() - 1,
    condition: 'used' as 'new' | 'used' | 'refurbished' | 'for-parts',
    price: '',
    quantity: '1',
    description: '',
  });

  // 상세 사양 (카테고리별로 다름)
  const [specifications, setSpecifications] = useState<Record<string, string>>({
    voltage: '',
    capacity: '',
    power: '',
    weight: '',
  });

  // 활용 사례
  const [useCases, setUseCases] = useState<UseCase[]>([
    { industry: '', application: '', description: '' }
  ]);

  // 이미지 URL들 (나중에 S3 업로드로 변경)
  const [imageUrls, setImageUrls] = useState<string[]>(['']);

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
      // Filter out empty specifications
      const filteredSpecs = Object.entries(specifications)
        .filter(([_, value]) => value.trim() !== '')
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

      // Filter out empty use cases
      const filteredUseCases = useCases.filter(
        uc => uc.industry && uc.application && uc.description
      );

      // Filter out empty image URLs
      const filteredImages = imageUrls.filter(url => url.trim() !== '');

      const response = await fetch('/api/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          year: parseInt(formData.year.toString()),
          price: parseFloat(formData.price),
          quantity: parseInt(formData.quantity),
          sellerId: 'demo-seller', // TODO: Replace with actual user ID
          images: filteredImages,
          specifications: Object.keys(filteredSpecs).length > 0 ? filteredSpecs : undefined,
          useCases: filteredUseCases.length > 0 ? filteredUseCases : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('부품 등록에 실패했습니다');
      }

      alert('✅ 부품이 성공적으로 등록되었습니다!');

      // Reset form
      setFormData({
        name: '',
        category: 'battery',
        manufacturer: '',
        model: '',
        year: new Date().getFullYear() - 1,
        condition: 'used',
        price: '',
        quantity: '1',
        description: '',
      });
      setSpecifications({ voltage: '', capacity: '', power: '', weight: '' });
      setUseCases([{ industry: '', application: '', description: '' }]);
      setImageUrls(['']);
    } catch (error) {
      alert(`❌ ${(error as Error).message}`);
    }
  };

  const addUseCase = () => {
    setUseCases([...useCases, { industry: '', application: '', description: '' }]);
  };

  const removeUseCase = (index: number) => {
    setUseCases(useCases.filter((_, i) => i !== index));
  };

  const updateUseCase = (index: number, field: keyof UseCase, value: string) => {
    const updated = [...useCases];
    updated[index] = { ...updated[index], [field]: value };
    setUseCases(updated);
  };

  const addImageUrl = () => {
    setImageUrls([...imageUrls, '']);
  };

  const removeImageUrl = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index));
  };

  const updateImageUrl = (index: number, value: string) => {
    const updated = [...imageUrls];
    updated[index] = value;
    setImageUrls(updated);
  };

  return (
    <div className="seller-dashboard">
      <header className="page-header">
        <button onClick={() => navigate('/')} className="back-button">
          ← 홈으로
        </button>
        <h1>판매자 센터</h1>
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

            <div className="form-row">
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

              <div className="form-group">
                <label htmlFor="year">연식 *</label>
                <input
                  id="year"
                  type="number"
                  required
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                  min="2000"
                  max={new Date().getFullYear() + 1}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="condition">상태 *</label>
                <select
                  id="condition"
                  required
                  value={formData.condition}
                  onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
                >
                  <option value="new">신품</option>
                  <option value="used">중고</option>
                  <option value="refurbished">리퍼</option>
                  <option value="for-parts">부품용</option>
                </select>
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
              <label htmlFor="description">설명</label>
              <textarea
                id="description"
                rows={4}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="부품의 상태, 특징 등을 설명해주세요"
              />
            </div>

            {/* 이미지 URL */}
            <div className="form-section">
              <h3>이미지</h3>
              <p className="section-hint">이미지 URL을 입력하세요 (나중에 파일 업로드 기능 추가 예정)</p>
              {imageUrls.map((url, index) => (
                <div key={index} className="dynamic-field">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => updateImageUrl(index, e.target.value)}
                    placeholder="https://example.com/image.jpg"
                  />
                  {imageUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeImageUrl(index)}
                      className="remove-button"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addImageUrl} className="add-button">
                + 이미지 추가
              </button>
            </div>

            {/* 상세 사양 */}
            <div className="form-section">
              <h3>상세 사양 (선택사항)</h3>
              <p className="section-hint">부품의 주요 사양을 입력하세요</p>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="voltage">전압 (V)</label>
                  <input
                    id="voltage"
                    type="text"
                    value={specifications.voltage}
                    onChange={(e) => setSpecifications({ ...specifications, voltage: e.target.value })}
                    placeholder="예: 400V"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="capacity">용량</label>
                  <input
                    id="capacity"
                    type="text"
                    value={specifications.capacity}
                    onChange={(e) => setSpecifications({ ...specifications, capacity: e.target.value })}
                    placeholder="예: 85kWh"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="power">출력</label>
                  <input
                    id="power"
                    type="text"
                    value={specifications.power}
                    onChange={(e) => setSpecifications({ ...specifications, power: e.target.value })}
                    placeholder="예: 150kW"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="weight">무게</label>
                  <input
                    id="weight"
                    type="text"
                    value={specifications.weight}
                    onChange={(e) => setSpecifications({ ...specifications, weight: e.target.value })}
                    placeholder="예: 540kg"
                  />
                </div>
              </div>
            </div>

            {/* 활용 사례 */}
            <div className="form-section">
              <h3>활용 사례 (선택사항)</h3>
              <p className="section-hint">이 부품을 어떻게 활용할 수 있는지 설명하세요</p>
              {useCases.map((useCase, index) => (
                <div key={index} className="use-case-group">
                  <div className="use-case-header">
                    <span>사례 {index + 1}</span>
                    {useCases.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeUseCase(index)}
                        className="remove-button"
                      >
                        ✕ 삭제
                      </button>
                    )}
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>산업 분야</label>
                      <input
                        type="text"
                        value={useCase.industry}
                        onChange={(e) => updateUseCase(index, 'industry', e.target.value)}
                        placeholder="예: 에너지 저장"
                      />
                    </div>
                    <div className="form-group">
                      <label>응용 분야</label>
                      <input
                        type="text"
                        value={useCase.application}
                        onChange={(e) => updateUseCase(index, 'application', e.target.value)}
                        placeholder="예: ESS 구축"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>설명</label>
                    <textarea
                      rows={2}
                      value={useCase.description}
                      onChange={(e) => updateUseCase(index, 'description', e.target.value)}
                      placeholder="활용 사례에 대한 설명을 입력하세요"
                    />
                  </div>
                </div>
              ))}
              <button type="button" onClick={addUseCase} className="add-button">
                + 활용 사례 추가
              </button>
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
          color: #0055f4;
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
          color: #0055f4;
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

        .form-section {
          margin-top: 2.5rem;
          padding: 1.5rem;
          background: rgba(0, 162, 255, 0.03);
          border-radius: 12px;
          border: 1px dashed rgba(0, 162, 255, 0.3);
        }

        .form-section h3 {
          margin: 0 0 0.5rem 0;
          color: #0055f4;
          font-size: 1.2rem;
          font-weight: 700;
        }

        .section-hint {
          margin: 0 0 1.25rem 0;
          color: #6b7280;
          font-size: 0.875rem;
        }

        .dynamic-field {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .dynamic-field input {
          flex: 1;
        }

        .remove-button {
          padding: 0.5rem 1rem;
          background: #ef4444;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .remove-button:hover {
          background: #dc2626;
          transform: scale(1.05);
        }

        .add-button {
          width: 100%;
          padding: 0.875rem;
          background: white;
          color: #0055f4;
          border: 2px dashed #0055f4;
          border-radius: 8px;
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 0.5rem;
        }

        .add-button:hover {
          background: rgba(0, 85, 244, 0.05);
          border-color: #0080ff;
          color: #0080ff;
        }

        .use-case-group {
          background: white;
          padding: 1.25rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          border: 1px solid rgba(0, 162, 255, 0.15);
        }

        .use-case-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid rgba(0, 162, 255, 0.15);
        }

        .use-case-header span {
          font-weight: 700;
          color: #0055f4;
        }

        .use-case-header .remove-button {
          padding: 0.375rem 0.875rem;
          font-size: 0.8125rem;
        }

        .submit-button {
          width: 100%;
          padding: 1.25rem;
          background: linear-gradient(135deg, #0055f4 0%, #0055f4 50%, #0080ff 100%);
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

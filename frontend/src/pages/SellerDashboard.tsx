import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseCase } from '@shared/index';
import { getApiUrl } from '../config';

// 카테고리별 사양 필드 정의
const categorySpecFields: Record<string, { label: string; placeholder: string; key: string }[]> = {
  battery: [
    { key: 'voltage', label: '전압 (V)', placeholder: '예: 400V' },
    { key: 'capacity', label: '용량', placeholder: '예: 85kWh' },
    { key: 'chemistry', label: '셀 종류', placeholder: '예: NCM, LFP, NCA' },
    { key: 'soc', label: 'SOC 범위', placeholder: '예: 0-100%' },
    { key: 'cycles', label: '충방전 사이클', placeholder: '예: 2000 cycles' },
    { key: 'weight', label: '무게', placeholder: '예: 540kg' },
  ],
  motor: [
    { key: 'power', label: '출력', placeholder: '예: 150kW' },
    { key: 'voltage', label: '전압 (V)', placeholder: '예: 400V' },
    { key: 'torque', label: '토크', placeholder: '예: 395Nm' },
    { key: 'rpm', label: '최대 RPM', placeholder: '예: 14000 RPM' },
    { key: 'cooling', label: '냉각 방식', placeholder: '예: 수냉식' },
    { key: 'weight', label: '무게', placeholder: '예: 45kg' },
  ],
  inverter: [
    { key: 'power', label: '출력', placeholder: '예: 100kW' },
    { key: 'voltage', label: '입력 전압 (V)', placeholder: '예: 400V DC' },
    { key: 'phases', label: '상', placeholder: '예: 3상' },
    { key: 'efficiency', label: '효율', placeholder: '예: 95%' },
    { key: 'cooling', label: '냉각 방식', placeholder: '예: 수냉식' },
    { key: 'weight', label: '무게', placeholder: '예: 15kg' },
  ],
  charger: [
    { key: 'power', label: '충전 출력', placeholder: '예: 11kW' },
    { key: 'voltage', label: '전압 범위 (V)', placeholder: '예: 200-450V' },
    { key: 'current', label: '최대 전류 (A)', placeholder: '예: 32A' },
    { key: 'type', label: '충전 타입', placeholder: '예: AC/DC, Type 2' },
    { key: 'efficiency', label: '효율', placeholder: '예: 94%' },
    { key: 'weight', label: '무게', placeholder: '예: 8kg' },
  ],
  electronics: [
    { key: 'voltage', label: '전압 (V)', placeholder: '예: 12V' },
    { key: 'power', label: '소비 전력', placeholder: '예: 500W' },
    { key: 'type', label: '타입', placeholder: '예: BMS, OBC' },
    { key: 'weight', label: '무게', placeholder: '예: 2kg' },
  ],
  body: [
    { key: 'material', label: '재질', placeholder: '예: 알루미늄, 카본파이버' },
    { key: 'dimensions', label: '치수', placeholder: '예: 1200x800x600mm' },
    { key: 'weight', label: '무게', placeholder: '예: 25kg' },
    { key: 'color', label: '색상', placeholder: '예: 흰색' },
  ],
  interior: [
    { key: 'material', label: '재질', placeholder: '예: 가죽, 직물' },
    { key: 'color', label: '색상', placeholder: '예: 검정' },
    { key: 'condition', label: '상태', placeholder: '예: 찢어짐 없음' },
  ],
  other: [
    { key: 'type', label: '타입', placeholder: '부품 타입' },
    { key: 'specifications', label: '사양', placeholder: '주요 사양' },
    { key: 'weight', label: '무게', placeholder: '예: 10kg' },
  ],
};

export default function SellerDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  // 상세 사양 (카테고리별로 동적으로 변경)
  const [specifications, setSpecifications] = useState<Record<string, string>>({});

  // 활용 사례
  const [useCases, setUseCases] = useState<UseCase[]>([
    { industry: '', application: '', description: '' }
  ]);

  // 이미지 URL들 (나중에 S3 업로드로 변경)
  const [imageUrls, setImageUrls] = useState<string[]>(['']);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  // 카테고리 변경 시 specifications 초기화
  useEffect(() => {
    setSpecifications({});
  }, [formData.category]);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Cleanup blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      imageUrls.forEach(url => {
        if (url && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [imageUrls]);

  // 부품 등록 mutation
  const registerPartMutation = useMutation({
    mutationFn: async (partData: any) => {
      const response = await fetch(getApiUrl('parts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partData),
      });

      if (!response.ok) {
        throw new Error('부품 등록에 실패했습니다');
      }

      return response.json();
    },
    onSuccess: () => {
      // 부품 목록 캐시 무효화 (BuyerSearch가 자동으로 새로고침됨)
      queryClient.invalidateQueries({ queryKey: ['parts'] });

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
      setSpecifications({});
      setUseCases([{ industry: '', application: '', description: '' }]);
      setImageUrls(['']);

      // BuyerSearch로 리다이렉트하여 등록된 부품 확인
      setTimeout(() => {
        navigate('/buyer');
      }, 1000);
    },
    onError: (error: Error) => {
      alert(`❌ ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

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

    registerPartMutation.mutate({
      ...formData,
      year: parseInt(formData.year.toString()),
      price: parseFloat(formData.price),
      quantity: parseInt(formData.quantity),
      sellerId: 'demo-seller', // TODO: Replace with actual user ID
      images: filteredImages,
      specifications: Object.keys(filteredSpecs).length > 0 ? filteredSpecs : undefined,
      useCases: filteredUseCases.length > 0 ? filteredUseCases : undefined,
    });
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

  const removeImageUrl = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setUploadedFiles([...uploadedFiles, ...files]);
      // 임시로 로컬 URL 생성 (실제로는 S3 업로드 후 URL 받아야 함)
      const urls = files.map(file => URL.createObjectURL(file));
      setImageUrls([...imageUrls.filter(url => url !== ''), ...urls]);
    }
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
            {/* 이미지 업로드 - 맨 위로 이동 */}
            <div className="form-section image-upload-section">
              <h3>이미지 업로드</h3>
              <p className="section-hint">부품 이미지를 업로드하세요</p>
              <div className="image-upload-container">
                <input
                  type="file"
                  id="image-file-input"
                  multiple
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <label htmlFor="image-file-input" className="upload-box">
                  <div className="camera-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                      <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                  </div>
                  <span>클릭하여 이미지 업로드</span>
                </label>
                {imageUrls.filter(url => url !== '').map((url, index) => (
                  <div key={index} className="image-preview">
                    <img src={url} alt={`preview-${index}`} />
                    <button
                      type="button"
                      onClick={() => removeImageUrl(index)}
                      className="remove-image-btn"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="section-divider"></div>

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

            <div className="form-group">
              <label>카테고리 *</label>
              <div className="category-scroll-container">
                {[
                  { value: 'battery', label: '배터리' },
                  { value: 'motor', label: '모터' },
                  { value: 'inverter', label: '인버터' },
                  { value: 'charger', label: '충전기' },
                  { value: 'electronics', label: '전장 부품' },
                  { value: 'body', label: '차체' },
                  { value: 'interior', label: '내장재' },
                  { value: 'other', label: '기타' },
                ].map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    className={`category-button ${formData.category === cat.value ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, category: cat.value })}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-row">
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

            <div className="section-divider"></div>

            <div className="form-group">
              <label>상태 *</label>
              <div className="radio-group">
                <label className="radio-option">
                  <input
                    type="radio"
                    name="condition"
                    value="new"
                    checked={formData.condition === 'new'}
                    onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
                    required
                  />
                  <span>  신품</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="condition"
                    value="used"
                    checked={formData.condition === 'used'}
                    onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
                  />
                  <span>  중고</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="condition"
                    value="refurbished"
                    checked={formData.condition === 'refurbished'}
                    onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
                  />
                  <span>  리퍼</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="condition"
                    value="for-parts"
                    checked={formData.condition === 'for-parts'}
                    onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
                  />
                  <span>  부품용</span>
                </label>
              </div>
            </div>

            <div className="form-row">
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
            </div>

            <div className="section-divider"></div>

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

            <div className="section-divider"></div>

            {/* 상세 사양 - 카테고리별 동적 필드 */}
            <div className="form-section">
              <h3>상세 사양 (선택사항)</h3>
              <p className="section-hint">
                {formData.category === 'battery' && '배터리 부품의 주요 사양을 입력하세요'}
                {formData.category === 'motor' && '모터 부품의 주요 사양을 입력하세요'}
                {formData.category === 'inverter' && '인버터 부품의 주요 사양을 입력하세요'}
                {formData.category === 'charger' && '충전기 부품의 주요 사양을 입력하세요'}
                {!['battery', 'motor', 'inverter', 'charger'].includes(formData.category) && '부품의 주요 사양을 입력하세요'}
              </p>
              {categorySpecFields[formData.category]?.map((field, index) => {
                // 2개씩 묶어서 한 행에 표시
                if (index % 2 === 0) {
                  const nextField = categorySpecFields[formData.category][index + 1];
                  return (
                    <div key={index} className="form-row">
                      <div className="form-group">
                        <label htmlFor={field.key}>{field.label}</label>
                        <input
                          id={field.key}
                          type="text"
                          value={specifications[field.key] || ''}
                          onChange={(e) => setSpecifications({ ...specifications, [field.key]: e.target.value })}
                          placeholder={field.placeholder}
                        />
                      </div>
                      {nextField && (
                        <div className="form-group">
                          <label htmlFor={nextField.key}>{nextField.label}</label>
                          <input
                            id={nextField.key}
                            type="text"
                            value={specifications[nextField.key] || ''}
                            onChange={(e) => setSpecifications({ ...specifications, [nextField.key]: e.target.value })}
                            placeholder={nextField.placeholder}
                          />
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })}
            </div>

            <div className="section-divider"></div>

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

            <button
              type="submit"
              className="submit-button"
              disabled={registerPartMutation.isPending}
            >
              {registerPartMutation.isPending ? '등록 중...' : '부품 등록하기'}
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

        .section-divider {
          height: 1px;
          background: #e5e7eb;
          margin: 2rem 0;
        }

        .form-section {
          margin-top: 2.5rem;
          padding: 1.5rem;
          background: rgba(0, 162, 255, 0.03);
          border-radius: 12px;
          border: 1px dashed rgba(0, 162, 255, 0.3);
        }

        .image-upload-section {
          margin-top: 0;
          margin-bottom: 1rem;
        }

        .image-upload-container {
          display: flex;
          flex-direction: row;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .upload-box {
          width: 180px;
          height: 180px;
          border: 2px dashed #00a2ff;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          background: white;
          transition: all 0.3s ease;
          gap: 0.75rem;
        }

        .upload-box:hover {
          border-color: #0055f4;
          background: rgba(0, 85, 244, 0.05);
          transform: scale(1.02);
        }

        .camera-icon {
          width: 36px;
          height: 36px;
          color: #00a2ff;
        }

        .camera-icon svg {
          width: 100%;
          height: 100%;
        }

        .upload-box span {
          font-size: 0.875rem;
          color: #0055f4;
          font-weight: 600;
        }

        .image-preview {
          position: relative;
          width: 180px;
          height: 180px;
          border-radius: 12px;
          overflow: hidden;
          border: 2px solid #e5e7eb;
        }

        .image-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .remove-image-btn {
          position: absolute;
          top: 0.25rem;
          right: 0.25rem;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #ef4444;
          color: white;
          border: none;
          font-size: 0.875rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .remove-image-btn:hover {
          background: #dc2626;
          transform: scale(1.1);
        }

        .radio-group {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .radio-option {
          display: inline-flex;
          align-items: center;
          gap: 0.625rem;
          padding: 0.75rem 1.25rem;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          background: white;
          min-width: 105px;
        }

        .radio-option:hover {
          border-color: #00a2ff;
          background: rgba(0, 162, 255, 0.05);
        }

        .radio-option input[type="radio"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
          accent-color: #0055f4;
          margin: 0;
          flex-shrink: 0;
        }

        .radio-option input[type="radio"]:checked + span {
          color: #0055f4;
          font-weight: 700;
        }

        .radio-option:has(input[type="radio"]:checked) {
          border-color: #0055f4;
          background: rgba(0, 85, 244, 0.08);
        }

        .radio-option span {
          font-size: 1rem;
          color: #374151;
          transition: all 0.2s;
          white-space: nowrap;
          line-height: 1.2;
        }

        .category-scroll-container {
          display: flex;
          gap: 0.75rem;
          overflow-x: auto;
          padding: 0.5rem 0;
          scrollbar-width: thin;
          scrollbar-color: #00a2ff #f3f4f6;
        }

        .category-scroll-container::-webkit-scrollbar {
          height: 6px;
        }

        .category-scroll-container::-webkit-scrollbar-track {
          background: #f3f4f6;
          border-radius: 3px;
        }

        .category-scroll-container::-webkit-scrollbar-thumb {
          background: #00a2ff;
          border-radius: 3px;
        }

        .category-scroll-container::-webkit-scrollbar-thumb:hover {
          background: #0055f4;
        }

        .category-button {
          padding: 0.75rem 1.5rem;
          border: 2px solid #e5e7eb;
          background: white;
          color: #374151;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .category-button:hover {
          border-color: #00a2ff;
          background: rgba(0, 162, 255, 0.05);
        }

        .category-button.active {
          border-color: #0055f4;
          background: rgba(0, 85, 244, 0.08);
          color: #0055f4;
          font-weight: 700;
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

        .submit-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(58, 0, 187, 0.4);
        }

        .submit-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
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

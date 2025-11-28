import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { Part } from '@shared/index';
import { useAuth } from '../context/AuthContext';
import { mockParts } from '../data/mockParts';
import { getApiUrl } from '../config';

// 카테고리별 기본 이미지
const categoryDefaultImages: Record<string, string> = {
  'battery': '/image/batterypack_1.jpg',
  'motor': '/image/motor_1.jpg',
  'inverter': '/image/inverter_1.png',
  'body-chassis-frame': '/image/car_body_1.jpg',
  'body-panel': '/image/car_body_2.jpg',
  'body-door': '/image/car_body_3.png',
  'body-window': '/image/car_body_1.jpg',
  'body': '/image/car_body_1.jpg', // 하위 호환성
  'charger': '/image/batterypack_1.jpg',
  'electronics': '/image/inverter_1.png',
  'interior': '/image/car_body_1.jpg',
  'other': '/image/car_body_1.jpg',
};

// 이미지 URL 가져오기 헬퍼 함수
const getPartImageUrl = (part: Part, index: number = 0): string => {
  if (part.images && part.images.length > index && part.images[index]) {
    return part.images[index];
  }
  return categoryDefaultImages[part.category] || '/image/car_body_1.jpg';
};

// Mock 데이터를 Part 타입으로 변환
const convertMockPartToPart = (mockPart: any): Part => {
  const categoryMap: Record<string, string> = {
    '배터리': 'battery',
    '모터': 'motor',
    '인버터': 'inverter',
    '충전기': 'charger',
    '전장 부품': 'electronics',
    '차체': 'body',
    '내장재': 'interior',
    '기타': 'other'
  };

  const categoryEng = categoryMap[mockPart.category] || 'other';

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

export default function PartDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [selectedImage, setSelectedImage] = useState(0);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactTab, setContactTab] = useState<'inquiry' | 'proposal'>('inquiry'); // 탭 상태
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  // Contact inquiry 폼 데이터
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  // Proposal 폼 데이터
  const [proposalData, setProposalData] = useState({
    quantity: 1,
    priceOffer: '',
    message: '',
    deliveryDate: '',
    paymentTerms: '',
  });

  // 백엔드 API에서 부품 데이터 가져오기 (정적 호스팅 대응: mock 데이터 fallback)
  const { data: part, isLoading, error } = useQuery<Part>({
    queryKey: ['part', id],
    queryFn: async () => {
      try {
        const response = await fetch(getApiUrl(`parts/${id}`));
        if (!response.ok) {
          throw new Error('부품을 찾을 수 없습니다');
        }
        return response.json();
      } catch (error) {
        console.log('API 호출 실패, mock 데이터 사용:', error);
        // Mock 데이터에서 partId로 검색
        const mockPart = mockParts.find(p => p.id === id);
        if (mockPart) {
          return convertMockPartToPart(mockPart);
        }
        throw new Error('부품을 찾을 수 없습니다');
      }
    },
    enabled: !!id,
  });

  // Proposal 생성 mutation - Hook은 항상 최상위에서 호출
  const createProposalMutation = useMutation({
    mutationFn: async (proposal: any) => {
      const response = await fetch(getApiUrl('proposals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposal),
      });

      if (!response.ok) {
        throw new Error('제안 전송에 실패했습니다');
      }

      return response.json();
    },
    onSuccess: () => {
      alert('✅ 제안이 성공적으로 전송되었습니다!');
      setShowContactModal(false);
      setProposalData({
        quantity: 1,
        priceOffer: '',
        message: '',
        deliveryDate: '',
        paymentTerms: '',
      });
    },
    onError: (error: Error) => {
      alert(`❌ 제안 전송 실패: ${error.message}`);
    },
  });

  // 이메일 템플릿 생성 - part가 있을 때만 호출
  const generateEmailTemplate = () => {
    if (!part) return { subject: '', body: '' };

    const subject = `[EECAR] ${part.name} 구매 문의`;
    const body = `안녕하세요,

EECAR를 통해 등록하신 '${part.name}'에 관심이 있어 연락드립니다.

▪️ 구매 희망 부품: ${part.name}
▪️ 제조사: ${part.manufacturer} / 모델: ${part.model}
▪️ 등록 가격: ${part.price.toLocaleString()}원
▪️ 판매자 ID: ${part.sellerId}

저희는 [사용 목적을 입력해주세요]을 위해 해당 부품이 필요합니다.

부품의 상세 사양, 현재 상태, 그리고 거래 조건에 대해
미팅을 통해 논의하고 싶습니다.

▪️ 연락 가능한 시간: [입력해주세요]
▪️ 희망 미팅 방식: □ 대면  □ 화상

회신 기다리겠습니다.
감사합니다.

---
EECAR 전기차 부품 거래 플랫폼
https://eecar.com`;

    return { subject, body };
  };

  const handleOpenModal = (tab: 'inquiry' | 'proposal' = 'inquiry') => {
    if (tab === 'inquiry') {
      const { subject, body } = generateEmailTemplate();
      setEmailSubject(subject);
      setEmailBody(body);
    }
    setContactTab(tab);
    setShowContactModal(true);
  };

  const handleContactClick = async () => {
    // Validation
    if (!contactName || !contactEmail || !emailSubject || !emailBody) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactEmail)) {
      alert('유효한 이메일 주소를 입력해주세요.');
      return;
    }

    setIsSubmittingContact(true);

    try {
      const response = await fetch(getApiUrl('contact'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          subject: emailSubject,
          message: emailBody,
          partId: part?.partId,
          partName: part?.name,
        }),
      });

      if (!response.ok) {
        throw new Error('문의 전송에 실패했습니다');
      }

      alert('문의가 성공적으로 접수되었습니다. 빠른 시일 내에 답변 드리겠습니다.');
      setShowContactModal(false);
      // Reset form
      setContactName('');
      setContactEmail('');
      setEmailSubject('');
      setEmailBody('');
    } catch (error) {
      console.error('Contact inquiry error:', error);
      alert('문의 전송에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmittingContact(false);
    }
  };

  const handleProposal = () => {
    if (!isAuthenticated) {
      alert('로그인이 필요한 서비스입니다.');
      navigate('/login');
      return;
    }

    if (!proposalData.priceOffer) {
      alert('제안 가격을 입력해주세요.');
      return;
    }

    if (!part) return;

    createProposalMutation.mutate({
      fromCompanyId: user?.id || 'unknown',
      toCompanyId: part.sellerId || 'unknown',
      partIds: [id],
      proposalType: 'buy',
      quantity: proposalData.quantity,
      priceOffer: parseFloat(proposalData.priceOffer),
      message: proposalData.message,
      terms: {
        deliveryDate: proposalData.deliveryDate,
        paymentTerms: proposalData.paymentTerms,
      },
    });
  };

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="error-page">
        <div className="loading-spinner"></div>
        <p>부품 정보를 불러오는 중...</p>
        <style>{`
          .loading-spinner {
            width: 50px;
            height: 50px;
            border: 4px solid #f3f4f6;
            border-top: 4px solid #0055f4;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .error-page {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            gap: 1.5rem;
            padding: 2rem;
            background: #f9fafb;
          }
          .error-page p {
            color: #6b7280;
          }
        `}</style>
      </div>
    );
  }

  // 에러 또는 부품 없음
  if (error || !part) {
    return (
      <div className="error-page">
        <h2>부품을 찾을 수 없습니다</h2>
        <p>{error ? (error as Error).message : '요청하신 부품 정보가 존재하지 않습니다.'}</p>
        <button onClick={() => navigate('/buyer')}>부품 검색으로 돌아가기</button>

        <style>{`
          .error-page {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            gap: 1.5rem;
            padding: 2rem;
            background: #f9fafb;
          }

          .error-page h2 {
            color: #1f2937;
            font-size: 1.5rem;
          }

          .error-page p {
            color: #6b7280;
          }

          .error-page button {
            padding: 0.875rem 1.5rem;
            background: #0055f4;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
          }

          .error-page button:hover {
            background: #0040c0;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="part-detail-page">
      {/* 헤더 */}
      <header className="page-header">
        <button onClick={() => navigate(-1)} className="back-button">
          ← 뒤로가기
        </button>
        <h1>{part.category}</h1>
      </header>

      <main className="detail-container">
        {/* 상단: 이미지 + 기본 정보 */}
        <div className="top-section">
          {/* 이미지 갤러리 */}
          <div className="image-gallery">
            <div className="main-image">
              <img
                src={getPartImageUrl(part, selectedImage)}
                alt={part.name}
                onError={(e) => {
                  const defaultImg = categoryDefaultImages[part.category] || '/image/car_body_1.jpg';
                  if (e.currentTarget.src !== window.location.origin + defaultImg) {
                    e.currentTarget.src = defaultImg;
                  }
                }}
              />
              {part.quantity && (
                <div className="quantity-badge">{part.quantity}개 재고</div>
              )}
            </div>

            {part.images && part.images.length > 1 && (
              <div className="thumbnail-list">
                {part.images.map((img, idx) => (
                  <div
                    key={idx}
                    className={`thumbnail ${selectedImage === idx ? 'active' : ''}`}
                    onClick={() => setSelectedImage(idx)}
                  >
                    <img
                      src={img}
                      alt={`${part.name} ${idx + 1}`}
                      onError={(e) => {
                        const defaultImg = categoryDefaultImages[part.category] || '/image/car_body_1.jpg';
                        e.currentTarget.src = defaultImg;
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 기본 정보 */}
          <div className="basic-info">
            <h2 className="part-name">{part.name}</h2>
            <p className="part-meta">{part.manufacturer} · {part.model} · {part.year}년식</p>
            <div className="price-section">
              <span className="price">{part.price.toLocaleString()}원</span>
            </div>

            {/* 주요 스펙 */}
            <div className="key-specs">
              {part.specifications?.electricalProps?.capacity && (
                <div className="spec-item">
                  <span className="spec-label">용량</span>
                  <span className="spec-value">{part.specifications.electricalProps.capacity}Ah</span>
                </div>
              )}
              {part.specifications?.electricalProps?.power && (
                <div className="spec-item">
                  <span className="spec-label">출력</span>
                  <span className="spec-value">{part.specifications.electricalProps.power}W</span>
                </div>
              )}
              {part.specifications?.electricalProps?.voltage && (
                <div className="spec-item">
                  <span className="spec-label">전압</span>
                  <span className="spec-value">{part.specifications.electricalProps.voltage}V</span>
                </div>
              )}
              <div className="spec-item">
                <span className="spec-label">카테고리</span>
                <span className="spec-value">{part.category}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 설명 */}
        {part.description && (
          <section className="description-section">
            <h3>상세 설명</h3>
            <p>{part.description}</p>
          </section>
        )}

        {/* 상세 사양 */}
        {part.specifications && (
          <section className="specifications-section">
            <h3>상세 사양</h3>
            <div className="specs-grid">
              {Object.entries(part.specifications).map(([key, value]) => {
                // 객체인 경우 적절히 처리
                const displayValue = typeof value === 'object' && value !== null
                  ? JSON.stringify(value, null, 2)
                  : String(value);

                return (
                  <div key={key} className="spec-row">
                    <span className="spec-key">{key}</span>
                    <span className="spec-val" style={{ whiteSpace: 'pre-wrap' }}>{displayValue}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 활용 사례 */}
        {part.useCases && part.useCases.length > 0 && (
          <section className="use-cases-section">
            <h3>활용 사례</h3>
            <div className="use-cases-grid">
              {part.useCases.map((useCase, idx) => (
                <div key={idx} className="use-case-card">
                  <div className="use-case-header">
                    <span className="industry">{useCase.industry}</span>
                    <span className="application">{useCase.application}</span>
                  </div>
                  <p className="use-case-desc">{useCase.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 판매자 정보 */}
        <section className="seller-section">
          <h3>판매자 정보</h3>
          <div className="seller-card">
            <div className="seller-info">
              <div className="seller-name">판매자 ID: {part.sellerId}</div>
              <div className="seller-note">
                💡 판매자와 직접 연락하려면 아래 '구매 문의하기' 버튼을 클릭하세요.
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 하단 고정 버튼 */}
      <div className="fixed-bottom">
        <button className="contact-button" onClick={() => handleOpenModal('inquiry')}>
          문의하기
        </button>
      </div>

      {/* 통합 문의/제안 모달 */}
      {showContactModal && (
        <div className="modal-overlay" onClick={() => setShowContactModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>판매자 문의하기</h3>
              <button className="close-button" onClick={() => setShowContactModal(false)}>
                ✕
              </button>
            </div>

            {/* 탭 전환 */}
            <div className="modal-tabs">
              <button
                className={`tab-button ${contactTab === 'inquiry' ? 'active' : ''}`}
                onClick={() => setContactTab('inquiry')}
              >
                일반 문의
              </button>
              <button
                className={`tab-button ${contactTab === 'proposal' ? 'active' : ''}`}
                onClick={() => setContactTab('proposal')}
              >
                구매 제안
              </button>
            </div>

            <div className="modal-body">
              {contactTab === 'inquiry' ? (
                // 일반 문의 탭
                <>
                  <p className="modal-description">
                    EECAR 고객센터로 문의가 전송됩니다.<br/>
                    아래 정보를 입력해주세요.
                  </p>

                  <div className="email-preview">
                    <div className="preview-label">이름</div>
                    <input
                      type="text"
                      className="email-subject-input"
                      placeholder="홍길동"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                    />

                    <div className="preview-label">이메일</div>
                    <input
                      type="email"
                      className="email-subject-input"
                      placeholder="example@email.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                    />

                    <div className="preview-label">받는 사람</div>
                    <div className="preview-value">EECAR 고객센터 (inha2025vip@gmail.com)</div>

                    <div className="preview-label">제목</div>
                    <input
                      type="text"
                      className="email-subject-input"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                    />

                    <div className="preview-label">내용</div>
                    <textarea
                      className="email-body-input"
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      rows={15}
                    />
                  </div>

                  <div className="modal-tip">
                    💡 [사용 목적], [연락 가능한 시간], [희망 미팅 방식]을 입력한 후 전송해주세요.
                  </div>
                </>
              ) : (
                // 구매 제안 탭
                <>
                  <p className="modal-description">
                    판매자에게 구매 제안을 보냅니다. 조건을 입력하고 전송하세요.
                  </p>

                  <div className="proposal-part-info">
                    <strong>{part.name}</strong>
                    <span>현재 가격: {part.price.toLocaleString()}원</span>
                  </div>

                  <div className="form-group">
                    <label>수량 *</label>
                    <input
                      type="number"
                      min="1"
                      value={proposalData.quantity}
                      onChange={(e) => setProposalData({ ...proposalData, quantity: parseInt(e.target.value) })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label>제안 가격 (원) *</label>
                    <input
                      type="number"
                      placeholder="예: 14000000"
                      value={proposalData.priceOffer}
                      onChange={(e) => setProposalData({ ...proposalData, priceOffer: e.target.value })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label>희망 납기일</label>
                    <input
                      type="date"
                      value={proposalData.deliveryDate}
                      onChange={(e) => setProposalData({ ...proposalData, deliveryDate: e.target.value })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label>결제 조건</label>
                    <input
                      type="text"
                      placeholder="예: 계약금 30%, 잔금 70%"
                      value={proposalData.paymentTerms}
                      onChange={(e) => setProposalData({ ...proposalData, paymentTerms: e.target.value })}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label>추가 메시지</label>
                    <textarea
                      rows={4}
                      placeholder="제안에 대한 추가 설명을 입력하세요"
                      value={proposalData.message}
                      onChange={(e) => setProposalData({ ...proposalData, message: e.target.value })}
                      className="form-textarea"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="cancel-button"
                onClick={() => setShowContactModal(false)}
              >
                취소
              </button>
              <button
                className="send-button"
                onClick={contactTab === 'inquiry' ? handleContactClick : handleProposal}
                disabled={
                  (contactTab === 'inquiry' && isSubmittingContact) ||
                  (contactTab === 'proposal' && createProposalMutation.isPending)
                }
              >
                {contactTab === 'inquiry'
                  ? isSubmittingContact ? '전송 중...' : '문의하기'
                  : createProposalMutation.isPending ? '전송 중...' : '제안 전송'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        * {
          box-sizing: border-box;
        }

        .part-detail-page {
          min-height: 100vh;
          background: #f9fafb;
          padding-bottom: 80px;
        }

        /* 헤더 */
        .page-header {
          background: white;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          gap: 1rem;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .back-button {
          padding: 0.5rem 1rem;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          color: #374151;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .back-button:hover {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .page-header h1 {
          margin: 0;
          color: #1f2937;
          font-size: 1.125rem;
          font-weight: 600;
        }

        /* 메인 컨테이너 */
        .detail-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 1.5rem;
        }

        /* 상단 섹션 */
        .top-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          margin-bottom: 1.5rem;
        }

        /* 이미지 갤러리 */
        .image-gallery {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          border: 1px solid #e5e7eb;
        }

        .main-image {
          position: relative;
          width: 100%;
          height: 400px;
          border-radius: 8px;
          overflow: hidden;
          background: #f3f4f6;
          margin-bottom: 1rem;
        }

        .main-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .quantity-badge {
          position: absolute;
          bottom: 12px;
          right: 12px;
          background: rgba(0, 0, 0, 0.75);
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .thumbnail-list {
          display: flex;
          gap: 0.75rem;
          overflow-x: auto;
        }

        .thumbnail {
          width: 80px;
          height: 80px;
          border-radius: 6px;
          overflow: hidden;
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .thumbnail:hover {
          border-color: #d1d5db;
        }

        .thumbnail.active {
          border-color: #0055f4;
        }

        .thumbnail img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        /* 기본 정보 */
        .basic-info {
          background: white;
          border-radius: 12px;
          padding: 2rem;
          border: 1px solid #e5e7eb;
        }

        .part-name {
          margin: 0 0 0.5rem 0;
          color: #1f2937;
          font-size: 1.75rem;
          font-weight: 700;
        }

        .part-meta {
          margin: 0 0 1.5rem 0;
          color: #6b7280;
          font-size: 0.9375rem;
        }

        .price-section {
          padding: 1.5rem 0;
          border-top: 1px solid #e5e7eb;
          border-bottom: 1px solid #e5e7eb;
          margin-bottom: 1.5rem;
        }

        .price {
          color: #1f2937;
          font-size: 2rem;
          font-weight: 800;
        }

        .key-specs {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .spec-item {
          display: flex;
          justify-content: space-between;
          padding: 0.75rem;
          background: #f9fafb;
          border-radius: 6px;
        }

        .spec-label {
          color: #6b7280;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .spec-value {
          color: #1f2937;
          font-size: 0.875rem;
          font-weight: 600;
        }

        /* 섹션 공통 스타일 */
        .description-section,
        .specifications-section,
        .use-cases-section,
        .seller-section {
          background: white;
          border-radius: 12px;
          padding: 2rem;
          margin-bottom: 1.5rem;
          border: 1px solid #e5e7eb;
        }

        .description-section h3,
        .specifications-section h3,
        .use-cases-section h3,
        .seller-section h3 {
          margin: 0 0 1.5rem 0;
          color: #1f2937;
          font-size: 1.25rem;
          font-weight: 700;
        }

        .description-section p {
          margin: 0;
          color: #374151;
          line-height: 1.7;
          font-size: 0.9375rem;
        }

        /* 상세 사양 */
        .specs-grid {
          display: grid;
          gap: 0.75rem;
        }

        .spec-row {
          display: flex;
          justify-content: space-between;
          padding: 1rem;
          background: #f9fafb;
          border-radius: 6px;
        }

        .spec-key {
          color: #6b7280;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .spec-val {
          color: #1f2937;
          font-size: 0.875rem;
          font-weight: 600;
        }

        /* 활용 사례 */
        .use-cases-grid {
          display: grid;
          gap: 1rem;
        }

        .use-case-card {
          padding: 1.25rem;
          background: #f0f9ff;
          border-radius: 8px;
          border-left: 4px solid #0080ff;
        }

        .use-case-header {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .industry {
          padding: 0.25rem 0.75rem;
          background: #dbeafe;
          color: #1e40af;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .application {
          padding: 0.25rem 0.75rem;
          background: white;
          color: #0080ff;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .use-case-desc {
          margin: 0;
          color: #374151;
          font-size: 0.875rem;
          line-height: 1.6;
        }

        /* 판매자 정보 */
        .seller-card {
          display: grid;
          gap: 1.5rem;
        }

        .seller-info {
          padding: 1.25rem;
          background: #f9fafb;
          border-radius: 8px;
        }

        .seller-name {
          font-size: 1.125rem;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 0.5rem;
        }

        .seller-location {
          color: #6b7280;
          font-size: 0.875rem;
        }

        .seller-note {
          margin-top: 0.75rem;
          padding: 0.875rem;
          background: #fef3c7;
          border-left: 4px solid #f59e0b;
          border-radius: 6px;
          color: #92400e;
          font-size: 0.875rem;
          line-height: 1.5;
        }

        .seller-contact {
          display: grid;
          gap: 0.75rem;
        }

        .contact-item {
          display: flex;
          justify-content: space-between;
          padding: 0.875rem;
          background: #f9fafb;
          border-radius: 6px;
        }

        .contact-item .label {
          color: #6b7280;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .contact-item .value {
          color: #1f2937;
          font-size: 0.875rem;
          font-weight: 600;
        }

        /* 하단 고정 버튼 */
        .fixed-bottom {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: white;
          padding: 1rem 1.5rem;
          border-top: 1px solid #e5e7eb;
          z-index: 50;
        }

        .contact-button {
          width: 100%;
          padding: 1rem;
          background: #0055f4;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1.0625rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .contact-button:hover {
          background: #0040c0;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 85, 244, 0.3);
        }

        /* 모달 */
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
          max-width: 600px;
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

        /* 탭 */
        .modal-tabs {
          display: flex;
          gap: 0;
          border-bottom: 2px solid #e5e7eb;
          background: #f9fafb;
        }

        .tab-button {
          flex: 1;
          padding: 1rem;
          background: transparent;
          border: none;
          border-bottom: 3px solid transparent;
          font-size: 0.9375rem;
          font-weight: 600;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: -2px;
        }

        .tab-button:hover {
          color: #374151;
          background: rgba(0, 85, 244, 0.05);
        }

        .tab-button.active {
          color: #0055f4;
          border-bottom-color: #0055f4;
          background: white;
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

        /* Proposal 폼 스타일 */
        .proposal-part-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: linear-gradient(135deg, rgba(5, 150, 105, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%);
          border-left: 4px solid #10b981;
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }

        .proposal-part-info strong {
          color: #1f2937;
          font-size: 1rem;
          font-weight: 700;
        }

        .proposal-part-info span {
          color: #059669;
          font-size: 0.9375rem;
          font-weight: 600;
        }

        .form-group {
          margin-bottom: 1.25rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          color: #374151;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .form-input {
          width: 100%;
          padding: 0.75rem;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 0.9375rem;
          font-family: inherit;
          transition: all 0.2s;
        }

        .form-input:focus {
          outline: none;
          border-color: #0055f4;
          box-shadow: 0 0 0 3px rgba(0, 85, 244, 0.1);
        }

        .form-textarea {
          width: 100%;
          padding: 0.875rem;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 0.9375rem;
          font-family: inherit;
          line-height: 1.6;
          resize: vertical;
          transition: all 0.2s;
        }

        .form-textarea:focus {
          outline: none;
          border-color: #0055f4;
          box-shadow: 0 0 0 3px rgba(0, 85, 244, 0.1);
        }

        .email-preview {
          background: #f9fafb;
          border-radius: 8px;
          padding: 1.25rem;
          margin-bottom: 1rem;
        }

        .preview-label {
          color: #6b7280;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          margin-bottom: 0.375rem;
        }

        .preview-value {
          color: #1f2937;
          font-size: 0.9375rem;
          font-weight: 600;
          margin-bottom: 1rem;
        }

        .email-subject-input {
          width: 100%;
          padding: 0.75rem;
          border: 2px solid #e5e7eb;
          border-radius: 6px;
          font-size: 0.9375rem;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 1rem;
          font-family: inherit;
          transition: all 0.2s;
        }

        .email-subject-input:focus {
          outline: none;
          border-color: #0055f4;
          box-shadow: 0 0 0 3px rgba(0, 85, 244, 0.1);
        }

        .email-body-input {
          width: 100%;
          padding: 1rem;
          border: 2px solid #e5e7eb;
          border-radius: 6px;
          font-size: 0.875rem;
          line-height: 1.6;
          color: #374151;
          font-family: inherit;
          resize: vertical;
          transition: all 0.2s;
        }

        .email-body-input:focus {
          outline: none;
          border-color: #0055f4;
          box-shadow: 0 0 0 3px rgba(0, 85, 244, 0.1);
        }

        .preview-content {
          background: white;
          padding: 1rem;
          border-radius: 6px;
          color: #374151;
          font-size: 0.875rem;
          line-height: 1.6;
          white-space: pre-wrap;
          max-height: 300px;
          overflow-y: auto;
          border: 1px solid #e5e7eb;
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
        .send-button {
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

        .send-button {
          background: #0055f4;
          border: none;
          color: white;
        }

        .send-button:hover:not(:disabled) {
          background: #0040c0;
        }

        .send-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* 반응형 */
        @media (max-width: 768px) {
          .top-section {
            grid-template-columns: 1fr;
          }

          .main-image {
            height: 300px;
          }

          .part-name {
            font-size: 1.375rem;
          }

          .price {
            font-size: 1.5rem;
          }

          .modal-content {
            max-height: 95vh;
          }
        }
      `}</style>
    </div>
  );
}

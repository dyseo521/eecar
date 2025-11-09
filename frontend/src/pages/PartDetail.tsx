import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mockParts } from '../data/mockParts';

export default function PartDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState(0);
  const [showContactModal, setShowContactModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  // mockParts에서 부품 찾기
  const part = mockParts.find(p => p.id === id);

  if (!part) {
    return (
      <div className="error-page">
        <h2>부품을 찾을 수 없습니다</h2>
        <p>요청하신 부품 정보가 존재하지 않습니다.</p>
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

  // 이메일 템플릿 생성
  const generateEmailTemplate = () => {
    const subject = `[EECAR] ${part.name} 구매 문의`;
    const body = `안녕하세요, ${part.seller.company}님

EECAR를 통해 등록하신 '${part.name}'에 관심이 있어 연락드립니다.

▪️ 구매 희망 부품: ${part.name}
▪️ 제조사: ${part.manufacturer} / 모델: ${part.model}
▪️ 등록 가격: ${part.price.toLocaleString()}원

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

  const handleOpenModal = () => {
    const { subject, body } = generateEmailTemplate();
    setEmailSubject(subject);
    setEmailBody(body);
    setShowContactModal(true);
  };

  const handleContactClick = () => {
    window.location.href = `mailto:${part.seller.contact}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    setShowContactModal(false);
  };

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
                src={part.images?.[selectedImage] || part.image}
                alt={part.name}
                onError={(e) => {
                  e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect fill="%23f3f4f6" width="400" height="300"/><text x="50%" y="50%" text-anchor="middle" fill="%239ca3af" font-size="16">이미지 없음</text></svg>';
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
                    <img src={img} alt={`${part.name} ${idx + 1}`} />
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
              {part.capacity && (
                <div className="spec-item">
                  <span className="spec-label">용량</span>
                  <span className="spec-value">{part.capacity}</span>
                </div>
              )}
              {part.power && (
                <div className="spec-item">
                  <span className="spec-label">출력</span>
                  <span className="spec-value">{part.power}</span>
                </div>
              )}
              {part.type && (
                <div className="spec-item">
                  <span className="spec-label">타입</span>
                  <span className="spec-value">{part.type}</span>
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
              {Object.entries(part.specifications).map(([key, value]) => (
                <div key={key} className="spec-row">
                  <span className="spec-key">{key}</span>
                  <span className="spec-val">{value as string}</span>
                </div>
              ))}
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
        {part.seller && (
          <section className="seller-section">
            <h3>판매자 정보</h3>
            <div className="seller-card">
              <div className="seller-info">
                <div className="seller-name">{part.seller.company}</div>
                <div className="seller-location">📍 {part.seller.location}</div>
              </div>
              <div className="seller-contact">
                <div className="contact-item">
                  <span className="label">이메일</span>
                  <span className="value">{part.seller.contact}</span>
                </div>
                <div className="contact-item">
                  <span className="label">전화</span>
                  <span className="value">{part.seller.phone}</span>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* 하단 고정 버튼 */}
      <div className="fixed-bottom">
        <button className="contact-button" onClick={handleOpenModal}>
          구매 문의하기
        </button>
      </div>

      {/* 문의하기 모달 */}
      {showContactModal && (
        <div className="modal-overlay" onClick={() => setShowContactModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>구매 문의하기</h3>
              <button className="close-button" onClick={() => setShowContactModal(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-description">
                판매자에게 아래 양식으로 이메일이 발송됩니다.<br/>
                필요한 내용을 수정한 후 전송해주세요.
              </p>

              <div className="email-preview">
                <div className="preview-label">받는 사람</div>
                <div className="preview-value">{part.seller.company} ({part.seller.contact})</div>

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
            </div>

            <div className="modal-footer">
              <button className="cancel-button" onClick={() => setShowContactModal(false)}>
                취소
              </button>
              <button className="send-button" onClick={handleContactClick}>
                메일로 문의하기
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

        .modal-body {
          padding: 1.5rem;
        }

        .modal-description {
          margin: 0 0 1.5rem 0;
          color: #6b7280;
          font-size: 0.9375rem;
          line-height: 1.6;
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

        .send-button:hover {
          background: #0040c0;
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

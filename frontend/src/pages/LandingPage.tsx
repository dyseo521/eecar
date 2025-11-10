import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Intersection Observer for fade-in animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('fade-in-visible');
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px',
      }
    );

    // Observe all sections
    const sections = document.querySelectorAll('.animate-on-scroll');
    sections.forEach((section) => observer.observe(section));

    return () => {
      sections.forEach((section) => observer.unobserve(section));
    };
  }, []);

  return (
    <div className="landing-page">
      {/* Hero Section with Parallax */}
      <section className="hero" style={{ transform: `translateY(${scrollY * 0.3}px)` }}>
        <div className="hero-content">
          <div className="logo">EECAR</div>
          <h1 className="hero-title">전기차 중고 부품 B2B 거래 플랫폼</h1>
          <p className="hero-subtitle">
            AI 기반 RAG 검색으로 최적의 EV 부품을 찾아보세요
          </p>
          <div className="hero-stats">
            <div className="stat">
              <div className="stat-number">10K+</div>
              <div className="stat-label">등록된 부품</div>
            </div>
            <div className="stat">
              <div className="stat-number">500+</div>
              <div className="stat-label">파트너사</div>
            </div>
            <div className="stat">
              <div className="stat-number">AI</div>
              <div className="stat-label">RAG 검색</div>
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="scroll-indicator">
          <svg className="scroll-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14m0 0l-7-7m7 7l7-7" />
          </svg>
        </div>
      </section>

      {/* Entry Points - Toss Style */}
      <section className="entry-section animate-on-scroll">
        <div className="container">
          <h2 className="section-title-large">EV 부품 거래,<br/>이제 EECAR에서</h2>
          <p className="section-subtitle">AI가 찾아주는 최적의 부품, 안전한 B2B 거래</p>

          <div className="entry-grid">
            <div className="entry-card" onClick={() => navigate('/buyer')}>
              <div className="entry-icon-large">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3>AI로 부품 찾기</h3>
              <p>자연어로 물어보면 AI가 최적의 부품을 추천합니다</p>
              <button className="entry-button-large">
                부품 검색하기 →
              </button>
            </div>

            <div className="entry-card" onClick={() => navigate('/seller')}>
              <div className="entry-icon-large">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h3>부품 등록하고 판매하기</h3>
              <p>간편한 등록으로 구매 제안을 받아보세요</p>
              <button className="entry-button-large">
                부품 등록하기 →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - Toss Style */}
      <section className="features-section animate-on-scroll">
        <div className="container">
          <h2 className="section-title-large">필요한 부품,<br/>AI가 찾아드립니다</h2>
          <p className="section-subtitle">검증된 데이터로 안전하게, RAG 기술로 정확하게</p>

          <div className="features-grid-simple">
            <div className="feature-card-large animate-on-scroll">
              <div className="feature-icon-xl">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3>AI 기반 검색</h3>
              <p>자연어로 물어보면 RAG 시스템이 최적의 부품을 찾아드립니다</p>
            </div>

            <div className="feature-card-large animate-on-scroll">
              <div className="feature-icon-xl">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3>검증된 물성 데이터</h3>
              <p>부품별 물성 데이터를 체계적으로 관리하고 제공합니다</p>
            </div>

            <div className="feature-card-large animate-on-scroll">
              <div className="feature-icon-xl">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <h3>스마트 알림</h3>
              <p>원하는 부품이 등록되면 즉시 알림을 받아보세요</p>
            </div>

            <div className="feature-card-large animate-on-scroll">
              <div className="feature-icon-xl">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3>안전한 B2B 거래</h3>
              <p>기업 간 계약과 협상을 안전하게 지원합니다</p>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow - Toss Style */}
      <section className="workflow-section animate-on-scroll">
        <div className="container">
          <h2 className="section-title-large">간편하게, 안전하게</h2>
          <p className="section-subtitle">3단계로 끝나는 부품 거래</p>

          <div className="workflow-grid">
            <div className="workflow-step animate-on-scroll">
              <div className="step-number">①</div>
              <h3>AI가 부품을 찾아드립니다</h3>
              <p>자연어로 물어보면 최적의 부품을 추천받습니다</p>
            </div>

            <div className="workflow-step animate-on-scroll">
              <div className="step-number">②</div>
              <h3>물성 데이터를 확인하세요</h3>
              <p>검증된 데이터로 안전하게 비교하고 선택합니다</p>
            </div>

            <div className="workflow-step animate-on-scroll">
              <div className="step-number">③</div>
              <h3>계약하고 거래 완료</h3>
              <p>안전한 B2B 프로세스로 거래를 진행합니다</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section - Toss Style */}
      <section className="cta-section animate-on-scroll">
        <div className="container">
          <div className="cta-content-large">
            <h2 className="cta-title-large">지금 바로<br/>시작하세요</h2>
            <p className="cta-subtitle">EV 부품 거래의 새로운 기준</p>
            <div className="cta-buttons-large">
              <button className="cta-button-primary" onClick={() => navigate('/buyer')}>
                부품 검색하기
              </button>
              <button className="cta-button-secondary" onClick={() => navigate('/seller')}>
                부품 등록하기
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-logo">EECAR</div>
            <div className="footer-info">
              <p className="footer-contact">
                <span className="contact-label">문의</span>
                <a href="mailto:dyseo521@gmail.com">dyseo521@gmail.com</a>
              </p>
              <p className="footer-copyright">
                © {new Date().getFullYear()} EECAR. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>

      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .landing-page {
          min-height: 100vh;
          background: #ffffff;
          font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          overflow-x: hidden;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 2rem;
        }

        /* Hero Section */
        .hero {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            linear-gradient(to bottom, transparent 0%, rgba(255, 255, 255, 0.6) 80%, white 100%),
            linear-gradient(180deg, rgba(248, 250, 252, 0.75) 0%, rgba(255, 255, 255, 0.6) 100%),
            url('/image/background.png');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          position: relative;
          z-index: 1;
        }

        .hero::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background:
            radial-gradient(circle at 20% 50%, rgba(0, 85, 244, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(0, 128, 255, 0.06) 0%, transparent 50%),
            radial-gradient(circle at 40% 20%, rgba(0, 162, 255, 0.05) 0%, transparent 50%);
          pointer-events: none;
        }

        .hero-content {
          text-align: center;
          position: relative;
          z-index: 1;
        }

        .logo {
          font-size: 4rem;
          font-weight: 900;
          background: linear-gradient(135deg, #0055f4 0%, #0055f4 50%, #0080ff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 2rem;
          letter-spacing: -0.05em;
        }

        .hero-title {
          font-size: 2rem;
          color: #1e293b;
          margin-bottom: 1rem;
          font-weight: 700;
        }

        .hero-subtitle {
          font-size: 1.25rem;
          color: #64748b;
          margin-bottom: 3rem;
          max-width: 600px;
          margin-left: auto;
          margin-right: auto;
        }

        .hero-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 2rem;
          max-width: 600px;
          margin: 0 auto;
        }

        .stat {
          padding: 1.5rem;
          background: white;
          border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .stat-number {
          font-size: 2rem;
          font-weight: 800;
          background: linear-gradient(135deg, #0055f4, #0080ff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 0.5rem;
        }

        .stat-label {
          font-size: 0.875rem;
          color: #64748b;
        }

        /* Entry Section */
        .entry-section {
          padding: 6rem 0;
          background: linear-gradient(to bottom, rgba(255, 255, 255, 0.7) 0%, white 200px);
          position: relative;
          z-index: 10;
        }

        .section-title {
          text-align: center;
          font-size: 2.5rem;
          font-weight: 800;
          color: #1e293b;
          margin-bottom: 3rem;
        }

        /* Toss Style - Large Title */
        .section-title-large {
          text-align: center;
          font-size: 3.5rem;
          font-weight: 800;
          color: #191F28;
          margin-bottom: 1.5rem;
          line-height: 1.2;
          letter-spacing: -0.03em;
        }

        .section-subtitle {
          text-align: center;
          font-size: 1.25rem;
          color: #4E5968;
          margin-bottom: 4rem;
          font-weight: 500;
        }

        .entry-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2rem;
        }

        .entry-card {
          background: white;
          border-radius: 24px;
          padding: 2.5rem;
          border: 2px solid #e2e8f0;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
        }

        .entry-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          border-color: #0080ff;
        }

        .entry-icon {
          width: 64px;
          height: 64px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1.5rem;
        }

        .buyer-icon {
          background: linear-gradient(135deg, #0055f4, #0055f4);
          color: white;
        }

        .seller-icon {
          background: linear-gradient(135deg, #0080ff, #00a2ff);
          color: white;
        }

        .entry-icon svg {
          width: 32px;
          height: 32px;
        }

        .entry-card h3 {
          font-size: 1.75rem;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 1rem;
        }

        .entry-card p {
          color: #64748b;
          margin-bottom: 1.5rem;
          line-height: 1.6;
        }

        .entry-features {
          list-style: none;
          margin-bottom: 2rem;
        }

        .entry-features li {
          padding: 0.75rem 0;
          color: #475569;
          position: relative;
          padding-left: 1.75rem;
        }

        .entry-features li::before {
          content: '✓';
          position: absolute;
          left: 0;
          color: #0080ff;
          font-weight: bold;
        }

        .entry-button {
          width: 100%;
          padding: 1rem 1.5rem;
          border: none;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .buyer-button {
          background: linear-gradient(135deg, #0055f4, #0055f4);
          color: white;
        }

        .seller-button {
          background: linear-gradient(135deg, #0080ff, #00a2ff);
          color: white;
        }

        .entry-button:hover {
          transform: scale(1.02);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }

        .arrow {
          transition: transform 0.3s;
        }

        .entry-button:hover .arrow {
          transform: translateX(4px);
        }

        /* Toss Style - Entry Components */
        .entry-icon-large {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: #0055f4;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 2rem;
          color: white;
        }

        .entry-icon-large svg {
          width: 40px;
          height: 40px;
        }

        .entry-button-large {
          width: 100%;
          padding: 1.25rem 2rem;
          background: #0055f4;
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 1.125rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 2rem;
        }

        .entry-button-large:hover {
          background: #0040c0;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 85, 244, 0.3);
        }

        /* Features Section */
        .features-section {
          padding: 5rem 0;
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          position: relative;
          z-index: 15;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 2rem;
        }

        .feature-card {
          background: white;
          padding: 2rem;
          border-radius: 20px;
          text-align: center;
          transition: transform 0.3s;
          border: 1px solid #e2e8f0;
        }

        .feature-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }

        .feature-icon {
          width: 64px;
          height: 64px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.5rem;
          color: white;
        }

        .feature-icon svg {
          width: 32px;
          height: 32px;
        }

        .feature-card h3 {
          font-size: 1.25rem;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 0.75rem;
        }

        .feature-card p {
          color: #64748b;
          line-height: 1.6;
        }

        /* Toss Style - Features */
        .features-grid-simple {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 2rem;
          max-width: 900px;
          margin: 0 auto;
        }

        .feature-card-large {
          background: white;
          padding: 3rem;
          border-radius: 24px;
          text-align: center;
          transition: all 0.3s;
          box-shadow: 0 2px 20px rgba(0, 0, 0, 0.08);
        }

        .feature-card-large:hover {
          transform: translateY(-8px);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
        }

        .feature-icon-xl {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: #0055f4;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 2rem;
          color: white;
        }

        .feature-icon-xl svg {
          width: 40px;
          height: 40px;
        }

        .feature-card-large h3 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #191F28;
          margin-bottom: 1rem;
        }

        .feature-card-large p {
          color: #4E5968;
          line-height: 1.7;
          font-size: 1.0625rem;
        }

        /* Timeline Section */
        .timeline-section {
          padding: 6rem 0;
          background: white;
          position: relative;
          z-index: 20;
        }

        .timeline-subtitle {
          text-align: center;
          font-size: 1.125rem;
          color: #64748b;
          margin-bottom: 3rem;
        }

        .timeline-tabs {
          display: flex;
          justify-content: center;
          gap: 1rem;
          margin-bottom: 3rem;
        }

        .timeline-tab {
          padding: 1rem 2rem;
          border: 2px solid #e2e8f0;
          background: white;
          color: #64748b;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }

        .timeline-tab.active {
          border-color: #0055f4;
          background: #0055f4;
          color: white;
        }

        .timeline-tab:hover:not(.active) {
          border-color: #0080ff;
          color: #0080ff;
        }

        .timeline-container {
          display: none;
          max-width: 800px;
          margin: 0 auto;
          position: relative;
        }

        .timeline-container.active {
          display: block;
        }

        .timeline-container::before {
          content: '';
          position: absolute;
          left: 30px;
          top: 0;
          bottom: 0;
          width: 3px;
          background: linear-gradient(180deg, #0055f4 0%, #0055f4 33%, #0080ff 66%, #00a2ff 100%);
        }

        .timeline-item {
          position: relative;
          padding-left: 80px;
          margin-bottom: 3rem;
          animation: slideIn 0.5s ease-out;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .timeline-marker {
          position: absolute;
          left: 0;
          top: 0;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 1.5rem;
          font-weight: 800;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          border: 4px solid white;
        }

        .timeline-content {
          background: white;
          padding: 2rem;
          border-radius: 16px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          border: 1px solid #e2e8f0;
          transition: all 0.3s;
        }

        .timeline-content:hover {
          box-shadow: 0 8px 24px rgba(58, 0, 187, 0.15);
          transform: translateY(-4px);
          border-color: #0080ff;
        }

        .timeline-content h3 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 0.75rem;
        }

        .timeline-content p {
          color: #64748b;
          line-height: 1.6;
          margin-bottom: 1rem;
        }

        .timeline-tags {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .tag {
          padding: 0.375rem 0.875rem;
          background: rgba(0, 85, 244, 0.1);
          color: #0055f4;
          border-radius: 20px;
          font-size: 0.875rem;
          font-weight: 600;
        }

        /* CTA Section */
        .cta-section {
          padding: 6rem 0;
          background: linear-gradient(135deg, #0055f4 0%, #0055f4 50%, #0080ff 100%);
          position: relative;
          z-index: 5;
        }

        .cta-content {
          text-align: center;
          color: white;
        }

        .cta-content h2 {
          font-size: 2.5rem;
          font-weight: 800;
          margin-bottom: 1rem;
        }

        .cta-content p {
          font-size: 1.25rem;
          opacity: 0.9;
          margin-bottom: 2rem;
        }

        .cta-buttons {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .cta-button {
          padding: 1rem 2rem;
          border: none;
          border-radius: 12px;
          font-size: 1.125rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }

        .cta-button.primary {
          background: white;
          color: #0055f4;
        }

        .cta-button.secondary {
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border: 2px solid white;
        }

        .cta-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
        }

        /* Toss Style - Workflow */
        .workflow-section {
          padding: 8rem 0;
          background: #F9FAFB;
        }

        .workflow-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 3rem;
          max-width: 1000px;
          margin: 0 auto;
        }

        .workflow-step {
          text-align: center;
        }

        .step-number {
          font-size: 3.5rem;
          font-weight: 800;
          color: #0055f4;
          margin-bottom: 1.5rem;
          line-height: 1;
        }

        .workflow-step h3 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #191F28;
          margin-bottom: 1rem;
        }

        .workflow-step p {
          font-size: 1.0625rem;
          color: #4E5968;
          line-height: 1.6;
        }

        /* Toss Style - CTA */
        .cta-content-large {
          text-align: center;
          color: white;
          max-width: 600px;
          margin: 0 auto;
        }

        .cta-title-large {
          font-size: 3.5rem;
          font-weight: 800;
          margin-bottom: 1rem;
          line-height: 1.2;
        }

        .cta-subtitle {
          font-size: 1.25rem;
          opacity: 0.9;
          margin-bottom: 3rem;
        }

        .cta-buttons-large {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .cta-button-primary,
        .cta-button-secondary {
          padding: 1.25rem 2.5rem;
          border: none;
          border-radius: 12px;
          font-size: 1.125rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cta-button-primary {
          background: white;
          color: #0055f4;
        }

        .cta-button-secondary {
          background: rgba(255, 255, 255, 0.15);
          color: white;
          border: 2px solid rgba(255, 255, 255, 0.5);
        }

        .cta-button-primary:hover,
        .cta-button-secondary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
        }

        .cta-button-secondary:hover {
          background: rgba(255, 255, 255, 0.25);
          border-color: white;
        }

        /* Scroll Indicator */
        .scroll-indicator {
          position: absolute;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10;
        }

        .scroll-arrow {
          width: 40px;
          height: 40px;
          color: #64748b;
          animation: bounce 2s infinite;
          cursor: pointer;
          transition: color 0.3s;
        }

        .scroll-arrow:hover {
          color: #0080ff;
        }

        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(-10px);
          }
          60% {
            transform: translateY(-5px);
          }
        }

        /* Fade-in Animation */
        .animate-on-scroll {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.8s ease-out, transform 0.8s ease-out;
        }

        .animate-on-scroll.fade-in-visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* Footer */
        .footer {
          background: #1e293b;
          color: #e2e8f0;
          padding: 3rem 0 2rem;
          position: relative;
          z-index: 10;
        }

        .footer-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
          text-align: center;
        }

        .footer-logo {
          font-size: 2rem;
          font-weight: 900;
          background: linear-gradient(135deg, #0055f4 0%, #0055f4 50%, #0080ff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.05em;
        }

        .footer-info {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .footer-contact {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 1rem;
          margin: 0;
        }

        .contact-label {
          color: #94a3b8;
          font-weight: 600;
        }

        .footer-contact a {
          color: #0080ff;
          text-decoration: none;
          font-weight: 600;
          transition: color 0.3s;
        }

        .footer-contact a:hover {
          color: #00a2ff;
          text-decoration: underline;
        }

        .footer-copyright {
          color: #94a3b8;
          font-size: 0.875rem;
          margin: 0;
        }
        .eecar-highlight {
        color: #0055f4;
        font-weight: 700;
        /* 아래 두 줄을 추가하여 빛나는 효과를 줍니다 */
        filter: drop-shadow(0 0 8px rgba(0, 85, 244, 0.7));
        }
        /* Responsive */
        @media (max-width: 768px) {
          .logo {
            font-size: 3rem;
          }

          .hero-title {
            font-size: 1.5rem;
          }

          .hero-subtitle {
            font-size: 1rem;
          }

          .hero-stats {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .section-title {
            font-size: 2rem;
          }

          .entry-grid {
            grid-template-columns: 1fr;
          }

          .features-grid {
            grid-template-columns: 1fr;
          }

          /* Toss Style Responsive */
          .section-title-large {
            font-size: 2.5rem;
          }

          .section-subtitle {
            font-size: 1rem;
          }

          .features-grid-simple {
            grid-template-columns: 1fr;
          }

          .workflow-grid {
            grid-template-columns: 1fr;
            gap: 3rem;
          }

          .step-number {
            font-size: 3rem;
          }

          .cta-title-large {
            font-size: 2.5rem;
          }

          .cta-buttons-large {
            flex-direction: column;
            align-items: stretch;
          }

          .cta-button-primary,
          .cta-button-secondary {
            width: 100%;
          }

          .timeline-tabs {
            flex-direction: column;
            align-items: stretch;
          }

          .timeline-tab {
            width: 100%;
          }

          .timeline-container::before {
            left: 20px;
          }

          .timeline-item {
            padding-left: 60px;
          }

          .timeline-marker {
            width: 40px;
            height: 40px;
            font-size: 1.125rem;
          }

          .timeline-content {
            padding: 1.5rem;
          }

          .timeline-content h3 {
            font-size: 1.25rem;
          }

          .cta-content h2 {
            font-size: 2rem;
          }

          .cta-buttons {
            flex-direction: column;
            align-items: stretch;
          }

          .footer-contact {
            flex-direction: column;
            gap: 0.5rem;
          }

          .footer-logo {
            font-size: 1.5rem;
          }

          .scroll-indicator {
            display: none;
          }

          .container {
            padding: 0 1rem;
          }
        }

        @media (max-width: 480px) {
          .logo {
            font-size: 2.5rem;
          }

          .hero-title {
            font-size: 1.25rem;
          }

          .cta-content h2 {
            font-size: 1.5rem;
          }

          .footer-logo {
            font-size: 1.25rem;
          }

          .footer-contact {
            font-size: 0.875rem;
          }
        }
      `}</style>
    </div>
  );
}

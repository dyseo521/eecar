import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();
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
      {/* Auth Header */}
      <div className="auth-header">
        {isAuthenticated ? (
          <div className="auth-user-info">
            <span className="user-greeting">안녕하세요, {user?.name}님</span>
            <button onClick={logout} className="auth-button logout-button">
              로그아웃
            </button>
          </div>
        ) : (
          <div className="auth-buttons">
            <button onClick={() => navigate('/login')} className="auth-button login-button">
              로그인
            </button>
            <button onClick={() => navigate('/signup')} className="auth-button signup-button">
              회원가입
            </button>
          </div>
        )}
      </div>

      {/* Hero Section with Animated Gradient Background */}
      <section className="hero">
        {/* Animated Background Blobs */}
        <div className="animated-background">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
          <div className="blob blob-3"></div>
          <div className="blob blob-4"></div>
          <div className="blob blob-5"></div>
        </div>

        <div className="hero-content" style={{ transform: `translateY(${scrollY * 0.2}px)` }}>
          <div className="logo">EECAR</div>
          <h1 className="hero-title">전기차 중고 부품 B2B 거래 플랫폼</h1>
          <p className="hero-subtitle">
            AI 기반 RAG 검색으로 최적의 EV 부품을 찾아보세요
          </p>
          <button
            className="hero-explore-button"
            onClick={() => {
              const entrySection = document.querySelector('.entry-section');
              entrySection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            자세히 보기
          </button>
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
          <div className="section-layout-left">
            <div className="section-text-content">
              <h2 className="section-title-large-left">EV 부품 거래,<br/>이제 EECAR에서</h2>
              <p className="section-subtitle-left">AI가 찾아주는 최적의 부품, 안전한 B2B 거래</p>
            </div>

            <div className="entry-cards-wrapper">
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
        </div>
      </section>

      {/* Features Section - Toss Style */}
      <section className="features-section animate-on-scroll">
        <div className="container">
          <div className="section-layout-right">
            <div className="features-cards-wrapper">
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

            <div className="section-text-content">
              <h2 className="section-title-large-left">필요한 부품,<br/>AI가 찾아드립니다</h2>
              <p className="section-subtitle-left">검증된 데이터로 안전하게, RAG 기술로 정확하게</p>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow - Toss Style */}
      <section className="workflow-section animate-on-scroll">
        <div className="container">
          <div className="section-layout-left">
            <div className="section-text-content">
              <h2 className="section-title-large-left">간편하게,<br/>안전하게</h2>
              <p className="section-subtitle-left">3단계로 끝나는 부품 거래</p>
            </div>

            <div className="workflow-steps-wrapper">
              <div className="workflow-step animate-on-scroll">
                <div className="step-keyword">AI 검색</div>
                <h3>AI가 부품을 찾아드립니다</h3>
                <p>자연어로 물어보면 최적의 부품을 추천받습니다</p>
              </div>

              <div className="workflow-step animate-on-scroll">
                <div className="step-keyword">데이터 확인</div>
                <h3>물성 데이터를 확인하세요</h3>
                <p>검증된 데이터로 안전하게 비교하고 선택합니다</p>
              </div>

              <div className="workflow-step animate-on-scroll">
                <div className="step-keyword">거래 완료</div>
                <h3>계약하고 거래 완료</h3>
                <p>안전한 B2B 프로세스로 거래를 진행합니다</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission Banner Section */}
      <section className="mission-banner animate-on-scroll">
        <div className="mission-overlay">
          <h2 className="mission-text">버려지는 부품은 없습니다.<br/>새로운 가치로 이어집니다.</h2>
        </div>
      </section>

      {/* Bridge Section */}
      <section className="bridge-section animate-on-scroll">
        <div className="container">
          <div className="bridge-content">
            <h2 className="bridge-text">함께 만들어가는 지속 가능한 미래</h2>
          </div>
        </div>
      </section>

      {/* CTA Section - Compact */}
      <section className="cta-section animate-on-scroll">
        <div className="container">
          <div className="cta-content-compact">
            <h2 className="cta-title-compact">지금 바로 시작하세요</h2>
            <div className="cta-buttons-compact">
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

        /* Auth Header */
        .auth-header {
          position: fixed;
          top: 0;
          right: 0;
          z-index: 1000;
          padding: 1rem 2rem;
        }

        .auth-buttons, .auth-user-info {
          display: flex;
          gap: 0.75rem;
          align-items: center;
        }

        .user-greeting {
          color: #1f2937;
          font-weight: 600;
          font-size: 0.9375rem;
          background: white;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .auth-button {
          padding: 0.625rem 1.25rem;
          border: none;
          border-radius: 8px;
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .login-button {
          background: white;
          color: #0055f4;
          border: 2px solid #0055f4;
        }

        .login-button:hover {
          background: #0055f4;
          color: white;
        }

        .signup-button {
          background: linear-gradient(135deg, #0055f4, #0080ff);
          color: white;
        }

        .signup-button:hover {
          background: linear-gradient(135deg, #0040c0, #0060dd);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 85, 244, 0.3);
        }

        .logout-button {
          background: #ef4444;
          color: white;
        }

        .logout-button:hover {
          background: #dc2626;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 2rem;
        }

        /* Hero Section with Animated Gradient Mesh */
        .hero {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f8fafc 100%);
          position: relative;
          overflow: hidden;
          z-index: 1;
        }

        /* Animated Background Container */
        .animated-background {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          z-index: 1;
        }

        /* Gradient Blobs */
        .blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(5px);
          opacity: 0.8;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          animation-direction: alternate;
        }

        .blob-1 {
          width: 600px;
          height: 600px;
          background: linear-gradient(135deg, #0055f4 0%, #0080ff 100%);
          top: -10%;
          left: -10%;
          animation: float-1 25s infinite;
        }

        .blob-2 {
          width: 500px;
          height: 500px;
          background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);
          top: 20%;
          right: -5%;
          animation: float-2 28s infinite;
        }

        .blob-3 {
          width: 550px;
          height: 550px;
          background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%);
          bottom: -10%;
          left: 20%;
          animation: float-3 30s infinite;
        }

        .blob-4 {
          width: 450px;
          height: 450px;
          background: linear-gradient(135deg, #8b5cf6 0%, #0080ff 100%);
          top: 40%;
          left: 40%;
          animation: float-4 26s infinite;
        }

        .blob-5 {
          width: 520px;
          height: 520px;
          background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%);
          bottom: 15%;
          right: 10%;
          animation: float-5 32s infinite;
        }

        /* Blob Animation Keyframes */
        @keyframes float-1 {
          0%, 100% {
            transform: translate(0, 0) rotate(0deg) scale(1);
          }
          33% {
            transform: translate(50px, 80px) rotate(120deg) scale(1.1);
          }
          66% {
            transform: translate(-30px, 40px) rotate(240deg) scale(0.95);
          }
        }

        @keyframes float-2 {
          0%, 100% {
            transform: translate(0, 0) rotate(0deg) scale(1);
          }
          33% {
            transform: translate(-60px, 70px) rotate(-120deg) scale(1.08);
          }
          66% {
            transform: translate(40px, -50px) rotate(-240deg) scale(1.05);
          }
        }

        @keyframes float-3 {
          0%, 100% {
            transform: translate(0, 0) rotate(0deg) scale(1);
          }
          33% {
            transform: translate(70px, -60px) rotate(150deg) scale(1.12);
          }
          66% {
            transform: translate(-50px, -30px) rotate(300deg) scale(0.98);
          }
        }

        @keyframes float-4 {
          0%, 100% {
            transform: translate(0, 0) rotate(0deg) scale(1);
          }
          33% {
            transform: translate(-40px, -70px) rotate(-150deg) scale(1.06);
          }
          66% {
            transform: translate(60px, 50px) rotate(-300deg) scale(1.02);
          }
        }

        @keyframes float-5 {
          0%, 100% {
            transform: translate(0, 0) rotate(0deg) scale(1);
          }
          33% {
            transform: translate(-70px, 40px) rotate(180deg) scale(1.1);
          }
          66% {
            transform: translate(50px, -60px) rotate(360deg) scale(0.96);
          }
        }

        .hero-content {
          text-align: center;
          position: relative;
          z-index: 10;
          padding: 4rem 3rem;
          border-radius: 32px;
          background: rgba(255, 255, 255, 0.25);
          backdrop-filter: blur(20px) saturate(150%);
          -webkit-backdrop-filter: blur(10px) saturate(150%);
          border: 1px solid rgba(255, 255, 255, 0.3);
          box-shadow:
            0 8px 32px 0 rgba(0, 85, 244, 0.1),
            0 2px 8px 0 rgba(0, 0, 0, 0.03),
            inset 0 1px 1px 0 rgba(255, 255, 255, 0.5);
          max-width: 900px;
          margin: 0 2rem;
          transition: all 0.3s ease;
        }

        .hero-content:hover {
          transform: translateY(-5px);
          box-shadow:
            0 12px 40px 0 rgba(0, 85, 244, 0.15),
            0 4px 12px 0 rgba(0, 0, 0, 0.05);
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
          font-size: 2.75rem;
          color: white;
          margin-bottom: 1.5rem;
          font-weight: 800;
          line-height: 1.3;
          text-shadow: 0 2px 16px rgba(0, 0, 0, 0.15);
        }

        .hero-subtitle {
          font-size: 1.5rem;
          color: rgba(255, 255, 255, 0.95);
          margin-bottom: 3rem;
          line-height: 1.6;
          max-width: 700px;
          margin-left: auto;
          margin-right: auto;
          text-shadow: 0 1px 8px rgba(0, 0, 0, 0.1);
        }

        .hero-explore-button {
          padding: 1.125rem 3rem;
          border-radius: 50px;
          font-size: 1.125rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          background: transparent;
          color: white;
          border: 2px solid white;
          text-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
        }

        .hero-explore-button:hover {
          background: rgba(0, 85, 244, 0.9);
          border-color: rgba(0, 85, 244, 0.9);
          transform: translateY(-3px);
          box-shadow: 0 8px 24px rgba(0, 85, 244, 0.4);
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

        /* Left/Right Layout System */
        .section-layout-left {
          display: flex;
          align-items: center;
          gap: 4rem;
        }

        .section-layout-right {
          display: flex;
          align-items: center;
          gap: 4rem;
        }

        .section-text-content {
          flex: 1;
          min-width: 0;
        }

        .section-title-large-left {
          text-align: left;
          font-size: 3.5rem;
          font-weight: 800;
          color: #191F28;
          margin-bottom: 1.5rem;
          line-height: 1.2;
          letter-spacing: -0.03em;
        }

        .section-subtitle-left {
          text-align: left;
          font-size: 1.25rem;
          color: #4E5968;
          margin-bottom: 0;
          font-weight: 500;
          line-height: 1.6;
        }

        .entry-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2rem;
        }

        .entry-card {
          background: white;
          border-radius: 24px;
          padding: 2.5rem 1.5rem 1.5rem;
          border: 2px solid #e2e8f0;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
          position: relative;
          min-height: 280px;
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
          font-size: 2rem;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 0.75rem;
          padding-right: 75px; /* 아이콘 너비(60px) + 여백(15px) */
        }

        .entry-card p {
          color: #64748b;
          margin-bottom: 1.5rem;
          line-height: 1.6;
          padding-right: 75px; /* 아이콘 너비(60px) + 여백(15px) */
          margin-bottom: 1rem; /* 버튼이 위치할 하단 공간 확보 */
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
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: #0055f4;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 2rem;
          color: white;
          position: absolute;   /* absolute 포지션으로 변경 */
          top: 1.5rem;        /* 상단에서 1.5rem (패딩값) */
          right: 1.5rem;       /* 우측에서 1.5rem (패딩값) */
          margin: 0;          /* 기존 margin 제거 */
        }

        .entry-icon-large svg {
          width: 32px;
          height: 32px;
        }

        .entry-button-large {
          width: auto;
          padding: 1rem 1.5rem;
          background: linear-gradient(135deg, #0055f4 0%, #0080ff 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 1.125rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          margin-top: 2rem;
          position: absolute;
          bottom: 1.5rem;
          left: 1.5rem;
          right: 1.5rem;
          margin-top: 0;
          box-shadow: 0 2px 8px rgba(0, 85, 244, 0.2);
          display: flex;
          align-items: center;
          justify-content: space-between;
          overflow: hidden;
        }

        .entry-button-large::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: left 0.5s;
        }

        .entry-button-large:hover::before {
          left: 100%;
        }

        .entry-button-large:hover {
          background: linear-gradient(135deg, #0040c0 0%, #0060dd 100%);
          transform: translateY(-3px);
          box-shadow: 0 8px 20px rgba(0, 85, 244, 0.4);
        }

        .entry-button-large:active {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 85, 244, 0.3);
        }

        /* Wrapper Styles */
        .entry-cards-wrapper {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 500px;
        }

        .features-cards-wrapper {
          flex: 1;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
        }

        .workflow-steps-wrapper {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2rem;
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
          padding: 2rem;
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
          font-size: 1.25rem;
          font-weight: 700;
          color: #191F28;
          margin-bottom: 0.75rem;
        }

        .feature-card-large p {
          color: #4E5968;
          line-height: 1.6;
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

        /* Mission Banner Section */
        .mission-banner {
          width: 100%;
          height: 400px;
          background-image: url('/image/background_consult.webp');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          padding: 0;
        }

        .mission-overlay {
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }

        .mission-text {
          font-size: 3rem;
          font-weight: 800;
          color: white;
          text-align: center;
          line-height: 1.3;
          letter-spacing: -0.02em;
          text-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
          max-width: 1000px;
          margin: 0;
        }

        /* Bridge Section */
        .bridge-section {
          padding: 10rem 0 8rem 0;
          background: white;
        }

        .bridge-content {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .bridge-text {
          font-size: 3rem;
          font-weight: 800;
          color: #191F28;
          text-align: center;
          line-height: 1.35;
          letter-spacing: -0.02em;
          margin: 0;
        }

        /* CTA Section */
        .cta-section {
          padding: 5rem 0 8rem 0;
          background: white;
          position: relative;
          z-index: 5;
        }

        .cta-content-compact {
          text-align: center;
        }

        .cta-title-compact {
          font-size: 5rem;
          font-weight: 800;
          margin: 0 0 2.5rem 0;
          color: #191F28;
          letter-spacing: -0.02em;
        }

        .cta-buttons-compact {
          display: flex;
          gap: 1.5rem;
          justify-content: center;
          align-items: center;
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
          text-align: left;
        }

        .step-keyword {
          display: inline-block;
          padding: 0.625rem 1.5rem;
          font-size: 1.125rem;
          font-weight: 700;
          color: white;
          background: linear-gradient(135deg, #0055f4, #0080ff);
          border-radius: 24px;
          margin-bottom: 1.5rem;
          box-shadow: 0 4px 12px rgba(0, 85, 244, 0.25);
        }

        .workflow-step h3 {
          font-size: 1.625rem;
          font-weight: 700;
          color: #191F28;
          margin-bottom: 0.875rem;
        }

        .workflow-step p {
          font-size: 1.125rem;
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
          padding: 1.5rem 3.5rem;
          border-radius: 14px;
          font-size: 1.25rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          border: none;
          min-width: 200px;
        }

        .cta-button-primary {
          background: linear-gradient(135deg, #0055f4 0%, #0080ff 100%);
          color: white;
          box-shadow: 0 4px 20px rgba(0, 85, 244, 0.25);
        }

        .cta-button-secondary {
          background: white;
          color: #0055f4;
          border: 2px solid #0055f4;
        }

        .cta-button-primary:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 30px rgba(0, 85, 244, 0.4);
        }

        .cta-button-secondary:hover {
          background: #f0f7ff;
          transform: translateY(-3px);
          box-shadow: 0 8px 30px rgba(0, 85, 244, 0.2);
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
          /* Blob sizes for mobile */
          .blob-1 {
            width: 400px;
            height: 400px;
          }

          .blob-2 {
            width: 350px;
            height: 350px;
          }

          .blob-3 {
            width: 380px;
            height: 380px;
          }

          .blob-4 {
            width: 320px;
            height: 320px;
          }

          .blob-5 {
            width: 360px;
            height: 360px;
          }

          .hero-content {
            padding: 2.5rem 1.5rem;
            margin: 0 1rem;
            border-radius: 24px;
          }

          .logo {
            font-size: 3rem;
          }

          .hero-title {
            font-size: 1.875rem;
          }

          .hero-subtitle {
            font-size: 1.125rem;
            margin-bottom: 2rem;
          }

          .hero-explore-button {
            padding: 1rem 2.5rem;
            font-size: 1rem;
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

          /* Left/Right Layout - Stack vertically on mobile */
          .section-layout-left,
          .section-layout-right {
            flex-direction: column;
            gap: 3rem;
          }

          .section-title-large-left {
            font-size: 2.5rem;
            text-align: center;
          }

          .section-subtitle-left {
            font-size: 1rem;
            text-align: center;
            margin-bottom: 2rem;
          }

          .entry-cards-wrapper {
            width: 100%;
          }

          .features-cards-wrapper {
            grid-template-columns: 1fr;
            width: 100%;
          }

          .workflow-steps-wrapper {
            width: 100%;
          }

          .workflow-step {
            text-align: center;
          }

          .features-grid-simple {
            grid-template-columns: 1fr;
          }

          .workflow-grid {
            grid-template-columns: 1fr;
            gap: 3rem;
          }

          .step-keyword {
            font-size: 1rem;
            padding: 0.5rem 1.25rem;
          }

          .mission-banner {
            height: 280px;
          }

          .mission-text {
            font-size: 1.75rem;
            line-height: 1.4;
          }

          .bridge-section {
            padding: 4rem 0;
          }

          .bridge-text {
            font-size: 2rem;
            line-height: 1.4;
          }

          .cta-section {
            padding: 3rem 0 5rem 0;
          }

          .cta-title-compact {
            font-size: 1.75rem;
            margin-bottom: 2rem;
          }

          .cta-buttons-compact {
            flex-direction: column;
            width: 100%;
            gap: 1rem;
          }

          .cta-button-primary,
          .cta-button-secondary {
            width: 100%;
            padding: 1.25rem 2rem;
            font-size: 1.125rem;
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

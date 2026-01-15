import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Signup() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    companyName: '',
  });
  const [isSeller, setIsSeller] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다');
      return;
    }

    if (formData.password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다');
      return;
    }

    setIsLoading(true);

    try {
      // 판매자 체크박스가 선택되면 seller, 아니면 buyer
      const role = isSeller ? 'seller' : 'buyer';

      await signup(
        formData.email,
        formData.password,
        formData.name,
        role,
        formData.companyName || undefined
      );
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="signup-page">
      <button
        className="back-to-home"
        onClick={() => navigate('/')}
        aria-label="홈으로 돌아가기"
      >
        ← 홈으로
      </button>
      <div className="signup-container">
        <div className="signup-card">
          <div className="logo">EECAR</div>
          <h1>회원가입</h1>
          <p className="subtitle">EECAR에 오신 것을 환영합니다</p>

          {error && (
            <div className="error-message" role="alert" aria-live="assertive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name">이름 *</label>
              <input
                id="name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="홍길동"
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">이메일 *</label>
              <input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="example@email.com"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">비밀번호 *</label>
              <input
                id="password"
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="최소 6자 이상"
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">비밀번호 확인 *</label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="비밀번호를 다시 입력하세요"
              />
            </div>

            <div className="form-group">
              <div className="checkbox-group">
                <label className="checkbox-label" htmlFor="isSeller">
                  <input
                    id="isSeller"
                    type="checkbox"
                    checked={isSeller}
                    onChange={(e) => setIsSeller(e.target.checked)}
                    aria-describedby="seller-hint"
                  />
                  <span> 💼 판매자로도 활동하기</span>
                </label>
                <p id="seller-hint" className="checkbox-hint">
                  부품을 판매하려면 체크해주세요
                </p>
              </div>
            </div>

            {isSeller && (
              <div className="form-group seller-info">
                <label htmlFor="companyName">회사명</label>
                <input
                  id="companyName"
                  type="text"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  placeholder="회사명을 입력하세요 (선택사항)"
                />
              </div>
            )}

            <button type="submit" className="submit-button" disabled={isLoading}>
              {isLoading ? '가입 중...' : '회원가입'}
            </button>
          </form>

          <div className="link-section">
            <p>
              이미 계정이 있으신가요? <Link to="/login">로그인</Link>
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .signup-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #0055f4 0%, #0080ff 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          position: relative;
        }

        .back-to-home {
          position: absolute;
          top: 2rem;
          left: 2rem;
          padding: 0.75rem 1.5rem;
          background: rgba(255, 255, 255, 0.95);
          color: #0055f4;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 8px;
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          backdrop-filter: blur(10px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .back-to-home:hover {
          background: white;
          border-color: white;
          transform: translateX(-4px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
        }

        .signup-container {
          max-width: 500px;
          width: 100%;
        }

        .signup-card {
          background: white;
          border-radius: 20px;
          padding: 3rem;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          max-height: 90vh;
          overflow-y: auto;
        }

        .logo {
          font-size: 3rem;
          font-weight: 900;
          background: linear-gradient(135deg, #0055f4 0%, #0080ff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-align: center;
          margin-bottom: 1rem;
          letter-spacing: -0.05em;
        }

        .signup-card h1 {
          margin: 0 0 0.5rem 0;
          text-align: center;
          color: #1f2937;
          font-size: 2.75rem;
        }

        .subtitle {
          text-align: center;
          color: #6b7280;
          margin: 0 0 2rem 0;
          font-size: 0.9375rem;
        }

        .error-message {
          background: rgba(239, 68, 68, 0.1);
          color: #dc2626;
          padding: 0.875rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
          font-size: 0.875rem;
          border-left: 4px solid #dc2626;
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

        .form-group input {
          width: 100%;
          padding: 0.75rem;
          border: 2px solid #e5e7eb;
          border-radius: 10px;
          font-size: 0.9375rem;
          font-family: inherit;
          transition: all 0.2s;
        }

        .form-group input:focus {
          outline: none;
          border-color: #0055f4;
          box-shadow: 0 0 0 3px rgba(0, 85, 244, 0.1);
        }

        .checkbox-group {
          background: rgba(0, 85, 244, 0.03);
          border: 2px solid #e5e7eb;
          border-radius: 10px;
          padding: 1rem;
          transition: all 0.2s;
        }

        .checkbox-group:has(input:checked) {
          border-color: #0055f4;
          background: rgba(0, 85, 244, 0.08);
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 1.75rem;
          cursor: pointer;
          margin: 0;
        }

        .checkbox-label input[type="checkbox"] {
          width: 20px;
          height: 20px;
          cursor: pointer;
          accent-color: #0055f4;
          flex-shrink: 0;
          margin: 0;
        }

        .checkbox-label span {
          font-size: 1rem;
          font-weight: 600;
          color: #1f2937;
          line-height: 20px;
        }

        .checkbox-hint {
          margin: 0.5rem 0 0 2.75rem;
          color: #6b7280;
          font-size: 0.8125rem;
          line-height: 1.4;
        }

        .seller-info {
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .submit-button {
          width: 100%;
          padding: 1rem;
          background: linear-gradient(135deg, #0055f4 0%, #0080ff 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 1.0625rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s;
          margin-top: 0.5rem;
        }

        .submit-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0, 85, 244, 0.4);
        }

        .submit-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Focus visible for keyboard navigation */
        .submit-button:focus-visible,
        .back-to-home:focus-visible {
          outline: 3px solid #0055f4;
          outline-offset: 2px;
        }

        .form-group input:focus-visible {
          outline: 3px solid #0055f4;
          outline-offset: 1px;
        }

        .checkbox-label input:focus-visible {
          outline: 3px solid #0055f4;
          outline-offset: 2px;
        }

        .link-section {
          margin-top: 1.5rem;
          text-align: center;
        }

        .link-section p {
          margin: 0;
          color: #6b7280;
          font-size: 0.9375rem;
        }

        .link-section a {
          color: #0055f4;
          text-decoration: none;
          font-weight: 600;
        }

        .link-section a:hover {
          text-decoration: underline;
        }

        @media (max-width: 480px) {
          .signup-card {
            padding: 2rem 1.5rem;
          }

          .logo {
            font-size: 2.5rem;
          }

          .signup-card h1 {
            font-size: 1.5rem;
          }

          .back-to-home {
            top: 1rem;
            left: 1rem;
            padding: 0.625rem 1rem;
            font-size: 0.875rem;
          }
        }
      `}</style>
    </div>
  );
}

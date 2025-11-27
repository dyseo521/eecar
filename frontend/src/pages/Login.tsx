import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(formData.email, formData.password);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <button className="back-to-home" onClick={() => navigate('/')}>
        ← 홈으로
      </button>
      <div className="login-container">
        <div className="login-card">
          <div className="logo">EECAR</div>
          <h1>로그인</h1>
          <p className="subtitle">전기차 중고 부품 B2B 거래 플랫폼</p>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">이메일</label>
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
              <label htmlFor="password">비밀번호</label>
              <input
                id="password"
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
              />
            </div>

            <button type="submit" className="submit-button" disabled={isLoading}>
              {isLoading ? '로그인 중...' : '로그인'}
            </button>
          </form>

          <div className="link-section">
            <p>
              계정이 없으신가요? <Link to="/signup">회원가입</Link>
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .login-page {
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

        .login-container {
          max-width: 450px;
          width: 100%;
        }

        .login-card {
          background: white;
          border-radius: 20px;
          padding: 3rem;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
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

        .login-card h1 {
          margin: 0 0 0.5rem 0;
          text-align: center;
          color: #1f2937;
          font-size: 1.75rem;
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
          margin-bottom: 1.5rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          color: #374151;
          font-weight: 600;
          font-size: 0.9375rem;
        }

        .form-group input {
          width: 100%;
          padding: 0.875rem;
          border: 2px solid #e5e7eb;
          border-radius: 10px;
          font-size: 1rem;
          font-family: inherit;
          transition: all 0.2s;
        }

        .form-group input:focus {
          outline: none;
          border-color: #0055f4;
          box-shadow: 0 0 0 3px rgba(0, 85, 244, 0.1);
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
          .login-card {
            padding: 2rem 1.5rem;
          }

          .logo {
            font-size: 2.5rem;
          }

          .login-card h1 {
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

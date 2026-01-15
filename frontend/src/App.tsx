import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';

// Lazy load pages for code splitting
const LandingPage = lazy(() => import('./pages/LandingPage'));
const BuyerSearch = lazy(() => import('./pages/BuyerSearch'));
const SellerDashboard = lazy(() => import('./pages/SellerDashboard'));
const PartDetail = lazy(() => import('./pages/PartDetail'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));

// Minimal loading fallback - matches app's light theme
function PageLoadingFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #f0f4ff 0%, #ffffff 100%)',
    }}>
      {/* Minimal top loading bar */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '3px',
        background: 'linear-gradient(90deg, #0055f4, #0080ff)',
        animation: 'loading-bar 1.5s ease-in-out infinite',
      }} />
      <style>{`
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <div className="app">
        <Suspense fallback={<PageLoadingFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/buyer" element={<BuyerSearch />} />
            <Route path="/seller" element={<SellerDashboard />} />
            <Route path="/parts/:id" element={<PartDetail />} />
          </Routes>
        </Suspense>
      </div>
    </AuthProvider>
  );
}

export default App;

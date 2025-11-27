import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import BuyerSearch from './pages/BuyerSearch';
import SellerDashboard from './pages/SellerDashboard';
import PartDetail from './pages/PartDetail';
import Login from './pages/Login';
import Signup from './pages/Signup';

function App() {
  return (
    <AuthProvider>
      <div className="app">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/buyer" element={<BuyerSearch />} />
          <Route path="/seller" element={<SellerDashboard />} />
          <Route path="/parts/:id" element={<PartDetail />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}

export default App;

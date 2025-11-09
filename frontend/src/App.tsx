import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import BuyerSearch from './pages/BuyerSearch';
import SellerDashboard from './pages/SellerDashboard';
import PartDetail from './pages/PartDetail';

function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/buyer" element={<BuyerSearch />} />
        <Route path="/seller" element={<SellerDashboard />} />
        <Route path="/parts/:id" element={<PartDetail />} />
      </Routes>
    </div>
  );
}

export default App;

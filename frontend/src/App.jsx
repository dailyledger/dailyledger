import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import NavBar from './components/NavBar';
import Login from './pages/Login';
import Home from './pages/Home';
import SalesHistory from './pages/SalesHistory';
import AddSale from './pages/AddSale';
import PurchasesHistory from './pages/PurchasesHistory';
import AddPurchase from './pages/AddPurchase';
import CreditLedger from './pages/CreditLedger';
import AddCredit from './pages/AddCredit';
import SpoilageHistory from './pages/SpoilageHistory';
import AddSpoilage from './pages/AddSpoilage';
import Reports from './pages/Reports';

export default function App() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="app-shell">
      <NavBar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sales" element={<SalesHistory />} />
          <Route path="/sales/add" element={<AddSale />} />
          <Route path="/sales/:id/edit" element={<AddSale />} />
          <Route path="/purchases" element={<PurchasesHistory />} />
          <Route path="/purchases/add" element={<AddPurchase />} />
          <Route path="/purchases/:id/edit" element={<AddPurchase />} />
          <Route path="/credits" element={<CreditLedger />} />
          <Route path="/credits/add" element={<AddCredit />} />
          <Route path="/credits/:id/edit" element={<AddCredit />} />
          <Route path="/spoilage" element={<SpoilageHistory />} />
          <Route path="/spoilage/add" element={<AddSpoilage />} />
          <Route path="/spoilage/:id/edit" element={<AddSpoilage />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

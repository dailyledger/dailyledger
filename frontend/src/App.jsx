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
import Inventory from './pages/Inventory';
import CookingHistory from './pages/CookingHistory';
import AddCooking from './pages/AddCooking';
import AdminApp from './pages/admin/AdminApp';
import AdminLogin from './pages/admin/AdminLogin';
import { IS_ADMIN_SITE } from './appMode';

export default function App() {
  const { isAuthenticated } = useAuth();

  if (IS_ADMIN_SITE) {
    return isAuthenticated ? <AdminApp /> : <AdminLogin />;
  }

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
          <Route path="/cooking" element={<CookingHistory />} />
          <Route path="/cooking/add" element={<AddCooking />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

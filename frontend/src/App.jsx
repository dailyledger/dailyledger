import { Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
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
  return (
    <div className="app-shell">
      <NavBar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sales" element={<SalesHistory />} />
          <Route path="/sales/add" element={<AddSale />} />
          <Route path="/purchases" element={<PurchasesHistory />} />
          <Route path="/purchases/add" element={<AddPurchase />} />
          <Route path="/credits" element={<CreditLedger />} />
          <Route path="/credits/add" element={<AddCredit />} />
          <Route path="/spoilage" element={<SpoilageHistory />} />
          <Route path="/spoilage/add" element={<AddSpoilage />} />
          <Route path="/reports" element={<Reports />} />
        </Routes>
      </main>
    </div>
  );
}

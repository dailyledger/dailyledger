import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Trophy,
  TrendingUp,
  ShoppingCart,
  Boxes,
  HandCoins,
  BarChart3,
  Store,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../AuthContext';
import Logo from '../../components/Logo';
import AdminDashboard from './AdminDashboard';
import AdminLeaderboard from './AdminLeaderboard';
import AdminSales from './AdminSales';
import AdminPurchases from './AdminPurchases';
import AdminInventory from './AdminInventory';
import AdminCreditWastage from './AdminCreditWastage';
import AdminStalls from './AdminStalls';
import AdminReports from './AdminReports';
import AdminSettings from './AdminSettings';
import './admin.css';

const NAV_GROUPS = [
  {
    label: 'OVERVIEW',
    items: [
      { to: '/', label: 'Dashboard', Icon: LayoutDashboard, end: true },
      { to: '/leaderboard', label: 'Leaderboard', Icon: Trophy },
    ],
  },
  {
    label: 'ANALYSE',
    items: [
      { to: '/sales', label: 'Sales', Icon: TrendingUp },
      { to: '/purchases', label: 'Purchases', Icon: ShoppingCart },
      { to: '/inventory', label: 'Inventory', Icon: Boxes },
      { to: '/credit', label: 'Credit & Wastage', Icon: HandCoins },
      { to: '/reports', label: 'Reports', Icon: BarChart3 },
    ],
  },
  {
    label: 'MANAGE',
    items: [
      { to: '/stalls', label: 'Stalls Management', Icon: Store },
      { to: '/settings', label: 'Settings', Icon: Settings },
    ],
  },
];

export default function AdminApp() {
  const { logout, username } = useAuth();
  const { pathname, search } = useLocation();

  // TV mode: the leaderboard on its own, full width, for a projector.
  if (pathname === '/leaderboard' && new URLSearchParams(search).get('tv') === '1') {
    return (
      <div className="a-tv">
        <AdminLeaderboard />
      </div>
    );
  }

  return (
    <div className="a-shell">
      <aside className="a-side">
        <div className="a-side-head">
          <Logo light size={40} subtitle="Admin console" />
        </div>

        <nav className="a-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="a-nav-group">
              <div className="a-side-label">{group.label}</div>
              {group.items.map(({ to, label, Icon, end }) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => `a-nav-link${isActive ? ' active' : ''}`}>
                  <Icon size={19} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="a-side-foot">
          <div className="a-user">
            <span className="a-avatar">{(username || 'a').charAt(0)}</span>
            <div>
              <div className="a-user-name">{username || 'admin'}</div>
              <div className="a-user-role">Administrator</div>
            </div>
          </div>
          <button type="button" className="a-logout" onClick={logout}>
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="a-main">
        <Routes>
          <Route path="/" element={<AdminDashboard />} />
          <Route path="/leaderboard" element={<AdminLeaderboard />} />
          <Route path="/sales" element={<AdminSales />} />
          <Route path="/purchases" element={<AdminPurchases />} />
          <Route path="/inventory" element={<AdminInventory />} />
          <Route path="/credit" element={<AdminCreditWastage />} />
          <Route path="/reports" element={<AdminReports />} />
          <Route path="/stalls" element={<AdminStalls />} />
          <Route path="/settings" element={<AdminSettings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { LayoutDashboard, Store, BarChart3, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../AuthContext';
import AdminDashboard from './AdminDashboard';
import AdminStalls from './AdminStalls';
import AdminReports from './AdminReports';
import './admin.css';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard, end: true },
  { to: '/stalls', label: 'Stalls Management', Icon: Store },
  { to: '/reports', label: 'Reports', Icon: BarChart3 },
];

export default function AdminApp() {
  const { logout, username } = useAuth();

  return (
    <div className="a-shell">
      <aside className="a-side">
        <div className="a-side-head">
          <span className="a-brand-mark">
            <ShieldCheck size={22} />
          </span>
          <div>
            <div className="a-brand-name">DailyLedger</div>
            <div className="a-brand-sub">Admin console</div>
          </div>
        </div>

        <div className="a-side-label">MODULES</div>
        <nav className="a-nav">
          {NAV_ITEMS.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `a-nav-link${isActive ? ' active' : ''}`}
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
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
            <LogOut size={19} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="a-main">
        <Routes>
          <Route path="/" element={<AdminDashboard />} />
          <Route path="/stalls" element={<AdminStalls />} />
          <Route path="/reports" element={<AdminReports />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

import { NavLink } from 'react-router-dom';
import { Home, Receipt, Package, HandCoins, Trash2, BarChart3, Boxes, LogOut } from 'lucide-react';
import { useAuth } from '../AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Home', Icon: Home, end: true },
  { to: '/sales', label: 'Sales', Icon: Receipt },
  { to: '/purchases', label: 'Purchase', Icon: Package },
  { to: '/credits', label: 'Credit', Icon: HandCoins },
  { to: '/spoilage', label: 'Spoilage', Icon: Trash2 },
  { to: '/reports', label: 'Reports', Icon: BarChart3 },
  { to: '/inventory', label: 'Inventory', Icon: Boxes },
];

export default function NavBar() {
  const { logout } = useAuth();

  return (
    <>
      {/*
        On phones the tab bar has to fit seven destinations across ~390px, which
        leaves about 50px each — not enough for "Purchase" or "Inventory". Logout
        moves up here so the tabs get that space back. Hidden from 768px up, where
        the nav becomes a roomy top bar and keeps its own logout.
      */}
      <header className="app-topbar">
        <span className="app-topbar-title">DailyLedger</span>
        <button
          type="button"
          className="app-topbar-logout"
          onClick={logout}
          aria-label="Log out"
          title="Log out"
        >
          <LogOut size={18} strokeWidth={2} />
        </button>
      </header>

      <nav className="nav">
        {NAV_ITEMS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <Icon className="nav-icon" size={22} strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button type="button" className="nav-link nav-logout" onClick={logout}>
          <LogOut className="nav-icon" size={22} strokeWidth={2} />
          <span>Logout</span>
        </button>
      </nav>
    </>
  );
}

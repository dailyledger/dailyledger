import { NavLink } from 'react-router-dom';
import { Home, Receipt, Package, HandCoins, Trash2, BarChart3 } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Home', Icon: Home, end: true },
  { to: '/sales', label: 'Sales', Icon: Receipt },
  { to: '/purchases', label: 'Purchase', Icon: Package },
  { to: '/credits', label: 'Credit', Icon: HandCoins },
  { to: '/spoilage', label: 'Spoilage', Icon: Trash2 },
  { to: '/reports', label: 'Reports', Icon: BarChart3 },
];

export default function NavBar() {
  return (
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
    </nav>
  );
}

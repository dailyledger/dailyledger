import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../AuthContext';
import './admin.css';

export default function AdminLogin() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="a-login">
      <form className="a-login-card" onSubmit={handleSubmit}>
        <div className="a-login-brand">
          <span className="a-brand-mark">
            <ShieldCheck size={22} />
          </span>
          <div>
            <div className="a-brand-name">DailyLedger</div>
            <div className="a-brand-sub">Admin console</div>
          </div>
        </div>

        {error && <div className="a-error">{error}</div>}

        <div className="a-field" style={{ marginBottom: 16 }}>
          <label className="a-label">Username</label>
          <input
            className="a-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div className="a-field" style={{ marginBottom: 24 }}>
          <label className="a-label">Password</label>
          <input
            className="a-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="a-btn a-btn-primary" style={{ width: '100%' }} disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

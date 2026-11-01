import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../AuthContext';

/** The sign-in form shared by the stall and admin login screens. */
export default function LoginForm({ title, subtitle, foot }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
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
    <form onSubmit={handleSubmit}>
      <h1 className="auth-title">{title}</h1>
      <p className="auth-sub">{subtitle}</p>

      {error && <div className="auth-error">{error}</div>}

      <div className="auth-field">
        <label className="auth-label" htmlFor="auth-username">
          Username
        </label>
        <input
          id="auth-username"
          className="auth-input"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setError('');
          }}
          autoComplete="username"
          autoFocus
          required
        />
      </div>

      <div className="auth-field">
        <label className="auth-label" htmlFor="auth-password">
          Password
        </label>
        <div className="auth-input-wrap">
          <input
            id="auth-password"
            className="auth-input has-toggle"
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="auth-eye"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <button type="submit" className="auth-btn" disabled={submitting}>
        {submitting ? 'Signing in...' : 'Sign in'}
      </button>

      {foot && <p className="auth-foot">{foot}</p>}
    </form>
  );
}

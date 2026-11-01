import AuthLayout from '../../components/AuthLayout';
import LoginForm from '../../components/LoginForm';
import './admin.css';

export default function AdminLogin() {
  return (
    <AuthLayout
      headline="Run the whole event from one screen."
      tagline="Watch every stall's sales, stock and profit live, compare them side by side, and see who is winning."
      points={['Live leaderboard', 'Compare stalls', 'Full audit trail']}
    >
      <LoginForm title="Welcome back" subtitle="Sign in to the DailyLedger admin console." />
    </AuthLayout>
  );
}

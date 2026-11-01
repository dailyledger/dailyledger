import AuthLayout from '../components/AuthLayout';
import LoginForm from '../components/LoginForm';

export default function Login() {
  return (
    <AuthLayout
      headline="Every plate. Every rupee. Counted."
      tagline="Record sales, purchases and stock for your stall, and always know exactly how much you are making."
      points={['Quick billing', 'Live stock', 'True profit']}
    >
      <LoginForm
        title="Welcome to DailyLedger"
        subtitle="Sign in to manage your stall."
        foot="Need a login? Ask your event organizer."
      />
    </AuthLayout>
  );
}

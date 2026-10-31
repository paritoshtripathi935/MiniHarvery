/**
 * App — auth gate. Signed-out visitors get the marketing page; signed-in
 * users get the lazy-loaded AuthedApp (routes documented there).
 */
import { lazy, Suspense } from 'react';
import { useAuth } from '@clerk/clerk-react';
import LandingPage from './pages/LandingPage';
import { useTheme } from './hooks/useTheme';

const AuthedApp = lazy(() => import('./AuthedApp'));

// Clerk keeps a `__client_uat` cookie (0 = signed out) on this domain. If no
// cookie says "signed in", show the landing page without waiting ~1-2s for
// Clerk to load; signed-in users still wait so they never see it flash.
function likelySignedOut() {
  const uats = [...document.cookie.matchAll(/(?:^|; )__client_uat(?:_[^=]*)?=([^;]*)/g)];
  return uats.every(m => !m[1] || m[1] === '0');
}

const Loading = () => (
  <div role="status" className="min-h-screen grid place-items-center text-sm" style={{ color: 'var(--text-muted)' }}>
    Loading Vidhi…
  </div>
);

export default function App() {
  useTheme();
  const { isLoaded, isSignedIn } = useAuth();
  if (isSignedIn) return <Suspense fallback={<Loading />}><AuthedApp /></Suspense>;
  if (isLoaded || likelySignedOut()) return <LandingPage />;
  return <Loading />;
}

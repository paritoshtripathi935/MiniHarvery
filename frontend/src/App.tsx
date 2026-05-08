/**
 * App — Router shell. Each route owns its layout below the AppLayout
 * chrome (NavRail + breadcrumbs).
 *
 *   /                  Today (landing dashboard)
 *   /matters           Matter list
 *   /matters/:id       Matter detail (the 3-pane research workbench)
 *   /inbox             Friendly alias — redirects to user's Inbox matter
 *
 * Authentication is gated at the root (Clerk's <SignedIn>/<SignedOut>);
 * once signed in, MattersProvider hydrates the matter list once and every
 * route reads from there (no per-route refetch).
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import LoginPage from './components/LoginPage';
import AppLayout from './layout/AppLayout';
import TodayPage from './pages/TodayPage';
import MattersPage from './pages/MattersPage';
import MatterDetailPage from './pages/MatterDetailPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import { MattersProvider } from './state/MattersContext';
import { useTheme } from './hooks/useTheme';

export default function App() {
  useTheme();
  return (
    <>
      <SignedOut>
        <LoginPage />
      </SignedOut>
      <SignedIn>
        <BrowserRouter>
          <MattersProvider>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<TodayPage />} />
                <Route path="matters" element={<MattersPage />} />
                <Route path="matters/:matterId" element={<MatterDetailPage />} />
                <Route
                  path="matters/:matterId/documents/:documentId"
                  element={<DocumentDetailPage />}
                />
                {/* /inbox resolves to the user's Inbox matter inside AppLayout */}
                <Route path="inbox" element={<TodayPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </MattersProvider>
        </BrowserRouter>
      </SignedIn>
    </>
  );
}

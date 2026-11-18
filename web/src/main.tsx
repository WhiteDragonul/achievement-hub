import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth';
import { Layout, Scene } from './components/Layout';
import { AuthCallbackPage, LoginPage } from './pages/LoginPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { GamesPage } from './pages/GamesPage';
import { GameDetailPage } from './pages/GameDetailPage';
import { ProfilePage } from './pages/ProfilePage';
import { FriendsPage } from './pages/FriendsPage';
import { AdminPage } from './pages/AdminPage';
import { SettingsPage } from './pages/SettingsPage';
import { applyTheme, getTheme } from './theme';
import { onDeepLink } from './native';
import './index.css';

// În aplicația Tauri: link-ul achievementhub://auth/callback#tokenuri ajunge la aceeași pagină ca pe site.
function DeepLinkBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    const stop = onDeepLink((fragment) => navigate(`/auth/callback#${fragment}`));
    return () => { stop.then((unlisten) => unlisten()); };
  }, [navigate]);
  return null;
}

// TanStack Query ține în cache răspunsurile API-ului; după o modificare (mutation) invalidăm cheile afectate
// și datele se reîncarcă automat.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Scene />
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <DeepLinkBridge />
          <Routes>
            <Route path="login" element={<LoginPage />} />
            <Route path="auth/callback" element={<AuthCallbackPage />} />
            <Route element={<Layout />}>
              <Route index element={<LeaderboardPage />} />
              <Route path="games" element={<GamesPage />} />
              <Route path="games/:id" element={<GameDetailPage />} />
              <Route path="users/:id" element={<ProfilePage />} />
              <Route path="friends" element={<FriendsPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);

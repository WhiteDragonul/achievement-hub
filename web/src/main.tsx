import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CurrentUserProvider } from './current-user';
import { Layout } from './components/Layout';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { GamesPage } from './pages/GamesPage';
import { GameDetailPage } from './pages/GameDetailPage';
import { ProfilePage } from './pages/ProfilePage';
import { FriendsPage } from './pages/FriendsPage';
import { AdminPage } from './pages/AdminPage';
import './index.css';

// TanStack Query ține în cache răspunsurile API-ului; după o modificare (mutation) invalidăm cheile afectate
// și datele se reîncarcă automat.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <CurrentUserProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<LeaderboardPage />} />
              <Route path="games" element={<GamesPage />} />
              <Route path="games/:id" element={<GameDetailPage />} />
              <Route path="users/:id" element={<ProfilePage />} />
              <Route path="friends" element={<FriendsPage />} />
              <Route path="admin" element={<AdminPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CurrentUserProvider>
    </QueryClientProvider>
  </StrictMode>,
);

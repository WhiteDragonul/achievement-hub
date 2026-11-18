// Sesiunea curentă: userul logat (din /auth/me) și acțiunile login / register / logout.
// La pornire, dacă există un refresh token salvat, îl folosim ca să obținem un token de acces nou.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, clearSession, refreshSession, saveSession, storedRefreshToken, type Role, type Session } from './api';

export type Me = { id: number; username: string; email: string | null; role: Role; display_name: string | null; avatar_url: string | null };

type AuthContextValue = {
  reloadMe: () => Promise<void>;
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  acceptTokens: (tokens: { access_token: string; refresh_token: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const loadMe = useCallback(async () => setUser(await api<Me>('/auth/me')), []);

  useEffect(() => {
    (async () => {
      if ((await storedRefreshToken()) && (await refreshSession())) await loadMe().catch(() => setUser(null));
      setLoading(false);
    })();
    // Refresh token-ul a expirat sau a fost revocat (ex. cont suspendat) → înapoi la login.
    const onExpired = () => setUser(null);
    window.addEventListener('session-expired', onExpired);
    return () => window.removeEventListener('session-expired', onExpired);
  }, [loadMe]);

  async function start(session: Session) {
    await saveSession(session);
    queryClient.clear(); // datele userului anterior nu trebuie să apară în sesiunea nouă
    await loadMe();
  }

  const value: AuthContextValue = {
    user,
    loading,
    reloadMe: loadMe, // după editarea profilului (numele / avatarul din bara laterală)
    login: async (email, password) => start(await api<Session>('/auth/login', { method: 'POST', body: { email, password } })),
    register: async (username, email, password) =>
      start(await api<Session>('/auth/register', { method: 'POST', body: { username, email, password } })),
    acceptTokens: async (tokens) => {
      await saveSession(tokens);
      queryClient.clear();
      await loadMe();
    },
    logout: async () => {
      const refresh_token = await storedRefreshToken();
      if (refresh_token) await api('/auth/logout', { method: 'POST', body: { refresh_token } }).catch(() => {});
      await clearSession();
      queryClient.clear();
      setUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth trebuie folosit în interiorul AuthProvider');
  return context;
}

// Paginile au nevoie doar de id-ul și rolul userului logat. Layout-ul nu randează paginile fără user.
export function useCurrentUser() {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser e folosit doar în paginile protejate');
  const rank = { user: 1, moderator: 2, admin: 3 }[user.role];
  return { userId: user.id, user, isModerator: rank >= 2, isAdmin: rank >= 3 };
}

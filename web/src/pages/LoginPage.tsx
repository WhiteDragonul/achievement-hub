// Login și înregistrare (email + parolă) sau login cu Steam (OpenID, redirect prin API).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { steamLoginUrl } from '../api';
import { useAuth } from '../auth';
import { Icon } from '../components/Layout';
import { Button, ErrorMessage, Input, Segmented } from '../components/ui';

const modes = [
  { id: 'login', label: 'Autentificare' },
  { id: 'register', label: 'Cont nou' },
] as const;

export function LoginPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(email, password);
      else await register(String(form.get('username')), email, password);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="glass-tint mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[22px]">
            <Icon name="trophy" className="h-8 w-8" />
          </span>
          <h1 className="text-3xl font-bold tracking-tight">Achievement Hub</h1>
          <p className="mt-2 text-sm text-white/55">Toate trofeele tale — Steam, PlayStation, Xbox, Epic — într-un singur profil.</p>
        </div>

        <div className="glass rounded-[32px] p-5">
          <Segmented options={modes} value={mode} onChange={(value) => { setMode(value); setError(null); }} />
          <ErrorMessage error={error} />
          <form onSubmit={submit} className="space-y-3">
            {mode === 'register' && (
              <Input name="username" placeholder="Username (3–32: litere, cifre, _)" autoComplete="username" required />
            )}
            <Input name="email" type="email" placeholder="Email" autoComplete="email" required />
            <Input
              name="password"
              type="password"
              placeholder={mode === 'register' ? 'Parolă (min. 8 caractere)' : 'Parolă'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 8 : undefined}
              required
            />
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Se verifică…' : mode === 'login' ? 'Intră în cont' : 'Creează contul'}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-white/40">
            <span className="h-px flex-1 bg-white/15" /> sau <span className="h-px flex-1 bg-white/15" />
          </div>
          <a href={steamLoginUrl} className="pressable glass flex min-h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold hover:bg-white/15">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M12 2a10 10 0 0 0-9.96 9.04l5.35 2.21a2.83 2.83 0 0 1 1.6-.49l2.39-3.46v-.05a3.78 3.78 0 1 1 3.78 3.78h-.09l-3.4 2.43a2.84 2.84 0 0 1-5.62.56L2.2 14.4A10 10 0 1 0 12 2Zm-3.73 15.17-1.22-.5a2.13 2.13 0 1 0 1.16-2.91l1.27.52a1.57 1.57 0 1 1-1.21 2.9Zm9.45-7.84a2.52 2.52 0 1 0-2.52 2.52 2.52 2.52 0 0 0 2.52-2.52Zm-4.4 0a1.89 1.89 0 1 1 1.89 1.89 1.89 1.89 0 0 1-1.9-1.89Z" />
            </svg>
            Continuă cu Steam
          </a>
        </div>
      </div>
    </div>
  );
}

// Steam redirecționează aici (prin API) cu tokenurile în fragmentul URL-ului: #access_token=…&refresh_token=…
export function AuthCallbackPage() {
  const { acceptTokens, user, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false); // fragmentul se citește o singură dată

  useEffect(() => {
    if (loading || handled.current) return; // așteptăm sesiunea existentă (contează la legarea Steam)
    handled.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    // Fragmentul se șterge imediat din bara de adrese și din istoric.
    window.history.replaceState(null, '', window.location.pathname);
    // Întoarcere după legarea contului Steam (userul era deja logat): înapoi la profil, unde rulează primul sync.
    if (params.get('linked')) {
      navigate(user ? `/users/${user.id}` : '/', { replace: true });
      return;
    }
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) {
      setError(params.get('error') ?? 'Login eșuat');
      return;
    }
    acceptTokens({ access_token, refresh_token }).then(() => navigate('/', { replace: true }), () => setError('Login eșuat'));
  }, [acceptTokens, navigate, loading, user]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="glass max-w-sm rounded-[28px] p-6 text-center">
        {error ? (
          <>
            <p className="mb-4 text-red-200">{error}</p>
            <Button onClick={() => navigate(user ? `/users/${user.id}` : '/login')}>{user ? 'Înapoi la profil' : 'Înapoi la login'}</Button>
          </>
        ) : (
          <p className="text-white/70">Te conectăm…</p>
        )}
      </div>
    </div>
  );
}

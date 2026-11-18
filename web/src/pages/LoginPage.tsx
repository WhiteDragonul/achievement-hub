// Login și înregistrare (email + parolă) sau login cu Steam (OpenID, redirect prin API).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { steamLoginUrl } from '../api';
import { isApp, openExternal } from '../native';
import { useAuth } from '../auth';
import { Logo } from '../components/Layout';
import { Button, ErrorMessage, Field, Input, Segmented, rarityStyles } from '../components/ui';

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
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Stânga (doar desktop): ce face aplicația + cum se punctează raritatea. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <Logo size={30} />
          <span className="font-semibold tracking-tight">Achievement Hub</span>
        </div>

        <div className="rise max-w-lg">
          <p className="eyebrow mb-5">Steam · PlayStation · Xbox · Epic</p>
          <h1 className="font-display font-extrabold tracking-[-0.03em] text-[68px] leading-[0.98]">
            Fiecare trofeu,<br /><em className="bg-gradient-to-r from-[#ffe2a6] to-[#ffa8cf] bg-clip-text not-italic text-transparent">într-un singur loc.</em>
          </h1>
          <p className="mt-6 max-w-md leading-relaxed text-muted">
            Leagă-ți conturile, iar biblioteca și achievement-urile se sincronizează într-un profil unificat,
            cu raritate, clasamente și prieteni.
          </p>
        </div>

        <ScoringScale />
      </aside>

      {/* Dreapta: formularul */}
      <main className="flex items-center justify-center px-5 py-12 lg:pr-12">
        <div className="panel rise w-full max-w-[420px] rounded-[32px] p-6 sm:p-8">
          <div className="mb-10 lg:hidden">
            <Logo size={40} />
            <h1 className="mt-6 font-display font-extrabold tracking-[-0.03em] text-[44px] leading-none">
              Fiecare trofeu, <em className="bg-gradient-to-r from-[#ffe2a6] to-[#ffa8cf] bg-clip-text not-italic text-transparent">într-un singur loc.</em>
            </h1>
          </div>

          <h2 className="text-xl font-semibold tracking-tight">{mode === 'login' ? 'Bine ai revenit' : 'Creează-ți contul'}</h2>
          <p className="mt-1 mb-7 text-sm text-muted">
            {mode === 'login' ? 'Intră cu emailul sau direct cu Steam.' : 'Durează câteva secunde. Platformele le legi după.'}
          </p>

          <a
            href={steamLoginUrl}
            // În aplicație login-ul Steam se face în browserul sistemului; revine prin deep-link (D51).
            onClick={(event) => { if (isApp) { event.preventDefault(); openExternal(steamLoginUrl); } }}
            className="pressable flex min-h-11 items-center justify-center gap-2.5 rounded-lg border border-line-strong bg-raised text-sm font-medium hover:border-white/20 hover:bg-hover"
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
              <path d="M12 2a10 10 0 0 0-9.96 9.04l5.35 2.21a2.83 2.83 0 0 1 1.6-.49l2.39-3.46v-.05a3.78 3.78 0 1 1 3.78 3.78h-.09l-3.4 2.43a2.84 2.84 0 0 1-5.62.56L2.2 14.4A10 10 0 1 0 12 2Zm-3.73 15.17-1.22-.5a2.13 2.13 0 1 0 1.16-2.91l1.27.52a1.57 1.57 0 1 1-1.21 2.9Zm9.45-7.84a2.52 2.52 0 1 0-2.52 2.52 2.52 2.52 0 0 0 2.52-2.52Zm-4.4 0a1.89 1.89 0 1 1 1.89 1.89 1.89 1.89 0 0 1-1.9-1.89Z" />
            </svg>
            Continuă cu Steam
          </a>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" /><span className="eyebrow">sau cu email</span><span className="h-px flex-1 bg-line" />
          </div>

          <Segmented options={modes} value={mode} onChange={(value) => { setMode(value); setError(null); }} className="mb-5" />
          <ErrorMessage error={error} />
          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <Field label="Username" hint="3–32: litere, cifre, _">
                <Input name="username" autoComplete="username" required />
              </Field>
            )}
            <Field label="Email">
              <Input name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="Parolă" hint={mode === 'register' ? 'min. 8 caractere' : undefined}>
              <Input
                name="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'register' ? 8 : undefined}
                required
              />
            </Field>
            <Button type="submit" disabled={busy} className="mt-2 w-full !min-h-11">
              {busy ? 'Se verifică…' : mode === 'login' ? 'Intră în cont' : 'Creează contul'}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}

// Scala de punctaj a clasamentului (view-ul din 008) și pragurile rarității (coloana generată din 003).
const scale = [
  { rarity: 'ultra_rare', points: 50, share: '< 1%' },
  { rarity: 'very_rare', points: 20, share: '1–5%' },
  { rarity: 'rare', points: 5, share: '5–20%' },
  { rarity: 'common', points: 1, share: '≥ 20%' },
] as const;

function ScoringScale() {
  return (
    <div>
      <p className="eyebrow mb-4">Cum se punctează</p>
      <ul className="grid grid-cols-4 gap-px overflow-hidden rounded-xl glass-grid">
        {scale.map(({ rarity, points, share }) => (
          <li key={rarity} className="bg-surface px-4 py-4">
            <p className={`num text-3xl ${rarityStyles[rarity].text}`}>{points}</p>
            <p className="mt-2 text-xs font-medium text-fg">{rarityStyles[rarity].label}</p>
            <p className="num mt-0.5 text-[11px] text-faint">{share} jucători</p>
          </li>
        ))}
      </ul>
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
      <div className="panel w-full max-w-sm rounded-2xl p-8 text-center">
        <div className="mb-5 flex justify-center"><Logo size={36} /></div>
        {error ? (
          <>
            <p className="mb-5 text-sm text-[#ffb4b4]">{error}</p>
            <Button onClick={() => navigate(user ? `/users/${user.id}` : '/login')}>{user ? 'Înapoi la profil' : 'Înapoi la login'}</Button>
          </>
        ) : (
          <p className="text-sm text-muted">Te conectăm…</p>
        )}
      </div>
    </div>
  );
}

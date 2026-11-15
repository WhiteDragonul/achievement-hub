// Profilul unificat al unui user: banner + bio (personalizabile), vitrina de achievement-uri, statistici pe raritate,
// conturile de platformă și biblioteca de jocuri.
// Pe profilul propriu: editarea profilului, conectarea contului Steam și sincronizarea.
// Pe profilul altcuiva: cerere de prietenie și raportare.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  accentColors, api, banners, download,
  type AccentColor, type Banner, type LibraryGame, type Platform, type Profile, type ProfileAccount, type Rarity,
  type SyncRun, type UnlockedAchievement,
} from '../api';
import { useAuth, useCurrentUser } from '../auth';
import { Avatar, Button, Card, ErrorMessage, Input, Loading, PlatformBadge, ProgressBar, RarityBadge, Select } from '../components/ui';

const LIBRARY_PAGE = 12;
const rarities: Rarity[] = ['ultra_rare', 'very_rare', 'rare', 'common'];

// Temele de profil: aceleași valori ca CHECK-urile din migrația 009.
const accentStyles: Record<AccentColor, { label: string; color: string }> = {
  violet: { label: 'Violet', color: '#a78bfa' },
  blue: { label: 'Albastru', color: '#60a5fa' },
  cyan: { label: 'Cyan', color: '#22d3ee' },
  emerald: { label: 'Smarald', color: '#34d399' },
  amber: { label: 'Chihlimbar', color: '#fbbf24' },
  rose: { label: 'Roz', color: '#fb7185' },
};
const bannerStyles: Record<Banner, { label: string; background: string }> = {
  aurora: { label: 'Aurora', background: 'linear-gradient(120deg, #4f46e5 0%, #a21caf 50%, #0891b2 100%)' },
  sunset: { label: 'Apus', background: 'linear-gradient(120deg, #f97316 0%, #db2777 55%, #7c3aed 100%)' },
  ocean: { label: 'Ocean', background: 'linear-gradient(120deg, #0ea5e9 0%, #2563eb 50%, #0f766e 100%)' },
  forest: { label: 'Pădure', background: 'linear-gradient(120deg, #065f46 0%, #16a34a 50%, #a3e635 100%)' },
  midnight: { label: 'Miez de noapte', background: 'linear-gradient(120deg, #0f172a 0%, #312e81 60%, #1e1b4b 100%)' },
};

export function ProfilePage() {
  const profileId = Number(useParams().id);
  const { userId, isAdmin } = useCurrentUser();
  const isOwnProfile = profileId === userId;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);
  const exportFile = (path: string, filename: string) => download(path, filename).catch(setExportError);

  const profile = useQuery({ queryKey: ['profile', profileId], queryFn: () => api<Profile>(`/users/${profileId}/profile`) });

  // Biblioteca se încarcă pe bucăți („Mai multe jocuri”), cu LIMIT/OFFSET.
  const library = useInfiniteQuery({
    queryKey: ['library', profileId],
    queryFn: ({ pageParam }) => api<LibraryGame[]>(`/users/${profileId}/games?limit=${LIBRARY_PAGE}&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => (lastPage.length === LIBRARY_PAGE ? pages.length * LIBRARY_PAGE : undefined),
  });

  const recent = useQuery({
    queryKey: ['recent-achievements', profileId],
    queryFn: () => api<UnlockedAchievement[]>(`/users/${profileId}/achievements?limit=6`),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['profile', profileId] });
    queryClient.invalidateQueries({ queryKey: ['library', profileId] });
    queryClient.invalidateQueries({ queryKey: ['recent-achievements', profileId] });
  };

  if (profile.isPending) return <Loading />;
  if (profile.error) return <ErrorMessage error={profile.error} />;
  const { user, accounts, rarity_counts, totals, favorite_game, showcase } = profile.data;
  const accent = accentStyles[user.accent_color ?? 'violet'].color;
  const totalAchievements = rarities.reduce((sum, rarity) => sum + Number(rarity_counts[rarity] ?? 0), 0);

  return (
    <>
      {/* ---- Capul profilului: banner, avatar, nume, bio ---- */}
      <section className="glass relative mb-6 overflow-hidden rounded-[30px]">
        <div className="h-32 sm:h-40" style={{ background: bannerStyles[user.banner ?? 'aurora'].background }}>
          <div className="h-full w-full bg-gradient-to-b from-transparent to-black/40" />
        </div>
        <div className="px-5 pb-5">
          <div className="-mt-12 flex flex-wrap items-end gap-4">
            <div className="rounded-full p-1" style={{ background: accent, boxShadow: `0 0 30px ${accent}66` }}>
              <Avatar name={user.display_name ?? user.username} url={user.avatar_url} size={96} />
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
                {user.display_name ?? user.username}
                {user.role !== 'user' && (
                  <span className="glass-pill ml-3 rounded-full px-2.5 py-1 align-middle text-[11px] font-bold uppercase tracking-wide text-white/85">{user.role}</span>
                )}
              </h1>
              <p className="text-sm text-white/55">@{user.username} · membru din {new Date(user.created_at).toLocaleDateString('ro-RO')}</p>
            </div>
            <div className="flex flex-wrap gap-2 pb-1">
              {isOwnProfile && <Button onClick={() => setEditing(!editing)}>{editing ? 'Închide' : 'Editează profilul'}</Button>}
              {(isOwnProfile || isAdmin) && (
                <>
                  {/* Rapoartele userului (etapa 5): CSV generat cu COPY, Excel cu două foi */}
                  <Button variant="secondary" onClick={() => exportFile(`/exports/users/${profileId}/achievements.csv`, `achievements-${user.username}.csv`)}>CSV</Button>
                  <Button variant="secondary" onClick={() => exportFile(`/exports/users/${profileId}/library.xlsx`, `biblioteca-${user.username}.xlsx`)}>Excel</Button>
                </>
              )}
            </div>
          </div>
          {user.bio && <p className="mt-4 max-w-2xl whitespace-pre-line text-sm text-white/80">{user.bio}</p>}

          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <Stat value={totals.games} label="jocuri" />
            <Stat value={totalAchievements} label="achievement-uri" />
            <Stat value={Math.round(totals.playtime_minutes / 60)} label="ore jucate" />
            <Stat value={totals.perfect_games} label="jocuri 100%" />
            {favorite_game && (
              <Link to={`/games/${favorite_game.id}`} className="glass-pill pressable flex items-center gap-2 rounded-full px-3 py-1.5">
                {favorite_game.icon_url && <img src={favorite_game.icon_url} alt="" className="h-5 w-5 rounded" />}
                <span className="text-white/55">Preferat:</span> <span className="font-medium">{favorite_game.title}</span>
              </Link>
            )}
          </div>
        </div>
      </section>

      <ErrorMessage error={exportError} />
      {user.hidden_from_leaderboards && <p className="mb-4 text-sm text-amber-200">Ascuns din clasamente de un moderator.</p>}

      {editing && <EditProfile profile={profile.data} onSaved={() => { refresh(); setEditing(false); }} />}

      {/* ---- Vitrina ---- */}
      {showcase.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold">Vitrină</h2>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            {showcase.map((achievement) => <AchievementCard key={achievement.id} achievement={achievement} accent={accent} />)}
          </div>
        </>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rarities.map((rarity) => (
          <Card key={rarity} className="text-center">
            <p className="text-3xl font-bold tabular-nums">{rarity_counts[rarity] ?? 0}</p>
            <div className="mt-2"><RarityBadge rarity={rarity} /></div>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Conturi legate</h2>
      <div className="mb-6 space-y-3">
        {accounts.map((account) => (
          <AccountRow key={account.id} account={account} editable={isOwnProfile} onChange={refresh} />
        ))}
        {accounts.length === 0 && !isOwnProfile && <p className="text-sm text-white/55">Niciun cont legat.</p>}
        {isOwnProfile && <ConnectPlatforms userId={userId} linked={accounts} onLinked={refresh} />}
      </div>

      {!isOwnProfile && <SocialActions currentUserId={userId} profileId={profileId} />}

      {recent.data && recent.data.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold">Deblocate recent</h2>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.data.map((achievement) => <AchievementCard key={achievement.id} achievement={achievement} />)}
          </div>
        </>
      )}

      <h2 className="mb-3 text-lg font-semibold">Biblioteca de jocuri</h2>
      <ErrorMessage error={library.error} />
      {library.data?.pages[0]?.length === 0 && (
        <p className="text-sm text-white/55">
          {isOwnProfile ? 'Conectează contul Steam și jocurile tale apar aici după prima sincronizare.' : 'Nicio bibliotecă încă.'}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {library.data?.pages.flat().map((game) => (
          <Link key={`${game.platform_account_id}-${game.game_id}`} to={`/games/${game.game_id}`}>
            <Card className="pressable h-full hover:bg-white/10">
              <div className="mb-2 flex items-center gap-3">
                {game.icon_url && <img src={game.icon_url} alt="" className="h-9 w-9 shrink-0 rounded-lg" />}
                <p className="min-w-0 flex-1 truncate font-medium">{game.title}</p>
                <PlatformBadge code={game.platform_code} />
              </div>
              <ProgressBar value={game.unlocked_achievements} total={game.total_achievements} />
              <p className="mt-2 text-xs text-white/55">
                {game.total_achievements > 0
                  ? `${game.unlocked_achievements}/${game.total_achievements} achievement-uri`
                  : 'fără achievement-uri'} · {Math.round(game.playtime_minutes / 60)} ore jucate
              </p>
            </Card>
          </Link>
        ))}
      </div>
      {library.hasNextPage && (
        <Button variant="secondary" className="mt-4 w-full" disabled={library.isFetchingNextPage} onClick={() => library.fetchNextPage()}>
          Mai multe jocuri
        </Button>
      )}
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="glass-pill rounded-full px-3 py-1.5">
      <span className="font-bold tabular-nums">{Number(value).toLocaleString('ro-RO')}</span> <span className="text-white/55">{label}</span>
    </span>
  );
}

function AchievementCard({ achievement, accent }: { achievement: UnlockedAchievement; accent?: string }) {
  return (
    <Card className="flex items-center gap-3 !p-4" >
      {achievement.icon_url ? (
        <img
          src={achievement.icon_url} alt="" className="h-12 w-12 shrink-0 rounded-xl"
          style={accent ? { boxShadow: `0 0 0 2px ${accent}, 0 0 18px ${accent}88` } : undefined}
        />
      ) : (
        <span className="glass-pill flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl">🏆</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{achievement.name}</p>
        <p className="truncate text-xs text-white/55">{achievement.game_title}</p>
        <div className="mt-1 flex items-center gap-2">
          <RarityBadge rarity={achievement.rarity} />
          {achievement.global_unlock_pct !== null && (
            <span className="text-[11px] text-white/45">{Number(achievement.global_unlock_pct).toFixed(1)}% dintre jucători</span>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---- Editarea profilului: date de bază, temă, joc preferat, vitrină ----
function EditProfile({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const { user } = profile;
  const { reloadMe } = useAuth();
  const [displayName, setDisplayName] = useState(user.display_name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [accent, setAccent] = useState<AccentColor>(user.accent_color ?? 'violet');
  const [banner, setBanner] = useState<Banner>(user.banner ?? 'aurora');
  const [favoriteGameId, setFavoriteGameId] = useState<number | null>(user.favorite_game_id ?? null);
  const [showcaseIds, setShowcaseIds] = useState<number[]>(profile.showcase.map((item) => item.id));

  // Opțiunile: jocurile din bibliotecă și ultimele achievement-uri deblocate.
  const games = useQuery({ queryKey: ['library-all', user.id], queryFn: () => api<LibraryGame[]>(`/users/${user.id}/games?limit=100`) });
  const unlocked = useQuery({
    queryKey: ['unlocked', user.id],
    queryFn: () => api<UnlockedAchievement[]>(`/users/${user.id}/achievements?limit=100`),
  });
  // Cele mai rare primele: sunt cele pe care merită să le expui.
  const choices = [...(unlocked.data ?? [])].sort((a, b) => (a.global_unlock_pct ?? 100) - (b.global_unlock_pct ?? 100));

  const save = useMutation({
    mutationFn: async () => {
      await api(`/users/${user.id}`, {
        method: 'PATCH',
        body: {
          display_name: displayName.trim() || undefined,
          avatar_url: avatarUrl.trim() || null,
          bio: bio.trim() || null,
          accent_color: accent,
          banner,
          favorite_game_id: favoriteGameId,
        },
      });
      await api(`/users/${user.id}/showcase`, { method: 'PUT', body: { achievement_ids: showcaseIds } });
    },
    onSuccess: async () => {
      await reloadMe();
      onSaved();
    },
  });

  function toggleShowcase(id: number) {
    setShowcaseIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < 3 ? [...ids, id] : ids));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <Card className="mb-6">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="text-white/60">Nume afișat</span>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={64} placeholder={user.username} />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-white/60">Avatar (link https către o imagine)</span>
            <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
          </label>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="text-white/60">Despre tine ({bio.length}/300)</span>
          <textarea
            value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={3}
            className="glass-field w-full rounded-2xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
            placeholder="Ce jocuri îți plac, ce vânezi acum…"
          />
        </label>

        <div className="space-y-2 text-sm">
          <span className="text-white/60">Culoare de accent</span>
          <div className="flex flex-wrap gap-2">
            {accentColors.map((color) => (
              <button
                key={color} type="button" title={accentStyles[color].label} onClick={() => setAccent(color)}
                className={`pressable h-9 w-9 rounded-full border-2 ${accent === color ? 'border-white' : 'border-transparent'}`}
                style={{ background: accentStyles[color].color }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <span className="text-white/60">Banner</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {banners.map((name) => (
              <button
                key={name} type="button" onClick={() => setBanner(name)}
                className={`pressable h-14 rounded-2xl border-2 text-xs font-semibold text-white ${banner === name ? 'border-white' : 'border-transparent'}`}
                style={{ background: bannerStyles[name].background }}
              >
                {bannerStyles[name].label}
              </button>
            ))}
          </div>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="text-white/60">Joc preferat</span>
          <Select value={favoriteGameId ?? ''} onChange={(e) => setFavoriteGameId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— niciunul —</option>
            {games.data?.map((game) => <option key={game.game_id} value={game.game_id}>{game.title}</option>)}
          </Select>
        </label>

        <div className="space-y-2 text-sm">
          <span className="text-white/60">Vitrină — alege până la 3 achievement-uri ({showcaseIds.length}/3)</span>
          {choices.length === 0 && <p className="text-white/45">Niciun achievement deblocat încă. Sincronizează contul Steam.</p>}
          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {choices.map((achievement) => {
              const selected = showcaseIds.includes(achievement.id);
              return (
                <button
                  key={achievement.id} type="button" onClick={() => toggleShowcase(achievement.id)}
                  className={`pressable flex items-center gap-3 rounded-2xl border p-2 text-left ${selected ? 'border-white/70 bg-white/15' : 'border-white/10 bg-white/5'}`}
                >
                  {achievement.icon_url && <img src={achievement.icon_url} alt="" className="h-9 w-9 shrink-0 rounded-lg" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{achievement.name}</span>
                    <span className="block truncate text-xs text-white/50">{achievement.game_title}</span>
                  </span>
                  {selected && <span className="text-xs font-bold">#{showcaseIds.indexOf(achievement.id) + 1}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <ErrorMessage error={save.error} />
        <Button type="submit" disabled={save.isPending} className="w-full">{save.isPending ? 'Se salvează…' : 'Salvează profilul'}</Button>
      </form>
    </Card>
  );
}

function AccountRow({ account, editable, onChange }: { account: ProfileAccount; editable: boolean; onChange: () => void }) {
  const queryClient = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);

  // Istoricul se citește mereu (ultimele 5): așa vedem și sincronizarea pornită automat după conectarea Steam.
  const history = useQuery({
    queryKey: ['sync-runs', account.id],
    queryFn: () => api<SyncRun[]>(`/sync-runs?platform_account_id=${account.id}&limit=5`),
  });
  const latest = history.data?.[0];

  // Cât timp o sincronizare e în coadă sau rulează, istoricul se reîncarcă la 2 s.
  const syncInProgress = latest?.status === 'queued' || latest?.status === 'running';
  useEffect(() => {
    if (!syncInProgress) return;
    const timer = setInterval(() => history.refetch(), 2000);
    return () => clearInterval(timer);
  }, [syncInProgress, history]);
  // Când sync-ul s-a terminat, reîncărcăm profilul și biblioteca (au date noi).
  const [wasSyncing, setWasSyncing] = useState(false);
  useEffect(() => {
    if (syncInProgress) setWasSyncing(true);
    else if (wasSyncing) {
      setWasSyncing(false);
      onChange();
    }
  }, [syncInProgress, wasSyncing, onChange]);

  // Sincronizarea se pune în coada pg-boss; worker-ul o execută (etapa 3b).
  const sync = useMutation({
    mutationFn: () => api<SyncRun>('/sync-runs', { method: 'POST', body: { platform_account_id: account.id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sync-runs', account.id] }),
  });
  const unlink = useMutation({
    mutationFn: () => api(`/platform-accounts/${account.id}`, { method: 'DELETE' }),
    onSuccess: onChange,
  });

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <PlatformBadge code={account.platform_code} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{account.display_name}</p>
          <p className="truncate text-xs text-white/55">
            {account.games} jocuri · {account.achievements} achievement-uri ·{' '}
            {syncInProgress
              ? latest?.status === 'queued' ? 'în coadă pentru sincronizare…' : 'se sincronizează…'
              : account.last_synced_at ? `sincronizat ${new Date(account.last_synced_at).toLocaleString('ro-RO')}` : 'nesincronizat'}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setShowHistory(!showHistory)}>Istoric</Button>
        {editable && (
          <Button onClick={() => sync.mutate()} disabled={sync.isPending || syncInProgress}>
            {syncInProgress ? 'Se sincronizează…' : 'Sincronizează'}
          </Button>
        )}
        {editable && (
          <Button variant="danger" onClick={() => confirm(`Dezlegi contul ${account.platform_name}? Progresul lui se șterge.`) && unlink.mutate()}>
            Dezleagă
          </Button>
        )}
      </div>
      {latest?.status === 'failed' && !showHistory && (
        <p className="mt-3 rounded-2xl bg-red-500/15 px-3 py-2 text-sm text-red-200">Ultima sincronizare a eșuat: {latest.error_message}</p>
      )}
      <ErrorMessage error={sync.error ?? unlink.error} />
      {showHistory && (
        <ul className="mt-3 space-y-1 border-t border-white/10 pt-3 text-xs text-white/55">
          {history.data?.map((run) => (
            <li key={run.id}>
              {new Date(run.created_at).toLocaleString('ro-RO')} — <span className="font-medium text-white/90">{run.status}</span>
              {run.status === 'succeeded' && ` · ${run.games_synced} jocuri, ${run.achievements_synced} achievement-uri noi`}
              {run.error_message && ` · ${run.error_message}`}
            </li>
          ))}
          {history.data?.length === 0 && <li>Nicio sincronizare.</li>}
        </ul>
      )}
    </Card>
  );
}

// Platformele încă nelegate. Steam: login Steam (dovedește că SteamID-ul e al tău), apoi primul sync pornește singur.
// PSN / Xbox / Epic: fără integrare reală deocamdată (ar da date generate), deci apar ca „în curând”.
function ConnectPlatforms({ userId, linked, onLinked }: { userId: number; linked: ProfileAccount[]; onLinked: () => void }) {
  const platforms = useQuery({ queryKey: ['platforms'], queryFn: () => api<Platform[]>('/platforms') });
  const available = platforms.data?.filter((platform) => !linked.some((account) => account.platform_id === platform.id)) ?? [];

  const connectSteam = useMutation({
    mutationFn: () => api<{ url: string }>('/auth/steam/link', { method: 'POST', body: { client: 'web' } }),
    onSuccess: ({ url }) => window.location.assign(url),
  });

  if (available.length === 0) return null;
  return (
    <Card>
      <h3 className="mb-1 font-semibold">Conectează o platformă</h3>
      <p className="mb-4 text-sm text-white/55">Jocurile și achievement-urile se importă automat după conectare.</p>
      <div className="space-y-3">
        {available.map((platform) => platform.code === 'steam' ? (
          <div key={platform.id} className="flex flex-wrap items-center gap-3">
            <PlatformBadge code="steam" />
            <p className="min-w-0 flex-1 text-sm text-white/70">
              Te autentifici pe steamcommunity.com; noi primim doar SteamID-ul, nu parola.
              Setează în Steam „Detalii joc” pe <b>Public</b>, altfel Steam nu arată jocurile.
            </p>
            <Button onClick={() => connectSteam.mutate()} disabled={connectSteam.isPending}>Conectează Steam</Button>
          </div>
        ) : platform.linkable ? (
          <MockLinkForm key={platform.id} platform={platform} userId={userId} onLinked={onLinked} />
        ) : (
          <div key={platform.id} className="flex items-center gap-3 opacity-60">
            <PlatformBadge code={platform.code} />
            <p className="flex-1 text-sm">{platform.name}</p>
            <span className="glass-pill rounded-full px-3 py-1 text-xs">În curând</span>
          </div>
        ))}
      </div>
      <div className="mt-3"><ErrorMessage error={connectSteam.error} /></div>
    </Card>
  );
}

// Doar cu ALLOW_MOCK_PLATFORMS=true (demo): legare manuală pe o platformă cu date generate.
function MockLinkForm({ platform, userId, onLinked }: { platform: Platform; userId: number; onLinked: () => void }) {
  const link = useMutation({
    mutationFn: (body: object) => api('/platform-accounts', { method: 'POST', body }),
    onSuccess: onLinked,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('display_name'));
    link.mutate({ user_id: userId, platform_id: platform.id, external_id: `${platform.code}-${userId}`, display_name: name });
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
      <PlatformBadge code={platform.code} />
      <Input name="display_name" placeholder={`Nume pe ${platform.name} (date demo)`} required className="min-w-40 flex-1" />
      <Button type="submit" variant="secondary" disabled={link.isPending}>Leagă (demo)</Button>
      <ErrorMessage error={link.error} />
    </form>
  );
}

function SocialActions({ currentUserId, profileId }: { currentUserId: number; profileId: number }) {
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();

  const befriend = useMutation({
    mutationFn: () => api('/friendships', { method: 'POST', body: { requester_id: currentUserId, addressee_id: profileId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friendships'] }),
  });
  const report = useMutation({
    mutationFn: () => api('/reports', { method: 'POST', body: { reporter_id: currentUserId, target_user_id: profileId, reason } }),
    onSuccess: () => setReason(''),
  });

  return (
    <Card className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => befriend.mutate()} disabled={befriend.isPending || befriend.isSuccess}>
          {befriend.isSuccess ? 'Cerere trimisă' : 'Trimite cerere de prietenie'}
        </Button>
      </div>
      <ErrorMessage error={befriend.error} />
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => { event.preventDefault(); report.mutate(); }}
      >
        <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivul raportării (min. 5 caractere)" className="flex-1" />
        <Button variant="danger" type="submit" disabled={report.isPending}>Raportează</Button>
      </form>
      {report.isSuccess && <p className="text-sm text-emerald-300">Raportarea a fost trimisă moderatorilor.</p>}
      <ErrorMessage error={report.error} />
    </Card>
  );
}

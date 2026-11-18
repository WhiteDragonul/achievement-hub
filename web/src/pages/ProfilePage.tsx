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
import {
  Avatar, Button, Card, Empty, ErrorMessage, Field, Icon, Input, Loading, PlatformBadge, ProgressBar, RarityBadge, SectionTitle, Select,
  fieldClass, rarityStyles,
} from '../components/ui';

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

  const name = user.display_name ?? user.username;
  const libraryGames = library.data?.pages.flat() ?? [];

  return (
    <>
      {/* ---- Capul profilului: banner, avatar, nume, bio ---- */}
      <section className="panel relative mb-10 overflow-hidden rounded-2xl">
        {/* Bannerul ales de user, estompat spre suprafața cardului ca să nu concureze cu conținutul. */}
        <div className="relative h-28 sm:h-36">
          <div className="absolute inset-0 opacity-60" style={{ background: bannerStyles[user.banner ?? 'aurora'].background }} />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-surface/40 to-surface" />
        </div>
        <div className="relative px-5 pb-6 sm:px-7">
          <div className="-mt-14 flex flex-wrap items-end gap-5">
            <div className="rounded-full p-[3px]" style={{ background: `linear-gradient(160deg, ${accent}, ${accent}55)` }}>
              <Avatar name={name} url={user.avatar_url} size={96} className="!ring-4 !ring-black/30" />
            </div>
            <div className="min-w-0 flex-1 basis-56 pb-1">
              <p className="eyebrow mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>@{user.username}</span>
                <span className="text-line-strong">/</span>
                <span>din {new Date(user.created_at).toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' })}</span>
                {user.role !== 'user' && <span className="rounded border border-gold/30 px-1.5 py-px !text-gold">{user.role}</span>}
              </p>
              <h1 className="truncate font-display font-extrabold tracking-[-0.03em] text-[40px] leading-none sm:text-[52px]">{name}</h1>
            </div>
            <div className="flex flex-wrap gap-2 pb-1">
              {isOwnProfile && (
                <Button variant={editing ? 'secondary' : 'primary'} onClick={() => setEditing(!editing)}>
                  <Icon name={editing ? 'x' : 'edit'} className="h-4 w-4" /> {editing ? 'Închide' : 'Editează'}
                </Button>
              )}
              {(isOwnProfile || isAdmin) && (
                <>
                  {/* Rapoartele userului (etapa 5): CSV generat cu COPY, Excel cu două foi */}
                  <Button variant="secondary" title="Achievement-urile, CSV" onClick={() => exportFile(`/exports/users/${profileId}/achievements.csv`, `achievements-${user.username}.csv`)}>
                    <Icon name="download" className="h-4 w-4" /> CSV
                  </Button>
                  <Button variant="secondary" title="Biblioteca, Excel" onClick={() => exportFile(`/exports/users/${profileId}/library.xlsx`, `biblioteca-${user.username}.xlsx`)}>
                    <Icon name="download" className="h-4 w-4" /> Excel
                  </Button>
                </>
              )}
            </div>
          </div>
          {user.bio && <p className="mt-5 max-w-2xl text-[15px] leading-relaxed whitespace-pre-line text-muted">{user.bio}</p>}

          {/* Cifrele profilului, separate prin linii fine */}
          <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl glass-grid sm:grid-cols-4">
            <Stat value={totals.games} label="Jocuri" />
            <Stat value={totalAchievements} label="Achievement-uri" />
            <Stat value={Math.round(totals.playtime_minutes / 60)} label="Ore jucate" />
            <Stat value={totals.perfect_games} label="Jocuri 100%" gold={totals.perfect_games > 0} />
          </dl>
          {favorite_game && (
            <Link to={`/games/${favorite_game.id}`} className="mt-4 inline-flex items-center gap-2.5 text-sm text-muted transition-colors hover:text-fg">
              {favorite_game.icon_url && <img src={favorite_game.icon_url} alt="" className="h-5 w-5 rounded" />}
              <span className="eyebrow">Preferat</span> <span className="font-medium text-fg">{favorite_game.title}</span>
            </Link>
          )}
        </div>
      </section>

      <ErrorMessage error={exportError} />
      {user.hidden_from_leaderboards && (
        <p className="mb-6 rounded-lg border border-gold/25 bg-gold/[0.06] px-3.5 py-2.5 text-sm text-gold">Ascuns din clasamente de un moderator.</p>
      )}

      {editing && <EditProfile profile={profile.data} onSaved={() => { refresh(); setEditing(false); }} />}

      {/* ---- Vitrina ---- */}
      {showcase.length > 0 && (
        <section className="mb-10">
          <SectionTitle>Vitrină</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            {showcase.map((achievement, index) => <ShowcaseCard key={achievement.id} achievement={achievement} accent={accent} index={index} />)}
          </div>
        </section>
      )}

      {/* ---- Raritate: câte achievement-uri pe fiecare nivel ---- */}
      <section className="mb-10">
        <SectionTitle aside={`${totalAchievements.toLocaleString('ro-RO')} total`}>Raritate</SectionTitle>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl glass-grid sm:grid-cols-4">
          {rarities.map((rarity) => {
            const count = Number(rarity_counts[rarity] ?? 0);
            return (
              <div key={rarity} className="bg-surface p-5">
                <p className={`num text-3xl ${count > 0 ? rarityStyles[rarity].text : 'text-faint'}`}>{count.toLocaleString('ro-RO')}</p>
                <div className="mt-3"><RarityBadge rarity={rarity} /></div>
                <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={`h-full ${rarityStyles[rarity].dot}`} style={{ width: `${totalAchievements ? (count / totalAchievements) * 100 : 0}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- Conturi ---- */}
      <section className="mb-10">
        <SectionTitle aside={accounts.length}>Conturi legate</SectionTitle>
        <div className="space-y-3">
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} editable={isOwnProfile} onChange={refresh} />
          ))}
          {accounts.length === 0 && !isOwnProfile && <p className="text-sm text-faint">Niciun cont legat.</p>}
          {isOwnProfile && <ConnectPlatforms userId={userId} linked={accounts} onLinked={refresh} />}
        </div>
      </section>

      {!isOwnProfile && <SocialActions currentUserId={userId} profileId={profileId} />}

      {recent.data && recent.data.length > 0 && (
        <section className="mb-10">
          <SectionTitle>Deblocate recent</SectionTitle>
          <ul className="panel overflow-hidden rounded-3xl">
            {recent.data.map((achievement) => <RecentRow key={achievement.id} achievement={achievement} />)}
          </ul>
        </section>
      )}

      {/* ---- Biblioteca ---- */}
      <section>
        <SectionTitle aside={totals.games}>Biblioteca de jocuri</SectionTitle>
        <ErrorMessage error={library.error} />
        {library.data?.pages[0]?.length === 0 && (
          <div className="panel rounded-3xl">
            <Empty icon="games" title="Nicio bibliotecă încă">
              {isOwnProfile ? 'Conectează contul Steam și jocurile tale apar aici după prima sincronizare.' : 'Jucătorul nu are încă jocuri sincronizate.'}
            </Empty>
          </div>
        )}
        {libraryGames.length > 0 && (
          <ul className="grid gap-px overflow-hidden rounded-3xl glass-grid sm:grid-cols-2">
            {libraryGames.map((game) => {
              const perfect = game.total_achievements > 0 && game.unlocked_achievements === game.total_achievements;
              return (
                <li key={`${game.platform_account_id}-${game.game_id}`} className="bg-surface">
                  <Link to={`/games/${game.game_id}`} className="flex h-full flex-col gap-4 p-5 transition-colors hover:bg-raised">
                    <div className="flex items-center gap-3">
                      {game.icon_url
                        ? <img src={game.icon_url} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-line" />
                        : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-raised text-faint"><Icon name="games" /></span>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{game.title}</p>
                        <p className="num text-[11px] text-faint">{Math.round(game.playtime_minutes / 60).toLocaleString('ro-RO')} ore</p>
                      </div>
                      {perfect ? <span className="eyebrow !text-gold">100%</span> : <PlatformBadge code={game.platform_code} />}
                    </div>
                    {game.total_achievements > 0
                      ? <ProgressBar value={game.unlocked_achievements} total={game.total_achievements} />
                      : <p className="text-xs text-faint">Fără achievement-uri</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {library.hasNextPage && (
          <Button variant="secondary" className="mt-4 w-full" disabled={library.isFetchingNextPage} onClick={() => library.fetchNextPage()}>
            {library.isFetchingNextPage ? 'Se încarcă…' : 'Mai multe jocuri'}
          </Button>
        )}
      </section>
    </>
  );
}

function Stat({ value, label, gold = false }: { value: number; label: string; gold?: boolean }) {
  return (
    <div className="bg-surface px-4 py-4">
      <dt className="eyebrow">{label}</dt>
      <dd className={`num mt-1.5 text-2xl ${gold ? 'text-gold' : ''}`}>{Number(value).toLocaleString('ro-RO')}</dd>
    </div>
  );
}

// Iconița achievement-ului, cu un inel în culoarea rarității (sau cupa, dacă nu are imagine).
function AchievementIcon({ achievement, size = 48 }: { achievement: UnlockedAchievement; size?: number }) {
  const ring = achievement.rarity ? rarityStyles[achievement.rarity].ring : 'ring-line';
  return achievement.icon_url ? (
    <img src={achievement.icon_url} alt="" width={size} height={size} loading="lazy" className={`shrink-0 rounded-lg ring-1 ${ring}`} style={{ width: size, height: size }} />
  ) : (
    <span className={`flex shrink-0 items-center justify-center rounded-lg bg-raised text-faint ring-1 ${ring}`} style={{ width: size, height: size }}>
      <Icon name="trophy" />
    </span>
  );
}

// Un trofeu din vitrină: iconița mare, numele, jocul și cât de rar e.
function ShowcaseCard({ achievement, accent, index }: { achievement: UnlockedAchievement; accent: string; index: number }) {
  return (
    <article className="panel relative overflow-hidden rounded-2xl p-5">
      <span className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      <div className="flex items-start justify-between">
        <AchievementIcon achievement={achievement} size={56} />
        <span className="num text-xs text-faint">{String(index + 1).padStart(2, '0')}</span>
      </div>
      <p className="mt-5 line-clamp-2 font-medium leading-snug">{achievement.name}</p>
      <p className="mt-0.5 truncate text-[13px] text-muted">{achievement.game_title}</p>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <RarityBadge rarity={achievement.rarity} />
        {achievement.global_unlock_pct !== null && (
          <span className="num text-[11px] text-faint">{Number(achievement.global_unlock_pct).toFixed(1)}%</span>
        )}
      </div>
    </article>
  );
}

function RecentRow({ achievement }: { achievement: UnlockedAchievement }) {
  return (
    <li className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-b-0 sm:px-5">
      <AchievementIcon achievement={achievement} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{achievement.name}</p>
        <p className="truncate text-xs text-faint">{achievement.game_title}</p>
      </div>
      <div className="hidden text-right sm:block">
        <RarityBadge rarity={achievement.rarity} />
        {achievement.global_unlock_pct !== null && (
          <p className="num text-[11px] text-faint">{Number(achievement.global_unlock_pct).toFixed(1)}% dintre jucători</p>
        )}
      </div>
    </li>
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
    <Card className="rise mb-10 !p-0">
      <form onSubmit={submit}>
        <div className="border-b border-line px-5 py-4 sm:px-7">
          <p className="font-medium">Editează profilul</p>
          <p className="text-sm text-muted">Ce văd ceilalți când îți deschid profilul.</p>
        </div>

        <div className="space-y-7 px-5 py-6 sm:px-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nume afișat">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={64} placeholder={user.username} />
            </Field>
            <Field label="Avatar" hint="link https către o imagine">
              <Input type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://" />
            </Field>
          </div>

          <Field label="Despre tine" hint={`${bio.length}/300`}>
            <textarea
              value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={3}
              className={`${fieldClass} resize-y py-3 leading-relaxed`}
              placeholder="Ce jocuri îți plac, ce vânezi acum"
            />
          </Field>

          <div className="grid gap-7 sm:grid-cols-[auto_1fr]">
            <fieldset className="space-y-2.5">
              <legend className="mb-2.5 text-[13px] font-medium text-muted">Accent</legend>
              <div className="flex flex-wrap gap-2">
                {accentColors.map((color) => (
                  <button
                    key={color} type="button" title={accentStyles[color].label} aria-label={accentStyles[color].label} aria-pressed={accent === color}
                    onClick={() => setAccent(color)}
                    className={`pressable h-9 w-9 cursor-pointer rounded-full ring-offset-2 ring-offset-surface ${accent === color ? 'ring-2 ring-fg' : 'ring-1 ring-line'}`}
                    style={{ background: accentStyles[color].color }}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2.5 text-[13px] font-medium text-muted">Banner</legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {banners.map((name) => (
                  <button
                    key={name} type="button" onClick={() => setBanner(name)} aria-pressed={banner === name}
                    className={`pressable relative h-12 cursor-pointer overflow-hidden rounded-lg ring-offset-2 ring-offset-surface ${banner === name ? 'ring-2 ring-fg' : 'ring-1 ring-line'}`}
                  >
                    <span className="absolute inset-0 opacity-70" style={{ background: bannerStyles[name].background }} />
                    <span className="relative text-[11px] font-medium text-white">{bannerStyles[name].label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <Field label="Joc preferat">
            <Select value={favoriteGameId ?? ''} onChange={(e) => setFavoriteGameId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">(niciunul)</option>
              {games.data?.map((game) => <option key={game.game_id} value={game.game_id}>{game.title}</option>)}
            </Select>
          </Field>

          <fieldset>
            <legend className="mb-2.5 flex w-full justify-between text-[13px] font-medium text-muted">
              <span>Vitrină: până la 3 achievement-uri, cele mai rare primele</span>
              <span className="num text-xs font-normal text-faint">{showcaseIds.length}/3</span>
            </legend>
            {choices.length === 0 && <p className="text-sm text-faint">Niciun achievement deblocat încă. Sincronizează contul Steam.</p>}
            <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {choices.map((achievement) => {
                const selected = showcaseIds.includes(achievement.id);
                const full = !selected && showcaseIds.length >= 3;
                return (
                  <button
                    key={achievement.id} type="button" onClick={() => toggleShowcase(achievement.id)} aria-pressed={selected} disabled={full}
                    className={`pressable flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 text-left disabled:cursor-not-allowed disabled:opacity-40 ${
                      selected ? 'border-fg/40 bg-raised' : 'border-line hover:border-line-strong'}`}
                  >
                    <AchievementIcon achievement={achievement} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{achievement.name}</span>
                      <span className="block truncate text-xs text-faint">{achievement.game_title}</span>
                    </span>
                    {selected
                      ? <span className="num flex h-6 w-6 items-center justify-center rounded-full bg-fg text-[11px] text-ink">{showcaseIds.indexOf(achievement.id) + 1}</span>
                      : <span className="num text-[11px] text-faint">{achievement.global_unlock_pct !== null ? `${Number(achievement.global_unlock_pct).toFixed(1)}%` : ''}</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <ErrorMessage error={save.error} />
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-4 sm:px-7">
          <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Se salvează…' : 'Salvează profilul'}</Button>
        </div>
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

  const statusLabel = syncInProgress
    ? latest?.status === 'queued' ? 'În coadă' : 'Se sincronizează'
    : account.last_synced_at ? `Sincronizat ${new Date(account.last_synced_at).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Nesincronizat';

  return (
    <Card className="!p-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
        <PlatformBadge code={account.platform_code} full />
        <div className="min-w-0 flex-1 basis-40">
          <p className="truncate font-medium">{account.display_name}</p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-faint">
            {/* Punctul de stare: pulsează cât timp rulează sincronizarea */}
            <span className={`h-1.5 w-1.5 rounded-full ${syncInProgress ? 'animate-pulse bg-gold' : latest?.status === 'failed' ? 'bg-danger' : 'bg-success'}`} />
            {statusLabel}
          </p>
        </div>
        <div className="flex gap-6 text-right">
          <span><span className="num block text-sm">{Number(account.games).toLocaleString('ro-RO')}</span><span className="eyebrow !text-[10px]">jocuri</span></span>
          <span><span className="num block text-sm">{Number(account.achievements).toLocaleString('ro-RO')}</span><span className="eyebrow !text-[10px]">achiev.</span></span>
        </div>
        <div className="flex w-full gap-1.5 sm:w-auto">
          <Button variant="ghost" size="sm" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}>
            <Icon name="history" className="h-4 w-4" /> Istoric
          </Button>
          {editable && (
            <Button variant="secondary" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending || syncInProgress}>
              <Icon name="sync" className={`h-4 w-4 ${syncInProgress ? 'animate-spin' : ''}`} /> {syncInProgress ? 'Rulează' : 'Sincronizează'}
            </Button>
          )}
          {editable && (
            <Button
              variant="ghost" size="sm" className="hover:!text-danger"
              onClick={() => confirm(`Dezlegi contul ${account.platform_name}? Progresul lui se șterge.`) && unlink.mutate()}
            >
              Dezleagă
            </Button>
          )}
        </div>
      </div>
      {latest?.status === 'failed' && !showHistory && (
        <p className="border-t border-line px-5 py-3 text-sm text-[#ffb4b4]">Ultima sincronizare a eșuat: {latest.error_message}</p>
      )}
      {(sync.error || unlink.error) && <div className="px-5"><ErrorMessage error={sync.error ?? unlink.error} /></div>}
      {showHistory && (
        <ol className="rise border-t border-line px-5 py-3">
          {history.data?.map((run) => (
            <li key={run.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5 text-xs">
              <span className="num w-36 text-faint">{new Date(run.created_at).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <span className={`num ${run.status === 'failed' ? 'text-danger' : run.status === 'succeeded' ? 'text-success' : 'text-gold'}`}>{run.status}</span>
              <span className="text-muted">
                {run.status === 'succeeded' && `${run.games_synced} jocuri, ${run.achievements_synced} achievement-uri noi`}
                {run.error_message}
              </span>
            </li>
          ))}
          {history.data?.length === 0 && <li className="py-1.5 text-xs text-faint">Nicio sincronizare.</li>}
        </ol>
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
    <Card className="!p-0 !border-dashed !border-line-strong !bg-transparent">
      <div className="px-5 pt-5">
        <p className="font-medium">Conectează o platformă</p>
        <p className="mt-0.5 text-sm text-muted">Jocurile și achievement-urile se importă automat după conectare.</p>
      </div>
      <ul className="mt-4">
        {available.map((platform) => platform.code === 'steam' ? (
          <li key={platform.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line px-5 py-4">
            <PlatformBadge code="steam" full />
            <p className="min-w-0 flex-1 basis-64 text-[13px] leading-relaxed text-muted">
              Te autentifici pe steamcommunity.com; noi primim doar SteamID-ul, nu parola.
              Setează în Steam „Detalii joc” pe <span className="text-fg">Public</span>, altfel Steam nu arată jocurile.
            </p>
            <Button size="sm" onClick={() => connectSteam.mutate()} disabled={connectSteam.isPending}>
              <Icon name="link" className="h-4 w-4" /> Conectează Steam
            </Button>
          </li>
        ) : platform.linkable ? (
          <li key={platform.id} className="border-t border-line px-5 py-4">
            <MockLinkForm platform={platform} userId={userId} onLinked={onLinked} />
          </li>
        ) : (
          <li key={platform.id} className="flex items-center gap-4 border-t border-line px-5 py-4">
            <PlatformBadge code={platform.code} full />
            <p className="flex-1 text-sm text-faint">{platform.name}</p>
            <span className="eyebrow">În curând</span>
          </li>
        ))}
      </ul>
      {connectSteam.error && <div className="px-5"><ErrorMessage error={connectSteam.error} /></div>}
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
      <PlatformBadge code={platform.code} full />
      <Input name="display_name" aria-label={`Nume pe ${platform.name}`} placeholder={`Nume pe ${platform.name} (date demo)`} required className="min-w-40 flex-1" />
      <Button type="submit" size="sm" variant="secondary" disabled={link.isPending}>Leagă (demo)</Button>
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
    <section className="mb-10 grid gap-3 md:grid-cols-[auto_1fr]">
      <Card className="flex flex-col justify-center">
        <Button onClick={() => befriend.mutate()} disabled={befriend.isPending || befriend.isSuccess}>
          <Icon name={befriend.isSuccess ? 'check' : 'plus'} className="h-4 w-4" />
          {befriend.isSuccess ? 'Cerere trimisă' : 'Cerere de prietenie'}
        </Button>
        <div className="mt-3 empty:hidden"><ErrorMessage error={befriend.error} /></div>
      </Card>
      <Card>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); report.mutate(); }}>
          <Field label="Raportează profilul" hint="min. 5 caractere" className="min-w-52 flex-1">
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivul, pentru moderatori" />
          </Field>
          <Button variant="danger" type="submit" disabled={report.isPending} className="!min-h-11">
            <Icon name="flag" className="h-4 w-4" /> Raportează
          </Button>
        </form>
        {report.isSuccess && <p role="status" className="mt-3 text-sm text-success">Raportarea a fost trimisă moderatorilor.</p>}
        <div className="mt-3 empty:hidden"><ErrorMessage error={report.error} /></div>
      </Card>
    </section>
  );
}

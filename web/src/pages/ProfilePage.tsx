// Profilul unificat al unui user: statistici pe raritate, conturile de platformă, biblioteca de jocuri.
// Pe profilul propriu: legare / dezlegare conturi și pornirea unei sincronizări.
// Pe profilul altcuiva: cerere de prietenie și raportare.
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type LibraryGame, type Platform, type Profile, type ProfileAccount, type Rarity, type SyncRun } from '../api';
import { useCurrentUser } from '../current-user';
import { Button, Card, ErrorMessage, Input, Loading, PageTitle, PlatformBadge, ProgressBar, RarityBadge, Select } from '../components/ui';

const LIBRARY_PAGE = 12;
const rarities: Rarity[] = ['ultra_rare', 'very_rare', 'rare', 'common'];

export function ProfilePage() {
  const profileId = Number(useParams().id);
  const { userId } = useCurrentUser();
  const isOwnProfile = profileId === userId;
  const queryClient = useQueryClient();

  const profile = useQuery({ queryKey: ['profile', profileId], queryFn: () => api<Profile>(`/users/${profileId}/profile`) });

  // Biblioteca se încarcă pe bucăți („Mai multe jocuri”), cu LIMIT/OFFSET.
  const library = useInfiniteQuery({
    queryKey: ['library', profileId],
    queryFn: ({ pageParam }) => api<LibraryGame[]>(`/users/${profileId}/games?limit=${LIBRARY_PAGE}&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => (lastPage.length === LIBRARY_PAGE ? pages.length * LIBRARY_PAGE : undefined),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['profile', profileId] });
    queryClient.invalidateQueries({ queryKey: ['library', profileId] });
  };

  if (profile.isPending) return <Loading />;
  if (profile.error) return <ErrorMessage error={profile.error} />;
  const { user, accounts, rarity_counts } = profile.data;

  return (
    <>
      <PageTitle subtitle={`@${user.username} · membru din ${new Date(user.created_at).toLocaleDateString('ro-RO')}`}>
        {user.display_name ?? user.username}
        {user.role !== 'user' && <span className="ml-2 align-middle text-xs font-medium uppercase text-indigo-300">{user.role}</span>}
      </PageTitle>
      {user.hidden_from_leaderboards && <p className="mb-4 text-sm text-amber-300">Ascuns din clasamente de un moderator.</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rarities.map((rarity) => (
          <Card key={rarity} className="text-center">
            <p className="text-2xl font-bold tabular-nums">{rarity_counts[rarity] ?? 0}</p>
            <div className="mt-1"><RarityBadge rarity={rarity} /></div>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Conturi legate</h2>
      <div className="mb-6 space-y-3">
        {accounts.map((account) => (
          <AccountRow key={account.id} account={account} editable={isOwnProfile} onChange={refresh} />
        ))}
        {accounts.length === 0 && <p className="text-sm text-slate-400">Niciun cont legat.</p>}
        {isOwnProfile && <LinkAccountForm userId={userId} linked={accounts} onLinked={refresh} />}
      </div>

      {!isOwnProfile && <SocialActions currentUserId={userId} profileId={profileId} />}

      <h2 className="mb-3 text-lg font-semibold">Biblioteca de jocuri</h2>
      <ErrorMessage error={library.error} />
      <div className="grid gap-3 sm:grid-cols-2">
        {library.data?.pages.flat().map((game) => (
          <Link key={`${game.platform_account_id}-${game.game_id}`} to={`/games/${game.game_id}`}>
            <Card className="h-full transition hover:border-indigo-500/60">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="truncate font-medium">{game.title}</p>
                <PlatformBadge code={game.platform_code} />
              </div>
              <ProgressBar value={game.unlocked_achievements} total={game.total_achievements} />
              <p className="mt-2 text-xs text-slate-400">
                {game.unlocked_achievements}/{game.total_achievements} achievement-uri · {Math.round(game.playtime_minutes / 60)} ore jucate
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

function AccountRow({ account, editable, onChange }: { account: ProfileAccount; editable: boolean; onChange: () => void }) {
  const [showHistory, setShowHistory] = useState(false);
  const queryClient = useQueryClient();

  const history = useQuery({
    queryKey: ['sync-runs', account.id],
    queryFn: () => api<SyncRun[]>(`/sync-runs?platform_account_id=${account.id}&limit=5`),
    enabled: showHistory,
  });

  // Deocamdată sincronizarea doar se pune în coadă (status 'queued'); worker-ul care o execută vine în etapa 3b.
  const sync = useMutation({
    mutationFn: () => api<SyncRun>('/sync-runs', { method: 'POST', body: { platform_account_id: account.id } }),
    onSuccess: () => {
      setShowHistory(true);
      queryClient.invalidateQueries({ queryKey: ['sync-runs', account.id] });
    },
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
          <p className="truncate text-xs text-slate-400">
            {account.games} jocuri · {account.achievements} achievement-uri ·{' '}
            {account.last_synced_at ? `sincronizat ${new Date(account.last_synced_at).toLocaleDateString('ro-RO')}` : 'nesincronizat'}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setShowHistory(!showHistory)}>Istoric</Button>
        {editable && <Button onClick={() => sync.mutate()} disabled={sync.isPending}>Sincronizează</Button>}
        {editable && (
          <Button variant="danger" onClick={() => confirm(`Dezlegi contul ${account.platform_name}? Progresul lui se șterge.`) && unlink.mutate()}>
            Dezleagă
          </Button>
        )}
      </div>
      <ErrorMessage error={sync.error ?? unlink.error} />
      {showHistory && (
        <ul className="mt-3 space-y-1 border-t border-slate-800 pt-3 text-xs text-slate-400">
          {history.data?.map((run) => (
            <li key={run.id}>
              {new Date(run.created_at).toLocaleString('ro-RO')} — <span className="font-medium text-slate-200">{run.status}</span>
              {run.status === 'succeeded' && ` · ${run.games_synced} jocuri, ${run.achievements_synced} achievement-uri`}
              {run.error_message && ` · ${run.error_message}`}
            </li>
          ))}
          {history.data?.length === 0 && <li>Nicio sincronizare.</li>}
        </ul>
      )}
    </Card>
  );
}

function LinkAccountForm({ userId, linked, onLinked }: { userId: number; linked: ProfileAccount[]; onLinked: () => void }) {
  const platforms = useQuery({ queryKey: ['platforms'], queryFn: () => api<Platform[]>('/platforms') });
  // Un singur cont per platformă: oferim doar platformele încă nelegate (regula e păzită oricum de UNIQUE în DB).
  const available = platforms.data?.filter((platform) => !linked.some((account) => account.platform_id === platform.id)) ?? [];

  const link = useMutation({
    mutationFn: (body: object) => api('/platform-accounts', { method: 'POST', body }),
    onSuccess: onLinked,
  });

  if (available.length === 0) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const token = String(form.get('access_token'));
    link.mutate({
      user_id: userId,
      platform_id: Number(form.get('platform_id')),
      external_id: String(form.get('external_id')),
      display_name: String(form.get('display_name')),
      access_token: token || undefined,
    });
  }

  return (
    <Card>
      <h3 className="mb-3 font-semibold">Leagă un cont</h3>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Select name="platform_id">
          {available.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
        </Select>
        <Input name="external_id" placeholder="Id-ul contului (ex. SteamID64)" required />
        <Input name="display_name" placeholder="Nume afișat" required />
        <Input name="access_token" placeholder="Token de acces (opțional, se salvează criptat)" />
        <Button type="submit" disabled={link.isPending} className="sm:col-span-2">Leagă contul</Button>
      </form>
      <div className="mt-3"><ErrorMessage error={link.error} /></div>
    </Card>
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
      {report.isSuccess && <p className="text-sm text-green-400">Raportarea a fost trimisă moderatorilor.</p>}
      <ErrorMessage error={report.error} />
    </Card>
  );
}

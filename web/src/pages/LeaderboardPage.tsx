// Clasamentul: global, pe platformă sau doar între prietenii userului curent.
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, type LeaderboardRow, type Platform } from '../api';
import { useCurrentUser } from '../auth';
import { Button, Card, ErrorMessage, Loading, PageTitle, Select, Avatar } from '../components/ui';

const medals = ['from-amber-200/80 to-amber-600/60', 'from-slate-100/70 to-slate-400/50', 'from-orange-300/75 to-orange-700/55'];

const PAGE_SIZE = 20;

export function LeaderboardPage() {
  const { userId } = useCurrentUser();
  const [platformId, setPlatformId] = useState('');
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [page, setPage] = useState(0);

  const platforms = useQuery({ queryKey: ['platforms'], queryFn: () => api<Platform[]>('/platforms') });

  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
  if (platformId) params.set('platform_id', platformId);
  if (friendsOnly) params.set('friends_of', String(userId));

  const leaderboard = useQuery({
    queryKey: ['leaderboard', platformId, friendsOnly, userId, page],
    queryFn: () => api<LeaderboardRow[]>(`/leaderboard?${params}`),
  });

  return (
    <>
      <PageTitle subtitle="Scor: ultra rar 50 · foarte rar 20 · rar 5 · comun 1 punct">Clasament</PageTitle>

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={platformId} onChange={(event) => { setPlatformId(event.target.value); setPage(0); }}>
          <option value="">Toate platformele</option>
          {platforms.data?.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
        </Select>
        <Button variant={friendsOnly ? 'primary' : 'secondary'} onClick={() => { setFriendsOnly(!friendsOnly); setPage(0); }}>
          Doar prietenii
        </Button>
      </div>

      <ErrorMessage error={leaderboard.error} />
      {leaderboard.isPending ? <Loading /> : (
        <Card className="p-0">
          <ol className="divide-y divide-white/10">
            {leaderboard.data?.map((row) => (
              <li key={row.user_id} className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5 ${row.user_id === userId ? 'bg-white/10' : ''}`}>
                {/* Primii trei au „medalii” de sticlă colorată: aur, argint, bronz. */}
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
                  row.rank <= 3
                    ? `border border-white/40 bg-gradient-to-b text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_4px_14px_-4px_rgb(0_0_0/0.6)] ${medals[row.rank - 1]}`
                    : 'text-white/40'}`}>
                  {row.rank}
                </span>
                <Avatar name={row.display_name ?? row.username} size={36} />
                <Link to={`/users/${row.user_id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.display_name ?? row.username}</p>
                  <p className="truncate text-xs text-white/55">
                    @{row.username} · {row.achievements} achievement-uri · {row.rare_achievements} rare
                  </p>
                </Link>
                <span className="text-right font-semibold tabular-nums">{row.score}<span className="ml-1 text-xs text-white/40">pct</span></span>
              </li>
            ))}
          </ol>
          {leaderboard.data?.length === 0 && <p className="p-4 text-sm text-white/55">Nimeni în clasament.</p>}
        </Card>
      )}

      <div className="mt-4 flex justify-between">
        <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Înapoi</Button>
        <Button variant="secondary" disabled={(leaderboard.data?.length ?? 0) < PAGE_SIZE} onClick={() => setPage(page + 1)}>
          Următoarea
        </Button>
      </div>
    </>
  );
}

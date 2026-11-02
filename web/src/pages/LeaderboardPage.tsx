// Clasamentul: global, pe platformă sau doar între prietenii userului curent.
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, type LeaderboardRow, type Platform } from '../api';
import { useCurrentUser } from '../current-user';
import { Button, Card, ErrorMessage, Loading, PageTitle, Select } from '../components/ui';

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
          <ol className="divide-y divide-slate-800">
            {leaderboard.data?.map((row) => (
              <li key={row.user_id} className={`flex items-center gap-3 px-4 py-3 ${row.user_id === userId ? 'bg-indigo-500/10' : ''}`}>
                <span className={`w-8 text-center text-lg font-bold tabular-nums ${row.rank <= 3 ? 'text-rarity-ultra' : 'text-slate-500'}`}>
                  {row.rank}
                </span>
                <Link to={`/users/${row.user_id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.display_name ?? row.username}</p>
                  <p className="truncate text-xs text-slate-400">
                    @{row.username} · {row.achievements} achievement-uri · {row.rare_achievements} rare
                  </p>
                </Link>
                <span className="text-right font-semibold tabular-nums">{row.score}<span className="ml-1 text-xs text-slate-500">pct</span></span>
              </li>
            ))}
          </ol>
          {leaderboard.data?.length === 0 && <p className="p-4 text-sm text-slate-400">Nimeni în clasament.</p>}
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

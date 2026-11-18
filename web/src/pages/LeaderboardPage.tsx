// Clasamentul: global, pe platformă sau doar între prietenii userului curent.
// Pe prima pagină, primii trei apar pe un podium; restul într-o listă cu rang, nume și scor.
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, type LeaderboardRow, type Platform } from '../api';
import { useCurrentUser } from '../auth';
import { Avatar, Empty, ErrorMessage, Loading, PageTitle, Pager, Segmented, Select } from '../components/ui';

const PAGE_SIZE = 20;

// Culoarea rangului pentru primele trei locuri: aur, argint, bronz.
const medalText = ['text-gold', 'text-silver', 'text-bronze'];

const scopes = [
  { id: 'all', label: 'Toți' },
  { id: 'friends', label: 'Prieteni' },
] as const;

export function LeaderboardPage() {
  const { userId } = useCurrentUser();
  const [platformId, setPlatformId] = useState('');
  const [scope, setScope] = useState<'all' | 'friends'>('all');
  const [page, setPage] = useState(0);

  const platforms = useQuery({ queryKey: ['platforms'], queryFn: () => api<Platform[]>('/platforms') });

  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
  if (platformId) params.set('platform_id', platformId);
  if (scope === 'friends') params.set('friends_of', String(userId));

  const leaderboard = useQuery({
    queryKey: ['leaderboard', platformId, scope, userId, page],
    queryFn: () => api<LeaderboardRow[]>(`/leaderboard?${params}`),
  });

  const rows = leaderboard.data ?? [];
  // Podiumul are sens doar pe prima pagină și când sunt cel puțin trei jucători.
  const podium = page === 0 && rows.length >= 3 ? rows.slice(0, 3) : [];
  const rest = podium.length ? rows.slice(3) : rows;

  return (
    <>
      <PageTitle
        eyebrow="Clasament"
        subtitle="Scorul adună raritatea fiecărui achievement: ultra rar 50, foarte rar 20, rar 5, comun 1 punct."
      >
        Cei mai buni vânători
      </PageTitle>

      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Segmented options={scopes} value={scope} onChange={(value) => { setScope(value); setPage(0); }} className="w-56" />
        <Select value={platformId} onChange={(event) => { setPlatformId(event.target.value); setPage(0); }} className="w-52">
          <option value="">Toate platformele</option>
          {platforms.data?.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
        </Select>
      </div>

      <ErrorMessage error={leaderboard.error} />
      {leaderboard.isPending ? <Loading rows={8} /> : (
        <>
          {podium.length > 0 && <Podium rows={podium} currentUserId={userId} />}

          {rest.length > 0 && (
            <ol className="panel overflow-hidden rounded-3xl">
              <li className="eyebrow hidden grid-cols-[3.5rem_1fr_7rem_7rem_6rem] items-center border-b border-line px-5 py-3 sm:grid">
                <span>#</span><span>Jucător</span><span className="text-right">Achievement-uri</span><span className="text-right">Rare</span><span className="text-right">Scor</span>
              </li>
              {rest.map((row) => <Row key={row.user_id} row={row} isMe={row.user_id === userId} />)}
            </ol>
          )}
          {rows.length === 0 && (
            <div className="panel rounded-3xl">
              <Empty title="Nimeni în clasament încă">
                {scope === 'friends' ? 'Adaugă prieteni ca să vă comparați scorurile.' : 'Clasamentul se umple după primele sincronizări.'}
              </Empty>
            </div>
          )}
        </>
      )}

      <Pager page={page} hasNext={rows.length === PAGE_SIZE} onChange={setPage} />
    </>
  );
}

// Podium: locul 1 la mijloc și mai înalt; pe telefon se așază în ordinea 1, 2, 3.
function Podium({ rows, currentUserId }: { rows: LeaderboardRow[]; currentUserId: number }) {
  const order = [1, 0, 2]; // pe desktop: argint, aur, bronz
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-3 sm:items-end">
      {order.map((index) => {
        const row = rows[index];
        const first = index === 0;
        return (
          <Link
            key={row.user_id}
            to={`/users/${row.user_id}`}
            className={`panel group relative block overflow-hidden rounded-2xl p-5 transition-colors hover:border-line-strong ${
              first ? 'sm:order-none sm:pt-9 sm:pb-7' : index === 1 ? 'order-1 sm:order-none' : 'order-2 sm:order-none'} ${
              row.user_id === currentUserId ? 'ring-1 ring-gold/40' : ''}`}
          >
            {/* Linia de sus în culoarea medaliei: singurul ornament al podiumului. */}
            <span className={`absolute inset-x-0 top-0 h-px ${first ? 'bg-gold' : index === 1 ? 'bg-silver/60' : 'bg-bronze/60'}`} />
            <div className="flex items-start justify-between">
              <Avatar name={row.display_name ?? row.username} size={first ? 52 : 44} />
              <span className={`font-extrabold tracking-[-0.04em] leading-none ${medalText[index]} ${first ? 'text-6xl' : 'text-5xl'}`}>{row.rank}</span>
            </div>
            <p className="mt-5 truncate font-medium group-hover:text-white">{row.display_name ?? row.username}</p>
            <p className="truncate text-xs text-faint">@{row.username}</p>
            <div className="mt-4 flex items-end justify-between border-t border-line pt-4">
              <span>
                <span className={`num block text-2xl ${first ? 'text-gold' : 'text-fg'}`}>{Number(row.score).toLocaleString('ro-RO')}</span>
                <span className="eyebrow">puncte</span>
              </span>
              <span className="num text-right text-xs text-muted">
                {Number(row.achievements).toLocaleString('ro-RO')} ach.<br />{row.rare_achievements} rare
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function Row({ row, isMe }: { row: LeaderboardRow; isMe: boolean }) {
  return (
    <li className={`border-b border-line last:border-b-0 ${isMe ? 'bg-gold/[0.05]' : ''}`}>
      <Link
        to={`/users/${row.user_id}`}
        className="grid grid-cols-[2.75rem_1fr_auto] items-center gap-x-3 px-4 py-3 transition-colors hover:bg-raised sm:grid-cols-[3.5rem_1fr_7rem_7rem_6rem] sm:gap-x-0 sm:px-5"
      >
        <span className={`num text-sm ${row.rank <= 3 ? medalText[row.rank - 1] : 'text-faint'}`}>{String(row.rank).padStart(2, '0')}</span>
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={row.display_name ?? row.username} size={32} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {row.display_name ?? row.username}
              {isMe && <span className="eyebrow ml-2 !text-gold">tu</span>}
            </span>
            <span className="block truncate text-xs text-faint sm:hidden">
              {Number(row.achievements).toLocaleString('ro-RO')} achievement-uri · {row.rare_achievements} rare
            </span>
            <span className="hidden truncate text-xs text-faint sm:block">@{row.username}</span>
          </span>
        </span>
        <span className="num hidden text-right text-sm text-muted sm:block">{Number(row.achievements).toLocaleString('ro-RO')}</span>
        <span className="num hidden text-right text-sm text-muted sm:block">{row.rare_achievements}</span>
        <span className="num text-right text-sm font-medium">{Number(row.score).toLocaleString('ro-RO')}</span>
      </Link>
    </li>
  );
}

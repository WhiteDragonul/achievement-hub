// Detaliul unui joc: achievement-urile cu raritate, ce a deblocat userul curent,
// plus CRUD pe joc (redenumire, ștergere) și pe achievement-uri (adăugare, procent, ștergere).
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type GameAchievements, type GameDetail, type Platform } from '../api';
import { useCurrentUser } from '../current-user';
import { Button, Card, ErrorMessage, Input, Loading, PageTitle, PlatformBadge, ProgressBar, RarityBadge } from '../components/ui';

export function GameDetailPage() {
  const gameId = Number(useParams().id);
  const { userId } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingTitle, setEditingTitle] = useState(false);

  const game = useQuery({ queryKey: ['game', gameId], queryFn: () => api<GameDetail>(`/games/${gameId}`) });
  const platforms = useQuery({ queryKey: ['platforms'], queryFn: () => api<Platform[]>('/platforms') });
  const achievements = useQuery({
    queryKey: ['game-achievements', gameId, userId],
    queryFn: () => api<GameAchievements>(`/games/${gameId}/achievements?user_id=${userId}`),
  });

  // După orice modificare reîncărcăm jocul și lista de achievement-uri.
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    queryClient.invalidateQueries({ queryKey: ['game-achievements', gameId] });
  };
  const mutate = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) => api(path, { method, body }),
    onSuccess: refresh,
  });

  const deleteGame = useMutation({
    mutationFn: () => api(`/games/${gameId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] });
      navigate('/games');
    },
  });

  if (game.isPending || achievements.isPending) return <Loading />;
  if (game.error) return <ErrorMessage error={game.error} />;

  const accountId = achievements.data?.platform_account_id ?? null;
  const list = achievements.data?.achievements ?? [];
  const unlockedCount = list.filter((achievement) => achievement.unlocked_at).length;
  const platformCode = platforms.data?.find((platform) => platform.id === game.data.platform_id)?.code ?? '?';

  function renameGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get('title'));
    mutate.mutate({ path: `/games/${gameId}`, method: 'PATCH', body: { title } });
    setEditingTitle(false);
  }

  function addAchievement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pct = String(form.get('global_unlock_pct'));
    mutate.mutate({
      path: '/achievements',
      method: 'POST',
      body: {
        game_id: gameId,
        external_id: String(form.get('external_id')),
        name: String(form.get('name')),
        global_unlock_pct: pct === '' ? undefined : Number(pct),
      },
    });
    event.currentTarget.reset();
  }

  return (
    <>
      <div className="mb-2"><PlatformBadge code={platformCode} /></div>
      {editingTitle ? (
        <form onSubmit={renameGame} className="mb-5 flex gap-2">
          <Input name="title" defaultValue={game.data.title} autoFocus />
          <Button type="submit">Salvează</Button>
        </form>
      ) : (
        <PageTitle subtitle={`${game.data.achievements_count} achievement-uri · id extern ${game.data.external_id}`}>
          {game.data.title}
        </PageTitle>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setEditingTitle(!editingTitle)}>Redenumește</Button>
        <Button variant="danger" onClick={() => confirm('Ștergi jocul cu tot cu achievement-uri și progres?') && deleteGame.mutate()}>
          Șterge jocul
        </Button>
        {accountId && !achievements.data?.owns_game && (
          <Button onClick={() => mutate.mutate({ path: '/user-games', method: 'POST', body: { platform_account_id: accountId, game_id: gameId } })}>
            Adaugă în biblioteca mea
          </Button>
        )}
        {accountId && achievements.data?.owns_game && (
          <Button variant="secondary" onClick={() => mutate.mutate({ path: `/user-games/${accountId}/${gameId}`, method: 'DELETE' })}>
            Scoate din biblioteca mea
          </Button>
        )}
      </div>
      <div className="mb-4 space-y-2">
        <ErrorMessage error={mutate.error} />
        <ErrorMessage error={deleteGame.error} />
      </div>

      {achievements.data?.owns_game && (
        <Card className="mb-4">
          <p className="mb-2 text-sm text-slate-400">Progresul tău: {unlockedCount} din {list.length}</p>
          <ProgressBar value={unlockedCount} total={list.length} />
        </Card>
      )}
      {!accountId && (
        <p className="mb-4 text-sm text-slate-400">Nu ai cont legat pe această platformă, deci nu poți debloca achievement-uri aici.</p>
      )}

      <Card className="p-0">
        <ul className="divide-y divide-slate-800">
          {list.map((achievement) => (
            <li key={achievement.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${achievement.unlocked_at ? '' : 'opacity-70'}`}>
              {/* pe telefon textul ocupă tot rândul, iar butoanele trec dedesubt */}
              <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                <p className="font-medium">
                  {achievement.unlocked_at && <span className="mr-1 text-green-400">✓</span>}
                  {achievement.name}
                </p>
                <p className="text-xs text-slate-400">
                  {achievement.global_unlock_pct ?? '?'}% dintre jucători
                  {achievement.unlocked_at && ` · deblocat ${new Date(achievement.unlocked_at).toLocaleDateString('ro-RO')}`}
                </p>
              </div>
              <RarityBadge rarity={achievement.rarity} />
              {achievements.data?.owns_game && accountId && (
                achievement.unlocked_at
                  ? <Button variant="secondary" onClick={() => mutate.mutate({ path: `/user-achievements/${accountId}/${achievement.id}`, method: 'DELETE' })}>Anulează</Button>
                  : <Button variant="secondary" onClick={() => mutate.mutate({ path: '/user-achievements', method: 'POST', body: { platform_account_id: accountId, achievement_id: achievement.id } })}>Deblochează</Button>
              )}
              <Button
                variant="danger"
                aria-label={`Șterge ${achievement.name}`}
                onClick={() => confirm(`Ștergi achievement-ul „${achievement.name}”?`) && mutate.mutate({ path: `/achievements/${achievement.id}`, method: 'DELETE' })}
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 font-semibold">Adaugă achievement</h2>
        <form onSubmit={addAchievement} className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr_auto]">
          <Input name="external_id" placeholder="Id extern" required />
          <Input name="name" placeholder="Nume" required />
          <Input name="global_unlock_pct" placeholder="% global (0–100)" type="number" step="0.01" />
          <Button type="submit">Adaugă</Button>
        </form>
      </Card>
    </>
  );
}

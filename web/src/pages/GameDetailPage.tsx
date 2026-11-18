// Detaliul unui joc: achievement-urile cu raritate, ce a deblocat userul curent,
// plus CRUD pe joc (redenumire, ștergere) și pe achievement-uri (adăugare, procent, ștergere).
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type GameAchievements, type GameDetail, type Platform, type Rarity } from '../api';
import { useCurrentUser } from '../auth';
import {
  Button, Card, Empty, ErrorMessage, Field, Icon, Input, Loading, PageTitle, PlatformBadge, ProgressBar, RarityBadge, SectionTitle, rarityStyles,
} from '../components/ui';

const rarityOrder: Rarity[] = ['ultra_rare', 'very_rare', 'rare', 'common'];

export function GameDetailPage() {
  const gameId = Number(useParams().id);
  const { userId, isAdmin } = useCurrentUser(); // catalogul (jocul, achievement-urile) îl modifică doar adminul
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

  // Câte achievement-uri are jocul pe fiecare raritate (pentru bara de distribuție).
  const byRarity = rarityOrder.map((rarity) => ({ rarity, count: list.filter((a) => a.rarity === rarity).length }));
  const owns = achievements.data?.owns_game ?? false;

  return (
    <>
      <Link to="/games" className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-fg">
        <Icon name="arrowLeft" className="h-4 w-4" /> Catalog
      </Link>

      {editingTitle ? (
        <form onSubmit={renameGame} className="mb-8 flex gap-2 border-b border-line pb-6">
          <Input name="title" defaultValue={game.data.title} autoFocus aria-label="Titlul jocului" className="!min-h-12 !text-lg" />
          <Button type="submit" className="!min-h-12">Salvează</Button>
          <Button type="button" variant="ghost" className="!min-h-12" onClick={() => setEditingTitle(false)}>Renunță</Button>
        </form>
      ) : (
        <PageTitle
          eyebrow={<span className="flex items-center gap-3"><PlatformBadge code={platformCode} full /> <span>id {game.data.external_id}</span></span>}
          actions={
            <>
              {accountId && !owns && (
                <Button onClick={() => mutate.mutate({ path: '/user-games', method: 'POST', body: { platform_account_id: accountId, game_id: gameId } })}>
                  <Icon name="plus" className="h-4 w-4" /> Adaugă în bibliotecă
                </Button>
              )}
              {accountId && owns && (
                <Button variant="ghost" onClick={() => mutate.mutate({ path: `/user-games/${accountId}/${gameId}`, method: 'DELETE' })}>
                  Scoate din bibliotecă
                </Button>
              )}
              {isAdmin && (
                <Button variant="secondary" onClick={() => setEditingTitle(true)}>
                  <Icon name="edit" className="h-4 w-4" /> Redenumește
                </Button>
              )}
              {isAdmin && (
                <Button variant="danger" onClick={() => confirm('Ștergi jocul cu tot cu achievement-uri și progres?') && deleteGame.mutate()}>
                  Șterge
                </Button>
              )}
            </>
          }
        >
          {game.data.title}
        </PageTitle>
      )}

      <ErrorMessage error={mutate.error} />
      <ErrorMessage error={deleteGame.error} />

      {/* Rezumatul: progresul userului (dacă are jocul) + distribuția pe raritate */}
      <div className="mb-8 grid gap-3 md:grid-cols-[1fr_1.4fr]">
        <Card>
          <p className="eyebrow mb-4">Progresul tău</p>
          {owns ? (
            <>
              <p className="mb-4">
                <span className="num text-4xl">{unlockedCount}</span>
                <span className="num text-lg text-faint"> / {list.length}</span>
              </p>
              <ProgressBar value={unlockedCount} total={list.length} />
            </>
          ) : (
            <p className="text-sm leading-relaxed text-muted">
              {accountId
                ? 'Jocul nu e în biblioteca ta. Adaugă-l ca să-ți urmărești progresul.'
                : 'Nu ai cont legat pe această platformă, deci nu poți debloca achievement-uri aici.'}
            </p>
          )}
        </Card>
        <Card>
          <p className="eyebrow mb-4 flex justify-between"><span>Raritate</span><span className="num">{game.data.achievements_count} total</span></p>
          {list.length > 0 && (
            <div className="mb-4 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
              {byRarity.filter((r) => r.count > 0).map(({ rarity, count }) => (
                <span key={rarity} className={rarityStyles[rarity].dot} style={{ flexGrow: count }} />
              ))}
            </div>
          )}
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {byRarity.map(({ rarity, count }) => (
              <li key={rarity}>
                <span className="num block text-xl">{count}</span>
                <RarityBadge rarity={rarity} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <SectionTitle aside={`${list.length} achievement-uri`}>Achievement-uri</SectionTitle>
      <ul className="panel overflow-hidden rounded-3xl">
        {list.map((achievement) => {
          const unlocked = Boolean(achievement.unlocked_at);
          const pct = achievement.global_unlock_pct;
          return (
            <li key={achievement.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line px-4 py-4 last:border-b-0 sm:px-5">
              {/* Starea: bifă aurie dacă e deblocat, lacăt dacă nu */}
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                unlocked ? 'border-gold/40 bg-gold/10 text-gold' : 'border-line bg-raised text-faint'}`}>
                <Icon name={unlocked ? 'check' : 'lock'} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <p className={`font-medium ${unlocked ? '' : 'text-fg/80'}`}>{achievement.name}</p>
                {achievement.description && <p className="mt-0.5 text-[13px] leading-snug text-muted">{achievement.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <RarityBadge rarity={achievement.rarity} />
                  <span className="num text-[11px] text-faint">{pct === null ? '?' : Number(pct).toFixed(1)}% dintre jucători</span>
                  {unlocked && (
                    <span className="num text-[11px] text-gold/80">deblocat {new Date(achievement.unlocked_at!).toLocaleDateString('ro-RO')}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {owns && accountId && (
                  unlocked
                    ? <Button variant="ghost" size="sm" onClick={() => mutate.mutate({ path: `/user-achievements/${accountId}/${achievement.id}`, method: 'DELETE' })}>Anulează</Button>
                    : <Button variant="secondary" size="sm" onClick={() => mutate.mutate({ path: '/user-achievements', method: 'POST', body: { platform_account_id: accountId, achievement_id: achievement.id } })}>Deblochează</Button>
                )}
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Șterge ${achievement.name}`}
                    title="Șterge achievement-ul"
                    className="!w-9 !px-0 hover:!text-danger"
                    onClick={() => confirm(`Ștergi achievement-ul „${achievement.name}”?`) && mutate.mutate({ path: `/achievements/${achievement.id}`, method: 'DELETE' })}
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
        {list.length === 0 && <Empty title="Fără achievement-uri">Jocul nu are achievement-uri în catalog.</Empty>}
      </ul>

      {isAdmin && (
        <Card className="mt-6">
          <SectionTitle>Adaugă achievement</SectionTitle>
          <form onSubmit={addAchievement} className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_1fr_auto]">
            <Field label="Id extern"><Input name="external_id" required /></Field>
            <Field label="Nume"><Input name="name" required /></Field>
            <Field label="% global" hint="0–100"><Input name="global_unlock_pct" type="number" step="0.01" min={0} max={100} /></Field>
            <Button type="submit" className="!min-h-11">Adaugă</Button>
          </form>
        </Card>
      )}
    </>
  );
}

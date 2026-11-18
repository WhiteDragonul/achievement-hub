// Catalogul de jocuri: căutare, filtrare pe platformă și adăugarea unui joc nou (Create din CRUD).
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Game, type Platform } from '../api';
import { useCurrentUser } from '../auth';
import { Button, Card, Empty, ErrorMessage, Field, Icon, Input, Loading, PageTitle, Pager, PlatformBadge, SectionTitle, Select } from '../components/ui';

const PAGE_SIZE = 24;

export function GamesPage() {
  const { isAdmin } = useCurrentUser(); // doar adminul adaugă jocuri în catalog
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [platformId, setPlatformId] = useState('');
  const [page, setPage] = useState(0);
  const [showForm, setShowForm] = useState(false);

  const platforms = useQuery({ queryKey: ['platforms'], queryFn: () => api<Platform[]>('/platforms') });
  const platformCode = (id: number) => platforms.data?.find((platform) => platform.id === id)?.code ?? '?';

  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
  if (search) params.set('search', search);
  if (platformId) params.set('platform_id', platformId);
  const games = useQuery({ queryKey: ['games', search, platformId, page], queryFn: () => api<Game[]>(`/games?${params}`) });

  const createGame = useMutation({
    mutationFn: (body: { platform_id: number; external_id: string; title: string }) =>
      api<Game>('/games', { method: 'POST', body }),
    onSuccess: () => {
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['games'] });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createGame.mutate({
      platform_id: Number(form.get('platform_id')),
      external_id: String(form.get('external_id')),
      title: String(form.get('title')),
    });
  }

  return (
    <>
      <PageTitle
        eyebrow="Catalog"
        subtitle="Every known game across the linked platforms. Open one to see its achievements and how rare they are."
        actions={isAdmin && (
          <Button variant="secondary" onClick={() => setShowForm(!showForm)}>
            <Icon name={showForm ? 'x' : 'plus'} className="h-4 w-4" /> {showForm ? 'Cancel' : 'New game'}
          </Button>
        )}
      >
        Games
      </PageTitle>

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            type="search"
            aria-label="Search by title"
            placeholder="Search by title"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(0); }}
            className="!pl-10"
          />
        </div>
        <Select value={platformId} onChange={(event) => { setPlatformId(event.target.value); setPage(0); }} className="w-52">
          <option value="">All platforms</option>
          {platforms.data?.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
        </Select>
      </div>

      {showForm && (
        <Card className="rise mb-6">
          <SectionTitle>Add to catalog</SectionTitle>
          <form onSubmit={submit} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
            <Field label="Platform">
              <Select name="platform_id" required>
                {platforms.data?.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
              </Select>
            </Field>
            <Field label="External id"><Input name="external_id" placeholder="e.g. appid" required /></Field>
            <Field label="Title"><Input name="title" required /></Field>
            <Button type="submit" disabled={createGame.isPending} className="!min-h-11">Save</Button>
          </form>
          <div className="mt-4"><ErrorMessage error={createGame.error} /></div>
        </Card>
      )}

      <ErrorMessage error={games.error} />
      {games.isPending ? <Loading rows={6} /> : (
        <ul className="grid gap-px overflow-hidden rounded-3xl glass-grid sm:grid-cols-2 lg:grid-cols-3">
          {games.data?.map((game) => (
            <li key={game.id} className="bg-surface">
              <Link to={`/games/${game.id}`} className="group flex h-full min-h-28 flex-col justify-between gap-6 p-5 transition-colors hover:bg-raised">
                <div className="flex items-center justify-between">
                  <PlatformBadge code={platformCode(game.platform_id)} />
                  <Icon name="arrowRight" className="h-4 w-4 -translate-x-1 text-faint opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </div>
                <div>
                  <p className="line-clamp-2 font-medium leading-snug">{game.title}</p>
                  <p className="num mt-1 text-[11px] text-faint">{game.external_id}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {games.data?.length === 0 && (
        <div className="panel rounded-3xl"><Empty icon="search" title="No games found">Try another title or platform.</Empty></div>
      )}

      <Pager page={page} hasNext={(games.data?.length ?? 0) === PAGE_SIZE} onChange={setPage} />
    </>
  );
}

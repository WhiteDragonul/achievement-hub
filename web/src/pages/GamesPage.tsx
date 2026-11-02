// Catalogul de jocuri: căutare, filtrare pe platformă și adăugarea unui joc nou (Create din CRUD).
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Game, type Platform } from '../api';
import { Button, Card, ErrorMessage, Input, Loading, PageTitle, PlatformBadge, Select } from '../components/ui';

const PAGE_SIZE = 24;

export function GamesPage() {
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
      <PageTitle subtitle="Catalogul de jocuri de pe toate platformele">Jocuri</PageTitle>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Caută după titlu…"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(0); }}
          className="max-w-xs flex-1"
        />
        <Select value={platformId} onChange={(event) => { setPlatformId(event.target.value); setPage(0); }}>
          <option value="">Toate platformele</option>
          {platforms.data?.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
        </Select>
        <Button variant="secondary" onClick={() => setShowForm(!showForm)}>+ Joc nou</Button>
      </div>

      {showForm && (
        <Card className="mb-4">
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
            <Select name="platform_id" required>
              {platforms.data?.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}
            </Select>
            <Input name="external_id" placeholder="Id extern (ex. appid)" required />
            <Input name="title" placeholder="Titlu" required />
            <Button type="submit" disabled={createGame.isPending}>Salvează</Button>
          </form>
          <div className="mt-3"><ErrorMessage error={createGame.error} /></div>
        </Card>
      )}

      <ErrorMessage error={games.error} />
      {games.isPending ? <Loading /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {games.data?.map((game) => (
            <Link key={game.id} to={`/games/${game.id}`}>
              <Card className="h-full transition hover:border-indigo-500/60">
                <PlatformBadge code={platformCode(game.platform_id)} />
                <p className="mt-2 font-medium">{game.title}</p>
                <p className="mt-1 font-mono text-xs text-slate-500">{game.external_id}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {games.data?.length === 0 && <p className="text-sm text-slate-400">Niciun joc găsit.</p>}

      <div className="mt-4 flex justify-between">
        <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Înapoi</Button>
        <Button variant="secondary" disabled={(games.data?.length ?? 0) < PAGE_SIZE} onClick={() => setPage(page + 1)}>
          Următoarea
        </Button>
      </div>
    </>
  );
}

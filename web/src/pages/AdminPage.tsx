// Administrare, în trei secțiuni: raportări și utilizatori (moderator: suspendare / ascundere; admin: și roluri, ștergere),
// platforme (doar admin). Ce nu are voie rolul curent nu apare; API-ul verifică oricum fiecare cerere (403).
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, download, type Platform, type Report, type Role, type User } from '../api';
import { useCurrentUser } from '../auth';
import { Button, Card, ErrorMessage, Input, Loading, PageTitle, Segmented, Select } from '../components/ui';

type Tab = 'reports' | 'users' | 'platforms';

export function AdminPage() {
  const { isModerator, isAdmin } = useCurrentUser();
  const [tab, setTab] = useState<Tab>('reports');
  const [error, setError] = useState<unknown>(null);
  if (!isModerator) return <ErrorMessage error={new Error('Pagina e disponibilă doar moderatorilor și adminilor.')} />;

  const tabs: { id: Tab; label: string }[] = [{ id: 'reports', label: 'Raportări' }, { id: 'users', label: 'Utilizatori' }];
  if (isAdmin) tabs.push({ id: 'platforms', label: 'Platforme' });

  return (
    <>
      <PageTitle
        subtitle={isAdmin ? 'Moderare și administrare' : 'Moderare'}
        actions={
          <Button variant="secondary" onClick={() => download('/exports/overview.pdf', 'raport-achievement-hub.pdf').catch(setError)}>
            Raport PDF
          </Button>
        }
      >
        Admin
      </PageTitle>
      <ErrorMessage error={error} />
      <Segmented options={tabs} value={tab} onChange={setTab} />
      {tab === 'reports' && <ReportsSection />}
      {tab === 'users' && <UsersSection />}
      {tab === 'platforms' && <PlatformsSection />}
    </>
  );
}

// O singură mutație generică per secțiune: trimite cererea și reîncarcă lista afectată.
function useApiMutation(invalidateKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) => api(path, { method, body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [invalidateKey] }),
  });
}

function ReportsSection() {
  const { isAdmin } = useCurrentUser();
  const [status, setStatus] = useState('open');
  const reports = useQuery({
    queryKey: ['reports', status],
    queryFn: () => api<Report[]>(`/reports?status=${status}&limit=50`),
  });
  const mutate = useApiMutation('reports');

  return (
    <>
      <Select value={status} onChange={(event) => setStatus(event.target.value)} className="mb-4">
        <option value="open">Deschise</option>
        <option value="resolved">Rezolvate</option>
        <option value="rejected">Respinse</option>
      </Select>
      <ErrorMessage error={reports.error ?? mutate.error} />
      {reports.isPending ? <Loading /> : (
        <div className="space-y-3">
          {reports.data?.map((report) => (
            <Card key={report.id}>
              <p className="text-sm">
                <Link to={`/users/${report.reporter_id}`} className="text-sky-300">@{report.reporter_username}</Link>
                {' a raportat pe '}
                <Link to={`/users/${report.target_user_id}`} className="text-sky-300">@{report.target_username}</Link>
              </p>
              <p className="mt-1 text-white/75">„{report.reason}”</p>
              <p className="mt-1 text-xs text-white/40">
                {new Date(report.created_at).toLocaleString('ro-RO')}
                {report.resolution_note && ` · ${report.resolution_note}`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {report.status === 'open' && (
                  <>
                    <Button onClick={() => mutate.mutate({
                      path: `/reports/${report.id}`, method: 'PATCH',
                      body: { status: 'resolved', resolution_note: 'Utilizator ascuns din clasamente.' },
                    })}>
                      Rezolvă (ascunde userul)
                    </Button>
                    <Button variant="secondary" onClick={() => mutate.mutate({
                      path: `/reports/${report.id}`, method: 'PATCH',
                      body: { status: 'rejected', resolution_note: 'Nu am găsit dovezi.' },
                    })}>
                      Respinge
                    </Button>
                  </>
                )}
                {isAdmin && (
                  <Button variant="danger" onClick={() => mutate.mutate({ path: `/reports/${report.id}`, method: 'DELETE' })}>Șterge</Button>
                )}
              </div>
            </Card>
          ))}
          {reports.data?.length === 0 && <p className="text-sm text-white/55">Nicio raportare.</p>}
        </div>
      )}
    </>
  );
}

function UsersSection() {
  const { isAdmin } = useCurrentUser();
  const [search, setSearch] = useState('');
  const users = useQuery({
    queryKey: ['users', search],
    queryFn: () => api<User[]>(`/users?limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });
  const mutate = useApiMutation('users');

  function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutate.mutate({
      path: '/users', method: 'POST',
      body: {
        username: String(form.get('username')),
        email: String(form.get('email')) || undefined,
        password: String(form.get('password')) || undefined,
        role: String(form.get('role')),
      },
    });
    event.currentTarget.reset();
  }

  return (
    <>
      {isAdmin && <Card className="mb-4">
        <h2 className="mb-3 font-semibold">Utilizator nou</h2>
        <form onSubmit={createUser} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto_auto]">
          <Input name="username" placeholder="Username" required />
          <Input name="email" placeholder="Email" type="email" />
          <Input name="password" placeholder="Parolă (min. 8)" type="password" />
          <Select name="role" defaultValue="user">
            <option value="user">user</option>
            <option value="moderator">moderator</option>
            <option value="admin">admin</option>
          </Select>
          <Button type="submit">Creează</Button>
        </form>
      </Card>}

      <Input placeholder="Caută după username…" value={search} onChange={(event) => setSearch(event.target.value)} className="mb-4" />
      <ErrorMessage error={users.error ?? mutate.error} />

      {users.isPending ? <Loading /> : (
        <Card className="p-0">
          <ul className="divide-y divide-white/10">
            {users.data?.map((user) => (
              <li key={user.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <Link to={`/users/${user.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">@{user.username}</p>
                  <p className="truncate text-xs text-white/55">#{user.id} · {user.email ?? 'fără email'}</p>
                </Link>
                {isAdmin ? (
                  <Select
                    value={user.role}
                    onChange={(event) => mutate.mutate({ path: `/users/${user.id}`, method: 'PATCH', body: { role: event.target.value as Role } })}
                  >
                    <option value="user">user</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </Select>
                ) : (
                  <span className="glass-pill rounded-full px-3 py-1 text-xs font-semibold">{user.role}</span>
                )}
                <Button variant="secondary" onClick={() => mutate.mutate({ path: `/users/${user.id}`, method: 'PATCH', body: { is_banned: !user.is_banned } })}>
                  {user.is_banned ? 'Debanează' : 'Banează'}
                </Button>
                <Button variant="secondary" onClick={() => mutate.mutate({ path: `/users/${user.id}`, method: 'PATCH', body: { hidden_from_leaderboards: !user.hidden_from_leaderboards } })}>
                  {user.hidden_from_leaderboards ? 'Arată în clasament' : 'Ascunde din clasament'}
                </Button>
                {isAdmin && (
                  <Button variant="danger" onClick={() => confirm(`Ștergi @${user.username} cu tot cu datele lui?`) && mutate.mutate({ path: `/users/${user.id}`, method: 'DELETE' })}>
                    Șterge
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function PlatformsSection() {
  const platforms = useQuery({ queryKey: ['platforms'], queryFn: () => api<Platform[]>('/platforms') });
  const mutate = useApiMutation('platforms');

  function createPlatform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutate.mutate({ path: '/platforms', method: 'POST', body: { code: String(form.get('code')), name: String(form.get('name')), is_mock: true } });
    event.currentTarget.reset();
  }

  return (
    <>
      <ErrorMessage error={platforms.error ?? mutate.error} />
      <Card className="mb-4 p-0">
        <ul className="divide-y divide-white/10">
          {platforms.data?.map((platform) => (
            <li key={platform.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="w-16 font-mono text-sm text-white/55">{platform.code}</span>
              <Input
                defaultValue={platform.name}
                className="max-w-xs flex-1"
                onBlur={(event) => event.target.value !== platform.name &&
                  mutate.mutate({ path: `/platforms/${platform.id}`, method: 'PATCH', body: { name: event.target.value } })}
              />
              <Button variant="secondary" onClick={() => mutate.mutate({ path: `/platforms/${platform.id}`, method: 'PATCH', body: { is_mock: !platform.is_mock } })}>
                {platform.is_mock ? 'Mock' : 'Real'}
              </Button>
              <Button variant="danger" onClick={() => mutate.mutate({ path: `/platforms/${platform.id}`, method: 'DELETE' })}>Șterge</Button>
            </li>
          ))}
        </ul>
      </Card>
      <p className="mb-4 text-xs text-white/40">
        O platformă cu conturi sau jocuri nu poate fi ștearsă (ON DELETE RESTRICT) — încearcă și vezi eroarea din baza de date.
      </p>
      <Card>
        <h2 className="mb-3 font-semibold">Platformă nouă</h2>
        <form onSubmit={createPlatform} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <Input name="code" placeholder="cod (ex. gog)" required />
          <Input name="name" placeholder="Nume" required />
          <Button type="submit">Adaugă</Button>
        </form>
      </Card>
    </>
  );
}

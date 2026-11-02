// Administrare, în trei secțiuni: raportări (moderator), utilizatori și platforme (admin).
// În etapa 3 fiecare secțiune va fi vizibilă doar rolului potrivit.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Platform, type Report, type Role, type User } from '../api';
import { useCurrentUser } from '../current-user';
import { Button, Card, ErrorMessage, Input, Loading, PageTitle, Select } from '../components/ui';

const tabs = [
  { id: 'reports', label: 'Raportări' },
  { id: 'users', label: 'Utilizatori' },
  { id: 'platforms', label: 'Platforme' },
] as const;

export function AdminPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('reports');
  return (
    <>
      <PageTitle subtitle="Moderare și administrare">Admin</PageTitle>
      <div className="mb-5 flex gap-1 rounded-xl bg-slate-900 p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`min-h-10 flex-1 rounded-lg text-sm font-medium ${tab === item.id ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
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
  const { userId } = useCurrentUser();
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
                <Link to={`/users/${report.reporter_id}`} className="text-indigo-300">@{report.reporter_username}</Link>
                {' a raportat pe '}
                <Link to={`/users/${report.target_user_id}`} className="text-indigo-300">@{report.target_username}</Link>
              </p>
              <p className="mt-1 text-slate-300">„{report.reason}”</p>
              <p className="mt-1 text-xs text-slate-500">
                {new Date(report.created_at).toLocaleString('ro-RO')}
                {report.resolution_note && ` · ${report.resolution_note}`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {report.status === 'open' && (
                  <>
                    <Button onClick={() => mutate.mutate({
                      path: `/reports/${report.id}`, method: 'PATCH',
                      body: { status: 'resolved', resolved_by: userId, resolution_note: 'Utilizator ascuns din clasamente.' },
                    })}>
                      Rezolvă (ascunde userul)
                    </Button>
                    <Button variant="secondary" onClick={() => mutate.mutate({
                      path: `/reports/${report.id}`, method: 'PATCH',
                      body: { status: 'rejected', resolved_by: userId, resolution_note: 'Nu am găsit dovezi.' },
                    })}>
                      Respinge
                    </Button>
                  </>
                )}
                <Button variant="danger" onClick={() => mutate.mutate({ path: `/reports/${report.id}`, method: 'DELETE' })}>Șterge</Button>
              </div>
            </Card>
          ))}
          {reports.data?.length === 0 && <p className="text-sm text-slate-400">Nicio raportare.</p>}
        </div>
      )}
    </>
  );
}

function UsersSection() {
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
      <Card className="mb-4">
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
      </Card>

      <Input placeholder="Caută după username…" value={search} onChange={(event) => setSearch(event.target.value)} className="mb-4" />
      <ErrorMessage error={users.error ?? mutate.error} />

      {users.isPending ? <Loading /> : (
        <Card className="p-0">
          <ul className="divide-y divide-slate-800">
            {users.data?.map((user) => (
              <li key={user.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <Link to={`/users/${user.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">@{user.username}</p>
                  <p className="truncate text-xs text-slate-400">#{user.id} · {user.email ?? 'fără email'}</p>
                </Link>
                <Select
                  value={user.role}
                  onChange={(event) => mutate.mutate({ path: `/users/${user.id}`, method: 'PATCH', body: { role: event.target.value as Role } })}
                >
                  <option value="user">user</option>
                  <option value="moderator">moderator</option>
                  <option value="admin">admin</option>
                </Select>
                <Button variant="secondary" onClick={() => mutate.mutate({ path: `/users/${user.id}`, method: 'PATCH', body: { is_banned: !user.is_banned } })}>
                  {user.is_banned ? 'Debanează' : 'Banează'}
                </Button>
                <Button variant="secondary" onClick={() => mutate.mutate({ path: `/users/${user.id}`, method: 'PATCH', body: { hidden_from_leaderboards: !user.hidden_from_leaderboards } })}>
                  {user.hidden_from_leaderboards ? 'Arată în clasament' : 'Ascunde din clasament'}
                </Button>
                <Button variant="danger" onClick={() => confirm(`Ștergi @${user.username} cu tot cu datele lui?`) && mutate.mutate({ path: `/users/${user.id}`, method: 'DELETE' })}>
                  Șterge
                </Button>
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
        <ul className="divide-y divide-slate-800">
          {platforms.data?.map((platform) => (
            <li key={platform.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="w-16 font-mono text-sm text-slate-400">{platform.code}</span>
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
      <p className="mb-4 text-xs text-slate-500">
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

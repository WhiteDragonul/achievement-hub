// Administrare, în trei secțiuni: raportări și utilizatori (moderator: suspendare / ascundere; admin: și roluri, ștergere),
// platforme (doar admin). Ce nu are voie rolul curent nu apare; API-ul verifică oricum fiecare cerere (403).
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, download, type Platform, type Report, type Role, type User } from '../api';
import { useCurrentUser } from '../auth';
import { Avatar, Button, Card, Empty, ErrorMessage, Field, Icon, Input, Loading, PageTitle, SectionTitle, Segmented, Select } from '../components/ui';

type Tab = 'reports' | 'users' | 'platforms';

export function AdminPage() {
  const { isModerator, isAdmin } = useCurrentUser();
  const [tab, setTab] = useState<Tab>('reports');
  const [error, setError] = useState<unknown>(null);
  if (!isModerator) return <ErrorMessage error={new Error('This page is only available to moderators and admins.')} />;

  const tabs: { id: Tab; label: string }[] = [{ id: 'reports', label: 'Reports' }, { id: 'users', label: 'Users' }];
  if (isAdmin) tabs.push({ id: 'platforms', label: 'Platforms' });

  return (
    <>
      <PageTitle
        eyebrow={isAdmin ? 'Administrator' : 'Moderator'}
        subtitle={isAdmin ? 'Reports, accounts and platforms. Every action is also checked by the API (403).' : 'Reports and accounts. Every action is also checked by the API (403).'}
        actions={
          <Button variant="secondary" onClick={() => download('/exports/overview.pdf', 'achievement-hub-report.pdf').catch(setError)}>
            <Icon name="download" className="h-4 w-4" /> PDF report
          </Button>
        }
      >
        Administration
      </PageTitle>
      <ErrorMessage error={error} />
      <Segmented options={tabs} value={tab} onChange={setTab} className="mb-8 max-w-md" />
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
      <Select value={status} onChange={(event) => setStatus(event.target.value)} className="mb-5 w-48" aria-label="Report status">
        <option value="open">Open</option>
        <option value="resolved">Resolved</option>
        <option value="rejected">Rejected</option>
      </Select>
      <ErrorMessage error={reports.error ?? mutate.error} />
      {reports.isPending ? <Loading /> : (
        <div className="space-y-3">
          {reports.data?.map((report) => (
            <Card key={report.id} className="!p-0">
              <div className="px-5 pt-5">
                <p className="eyebrow mb-3 flex flex-wrap gap-x-3">
                  <span>#{report.id}</span>
                  <span>{new Date(report.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </p>
                <p className="text-sm text-muted">
                  <Link to={`/users/${report.reporter_id}`} className="font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg">@{report.reporter_username}</Link>
                  {' reported '}
                  <Link to={`/users/${report.target_user_id}`} className="font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg">@{report.target_username}</Link>
                </p>
                <blockquote className="mt-3 border-l-2 border-gold/50 pl-4 font-display font-extrabold tracking-[-0.03em] text-xl leading-snug text-fg">„{report.reason}”</blockquote>
                {report.resolution_note && <p className="mt-3 text-xs text-faint">Note: {report.resolution_note}</p>}
              </div>
              <div className="mt-5 flex flex-wrap gap-2 border-t border-line px-5 py-3">
                {report.status === 'open' && (
                  <>
                    <Button size="sm" onClick={() => mutate.mutate({
                      path: `/reports/${report.id}`, method: 'PATCH',
                      body: { status: 'resolved', resolution_note: 'User hidden from leaderboards.' },
                    })}>
                      Resolve (hide user)
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => mutate.mutate({
                      path: `/reports/${report.id}`, method: 'PATCH',
                      body: { status: 'rejected', resolution_note: 'No evidence found.' },
                    })}>
                      Reject
                    </Button>
                  </>
                )}
                {isAdmin && (
                  <Button size="sm" variant="ghost" className="ml-auto hover:!text-danger" onClick={() => mutate.mutate({ path: `/reports/${report.id}`, method: 'DELETE' })}>Delete</Button>
                )}
              </div>
            </Card>
          ))}
          {reports.data?.length === 0 && <div className="panel rounded-3xl"><Empty icon="flag" title="No reports">Nothing to moderate in this category.</Empty></div>}
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
      {isAdmin && <Card className="mb-8">
        <SectionTitle>New user</SectionTitle>
        <form onSubmit={createUser} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_9rem_auto]">
          <Field label="Username"><Input name="username" required /></Field>
          <Field label="Email"><Input name="email" type="email" /></Field>
          <Field label="Password" hint="min. 8"><Input name="password" type="password" autoComplete="new-password" /></Field>
          <Field label="Role">
            <Select name="role" defaultValue="user">
              <option value="user">user</option>
              <option value="moderator">moderator</option>
              <option value="admin">admin</option>
            </Select>
          </Field>
          <Button type="submit" className="!min-h-11">Create</Button>
        </form>
      </Card>}

      <div className="relative mb-5 max-w-sm">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input type="search" aria-label="Search by username" placeholder="Search by username" value={search} onChange={(event) => setSearch(event.target.value)} className="!pl-10" />
      </div>
      <ErrorMessage error={users.error ?? mutate.error} />

      {users.isPending ? <Loading /> : (
        <Card className="!p-0">
          <ul>
            {users.data?.map((user) => (
              <li key={user.id} className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 last:border-b-0 sm:px-5">
                <Link to={`/users/${user.id}`} className="group flex min-w-0 flex-1 basis-56 items-center gap-3">
                  <Avatar name={user.display_name ?? user.username} url={user.avatar_url} size={34} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 truncate text-sm font-medium group-hover:text-white">
                      @{user.username}
                      {user.is_banned && <span className="eyebrow !text-danger">banned</span>}
                      {user.hidden_from_leaderboards && <span className="eyebrow">hidden</span>}
                    </span>
                    <span className="num block truncate text-[11px] text-faint">#{user.id} · {user.email ?? 'no email'}</span>
                  </span>
                </Link>
                {isAdmin ? (
                  <Select
                    aria-label={`Role of ${user.username}`}
                    className="w-36"
                    value={user.role}
                    onChange={(event) => mutate.mutate({ path: `/users/${user.id}`, method: 'PATCH', body: { role: event.target.value as Role } })}
                  >
                    <option value="user">user</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </Select>
                ) : (
                  <span className="eyebrow rounded-md border border-line px-2 py-1">{user.role}</span>
                )}
                <Button size="sm" variant="secondary" onClick={() => mutate.mutate({ path: `/users/${user.id}`, method: 'PATCH', body: { is_banned: !user.is_banned } })}>
                  {user.is_banned ? 'Unban' : 'Ban'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => mutate.mutate({ path: `/users/${user.id}`, method: 'PATCH', body: { hidden_from_leaderboards: !user.hidden_from_leaderboards } })}>
                  {user.hidden_from_leaderboards ? 'Show on leaderboard' : 'Hide'}
                </Button>
                {isAdmin && (
                  <Button size="sm" variant="ghost" className="hover:!text-danger" onClick={() => confirm(`Delete @${user.username} and all of their data?`) && mutate.mutate({ path: `/users/${user.id}`, method: 'DELETE' })}>
                    Delete
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
      <Card className="mb-3 !p-0">
        <ul>
          {platforms.data?.map((platform) => (
            <li key={platform.id} className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 last:border-b-0 sm:px-5">
              <span className="num w-16 text-sm text-muted">{platform.code}</span>
              <Input
                aria-label={`Name of platform ${platform.code}`}
                defaultValue={platform.name}
                className="max-w-xs flex-1"
                onBlur={(event) => event.target.value !== platform.name &&
                  mutate.mutate({ path: `/platforms/${platform.id}`, method: 'PATCH', body: { name: event.target.value } })}
              />
              <Button size="sm" variant="secondary" title="Toggle between real and mock provider" onClick={() => mutate.mutate({ path: `/platforms/${platform.id}`, method: 'PATCH', body: { is_mock: !platform.is_mock } })}>
                <span className={`h-1.5 w-1.5 rounded-full ${platform.is_mock ? 'bg-faint' : 'bg-success'}`} />
                {platform.is_mock ? 'Mock' : 'Real'}
              </Button>
              <Button size="sm" variant="ghost" className="hover:!text-danger" onClick={() => mutate.mutate({ path: `/platforms/${platform.id}`, method: 'DELETE' })}>Delete</Button>
            </li>
          ))}
        </ul>
      </Card>
      <p className="mb-8 text-xs text-faint">
        A platform with accounts or games cannot be deleted (ON DELETE RESTRICT): try it and see the database error.
      </p>
      <Card>
        <SectionTitle>New platform</SectionTitle>
        <form onSubmit={createPlatform} className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <Field label="Code"><Input name="code" placeholder="e.g. gog" required /></Field>
          <Field label="Name"><Input name="name" required /></Field>
          <Button type="submit" className="!min-h-11">Add</Button>
        </form>
      </Card>
    </>
  );
}

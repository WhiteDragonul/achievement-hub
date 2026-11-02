// Prietenii userului curent: cereri primite (accept / refuz), cereri trimise, prieteni, adăugare după username.
import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Friendship, type User } from '../api';
import { useCurrentUser } from '../current-user';
import { Button, Card, ErrorMessage, Input, Loading, PageTitle } from '../components/ui';

export function FriendsPage() {
  const { userId } = useCurrentUser();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const friendships = useQuery({
    queryKey: ['friendships', userId],
    queryFn: () => api<Friendship[]>(`/friendships?user_id=${userId}&limit=100`),
  });
  const results = useQuery({
    queryKey: ['user-search', search],
    queryFn: () => api<User[]>(`/users?search=${encodeURIComponent(search)}&limit=5`),
    enabled: search.length >= 2,
  });

  const mutate = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) => api(path, { method, body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friendships'] }),
  });

  if (friendships.isPending) return <Loading />;
  const all = friendships.data ?? [];
  const incoming = all.filter((f) => f.status === 'pending' && f.addressee_id === userId);
  const outgoing = all.filter((f) => f.status === 'pending' && f.requester_id === userId);
  const friends = all.filter((f) => f.status === 'accepted');

  // Celălalt user dintr-o prietenie (cererea poate fi trimisă sau primită).
  const other = (f: Friendship) =>
    f.requester_id === userId ? { id: f.addressee_id, username: f.addressee_username } : { id: f.requester_id, username: f.requester_username };
  const pairPath = (f: Friendship) => `/friendships/${f.requester_id}/${f.addressee_id}`;

  return (
    <>
      <PageTitle subtitle={`${friends.length} prieteni`}>Prieteni</PageTitle>
      <ErrorMessage error={friendships.error ?? mutate.error} />

      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">Adaugă un prieten</h2>
        <Input placeholder="Caută după username…" value={search} onChange={(event) => setSearch(event.target.value)} />
        <ul className="mt-2 divide-y divide-slate-800">
          {results.data?.filter((user) => user.id !== userId).map((user) => (
            <li key={user.id} className="flex items-center justify-between py-2">
              <span>@{user.username}</span>
              <Button variant="secondary" onClick={() => mutate.mutate({ path: '/friendships', method: 'POST', body: { requester_id: userId, addressee_id: user.id } })}>
                Trimite cerere
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      {incoming.length > 0 && (
        <Section title="Cereri primite">
          {incoming.map((f) => (
            <FriendRow key={pairPath(f)} {...other(f)}>
              <Button onClick={() => mutate.mutate({ path: pairPath(f), method: 'PATCH', body: { status: 'accepted' } })}>Acceptă</Button>
              <Button variant="danger" onClick={() => mutate.mutate({ path: pairPath(f), method: 'DELETE' })}>Refuză</Button>
            </FriendRow>
          ))}
        </Section>
      )}

      {outgoing.length > 0 && (
        <Section title="Cereri trimise">
          {outgoing.map((f) => (
            <FriendRow key={pairPath(f)} {...other(f)}>
              <Button variant="secondary" onClick={() => mutate.mutate({ path: pairPath(f), method: 'DELETE' })}>Anulează</Button>
            </FriendRow>
          ))}
        </Section>
      )}

      <Section title="Prieteni">
        {friends.map((f) => (
          <FriendRow key={pairPath(f)} {...other(f)}>
            <Button variant="danger" onClick={() => confirm('Ștergi prietenia?') && mutate.mutate({ path: pairPath(f), method: 'DELETE' })}>
              Șterge
            </Button>
          </FriendRow>
        ))}
        {friends.length === 0 && <p className="px-4 py-3 text-sm text-slate-400">Încă nu ai prieteni.</p>}
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <Card className="mb-6 p-0"><ul className="divide-y divide-slate-800">{children}</ul></Card>
    </>
  );
}

function FriendRow({ id, username, children }: { id: number; username: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-3">
      <Link to={`/users/${id}`} className="flex-1 font-medium hover:text-indigo-300">@{username}</Link>
      {children}
    </li>
  );
}

// Prietenii userului curent: cereri primite (accept / refuz), cereri trimise, prieteni, adăugare după username.
import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Friendship, type User } from '../api';
import { useCurrentUser } from '../auth';
import { Avatar, Button, Card, Empty, ErrorMessage, Icon, Input, Loading, PageTitle, SectionTitle } from '../components/ui';

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
      <PageTitle eyebrow="Social" subtitle="Compare your progress with friends on their own leaderboard.">
        Friends
      </PageTitle>
      <ErrorMessage error={friendships.error ?? mutate.error} />

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          {incoming.length > 0 && (
            <Section title="Incoming requests" count={incoming.length} highlight>
              {incoming.map((f) => (
                <FriendRow key={pairPath(f)} {...other(f)} note="wants to be friends">
                  <Button size="sm" onClick={() => mutate.mutate({ path: pairPath(f), method: 'PATCH', body: { status: 'accepted' } })}>Accept</Button>
                  <Button size="sm" variant="ghost" onClick={() => mutate.mutate({ path: pairPath(f), method: 'DELETE' })}>Decline</Button>
                </FriendRow>
              ))}
            </Section>
          )}

          <Section title="Friends" count={friends.length}>
            {friends.map((f) => (
              <FriendRow key={pairPath(f)} {...other(f)}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="hover:!text-danger"
                  onClick={() => confirm('Remove this friend?') && mutate.mutate({ path: pairPath(f), method: 'DELETE' })}
                >
                  Remove
                </Button>
              </FriendRow>
            ))}
            {friends.length === 0 && (
              <li><Empty icon="friends" title="No friends yet">Search for a player by username and send them a request.</Empty></li>
            )}
          </Section>

          {outgoing.length > 0 && (
            <Section title="Sent requests" count={outgoing.length}>
              {outgoing.map((f) => (
                <FriendRow key={pairPath(f)} {...other(f)} note="pending">
                  <Button size="sm" variant="ghost" onClick={() => mutate.mutate({ path: pairPath(f), method: 'DELETE' })}>Cancel</Button>
                </FriendRow>
              ))}
            </Section>
          )}
        </div>

        {/* Căutarea stă lângă listă pe desktop și deasupra ei pe telefon. */}
        <aside className="order-first lg:order-none">
          <Card className="lg:sticky lg:top-14">
            <SectionTitle>Add a friend</SectionTitle>
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-faint" />
              <Input
                type="search"
                aria-label="Search by username"
                placeholder="username"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="!pl-10"
              />
            </div>
            {search.length > 0 && search.length < 2 && <p className="mt-2 text-xs text-faint">Type at least 2 characters.</p>}
            <ul className="mt-3 space-y-1">
              {results.data?.filter((user) => user.id !== userId).map((user) => (
                <li key={user.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                  <Avatar name={user.display_name ?? user.username} url={user.avatar_url} size={30} />
                  <span className="min-w-0 flex-1 truncate text-sm">@{user.username}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Send a request to ${user.username}`}
                    onClick={() => mutate.mutate({ path: '/friendships', method: 'POST', body: { requester_id: userId, addressee_id: user.id } })}
                  >
                    <Icon name="plus" className="h-4 w-4" />
                  </Button>
                </li>
              ))}
              {results.data && results.data.filter((user) => user.id !== userId).length === 0 && (
                <li className="py-2 text-sm text-faint">No players found.</li>
              )}
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Section({ title, count, highlight = false, children }: { title: string; count: number; highlight?: boolean; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <SectionTitle aside={count}>{title}</SectionTitle>
      <ul className={`panel overflow-hidden rounded-3xl ${highlight ? '!border-gold/25' : ''}`}>{children}</ul>
    </section>
  );
}

function FriendRow({ id, username, note, children }: { id: number; username: string; note?: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:px-5">
      <Link to={`/users/${id}`} className="group flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={username} size={36} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium group-hover:text-white">@{username}</span>
          {note && <span className="block text-xs text-faint">{note}</span>}
        </span>
      </Link>
      <div className="flex shrink-0 gap-1.5">{children}</div>
    </li>
  );
}

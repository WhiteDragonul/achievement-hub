// Load test k6 pentru API (etapa 4). Rulare:
//   k6 run -e API_URL=http://localhost:3000 loadtest/api.js
// Fiecare utilizator virtual (VU) se loghează o dată (setup), apoi repetă scenariul unui jucător obișnuit:
// clasamentul global, un profil, biblioteca și achievement-urile unui joc.
import http from 'k6/http';
import { check, sleep } from 'k6';

const API = `${__ENV.API_URL ?? 'http://localhost:3000'}/api`;

export const options = {
  scenarios: {
    jucatori: {
      executor: 'ramping-vus',
      stages: [
        { duration: '20s', target: 20 },  // urcare
        { duration: '60s', target: 50 },  // încărcare constantă
        { duration: '10s', target: 0 },   // coborâre
      ],
    },
  },
  // Pragurile fac testul să „pice” dacă API-ul e prea lent sau dă erori.
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:leaderboard}': ['p(95)<800'],
    'http_req_duration{name:profile}': ['p(95)<500'],
    'http_req_duration{name:library}': ['p(95)<500'],
    'http_req_duration{name:game_achievements}': ['p(95)<500'],
  },
};

// O singură autentificare pentru tot testul: argon2 e lent intenționat, deci nu îl măsurăm la fiecare iterație.
export function setup() {
  const response = http.post(`${API}/auth/login`, JSON.stringify({
    email: 'demo@achievementhub.test',
    password: __ENV.PASSWORD ?? 'Parola123!',
  }), { headers: { 'Content-Type': 'application/json' } });
  check(response, { 'login 200': (r) => r.status === 200 });
  return { token: response.json('access_token') };
}

export default function ({ token }) {
  const params = (name) => ({ headers: { Authorization: `Bearer ${token}` }, tags: { name } });
  // Userii din fixtures au id-uri 1..5003; alegem unul la întâmplare ca să nu lovim mereu același cache.
  const userId = 4 + Math.floor(Math.random() * 5000);

  const leaderboard = http.get(`${API}/leaderboard?limit=20`, params('leaderboard'));
  check(leaderboard, { 'leaderboard 200': (r) => r.status === 200 });

  const profile = http.get(`${API}/users/${userId}/profile`, params('profile'));
  check(profile, { 'profile 200': (r) => r.status === 200 });

  const library = http.get(`${API}/users/${userId}/games?limit=12`, params('library'));
  check(library, { 'library 200': (r) => r.status === 200 });

  const games = library.json();
  if (Array.isArray(games) && games.length > 0) {
    const game = games[Math.floor(Math.random() * games.length)];
    const achievements = http.get(`${API}/games/${game.game_id}/achievements?user_id=${userId}`, params('game_achievements'));
    check(achievements, { 'achievements 200': (r) => r.status === 200 });
  }

  sleep(1); // un om nu dă click non-stop
}

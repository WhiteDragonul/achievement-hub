// `npm run db:explain`: măsoară efectul indecșilor din 007 și al clasamentului precalculat din 008 (etapa 4).
// Pentru fiecare caz rulează EXPLAIN (ANALYZE, BUFFERS) de 5 ori „înainte” și de 5 ori „după” și afișează mediana.
//
// „Înainte” fără să stricăm baza: fiecare rulare e o tranzacție BEGIN → DROP INDEX → EXPLAIN ANALYZE → ROLLBACK.
// În Postgres și DDL-ul e tranzacțional, deci ROLLBACK readuce indexul ca și cum n-ar fi fost șters
// (atenție: cât durează tranzacția, tabelul e blocat: rulați scriptul când aplicația nu e sub încărcare).
// Același ROLLBACK anulează și DELETE-ul măsurat în cazul 2.
import { pool } from '../db/db.js';

type Case = {
  title: string;
  before: { setup?: string; query: string };
  after: { query: string };
};

const RUNS = 5;

async function measure(setup: string | undefined, query: string) {
  const times: number[] = [];
  let plan: string[] = [];
  for (let i = 0; i < RUNS; i++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (setup) await client.query(setup);
      const { rows } = await client.query(`EXPLAIN (ANALYZE, BUFFERS) ${query}`);
      plan = rows.map((row) => row['QUERY PLAN'] as string);
      // Execution Time include și timpul triggerelor de FK (ON DELETE CASCADE din cazul 2).
      const total = plan.find((line) => line.startsWith('Execution Time'))!;
      times.push(Number(/([\d.]+) ms/.exec(total)![1]));
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(RUNS / 2)], plan };
}

// Liniile relevante din plan: tipul de scanare / join / agregare și timpii, fără detaliile de cost.
// Prima linie „Buffers” = câte pagini de 8 KB a citit toată interogarea.
const summarize = (plan: string[]) => [
  ...plan.filter((line) => /Scan|Join|Aggregate|Trigger|BitmapOr|Execution Time/.test(line))
    .map((line) => line.replace(/\(cost=[^)]*\)\s*/, '')),
  `Pagini citite: ${/shared hit=(\d+)(?: read=(\d+))?/.exec(plan.find((line) => line.includes('Buffers:')) ?? '')?.slice(1).filter(Boolean).map(Number).reduce((a, b) => a + b, 0) ?? '?'}`,
];

async function pick(sqlText: string): Promise<number> {
  const { rows } = await pool.query(sqlText);
  return Number(Object.values(rows[0])[0]);
}

// Valori reale din baza curentă (cele mai „populare”), ca diferența să fie vizibilă și pe fixtures.
const achievementId = await pick(`SELECT achievement_id FROM user_achievements GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`);
const friendUserId = await pick(`SELECT addressee_id FROM friendships GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`);
const accountId = await pick(`SELECT platform_account_id FROM sync_runs GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`);

const oldLeaderboard = `
  SELECT rank() OVER (ORDER BY sum(CASE a.rarity WHEN 'ultra_rare' THEN 50 WHEN 'very_rare' THEN 20 WHEN 'rare' THEN 5 ELSE 1 END) DESC) AS rank,
         u.id, u.username, count(*) AS achievements,
         sum(CASE a.rarity WHEN 'ultra_rare' THEN 50 WHEN 'very_rare' THEN 20 WHEN 'rare' THEN 5 ELSE 1 END) AS score
  FROM users u
  JOIN platform_accounts pa ON pa.user_id = u.id
  JOIN user_achievements ua ON ua.platform_account_id = pa.id
  JOIN achievements a ON a.id = ua.achievement_id
  WHERE NOT u.hidden_from_leaderboards AND NOT u.is_banned
  GROUP BY u.id ORDER BY score DESC, u.id LIMIT 20`;
const newLeaderboard = `
  SELECT rank() OVER (ORDER BY sum(s.score) DESC) AS rank,
         u.id, u.username, sum(s.achievements) AS achievements, sum(s.score) AS score
  FROM leaderboard_scores s
  JOIN users u ON u.id = s.user_id
  WHERE NOT u.hidden_from_leaderboards AND NOT u.is_banned
  GROUP BY u.id ORDER BY score DESC, u.id LIMIT 20`;

const cases: Case[] = [
  {
    title: `1. Câți jucători au deblocat un achievement (achievement_id = ${achievementId}): index user_achievements_achievement_idx`,
    before: { setup: 'DROP INDEX user_achievements_achievement_idx', query: `SELECT count(*) FROM user_achievements WHERE achievement_id = ${achievementId}` },
    after: { query: `SELECT count(*) FROM user_achievements WHERE achievement_id = ${achievementId}` },
  },
  {
    title: `2. Ștergerea unui achievement (ON DELETE CASCADE în user_achievements): același index`,
    before: { setup: 'DROP INDEX user_achievements_achievement_idx', query: `DELETE FROM achievements WHERE id = ${achievementId}` },
    after: { query: `DELETE FROM achievements WHERE id = ${achievementId}` },
  },
  {
    title: `3. Prieteniile unui user (requester_id = X OR addressee_id = X, X = ${friendUserId}): index friendships_addressee_idx`,
    before: { setup: 'DROP INDEX friendships_addressee_idx', query: `SELECT * FROM friendships WHERE requester_id = ${friendUserId} OR addressee_id = ${friendUserId}` },
    after: { query: `SELECT * FROM friendships WHERE requester_id = ${friendUserId} OR addressee_id = ${friendUserId}` },
  },
  {
    title: `4. Ultimele 5 sincronizări ale unui cont (platform_account_id = ${accountId}): index sync_runs_account_created_idx`,
    before: {
      setup: 'DROP INDEX sync_runs_account_created_idx',
      query: `SELECT * FROM sync_runs WHERE platform_account_id = ${accountId} ORDER BY created_at DESC LIMIT 5`,
    },
    after: { query: `SELECT * FROM sync_runs WHERE platform_account_id = ${accountId} ORDER BY created_at DESC LIMIT 5` },
  },
  {
    title: '5. Clasamentul global (top 20): agregare pe toate deblocările vs. materialized view leaderboard_scores',
    before: { query: oldLeaderboard },
    after: { query: newLeaderboard },
  },
];

const summary: string[] = ['| Caz | Înainte (ms) | După (ms) | De câte ori mai rapid |', '|---|---:|---:|---:|'];
for (const item of cases) {
  // ANALYZE actualizează statisticile, ca planificatorul să aleagă pe baza datelor reale.
  await pool.query('ANALYZE');
  const before = await measure(item.before.setup, item.before.query);
  const after = await measure(undefined, item.after.query);
  console.log(`\n### ${item.title}\n`);
  console.log('Înainte:\n```');
  console.log(summarize(before.plan).join('\n'));
  console.log('```\nDupă:\n```');
  console.log(summarize(after.plan).join('\n'));
  console.log('```');
  console.log(`Mediană din ${RUNS} rulări: **${before.median.toFixed(3)} ms → ${after.median.toFixed(3)} ms**`);
  summary.push(`| ${item.title.split(': ')[0]} | ${before.median.toFixed(3)} | ${after.median.toFixed(3)} | ${(before.median / after.median).toFixed(0)}× |`);
}
console.log(`\n## Rezumat\n\n${summary.join('\n')}`);
await pool.end();

// Execută o sincronizare (un rând din sync_runs): ia datele de la provider și le scrie în DB.
// Statusul trece prin queued → running → succeeded / failed; CHECK-urile din sync_runs păzesc consistența.
import { sql } from 'kysely';
import { config } from '../config.js';
import { db } from '../db/db.js';
import { getProvider } from './providers.js';

export async function runSync(syncRunId: number): Promise<void> {
  const run = await db.selectFrom('sync_runs')
    .innerJoin('platform_accounts as pa', 'pa.id', 'sync_runs.platform_account_id')
    .innerJoin('platforms', 'platforms.id', 'pa.platform_id')
    .select([
      'sync_runs.id', 'pa.id as account_id', 'pa.platform_id', 'pa.external_id', 'platforms.code', 'platforms.is_mock',
      // Tokenul se decriptează în Postgres, cu cheia trimisă ca parametru (D7).
      sql<string | null>`pgp_sym_decrypt(pa.access_token_enc, ${config.tokenEncryptionKey})`.as('access_token'),
    ])
    .where('sync_runs.id', '=', syncRunId)
    .executeTakeFirst();
  if (!run) return; // contul a fost dezlegat între timp (sync_runs a dispărut prin CASCADE)

  await db.updateTable('sync_runs').set({ status: 'running', started_at: new Date() }).where('id', '=', run.id).execute();

  try {
    const library = await getProvider(run.code, run.is_mock).fetchLibrary({
      platform_id: run.platform_id, external_id: run.external_id, access_token: run.access_token,
    });

    let newUnlocks = 0;
    // O singură tranzacție: dacă scrierea pică la jumătate, progresul rămâne cel de dinainte de sync.
    await db.transaction().execute(async (trx) => {
      for (const game of library) {
        // UPSERT: jocul poate exista deja în catalog (adus de alt user); actualizăm doar titlul / iconul.
        const { id: gameId } = await trx.insertInto('games')
          .values({ platform_id: run.platform_id, external_id: game.external_id, title: game.title, icon_url: game.icon_url })
          .onConflict((oc) => oc.columns(['platform_id', 'external_id']).doUpdateSet({
            title: (eb) => eb.ref('excluded.title'),
            icon_url: (eb) => eb.ref('excluded.icon_url'),
          }))
          .returning('id')
          .executeTakeFirstOrThrow();

        await trx.insertInto('user_games')
          .values({
            platform_account_id: run.account_id, game_id: gameId,
            playtime_minutes: game.playtime_minutes, last_played_at: game.last_played_at,
          })
          .onConflict((oc) => oc.columns(['platform_account_id', 'game_id']).doUpdateSet({
            playtime_minutes: (eb) => eb.ref('excluded.playtime_minutes'),
            last_played_at: (eb) => eb.ref('excluded.last_played_at'),
          }))
          .execute();

        if (game.achievements.length === 0) continue;

        // Toate achievement-urile jocului într-un singur INSERT (o cerere, nu zeci).
        const saved = await trx.insertInto('achievements')
          .values(game.achievements.map((a) => ({
            game_id: gameId, external_id: a.external_id, name: a.name, description: a.description,
            icon_url: a.icon_url, is_hidden: a.is_hidden, global_unlock_pct: a.global_unlock_pct,
          })))
          .onConflict((oc) => oc.columns(['game_id', 'external_id']).doUpdateSet({
            name: (eb) => eb.ref('excluded.name'),
            description: (eb) => eb.ref('excluded.description'),
            icon_url: (eb) => eb.ref('excluded.icon_url'),
            global_unlock_pct: (eb) => eb.ref('excluded.global_unlock_pct'),
          }))
          .returning(['id', 'external_id'])
          .execute();
        const idByExternal = new Map(saved.map((a) => [a.external_id, a.id]));

        const unlocks = game.achievements
          .filter((a) => a.unlocked_at)
          .map((a) => ({ platform_account_id: run.account_id, achievement_id: idByExternal.get(a.external_id)!, unlocked_at: a.unlocked_at! }));
        if (unlocks.length > 0) {
          // DO NOTHING: un achievement deja deblocat își păstrează data inițială; numărăm doar cele noi.
          const inserted = await trx.insertInto('user_achievements').values(unlocks)
            .onConflict((oc) => oc.doNothing())
            .returning('achievement_id')
            .execute();
          newUnlocks += inserted.length;
        }
      }
      await trx.updateTable('platform_accounts').set({ last_synced_at: new Date() }).where('id', '=', run.account_id).execute();
    });

    await db.updateTable('sync_runs')
      .set({ status: 'succeeded', finished_at: new Date(), games_synced: library.length, achievements_synced: newUnlocks })
      .where('id', '=', run.id)
      .execute();
  } catch (error) {
    await db.updateTable('sync_runs')
      .set({ status: 'failed', finished_at: new Date(), error_message: (error as Error).message.slice(0, 500) })
      .where('id', '=', run.id)
      .execute();
  }
}

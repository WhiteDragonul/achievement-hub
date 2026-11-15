// Rapoarte (etapa 5, D39–D41):
//  - CSV   — achievement-urile deblocate ale unui user, generate direct de Postgres cu COPY ... TO STDOUT și trimise
//            ca stream: serverul nu ține tot fișierul în memorie, oricât de mare ar fi;
//  - Excel — biblioteca unui user (foaie „Jocuri”) + rezumat pe raritate (foaie „Raritate”), cu exceljs;
//  - PDF   — raport de ansamblu pentru moderatori: volume, platforme, top 10, raritate, moderare, sincronizări (pdfkit).
import type { FastifyInstance } from 'fastify';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { to as copyTo } from 'pg-copy-streams';
import { sql } from 'kysely';
import { assertSelf, requireRole } from '../auth.js';
import { db, pool } from '../db/db.js';
import { idParams, type IdParams } from './common.js';

// Fontul standard din PDF (Helvetica) nu are ă, ș, ț; folosim DejaVu Sans, inclus ca pachet npm.
const require = createRequire(import.meta.url);
const FONT = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const FONT_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

const rarityLabels: Record<string, string> = {
  ultra_rare: 'Ultra rar', very_rare: 'Foarte rar', rare: 'Rar', common: 'Comun',
};

export async function exportsRoutes(app: FastifyInstance) {
  // ---- CSV prin COPY ----
  app.get<{ Params: IdParams }>('/exports/users/:id/achievements.csv', { schema: { params: idParams } }, async (request, reply) => {
    assertSelf(request, request.params.id);

    // COPY nu acceptă parametri ($1), deci id-ul e pus direct în text. E sigur: schema rutei garantează
    // că e un număr întreg (Fastify a respins deja orice altceva cu 400).
    const userId = Number(request.params.id);
    const copySql = `
      COPY (
        SELECT p.name AS platforma, g.title AS joc, a.name AS achievement, a.rarity AS raritate,
               a.global_unlock_pct AS procent_global, to_char(ua.unlocked_at, 'YYYY-MM-DD HH24:MI') AS deblocat_la
        FROM platform_accounts pa
        JOIN platforms p          ON p.id = pa.platform_id
        JOIN user_achievements ua ON ua.platform_account_id = pa.id
        JOIN achievements a       ON a.id = ua.achievement_id
        JOIN games g              ON g.id = a.game_id
        WHERE pa.user_id = ${userId}
        ORDER BY ua.unlocked_at DESC
      ) TO STDOUT WITH (FORMAT csv, HEADER true)`;

    const client = await pool.connect();
    const stream = client.query(copyTo(copySql));
    // Conexiunea se întoarce în pool când stream-ul s-a terminat (sau a eșuat).
    stream.on('end', () => client.release());
    stream.on('error', (error) => client.release(error));

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="achievements-${userId}.csv"`)
      .send(stream);
  });

  // ---- Excel ----
  app.get<{ Params: IdParams }>('/exports/users/:id/library.xlsx', { schema: { params: idParams } }, async (request, reply) => {
    assertSelf(request, request.params.id);
    const userId = request.params.id;

    const games = await sql<{
      platforma: string; joc: string; minute: number; ultima_data: Date | null; deblocate: number; total: number;
    }>`
      SELECT p.name AS platforma, g.title AS joc, ug.playtime_minutes AS minute, ug.last_played_at AS ultima_data,
             count(ua.achievement_id) AS deblocate,
             (SELECT count(*) FROM achievements x WHERE x.game_id = g.id) AS total
      FROM platform_accounts pa
      JOIN platforms p   ON p.id = pa.platform_id
      JOIN user_games ug ON ug.platform_account_id = pa.id
      JOIN games g       ON g.id = ug.game_id
      LEFT JOIN achievements a       ON a.game_id = g.id
      LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.platform_account_id = pa.id
      WHERE pa.user_id = ${userId}
      GROUP BY p.name, g.id, ug.playtime_minutes, ug.last_played_at
      ORDER BY ug.playtime_minutes DESC
    `.execute(db);

    const rarity = await sql<{ rarity: string | null; n: number }>`
      SELECT a.rarity, count(*) AS n
      FROM platform_accounts pa
      JOIN user_achievements ua ON ua.platform_account_id = pa.id
      JOIN achievements a       ON a.id = ua.achievement_id
      WHERE pa.user_id = ${userId}
      GROUP BY a.rarity
      ORDER BY n DESC
    `.execute(db);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Achievement Hub';

    const sheet = workbook.addWorksheet('Jocuri', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
      { header: 'Platformă', key: 'platforma', width: 22 },
      { header: 'Joc', key: 'joc', width: 40 },
      { header: 'Ore jucate', key: 'ore', width: 12 },
      { header: 'Ultima dată', key: 'ultima_data', width: 14, style: { numFmt: 'yyyy-mm-dd' } },
      { header: 'Deblocate', key: 'deblocate', width: 11 },
      { header: 'Total', key: 'total', width: 9 },
      { header: 'Progres', key: 'progres', width: 10, style: { numFmt: '0%' } },
    ];
    games.rows.forEach((game, index) => {
      const row = index + 2; // rândul 1 e antetul
      sheet.addRow({ ...game, ore: Math.round(game.minute / 6) / 10 });
      // Progresul e formulă Excel, nu valoare calculată: se actualizează dacă cineva modifică celulele.
      sheet.getCell(`G${row}`).value = { formula: `IF(F${row}=0,0,E${row}/F${row})` };
    });
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = { from: 'A1', to: 'G1' };

    const summary = workbook.addWorksheet('Raritate');
    summary.columns = [{ header: 'Raritate', key: 'r', width: 16 }, { header: 'Achievement-uri', key: 'n', width: 16 }];
    for (const row of rarity.rows) summary.addRow({ r: row.rarity ? rarityLabels[row.rarity] : 'Necunoscută', n: row.n });
    summary.addRow({ r: 'Total', n: { formula: `SUM(B2:B${rarity.rows.length + 1})` } });
    summary.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="biblioteca-${userId}.xlsx"`)
      .send(Buffer.from(buffer));
  });

  // ---- PDF ----
  app.get('/exports/overview.pdf', { preHandler: requireRole('moderator') }, async (request, reply) => {
    const [totals, platforms, top, rarity, moderation, syncs] = await Promise.all([
      sql<{ users: number; accounts: number; games: number; achievements: number; unlocks: number }>`
        SELECT (SELECT count(*) FROM users) AS users,
               (SELECT count(*) FROM platform_accounts) AS accounts,
               (SELECT count(*) FROM games) AS games,
               (SELECT count(*) FROM achievements) AS achievements,
               (SELECT count(*) FROM user_achievements) AS unlocks
      `.execute(db),
      sql<{ name: string; accounts: number; games: number }>`
        SELECT p.name,
               (SELECT count(*) FROM platform_accounts pa WHERE pa.platform_id = p.id) AS accounts,
               (SELECT count(*) FROM games g WHERE g.platform_id = p.id) AS games
        FROM platforms p ORDER BY p.id
      `.execute(db),
      sql<{ username: string; achievements: number; score: number }>`
        SELECT u.username, count(*) AS achievements,
               sum(CASE a.rarity WHEN 'ultra_rare' THEN 50 WHEN 'very_rare' THEN 20 WHEN 'rare' THEN 5 ELSE 1 END) AS score
        FROM users u
        JOIN platform_accounts pa ON pa.user_id = u.id
        JOIN user_achievements ua ON ua.platform_account_id = pa.id
        JOIN achievements a       ON a.id = ua.achievement_id
        WHERE NOT u.hidden_from_leaderboards AND NOT u.is_banned
        GROUP BY u.id ORDER BY score DESC LIMIT 10
      `.execute(db),
      sql<{ rarity: string | null; n: number }>`
        SELECT rarity, count(*) AS n FROM achievements GROUP BY rarity ORDER BY n DESC
      `.execute(db),
      sql<{ status: string; n: number }>`SELECT status, count(*) AS n FROM reports GROUP BY status ORDER BY status`.execute(db),
      sql<{ status: string; n: number }>`SELECT status, count(*) AS n FROM sync_runs GROUP BY status ORDER BY status`.execute(db),
    ]);

    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: 'Achievement Hub — raport general' } });
    doc.registerFont('regular', FONT);
    doc.registerFont('bold', FONT_BOLD);

    const heading = (text: string) => doc.moveDown(1).font('bold').fontSize(13).fillColor('#4338ca').text(text).moveDown(0.3);
    // Tabel simplu: coloane cu lățime fixă, un rând de text per înregistrare.
    const table = (headers: string[], rows: (string | number)[][], widths: number[]) => {
      const draw = (cells: (string | number)[], font: string) => {
        const y = doc.y;
        let x = doc.page.margins.left;
        doc.font(font).fontSize(10).fillColor('#111827');
        cells.forEach((cell, i) => {
          doc.text(String(cell), x, y, { width: widths[i] - 8, lineBreak: false, ellipsis: true });
          x += widths[i];
        });
        doc.moveDown(0.4);
        doc.x = doc.page.margins.left;
      };
      draw(headers, 'bold');
      rows.forEach((row) => draw(row, 'regular'));
    };
    const number = (n: number) => n.toLocaleString('ro-RO');

    doc.font('bold').fontSize(20).fillColor('#111827').text('Achievement Hub — raport general');
    doc.font('regular').fontSize(10).fillColor('#6b7280')
      .text(`Generat la ${new Date().toLocaleString('ro-RO')} de ${request.user.username}`);

    const t = totals.rows[0];
    heading('Volume');
    table(['Utilizatori', 'Conturi legate', 'Jocuri', 'Achievement-uri', 'Deblocări'],
      [[t.users, t.accounts, t.games, t.achievements, t.unlocks].map(number)], [95, 100, 80, 110, 110]);

    heading('Platforme');
    table(['Platformă', 'Conturi', 'Jocuri'], platforms.rows.map((p) => [p.name, number(p.accounts), number(p.games)]), [200, 100, 100]);

    heading('Top 10 jucători (scor după raritate)');
    table(['#', 'Utilizator', 'Achievement-uri', 'Scor'],
      top.rows.map((row, i) => [i + 1, row.username, number(row.achievements), number(row.score)]), [30, 200, 120, 100]);

    heading('Catalogul pe raritate');
    table(['Raritate', 'Achievement-uri'],
      rarity.rows.map((r) => [r.rarity ? rarityLabels[r.rarity] : 'Necunoscută', number(r.n)]), [200, 120]);

    heading('Moderare (raportări) și sincronizări');
    table(['Raportări', 'Număr'], moderation.rows.map((r) => [r.status, number(r.n)]), [200, 120]);
    doc.moveDown(0.5);
    table(['Sincronizări', 'Număr'], syncs.rows.map((r) => [r.status, number(r.n)]), [200, 120]);

    // PDFKit scrie documentul ca stream; îl adunăm într-un Buffer ca să știm la final dacă a reușit.
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<void>((resolve) => doc.on('end', resolve));
    doc.end();
    await finished;

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', 'attachment; filename="raport-achievement-hub.pdf"')
      .send(Buffer.concat(chunks));
  });
}

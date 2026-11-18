# API: operații CRUD

Toate rutele sunt sub `/api`, primesc și întorc JSON. Listele acceptă `limit` (1–100, implicit 20) și `offset`.
Toate rutele, în afară de `/auth/*`, cer header-ul `Authorization: Bearer <token de acces>` (altfel 401);
regulile pe roluri sunt în secțiunea [Roluri](#roluri) (o operație nepermisă → 403).

| Resursă | Listă (filtre) | Citire | Creare | Modificare | Ștergere |
|---|---|---|---|---|---|
| Utilizatori | `GET /users` (`search`, `role`) | `GET /users/:id` | `POST /users` | `PATCH /users/:id` | `DELETE /users/:id` |
| Platforme | `GET /platforms` | `GET /platforms/:id` | `POST /platforms` | `PATCH /platforms/:id` | `DELETE /platforms/:id` |
| Conturi de platformă | `GET /platform-accounts` (`user_id`, `platform_id`) | `GET /platform-accounts/:id` | `POST /platform-accounts` | `PATCH /platform-accounts/:id` | `DELETE /platform-accounts/:id` |
| Jocuri | `GET /games` (`platform_id`, `search`) | `GET /games/:id` | `POST /games` | `PATCH /games/:id` | `DELETE /games/:id` |
| Achievement-uri | `GET /achievements` (`game_id`, `rarity`) | `GET /achievements/:id` | `POST /achievements` | `PATCH /achievements/:id` | `DELETE /achievements/:id` |
| Jocuri deținute | `GET /user-games` (`platform_account_id`*) | `GET /user-games/:accountId/:gameId` | `POST /user-games` | `PATCH /user-games/:accountId/:gameId` | `DELETE /user-games/:accountId/:gameId` |
| Achievement-uri deblocate | `GET /user-achievements` (`platform_account_id`*, `game_id`) | `GET /user-achievements/:accountId/:achievementId` | `POST /user-achievements` | `PATCH /user-achievements/:accountId/:achievementId` | `DELETE /user-achievements/:accountId/:achievementId` |
| Sincronizări | `GET /sync-runs` (`platform_account_id`, `status`) | `GET /sync-runs/:id` | `POST /sync-runs` | `PATCH /sync-runs/:id` | `DELETE /sync-runs/:id` |
| Prietenii | `GET /friendships` (`user_id`*, `status`) | `GET /friendships/:requesterId/:addresseeId` | `POST /friendships` | `PATCH /friendships/:requesterId/:addresseeId` (acceptare) | `DELETE /friendships/:requesterId/:addresseeId` |
| Raportări | `GET /reports` (`status`, `target_user_id`) | `GET /reports/:id` | `POST /reports` | `PATCH /reports/:id` (rezolvare) | `DELETE /reports/:id` |

\* filtru obligatoriu. Sesiunile (`refresh_tokens`) se creează și se revocă prin rutele `/auth/*`.

## Autentificare

| Rută | Body | Răspuns |
|---|---|---|
| `POST /auth/register` | `username`, `email`, `password` (min. 8) | 201 `{ user, access_token, refresh_token, expires_in }`: rolul e mereu `user` |
| `POST /auth/login` | `email`, `password` | 200 ca mai sus; 401 „Email sau parolă greșită”; 403 cont suspendat |
| `POST /auth/refresh` | `refresh_token` | o pereche nouă de tokenuri; tokenul vechi e revocat (rotație). Un token revocat refolosit → toate sesiunile userului sunt revocate |
| `POST /auth/logout` | `refresh_token` | 204, sesiunea e revocată |
| `GET /auth/me` | - | userul din token, cu datele actuale din DB |
| `GET /auth/steam?client=web` (sau `app`) | - | redirect la login-ul Steam (OpenID); la întoarcere, redirect la client cu tokenurile în `#fragment` |
| `POST /auth/steam/link` (cu token) | `client` | `{ url }`: adresa de login Steam cu un „state” semnat (10 min); la întoarcere contul Steam e legat userului logat și primul sync pornește automat (D47) |

## Profil (migrația 009)

| Rută | Body | Acces |
|---|---|---|
| `PATCH /users/:id` | în plus `bio`, `accent_color`, `banner`, `favorite_game_id` | proprietarul (sau admin); jocul preferat trebuie să fie în bibliotecă |
| `PUT /users/:id/showcase` | `achievement_ids` (0–3, unice) | proprietarul; doar achievement-uri deblocate de el; înlocuiește vitrina într-o tranzacție |
| `GET /users/:id/achievements` | `limit`, `offset` | oricine logat; ultimele deblocate |
| `GET /users/:id/profile` | - | include acum `totals`, `favorite_game`, `showcase` |

Tokenul de acces e un JWT HS256 valabil 15 minute; refresh token-ul e valabil 30 de zile (D31–D33).

## Roluri

Ierarhice: `admin` poate tot ce poate `moderator`, `moderator` tot ce poate `user`.

| Resursă | Citire | Scriere |
|---|---|---|
| Platforme, jocuri, achievement-uri (catalog) | oricine logat | admin |
| Utilizatori | oricine logat (emailul altora doar pentru moderator+) | propriul profil; `is_banned` / `hidden_from_leaderboards`: moderator; `role`, creare: admin; ștergere: proprietarul sau admin |
| Conturi de platformă, jocuri deținute, deblocări | oricine logat | proprietarul contului sau admin; contul Steam doar prin login Steam (`/auth/steam/link`), legarea manuală doar admin; PSN și Xbox prin `/auth/:platform/search` + `/auth/:platform/link` (Online ID / gamertag, D57), Epic doar cu `ALLOW_MOCK_PLATFORMS=true` (D55) |
| Sincronizări | oricine logat | creare: proprietarul contului; modificare / ștergere: admin (în rest le scrie worker-ul) |
| Prietenii | doar cei doi (sau moderator) | cererea pleacă de la userul logat; acceptă doar destinatarul; oricare o poate șterge |
| Raportări | moderator | creare: oricine (ca el însuși); rezolvare: moderator (`resolved_by` = moderatorul din token); ștergere: admin |
| `GET /stats` | admin | - |

## Rapoarte (etapa 5)

| Rută | Format | Acces |
|---|---|---|
| `GET /exports/users/:id/achievements.csv` | CSV generat cu `COPY … TO STDOUT`, trimis ca stream | proprietarul sau admin |
| `GET /exports/users/:id/library.xlsx` | Excel: foaia „Jocuri” (progres ca formulă) + „Raritate” | proprietarul sau admin |
| `GET /exports/overview.pdf` | PDF: volume, platforme, top 10, raritate, moderare, sincronizări | moderator, admin |

## Coduri de răspuns

| Cod | Când |
|---|---|
| 200 / 201 / 204 | succes (citire-modificare / creare / ștergere) |
| 400 | cererea nu respectă schema JSON a rutei, sau încalcă un `CHECK` / `NOT NULL` din baza de date |
| 404 | înregistrarea nu există |
| 409 | încalcă un `UNIQUE` / `PRIMARY KEY`, o cheie străină, sau ștergerea e blocată de `ON DELETE RESTRICT` |

Erorile de constrângere includ numele constrângerii, de exemplu:

```json
{ "error": "Există deja o înregistrare cu aceste valori unice", "constraint": "users_username_lower_uq" }
```

## Reguli de business implementate în API

- `password_hash` și `access_token_enc` nu sunt niciodată trimise clientului.
- Parola primită la creare/modificare e salvată ca hash argon2; tokenul de platformă e criptat cu `pgp_sym_encrypt`.
- Acceptarea unei prietenii completează `responded_at`; refuzul înseamnă ștergerea cererii.
- Rezolvarea unei raportări (`status: "resolved"`) ascunde utilizatorul raportat din clasamente, în aceeași tranzacție.

## Exemple

```bash
curl "http://localhost:3000/api/users?search=demo"
curl "http://localhost:3000/api/user-achievements?platform_account_id=6&limit=5"
curl -X POST http://localhost:3000/api/friendships -H "Content-Type: application/json" -d '{"requester_id":3,"addressee_id":10}'
```

# API — operații CRUD

Toate rutele sunt sub `/api`, primesc și întorc JSON. Listele acceptă `limit` (1–100, implicit 20) și `offset`.
Deocamdată fără autentificare; în etapa 3 fiecare rută primește regulile de acces pe roluri.

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

\* filtru obligatoriu. Sesiunile (`refresh_tokens`) se creează la login și se gestionează în etapa 3.

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

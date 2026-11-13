# Vinus Arcade ranking server

The server of the plugin's world ranking: a [Cloudflare Worker](https://developers.cloudflare.com/workers/)
with a [D1](https://developers.cloudflare.com/d1/) database, on the free plan. Only the plugin's
worker talks to it, and only for a person who joined the ranking.

## What it keeps

- `players`: a nickname, keyed by the SHA-256 of the secret the plugin made on the person's
  computer. The secret itself is never stored.
- `scores`: each player's best score in each game, for each week (`2026-W46`, Monday to Sunday in
  UTC) and of all time (`all`).
- `runs`: a run being played again, only while that lasts (a few requests); then it is deleted.

No IP address, no project, no agent, no logs kept (`observability` is off). `DELETE /v1/me`
deletes the player and every score of theirs.

## How a score counts

The plugin sends the record of a run: the game's state just before its first press, and every
press, resize and delivery by the step it happened at. The server plays the record again with the
same rules the panel played it with (`src/games/<id>/replay.ts`, imported from the plugin) and
counts the score only if it comes out the same. Workers Free gives each request 10 ms of CPU, so
a long run is played over several requests, `stepsPerRequest` steps each; the plugin keeps
asking (`POST /v1/runs/:id`) until the verdict comes.

When a change to a game's rules would play the same presses differently, raise its `RULESET` in
`replay.ts` and deploy the server with the new plugin version: records of the old rules are then
turned down instead of counted wrong.

## API

| Request | Does |
| --- | --- |
| `GET /v1/boards/:game` | The ten best of the week and of all time; with a secret, also where the player stands. |
| `PUT /v1/me` `{ name }` | Joins the ranking, or changes the nickname. |
| `DELETE /v1/me` | Leaves it: deletes the player and their scores. |
| `POST /v1/runs` `{ game, record }` | Sends a run. Answers `counted`, `refused` or `checking`. |
| `POST /v1/runs/:id` | Plays a `checking` run further. |

A player is the `Authorization: Bearer <secret>` header. A player sends at most one run every two
seconds and has at most three being played again.

## Run and deploy

It has no dependencies of its own: Wrangler runs through `npx`.

```sh
cd server
npx wrangler@4 types                                     # runtime types, for tsc
npx -p typescript tsc -p .                               # types
npx wrangler@4 d1 migrations apply vinus-arcade --local  # the schema, locally
npx wrangler@4 dev                                       # http://localhost:8787
npx wrangler@4 d1 migrations apply vinus-arcade --remote # the schema, in production
npx wrangler@4 deploy
```

To take a nickname down:

```sh
npx wrangler@4 d1 execute vinus-arcade --remote --command "UPDATE players SET name = 'player' WHERE name = '...'"
```

Study Space — minimal server scaffold

This folder contains a lightweight Express server to handle auth and provide a place to add DB-backed endpoints.

Quick start (macOS, Node.js installed):

1. From this folder:

```bash
cd "/Users/bobcheto/Desktop/Study place/study-place/server"
npm install
cp .env.example .env
# edit .env and set DATABASE_URL
```

2. Create the DB schema (Postgres):

```bash
psql < schema.sql
# or run the SQL contents in your Postgres client
```

3. Start the server:

```bash
npm run start
```

Endpoints:
- POST /api/auth/signup { name, email, password } -> creates user
- POST /api/auth/login { email, password } -> verifies credentials

Supabase Auth integration
- When `SUPABASE_URL` and `SUPABASE_KEY` are set, the server uses Supabase Auth flows:
	- `POST /api/auth/signup` calls `supabase.auth.signUp` and returns the Supabase `user` and any session object (if present).
	- `POST /api/auth/login` calls `supabase.auth.signInWithPassword` and returns `{ user, session, token }` where `token` is the Supabase `access_token`.
- The client should store `token` (we store it in `localStorage.ss_token` in the example client) and include it in `Authorization: Bearer <token>` for authenticated endpoints such as `/api/blocks`.
- If `SUPABASE_URL` is not configured, the server falls back to the local Postgres-based auth implementation (users table with hashed passwords) and returns a server-signed JWT.

New endpoints for customization persistence
- GET /api/blocks - returns the authenticated user's saved blocks
- PUT /api/blocks - replace the authenticated user's blocks; body: { blocks: Array }

Authentication
- The server accepts either:
	- A server-issued JWT in the `Authorization: Bearer <token>` header (issued on login), or
	- A Supabase access token (if `SUPABASE_URL` + `SUPABASE_KEY` are configured).

Client usage
- After login the API returns `{ ok:true, user:..., token: "<JWT>" }`. Store the token and include it in `Authorization` header for block endpoints.
- Example (client helper available at `study-place/assets/auth.js`):

```js
// read saved blocks
const resp = await ssApi.getBlocks();
// save blocks
await ssApi.saveBlocks([{ block_key: 'topbar', position: { x:0 }, style: { background:'#000' } }]);
```

UI helpers
- The Flashcard Studio and Introduction pages include small "Save Layout" / "Load Layout" controls that persist a `global_theme` block containing a few CSS variables (accent colors, card size, etc.). Use these to quickly save and restore a user's visual customization after logging in.

Token refresh
- The client helper `ssApi` will attempt to refresh the session automatically if a protected request returns 401, using `/api/auth/refresh` and the `refresh_token` stored in `localStorage.ss_refresh`.

Notes / Next steps:
- Add session or JWT issuance after login.
- Harden input validation.
- Add endpoints to store user customization: GET/PUT /api/users/:id/preferences or /api/users/:id/blocks
- For static hosting, keep the `study-place` directory as static files and proxy `/api` to this server.

Supabase integration
- You can optionally use Supabase instead of connecting directly with a Postgres `DATABASE_URL`.
- To enable Supabase, set `SUPABASE_URL` and `SUPABASE_KEY` (or `SUPABASE_SERVICE_ROLE`) in your `.env`.
- The server will prefer Supabase when those env vars are present and fall back to the Postgres pool otherwise.
- If you provided a publishable key like `sb_publishable_-pHOflGGasRf4o18KIXXQg_OPRhB6gK`, paste it into `SUPABASE_KEY` in your `.env`. For server-side inserts/reads you may need the service role key.

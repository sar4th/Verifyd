# Outlook Sync — minimal demo

Smallest possible Next.js 15 app that logs in with Microsoft, fetches your latest
50 Outlook emails via Microsoft Graph, and displays them. No database, no Prisma,
no background jobs, no service/repository layers — just routes and pages.

## Flow

1. `/` — "Connect Outlook" button → `/api/auth/login`
2. `/api/auth/login` — redirects to the Microsoft consent screen
3. `/api/auth/callback` — exchanges the code for an access token, stores it in an
   httpOnly cookie, redirects to `/mail`
4. `/mail` — reads the cookie and fetches 50 messages from Graph
   (`GET /me/messages`), showing subject, sender, received date, and body preview

Scopes requested: `Mail.Read offline_access openid profile email`.

## Azure setup (one time)

1. Go to **Azure Portal → App registrations → New registration**.
2. Supported account types: pick "Accounts in any organizational directory and
   personal Microsoft accounts" (matches the `common` tenant).
3. Add a **Web** redirect URI: `http://localhost:3000/api/auth/callback`.
4. Under **Certificates & secrets**, create a **client secret** — copy the *value*.
5. Copy the **Application (client) ID**.

## Run

```bash
cp .env.local.example .env.local   # then fill in the values
npm install
npm run dev
```

Open http://localhost:3000 and click **Connect Outlook**.

## Notes

- The access token lives only in a cookie for the session lifetime. `offline_access`
  is requested so the demo could be extended with refresh tokens, but refresh is not
  implemented — when the token expires, click Connect again.
- This is a demo. For production you'd add token refresh, CSRF/`state` validation on
  the OAuth callback, and server-side session storage.

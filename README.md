# NexoraGo

Professional visa assessment platform: choose a destination, submit a short form, track by reference ID, and complete KYC after admin approval.

## Features

- Destination cards focused on top Indian migrant pathways (Canada Express Entry, Germany EU Blue Card, UK Skilled Worker / Graduate, Netherlands, Ireland, Portugal, Sweden, Australia, USA H-1B, UAE)
- One-page short assessment form (no prices in the user flow)
- Tracking ID with copy + Track page
- Admin approve unlocks KYC; dummy card fee ($1 / $10 / $100) then document upload
- SQLite via `sql.js` in-process, with **Turso** as the durable store for applications (orders survive Vercel/Netlify redeploys)

## Requirements

- Node.js **18+**

## Quick start

```bash
npm install
npm start
```

Open http://localhost:3000

### Admin

- Username: `admin`
- Password: `NexoraGo2026!` (override with `ADMIN_PASS`)

Optional env:

```bash
PORT=3000
HOST=0.0.0.0
ADMIN_USER=admin
ADMIN_PASS=your-secure-password
```

## User flow

1. Select a visa card  
2. Fill short assessment → get **Tracking ID** (copy & save)  
3. Admin reviews → sets status to **Approve (open KYC)**  
4. User tracks ID → **Verify KYC** → pay dummy fee → upload ID + selfie  

KYC link format: `/track?ref=VSA-...`

## Deploy on Vercel (recommended)

Static `public/` + Express API in `api/index.js` (`vercel.json` routes `/api/*`).

1. Push to GitHub: `https://github.com/update-glitch87/Nexora`
2. Go to [vercel.com](https://vercel.com) → **Add New** → **Project** → import **Nexora**
3. Framework preset: **Other** (no build command needed — uses `vercel.json`)
4. **Environment variables** (Production + Preview):

   | Name | Value |
   |------|--------|
   | `TURSO_DATABASE_URL` | `libsql://…turso.io` |
   | `TURSO_AUTH_TOKEN` | your Turso token (mark as **Secret**) |
   | `ADMIN_USER` | `admin` |
   | `ADMIN_PASS` | your admin password (Secret) |

5. Click **Deploy**

After deploy, open your `*.vercel.app` URL. Check: `/api/health` should show `"platform":"vercel"` and `"persistence":"turso"`.

**Admin:** open `/admin82832783` (not linked in the nav).

**Notes**
- Turso is required on Vercel — without it, applications can reset on cold starts.
- KYC file uploads use `/tmp` on serverless; application **records** stay in Turso.
- Migrations never drop user applications.

### Required: Turso

1. Create a free DB at [turso.tech](https://turso.tech)
2. Add `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` in Vercel env vars
3. Redeploy after saving variables

## Deploy on Netlify (alternative)

See `netlify.toml` — static `public/` + `netlify/functions/api.js`. Same Turso env vars in Netlify settings.

## Deploy on Render (alternative)

See `render.yaml` — use if you prefer a always-on Node web service.

## Project layout

```
api/index.js       Vercel serverless API entry
vercel.json        Vercel routes + function config
server/server.js   Express API (+ static when local)
server/db.js       SQLite schema + Turso sync
server/turso.js    Durable applications store
public/            Frontend (HTML/CSS/JS)
netlify/           Optional Netlify function
```

## License

Private / for the Nexora project owner.

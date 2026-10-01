# NexoraGo

Professional visa assessment platform: choose a destination, submit a short form, track by reference ID, and complete KYC after admin approval.

## Features

- Destination cards focused on top Indian migrant pathways (Canada Express Entry, Germany EU Blue Card, UK Skilled Worker / Graduate, Netherlands, Ireland, Portugal, Sweden, Australia, USA H-1B, UAE)
- One-page short assessment form (no prices in the user flow)
- Tracking ID with copy + Track page
- Admin approve unlocks KYC; dummy card fee ($1 / $10 / $100) then document upload
- SQLite storage via Node.js built-in `node:sqlite` (Node 22+)

## Requirements

- Node.js **22.5+** (for `node:sqlite`)

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

## Deploy on Netlify (free)

This app is set up for **Netlify**: static `public/` + serverless Express API.

1. Push to GitHub: `https://github.com/update-glitch87/Nexora`
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import from Git**
3. Select **Nexora**
4. Build settings (auto from `netlify.toml`):
   - **Build command:** `npm install`
   - **Publish directory:** `public`
   - **Functions directory:** `netlify/functions`
   - **Node version:** `22`
5. Site settings → Environment variables (optional):
   - `ADMIN_USER` = `admin`
   - `ADMIN_PASS` = your password
6. Deploy

After deploy, open your `*.netlify.app` URL.

**Notes**
- KYC uploads & SQLite live in `/tmp` on Netlify (ephemeral — data can reset on cold starts). Fine for demo; use a real DB later for production.
- Local still works with `npm start` (Express on port 3000).

### CLI deploy (optional)

```bash
npm i -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

## Deploy on Render (alternative)

See `render.yaml` — use if you prefer a always-on Node web service.

## Project layout

```
server/server.js   API + static host
server/db.js       SQLite schema + seed visas
public/            Frontend (HTML/CSS/JS)
```

## License

Private / for the Nexora project owner.

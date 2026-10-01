# VisaGo (Nexora)

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
- Password: `VisaGo2026!` (override with `ADMIN_PASS`)

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

## Deploy (free)

This is a **Node + Express + SQLite** app (not a static site).

**Netlify** is for static / serverless frontends — it is **not** a good fit for this full server + SQLite + file uploads stack.

### Recommended: Render (free web service)

1. Push this repo to GitHub  
2. [Render](https://render.com) → New → Web Service → connect repo  
3. Settings:
   - **Runtime:** Node  
   - **Build:** `npm install`  
   - **Start:** `npm start`  
   - **Node version:** `22`  
4. Add env vars: `ADMIN_PASS`, optional `ADMIN_USER`  
5. Deploy  

Free-tier disk is ephemeral — SQLite data may reset on redeploy. For production, add a persistent disk or external DB later.

`render.yaml` is included for Blueprint deploy.

### Railway / Fly.io

Same idea: Node 22 web service, start command `npm start`, set `PORT` automatically by the host.

## Project layout

```
server/server.js   API + static host
server/db.js       SQLite schema + seed visas
public/            Frontend (HTML/CSS/JS)
```

## License

Private / for the Nexora project owner.

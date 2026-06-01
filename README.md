# GAE Scout Intelligence v2.0

AI-powered scoutingsrapport generator voor Go Ahead Eagles.

## Architectuur

```
Browser (index.html)
      ↓  fetch /api/scout  (same-origin, geen CORS)
Express Backend (server.js)
      ↓  axios + x-api-key header
Anthropic Claude API
      ↓  web_search tool + JSON response
Express Backend
      ↓  JSON validatie + sanitatie
Browser → rapport gerenderd
```

## Folderstructuur

```
gae-scout-v2/
├── backend/
│   ├── server.js            ← Express server + routing
│   ├── anthropicClient.js   ← Anthropic API wrapper (retry/timeout)
│   ├── jsonSanitizer.js     ← Robuuste JSON extractie
│   ├── prompt.js            ← Systeem prompt + user message builder
│   ├── logger.js            ← Gestructureerde logging
│   ├── package.json
│   ├── .env                 ← Maak zelf aan (zie .env.example)
│   └── .env.example
└── frontend/
    └── public/
        └── index.html       ← Volledige React-vrije frontend
```

## Installatie

### Vereisten
- Node.js 18 of hoger → https://nodejs.org
- Anthropic API key → https://console.anthropic.com

### Stap 1 — Dependencies installeren
```bash
cd backend
npm install
```

### Stap 2 — API key configureren
Maak een bestand `.env` in de `backend/` map:
```
ANTHROPIC_API_KEY=sk-ant-JOUW-KEY-HIER
PORT=3001
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3001
RATE_LIMIT_MAX=20
```

### Stap 3 — Server starten
```bash
cd backend
npm start
```

### Stap 4 — App openen
Ga naar: **http://localhost:3001**

## Deployment

### Railway (aanbevolen — gratis tier beschikbaar)
1. Maak account op railway.app
2. New Project → Deploy from GitHub
3. Stel environment variables in via Railway dashboard:
   - `ANTHROPIC_API_KEY`
   - `NODE_ENV=production`
   - `ALLOWED_ORIGINS=https://jouw-domein.railway.app`
4. Start command: `node server.js`
5. Root directory: `backend`

### Render
1. New Web Service → Connect GitHub repo
2. Build command: `npm install`
3. Start command: `node server.js`
4. Root directory: `backend`
5. Environment variables instellen via Render dashboard

### Vercel
Vercel werkt het best voor serverless — voor een Express app is Railway of Render geschikter.

## Kosten
- Elk rapport kost ca. $0.01–0.04 (web search + Claude Sonnet)
- Rate limit: 20 aanvragen per IP per 15 minuten
- Server timeout: 60 seconden per aanvraag

## Troubleshooting

| Probleem | Oorzaak | Oplossing |
|---|---|---|
| "Server offline" | Backend draait niet | `cd backend && npm start` |
| "API key ontbreekt" | .env niet aangemaakt | Maak `.env` aan met je key |
| "Timeout" | Claude > 60s | Probeer opnieuw |
| "Geen JSON" | Claude gaf tekst terug | Automatisch retry — of probeer opnieuw |
| Port bezet | Iets draait al op 3001 | Zet `PORT=3002` in .env |

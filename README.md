# Flag Check v3

React/Vite app. Apple Notes style checklist for green/red flags. Multi-profile, weighted scoring, streak, journal, compare, AI insights.

## Deploy

```bash
npm install
npm run build           # verify it builds

git init
git add .
git commit -m "init v3"
gh repo create martin2yordanov/flag-check --public --source=. --push

vercel --prod           # framework auto-detects Vite
```

Open the Vercel URL on iPhone → Share → Add to Home Screen.

## Local dev

```bash
npm install
npm run dev
```

Data: localStorage. API key (optional, for AI tab): stored locally, sent only to api.anthropic.com.

# URL Shortener (FastAPI + React)

Student learning project to practice full-stack development.

## What it does
- Create short links from long URLs
- Redirect via /u/{code}
- Basic click tracking + stats endpoint

## UI features
- Copy-to-clipboard + toast notifications
- Simple live click chart (polling)
- QR code + PNG download

## Tech
- Backend: FastAPI, SQLAlchemy, Postgres, Redis
- Frontend: React (Vite)

## Run locally

### Backend
cd url-shortener
source .venv/bin/activate
uvicorn app.main:app --reload

### Frontend
cd url-shortener-ui
npm install
npm run dev

## TODO
- Better analytics (timestamps, daily counts)
- Auth + saved links
- Deploy + custom domain
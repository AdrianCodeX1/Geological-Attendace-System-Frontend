# Attendance System — Frontend

Next.js 14 (App Router) + TypeScript + Tailwind CSS frontend for the
schedule-aware, proximity-verified attendance system.

Pairs with the Node.js + Express + PostGIS backend. This README assumes the
backend is already running and reachable.

---

## Prerequisites

- **Node.js 18.17 or newer** (`node -v`). Next.js 14 will refuse to start on older versions.
- **npm 9+** (bundled with Node 18.17+).
- The **backend running** at `http://localhost:5000` with its database seeded:
  ```bash
  cd <backend-folder>
  cp .env.example .env      # set DATABASE_URL and a long JWT_SECRET
  npm install
  npm run db:seed
  npm run dev
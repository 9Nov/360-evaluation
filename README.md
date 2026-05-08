# 360° Evaluation System

A web-based peer evaluation application built with vanilla HTML, Tailwind CSS, and Google Apps Script as the backend database.

## Features

- **Admin Dashboard** — create rooms, manage users, view room history, monitor evaluation progress
- **Evaluation Status Monitor** — live matrix showing who has/hasn't evaluated whom, progress bar, pending list
- **4-Digit PIN Authentication** — new users set a PIN on first join; returning users must verify it
- **Returning User Flow** — select your name and re-enter to continue pending evaluations
- **Result & Ranking** — per-question averages, total score, and top-3 leaderboard
- **Back Navigation** — header back button with context-aware routing

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, Tailwind CSS (CDN), Font Awesome |
| Logic | Vanilla JavaScript (ES2020) |
| Backend / DB | Google Apps Script (Google Sheets) |
| Hosting | GitHub Pages |

## Setup

1. Open `code.gs` and copy its contents into a Google Apps Script project bound to a Google Sheet.
2. Deploy the script as a **Web App** (Execute as: Me, Access: Anyone).
3. Copy the deployment URL into `script.js` line 5:
   ```js
   const API_URL = "https://script.google.com/macros/s/YOUR_URL/exec";
   ```
4. Open `index.html` in a browser or serve via GitHub Pages.

## Admin Login

Default password: `loading99`

---

&copy; 2026 360° Evaluation System

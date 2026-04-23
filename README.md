# 🌍 Zurii Travels

**Your Dream Destination Solution** — A modern, full-stack travel booking platform built with React and Node.js.

![Zurii Travels](frontend/public/zurii-logo.png)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Database Setup (PostgreSQL)](#2-database-setup-postgresql)
  - [3. Backend Setup](#3-backend-setup)
  - [4. Frontend Setup](#4-frontend-setup)
- [Running the Application](#running-the-application)
- [Environment Variables](#environment-variables)
- [Features](#features)
- [Available Routes](#available-routes)
- [API Endpoints](#api-endpoints)
- [Contributing](#contributing)

---

## Overview

Zurii Travels is a curated travel platform offering domestic and international tour packages. Users can browse destinations, view detailed itineraries, read travel blogs, and submit trip inquiries. An admin dashboard provides insights into customer submissions.

---

## Tech Stack

| Layer       | Technology                                      |
|-------------|------------------------------------------------|
| **Frontend** | React 19, Vite 8, Tailwind CSS 4, React Router 7 |
| **Backend**  | Node.js, Express 5, PostgreSQL (via `pg`)       |
| **Database** | PostgreSQL (Aiven Cloud / Local)                |
| **Styling**  | Tailwind CSS with custom design system          |

---

## Project Structure

```
Zurii/
├── frontend/                 # React + Vite frontend
│   ├── public/               # Static assets (logo, images)
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── Topbar.jsx         # Navigation bar with search
│   │   │   ├── HeroBanner.jsx     # Homepage hero section
│   │   │   ├── TripDetailPage.jsx # Individual trip details
│   │   │   ├── DestinationPage.jsx# Destination landing pages
│   │   │   ├── ContactModal.jsx   # Contact form modal
│   │   │   ├── CustomTripModal.jsx# Custom trip request modal
│   │   │   ├── GetInTouch.jsx     # Inline contact form
│   │   │   ├── TravelGuides.jsx   # Blog cards on homepage
│   │   │   └── ...
│   │   ├── pages/            # Route-level page components
│   │   │   ├── Blogs.jsx          # Blog listing page
│   │   │   ├── BlogDetail.jsx     # Individual blog article
│   │   │   ├── ContactUs.jsx      # Contact page
│   │   │   ├── AdminInsights.jsx  # Admin dashboard
│   │   │   └── ...
│   │   ├── data/
│   │   │   └── index.js      # All trip data, destinations, guides
│   │   ├── App.jsx            # Router configuration
│   │   └── main.jsx           # Entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── backend/                   # Express API server
│   ├── server.js              # API routes & DB connection
│   ├── .env                   # Environment variables (not in git)
│   └── package.json
│
├── .gitignore
└── README.md
```

---

## Prerequisites

Make sure you have the following installed:

- **Node.js** v18 or higher → [Download](https://nodejs.org/)
- **npm** v9 or higher (comes with Node.js)
- **PostgreSQL** 14+ (local or cloud like [Aiven](https://aiven.io/), [Supabase](https://supabase.com/), [Neon](https://neon.tech/))
- **Git** → [Download](https://git-scm.com/)

Verify installations:
```bash
node --version    # v18+
npm --version     # v9+
psql --version    # PostgreSQL 14+
```

---

## Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Anubhav-bhatt/zurii.git
cd zurii
```

### 2. Database Setup (PostgreSQL)

#### Option A: Using a Cloud PostgreSQL Service (Recommended)

If using **Aiven**, **Supabase**, or **Neon**, create a new PostgreSQL service and get your connection string. It will look like:

```
postgres://username:password@host:port/database?sslmode=require
```

> The backend will **automatically create** the required `contacts` table on first run — no manual SQL needed.

#### Option B: Using Local PostgreSQL

1. **Install PostgreSQL** if not already installed:
   ```bash
   # macOS (Homebrew)
   brew install postgresql@16
   brew services start postgresql@16

   # Ubuntu/Debian
   sudo apt install postgresql postgresql-contrib
   sudo systemctl start postgresql
   ```

2. **Create a database**:
   ```bash
   psql -U postgres
   ```
   ```sql
   CREATE DATABASE zurii_db;
   CREATE USER zurii_user WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE zurii_db TO zurii_user;
   \q
   ```

3. Your connection string will be:
   ```
   postgres://zurii_user:your_password@localhost:5432/zurii_db
   ```

> **Note:** For local PostgreSQL, set `config.ssl = false` in `backend/server.js` line 18, or comment out the SSL config entirely.

### 3. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Create environment file
touch .env
```

Add the following to `backend/.env`:

```env
DATABASE_URL=your_postgresql_connection_string_here
PORT=5001
```

**Example with Aiven:**
```env
DATABASE_URL=postgres://avnadmin:YOUR_PASSWORD@your-project.aivencloud.com:12345/defaultdb?sslmode=require
PORT=5001
```

**Example with Local PostgreSQL:**
```env
DATABASE_URL=postgres://zurii_user:your_password@localhost:5432/zurii_db
PORT=5001
```

### 4. Frontend Setup

```bash
# Navigate to frontend directory (from project root)
cd frontend

# Install dependencies
npm install
```

No additional configuration needed — the frontend connects to the backend at `http://localhost:5001`.

---

## Running the Application

You need **two terminal windows** — one for the backend and one for the frontend.

### Terminal 1: Start the Backend

```bash
cd backend
npm start
```

You should see:
```
Server is running on port 5001
Contacts table ready.
```

### Terminal 2: Start the Frontend

```bash
cd frontend
npm run dev
```

You should see:
```
  VITE v8.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
```

### 🎉 Open the App

Visit **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## Environment Variables

| Variable       | Required | Description                          | Default |
|---------------|----------|--------------------------------------|---------|
| `DATABASE_URL` | ✅ Yes   | PostgreSQL connection string         | —       |
| `PORT`         | No       | Backend server port                  | `5001`  |

> ⚠️ **Never commit your `.env` file.** It is already in `.gitignore`.

---

## Features

### 🏠 Homepage
- Hero banner with carousel
- Best seller trip cards
- Domestic & international destination menus
- Travel guides / blog section
- Inline contact form

### 🔍 Search
- Global search bar in the topbar
- Searches across all trip titles, subtitles, taglines, and overviews
- Keyboard navigation (↑↓ arrows, Enter, Esc)

### 🗺️ Trip Packages
- **Domestic**: Kerala, Kashmir, Ladakh, Uttarakhand, Himachal Pradesh, Rajasthan, and more
- **International**: Thailand, Bali, Paris, Santorini, Tokyo, Swiss Alps, and more
- **Family Packages**: Rishikesh-Mussoorie, Shimla-Manali, Udaipur-Mount Abu, Mussoorie-Nainital-Rishikesh
- Detailed itineraries, inclusions/exclusions, batch dates, gallery

### 📝 Blogs
- 6 travel articles with full content
- Featured article highlight
- Blog detail pages with related articles

### 📞 Contact & Custom Trip
- Contact modal, inline form, and dedicated contact page
- Custom trip request (2-step wizard with trip preferences)
- All forms require phone number

### 🔐 Admin
- Admin insights dashboard at `/admin/insights`
- View all contact submissions
- Priority-based sorting (high priority highlighted)

---

## Available Routes

| Route                     | Description                    |
|--------------------------|--------------------------------|
| `/`                      | Homepage                       |
| `/trip/:id`              | Trip detail page               |
| `/destination/:name`     | Destination landing page       |
| `/explore/:slug`         | Explore by category            |
| `/best-sellers`          | Best sellers page              |
| `/blogs`                 | Blog listing                   |
| `/blog/:slug`            | Individual blog article        |
| `/contact-us`            | Contact page                   |
| `/weekend-trips`         | Weekend trips                  |
| `/corporate-tours`       | Corporate tours                |
| `/all-domestic-destinations` | All domestic destinations  |
| `/payment-policy`        | Payment policy                 |
| `/no-cost-emi`           | EMI information                |
| `/terms-conditions`      | Terms & conditions             |
| `/privacy-policy`        | Privacy policy                 |
| `/cancellation-policy`   | Cancellation policy            |
| `/admin/insights`        | Admin dashboard                |

---

## API Endpoints

| Method | Endpoint        | Description                     | Body                                                                 |
|--------|----------------|---------------------------------|----------------------------------------------------------------------|
| `POST` | `/api/contact` | Submit a contact/trip inquiry   | `{ name, email, phone, interest, message, callback, priority }`     |
| `GET`  | `/api/contact` | Fetch all submissions (admin)   | —                                                                    |

---

## Build for Production

```bash
cd frontend
npm run build
```

The production build will be output to `frontend/dist/`. You can serve it with any static file server or deploy to Vercel, Netlify, etc.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ECONNREFUSED` on backend | Make sure PostgreSQL is running and `DATABASE_URL` is correct |
| SSL error with local PostgreSQL | Set `config.ssl = false` in `server.js` line 18 |
| Frontend can't reach backend | Ensure backend is running on port 5001 |
| `node_modules` missing | Run `npm install` in both `frontend/` and `backend/` |
| Port 5001 already in use | Change `PORT` in `.env` or kill the existing process |

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the ISC License.

---

<p align="center">
  Made with ❤️ by <strong>Zurii Travels</strong>
</p>

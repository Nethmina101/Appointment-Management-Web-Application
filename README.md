# Appointment Management Web Application

A full-stack web application for managing appointments, built with Node.js, Express, MongoDB, and vanilla HTML/CSS/JS.

## Features

- **Client:** Sign up, log in, book appointments, reschedule, cancel, view history
- **Admin:** View all appointments, approve, reject, complete, cancel; filter by status/date/name
- **Security:** JWT in httpOnly cookies, bcrypt hashing, rate limiting, account lockout, helmet, NoSQL injection protection
- **Responsive:** Mobile-first, card-based table on small screens, 320px–1440px+ tested

## Prerequisites

- Node.js 20 LTS
- A [MongoDB Atlas](https://www.mongodb.com/atlas) free cluster

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
# Edit .env and fill in your MongoDB URI and a random JWT_SECRET

# 3. Seed the admin account (run once)
npm run seed

# 4. Start the development server
npm run dev
```

Open http://localhost:5000 in your browser.

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | HTTP port (default 5000) |
| `NODE_ENV` | `development` or `production` |
| `MONGODB_URI` | Atlas connection string |
| `JWT_SECRET` | Random 32+ char string |
| `JWT_EXPIRES_IN` | Token lifetime (e.g. `2h`) |
| `FRONTEND_ORIGIN` | Allowed CORS origin |
| `ADMIN_EMAIL` | Seed admin email |
| `ADMIN_PASSWORD` | Seed admin password |
| `ADMIN_NAME` | Seed admin display name |

## Project Structure

```
├── config/         # DB connection, env loading
├── controllers/    # Route logic
├── middleware/     # Auth, role, validation, error, rate-limit
├── models/         # Mongoose User & Appointment schemas
├── routes/         # Express routers
├── validators/     # Joi schemas per endpoint
├── public/         # Frontend HTML/CSS/JS
└── server.js       # Entry point
```

## API Endpoints

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | /api/auth/signup | Public | Create client account |
| POST | /api/auth/login | Public | Start session |
| POST | /api/auth/logout | Auth | End session |
| GET | /api/auth/me | Auth | Current user info |
| GET | /api/appointments | Auth | List appointments |
| POST | /api/appointments | Client | Create appointment |
| PUT | /api/appointments/:id | Owner | Reschedule |
| PATCH | /api/appointments/:id/cancel | Owner/Admin | Cancel |
| PATCH | /api/appointments/:id/status | Admin | Approve/reject/complete |
| GET | /api/appointments/availability | Auth | Free slots for a date |
| GET | /api/health | Public | Health check |

## License

MIT

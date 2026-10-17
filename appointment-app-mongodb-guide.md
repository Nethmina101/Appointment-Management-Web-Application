# Appointment Management Web Application: Implementation Guide (MongoDB)

A step-by-step instruction manual covering signup, login, booking, administration, security, responsiveness, and optimization. This document contains no code; it tells you what to build, in what order, and how to verify each part.

---

## 1. Project Goal and Scope

Build a web application where:

- **Clients** create an account, log in, book appointments, view their own appointments, reschedule, and cancel.
- **Admins** (the service provider) log in, view all appointments, approve, reject, complete, or cancel them.

**Out of scope for the first version (list as "future work" in your report):** email/SMS reminders, payments, multiple providers, calendar sync, password reset by email.

---

## 2. Recommended Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js (LTS version) | Large ecosystem, same language front and back |
| Server framework | Express | Simple, well documented |
| Database | MongoDB (Atlas free tier for hosting) | Flexible documents, managed backups and security |
| ODM | Mongoose | Schema validation, type casting, middleware |
| Password hashing | bcrypt (or argon2) | Slow, salted hashing resists brute force |
| Sessions | JWT stored in an httpOnly cookie | Not readable by JavaScript, so XSS cannot steal it |
| Validation | A schema validation library (Joi, Zod, or express-validator) | Rejects bad input before it reaches the database |
| Security middleware | helmet, express-rate-limit, express-mongo-sanitize, cors, cookie-parser, compression | Each covers a specific attack class |
| Frontend | Plain HTML/CSS/JS, or React if your course allows | Either works; instructions below apply to both |

---

## 3. Requirements Analysis

### Functional requirements
1. Registration with name, email, password.
2. Login and logout with persistent session.
3. Role-based access (client, admin).
4. Book, view, reschedule, cancel appointments.
5. Admin status management.
6. Prevention of double-booking and past-date booking.

### Non-functional requirements
- **Security:** hashed passwords, protected routes, input validation, rate limiting.
- **Responsiveness:** usable from 320px phones to wide desktops.
- **Performance:** pages respond in under one second under normal load; queries use indexes.
- **Reliability:** clear error messages, no crashes on bad input.
- **Maintainability:** separated folders for routes, controllers, models, middleware.

---

## 4. Project Structure (Folders and Their Purpose)

Create these folders and keep responsibilities separate:

- **config:** database connection and environment variable loading.
- **models:** one file per collection (User, Appointment).
- **routes:** URL definitions only; no business logic.
- **controllers:** the logic behind each route.
- **middleware:** authentication check, role check, validation, error handler, rate limiters.
- **validators:** input rules for each endpoint.
- **public (or client):** pages, styles, scripts.
- **tests:** manual test sheet and, if time allows, automated tests.

Root files: environment file (never committed), ignore file listing the environment file and dependencies folder, README.

---

## 5. Environment and Setup Steps

1. Install the current Node.js LTS release.
2. Create a MongoDB Atlas account and a free cluster.
3. In Atlas, create a **dedicated database user** with permission only on your application's database (not an admin user).
4. In Atlas network access, allow only your current IP during development; restrict to your host's IP range in production. Do not leave "allow from anywhere" enabled long term.
5. Copy the connection string into an environment file.
6. Define these environment variables: database connection string, JWT secret (long random string, at least 32 characters), token lifetime, port, allowed frontend origin, environment mode (development or production).
7. Initialize the project, install the packages listed in Section 2, and add the environment file to the ignore file **before your first commit**.
8. Create a seed procedure that inserts the first admin account, reading its email and password from environment variables rather than hard-coding them.

---

## 6. Database Design (MongoDB)

### Collection: users

| Field | Type | Rules |
|---|---|---|
| name | String | Required, trimmed, 2 to 60 characters |
| email | String | Required, lowercase, trimmed, valid format, **unique index** |
| passwordHash | String | Required, never returned in any response (exclude by default) |
| role | String | Only "client" or "admin"; default "client"; cannot be set by signup input |
| failedLoginCount | Number | Default 0, for lockout |
| lockUntil | Date | Optional, for temporary lockout |
| createdAt, updatedAt | Date | Automatic timestamps |

### Collection: appointments

| Field | Type | Rules |
|---|---|---|
| user | ObjectId reference to users | Required, set by the server from the logged-in user, never from the request body |
| title | String | Required, 3 to 100 characters |
| startsAt | Date | Required, stored in **UTC**, must be in the future |
| durationMinutes | Number | Default 30 (or your slot size) |
| notes | String | Optional, maximum 500 characters |
| status | String | One of: pending, approved, rejected, completed, cancelled |
| statusHistory | Array | Optional audit trail: who changed the status, when, to what |
| createdAt, updatedAt | Date | Automatic timestamps |

### Why store one `startsAt` date instead of separate date and time strings
- Sorting and range queries work correctly and use an index.
- Timezones are handled once: store UTC, display in the user's local time in the browser.
- Conflict checks become simple comparisons.

### Indexes (critical)
1. **users.email:** unique.
2. **appointments.startsAt:** supports admin calendar and date-range lists.
3. **appointments (user, startsAt):** compound index for "my appointments sorted by date".
4. **appointments.status:** supports admin filtering.
5. **Double-booking guard:** a **unique partial index on startsAt** that applies only when status is pending or approved. This lets the database itself reject two active bookings for the same slot, even if two users click at the exact same millisecond. Application-level checks alone are vulnerable to race conditions; this index is the real protection.

If you later support multiple providers, make this index compound on provider and startsAt.

### Design decisions to mention in your report
- Referencing users from appointments (rather than embedding) because appointments grow without bound and admins query across all users.
- Cancelling changes status instead of deleting the document, preserving history.

---

## 7. Authentication: Exact Step-by-Step Flows

### 7.1 Signup flow
1. User opens the signup page and enters name, email, password, and password confirmation.
2. **Browser-side:** check required fields, email format, password length and match, for instant feedback only (never trusted).
3. Browser sends the data to the signup endpoint over HTTPS.
4. **Server-side:**
   1. Validate and sanitize every field; reject unexpected extra fields (this blocks attempts to set the role).
   2. Normalize email (trim, lowercase).
   3. Enforce password policy: minimum 8 characters (10 or more preferred), reject extremely common passwords, no maximum below 64.
   4. Check for an existing email. Rely on the unique index as the final guard, and handle the duplicate error gracefully.
   5. Hash the password with bcrypt using a cost factor of 12 (or argon2 default parameters).
   6. Create the user with role forced to "client".
   7. Issue a session token and set it in a cookie, then return only safe user data (id, name, role).
5. Browser redirects to the dashboard.

### 7.2 Login flow
1. User enters email and password.
2. Server normalizes the email and looks up the user.
3. If the account is currently locked (too many failures), return a generic "try again later" message.
4. Compare the password with the stored hash. Perform the comparison even when the user does not exist (against a dummy hash) so response time does not reveal which emails are registered.
5. On failure: increment the failure counter; after about 5 failures lock the account for 15 minutes; return the **same generic message** ("Incorrect email or password") regardless of which part was wrong.
6. On success: reset the counter, issue a new token, set the cookie, return role and name.
7. Browser redirects based on role (admin and client both go to the dashboard, which adapts to the role).

### 7.3 Session cookie settings
- **httpOnly:** on (JavaScript cannot read it).
- **Secure:** on in production (HTTPS only).
- **SameSite:** Lax or Strict (protects against cross-site request forgery for most cases).
- **Lifetime:** short (for example 1 to 2 hours). Optionally add a refresh mechanism with a longer-lived, rotating refresh token stored only as a hash in the database.
- Token contents: user id and role only. Never include the password hash or personal details.

### 7.4 Logout flow
1. Browser calls the logout endpoint.
2. Server clears the cookie (matching the same settings used to set it).
3. Browser redirects to the login page.
4. If you implemented refresh tokens, also delete the stored refresh token.

### 7.5 "Who am I" check on page load
- Every protected page first asks the server who the current user is. If the answer is "not logged in", redirect to login. This keeps the interface in sync with the real session.

---

## 8. Authorization Rules

Enforce on the **server for every request**; hiding buttons in the interface is cosmetic only.

| Action | Client | Admin |
|---|---|---|
| View appointments | Only their own | All |
| Create appointment | Yes, for themselves | Optional (usually no) |
| Reschedule | Only their own, and only while pending or approved | Optional |
| Cancel | Only their own | Any |
| Change status to approved, rejected, completed | No | Yes |

**Prevent IDOR (insecure direct object reference):** whenever a client requests an appointment by id, query using both the id **and** the owner. If it does not match, respond "not found" (not "forbidden"), so ids cannot be probed.

**Prevent mass assignment:** build the stored document from an explicit allow-list of fields. Never pass the raw request body into create or update operations.

---

## 9. API Endpoint Plan

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | /api/auth/signup | Public, rate limited | Create client account |
| POST | /api/auth/login | Public, strictly rate limited | Start session |
| POST | /api/auth/logout | Logged in | End session |
| GET | /api/auth/me | Logged in | Current user info |
| GET | /api/appointments | Logged in | List (own, or all for admin) with pagination and filters |
| POST | /api/appointments | Client | Create appointment |
| PUT | /api/appointments/:id | Owner | Reschedule |
| DELETE (or PATCH cancel) | /api/appointments/:id | Owner or admin | Cancel |
| PATCH | /api/appointments/:id/status | Admin | Approve, reject, complete |
| GET | /api/appointments/availability?date= | Logged in | Returns free time slots for a date (optional but recommended) |

Use consistent JSON responses and proper HTTP codes: 200 and 201 for success, 400 for invalid input, 401 not logged in, 403 not permitted, 404 not found, 409 conflict (slot taken), 429 too many requests, 500 unexpected.

---

## 10. Business Rules

1. Appointment start must be in the future (compare in UTC on the server).
2. Appointments must fall within working hours and on working days, aligned to the slot size (for example, every 30 minutes). Define these as configuration values.
3. Slot must not be occupied by a pending or approved appointment (enforced by the partial unique index plus a friendly pre-check).
4. When a unique-index conflict occurs, return 409 with a clear message such as "That slot was just taken; please choose another."
5. **Status workflow:**
   - pending → approved or rejected
   - approved → completed
   - pending or approved → cancelled
   - rejected, completed, cancelled are final; no further changes.
   Validate every transition on the server and reject illegal ones.
6. Rescheduling resets the status to pending (so the admin re-approves).
7. Optionally prevent clients from cancelling within a set number of hours before the start; make it a configuration value.
8. Limit each client to a maximum number of active future appointments to prevent slot hoarding.

---

## 11. Input Validation and Injection Protection

1. **Validate at the boundary:** every endpoint has a defined schema for body, query, and parameters. Reject unknown fields.
2. **Validate ids:** confirm that any id from the URL is a valid MongoDB ObjectId before querying.
3. **NoSQL injection:** attackers send objects such as operators in place of strings (for example in the login email field). Defend by (a) enforcing that email and password are plain strings, (b) using the sanitize middleware that strips operator keys from request data, and (c) letting Mongoose schemas cast types strictly. Never build queries by concatenating request data.
4. **Cross-site scripting (XSS):** when displaying titles, notes, and names, insert them as plain text, never as raw HTML. If you use React, avoid its raw-HTML insertion feature. Optionally strip HTML tags from stored text on the server.
5. **Request size limits:** cap JSON body size to a small value (for example 10 KB).
6. **Date validation:** accept only a well-formed ISO date-time; reject anything else.
7. **Regular expression safety:** if you add search, escape user input so it cannot create expensive patterns.

---

## 12. Security Hardening Checklist

**Transport and headers**
- Force HTTPS in production and enable HSTS.
- Use helmet to set secure headers, including a Content Security Policy that allows scripts and styles only from your own origin.
- Configure CORS to allow only your exact frontend origin, with credentials enabled only if the frontend is on a different origin. Prefer serving frontend and API from the same origin.

**Abuse prevention**
- General rate limit across the API (for example 100 requests per 15 minutes per IP).
- Much stricter limit on login and signup (for example 5 to 10 per 15 minutes).
- Account lockout after repeated failures (Section 7.2).
- If hosted behind a proxy (Render, Railway, Nginx), configure the app to trust the proxy so rate limiting sees real client IPs.

**CSRF**
- SameSite cookies cover most cases. For stronger protection, add a CSRF token mechanism or require a custom request header on all state-changing requests, and verify it on the server.

**Secrets and configuration**
- Keep all secrets in environment variables; rotate the JWT secret if it ever leaks.
- Never log passwords, tokens, or full request bodies.
- Use different secrets and databases for development and production.

**Error handling**
- One central error handler. In production, return generic messages; log details privately. Never expose stack traces or database error text.

**Database**
- Least-privilege database user, IP allow-list, encryption in transit (enabled by default on Atlas), automated backups turned on.
- Disable detailed query debugging in production.

**Dependencies**
- Run the package audit command regularly; keep packages updated; remove unused packages.

**Frontend**
- Do not store tokens in local storage or session storage (the cookie approach avoids this).
- Do not trust the role shown in the interface for anything except display.
- Add the "autocomplete" hints on login and password fields so password managers work.

---

## 13. Frontend Pages and Behavior

### Pages
1. **Signup:** name, email, password, confirm password, link to login.
2. **Login:** email, password, link to signup.
3. **Dashboard (client view):** booking form on top or in a dialog; list of the user's appointments with status badges; reschedule and cancel actions.
4. **Dashboard (admin view):** filters (status, date range, search by client), list of all appointments, approve, reject, complete, cancel actions.
5. **Not found / error page.**

### Behavior rules
- **Route guard:** on load of any protected page, check the session; redirect to login if absent. Redirect logged-in users away from login and signup pages.
- **Feedback:** show loading indicators while requests run; disable submit buttons during submission to prevent double clicks; show inline error messages beside the field concerned; show a success message after actions.
- **Confirmation dialogs** before cancel and reject.
- **Time display:** convert stored UTC times to the browser's local timezone for display, and make this visible (for example, show the timezone name).
- **Slot picker:** instead of free time entry, show a list of available slots for the chosen date, fetched from the availability endpoint. This prevents invalid choices and reduces conflict errors.
- **Empty states:** friendly message when there are no appointments.
- **Session expiry:** if any request returns "not logged in", redirect to login with a short notice.

---

## 14. Responsiveness (Adapting to Different Device Sizes)

1. **Mobile-first approach:** design the smallest screen (320 to 360px wide) first, then enhance for larger screens.
2. **Viewport:** include the standard responsive viewport instruction in every page head. Without it, mobile browsers render a zoomed-out desktop page.
3. **Breakpoints** (adjust to your content): small phones below 480px, large phones and small tablets 480 to 768px, tablets and small laptops 768 to 1024px, desktops above 1024px. Add a breakpoint where the layout actually breaks, not for specific devices.
4. **Layout techniques:** use flexible grid or flexbox layouts; use relative units (percentages, rem, viewport-based sizes) instead of fixed pixel widths; use maximum widths so content does not stretch on very wide screens.
5. **Tables on small screens:** a wide appointments table will not fit on a phone. Choose one: (a) convert each row into a stacked card showing label and value pairs, or (b) wrap the table in a horizontally scrollable container. The card approach gives the best experience. The page itself must never scroll sideways.
6. **Forms on small screens:** single-column layout, full-width inputs, large labels above fields. Use the proper input types (email, date, time, password) so phones show suitable keyboards and native pickers.
7. **Touch targets:** buttons and links at least 44 by 44 pixels with spacing between them, so fingers do not hit the wrong control. Hover-only features must have a touch equivalent.
8. **Navigation:** compact top bar on phones; collapse secondary links into a menu button if needed.
9. **Typography:** base font size at least 16px (smaller sizes cause automatic zoom on some mobile browsers when focusing inputs); comfortable line height; sufficient color contrast.
10. **Images and icons:** scale to container width; prefer scalable vector icons.
11. **Orientation and zoom:** layout must survive rotation; never disable user zooming.
12. **Dark mode (optional):** respect the system preference with a set of color variables.
13. **Test on:** browser developer tools device emulation (phone, tablet, desktop), at least one real phone, and zoom levels of 200 percent.

---

## 15. Optimization

### Database
- Create all indexes in Section 6 and verify the main queries use them with the database's query-explain feature (look for index scans, not collection scans).
- **Pagination:** never return all appointments. Return a page at a time (for example 10 to 20), with page number or cursor. For large data, prefer cursor-based pagination using the start time and id.
- **Projection:** request only the fields the interface displays.
- **Lean reads:** for read-only lists, ask Mongoose to return plain objects instead of full model instances; it is noticeably faster.
- **Avoid repeated lookups:** fetch client names in the same query (a single reference expansion limited to the name field) rather than one lookup per row.
- **Connection management:** create the database connection once at startup and reuse it; the driver pools connections automatically. Set sensible timeouts.
- **Cleanup (optional):** use a time-to-live index or a scheduled job to archive very old completed or cancelled appointments.
- Fail startup clearly if the database is unreachable instead of running half-broken.

### Server
- Enable response compression.
- Set caching headers for static assets (long cache for versioned files, none for HTML and API responses).
- Keep request handlers asynchronous; never run heavy work on the main thread. Password hashing is deliberately slow, so keep its cost factor reasonable (12 is a good balance).
- Use structured logging with levels; keep production logging modest.
- Add a health-check endpoint for the hosting platform.

### Frontend
- Minimize the number of files and total size; minify styles and scripts for production.
- Load scripts at the end or with deferral so the page renders first.
- Avoid large libraries when a small amount of plain code does the job.
- **Debounce** search boxes (wait until the user stops typing before calling the server).
- Request availability for one date at a time; do not preload the whole calendar.
- Update the list locally after an action when safe, or re-fetch only the current page, not everything.
- Use lazy loading for anything not needed on first render.
- Aim for good scores in the browser's built-in auditing tool (Lighthouse) for performance, accessibility, and best practices.

---

## 16. Accessibility (Supports Responsiveness and Quality)

- Every input has a visible label connected to it.
- Status is conveyed by text as well as color (badge says "Approved", not just green).
- Full keyboard navigation with visible focus outlines.
- Error messages are announced to screen readers and tied to their fields.
- Sufficient contrast between text and background.
- Meaningful page titles and heading hierarchy.

---

## 17. Step-by-Step Implementation Order

**Phase 1: Foundation**
1. Set up the project, folders, and environment file.
2. Connect to MongoDB Atlas and confirm a successful connection message.
3. Add the central error handler, security middleware, and a health-check endpoint.

**Phase 2: Data layer**
4. Define the User model with validation and the unique email index.
5. Define the Appointment model with validation and all indexes, including the partial unique slot index.
6. Write the admin seed procedure and run it once.

**Phase 3: Authentication**
7. Build signup (validation, hashing, cookie).
8. Build login (generic errors, lockout, cookie).
9. Build logout and the "who am I" endpoint.
10. Build the authentication check and role check middleware.
11. Apply rate limiters to the authentication routes.
12. Test all authentication behavior with an API testing tool before building pages.

**Phase 4: Appointment logic**
13. Create appointment with all business rules.
14. List with ownership filtering, pagination, and filters.
15. Reschedule with ownership and state checks.
16. Cancel with ownership or admin rule.
17. Admin status change with transition validation.
18. Availability endpoint.
19. Test every endpoint, including failure cases and the double-booking race (send two simultaneous requests for the same slot; exactly one must succeed).

**Phase 5: Frontend**
20. Build the shared stylesheet with mobile-first layout and design variables (colors, spacing, font sizes).
21. Build signup and login pages with validation and feedback.
22. Build the dashboard with route guard, booking form or slot picker, and list.
23. Add admin controls and filters.
24. Add confirmations, loading states, empty states, and session-expiry handling.

**Phase 6: Hardening and polish**
25. Walk through the security checklist (Section 12) item by item.
26. Run responsiveness tests (Section 14) at multiple widths and on a real phone.
27. Run optimization checks (Section 15): index usage, pagination, bundle size, Lighthouse.
28. Fix accessibility issues (Section 16).

**Phase 7: Deployment**
29. Choose a host (Render, Railway, or similar) and set environment variables there, using fresh production secrets.
30. Restrict the Atlas IP allow-list to the host.
31. Confirm HTTPS, the secure cookie flag, and the production error behavior.
32. Enable Atlas backups and basic monitoring and alerts.
33. Repeat the key tests on the live site.

---

## 18. Testing Plan

### Functional
- Signup with valid data, invalid email, short password, duplicate email, empty fields.
- Login with correct and wrong credentials; confirm the same message for unknown email and wrong password.
- Book, reschedule, cancel as a client; approve, reject, complete as admin.
- Confirm illegal status transitions are rejected.
- Past dates, out-of-hours times, and misaligned times are rejected.

### Security
- Access every protected route while logged out: expect 401.
- As a client, call admin routes: expect 403.
- As client A, request client B's appointment id: expect 404.
- Submit operator-style objects in login fields: expect rejection.
- Submit script tags in the title and notes: they must display as plain text.
- Exceed the login rate limit: expect 429, then lockout.
- Try to sign up with a role field set to admin: the role must still be client.
- Inspect cookies in the browser: httpOnly, Secure (in production), SameSite set.
- Confirm no password hash ever appears in any response.

### Concurrency
- Fire two or more simultaneous booking requests for one slot: exactly one succeeds, the rest receive 409.

### Responsive
- Test at 320, 375, 768, 1024, and 1440 pixel widths, both orientations; confirm no horizontal page scroll, readable text, tappable buttons, and usable forms.

### Performance
- With a few thousand sample appointments, confirm list queries remain fast and use indexes; confirm pages load quickly on a throttled mobile connection setting.

---

## 19. Final Submission Checklist

- [ ] No secrets in the code or repository history
- [ ] Default admin credentials changed
- [ ] Production uses HTTPS, secure cookies, strong JWT secret
- [ ] All endpoints validated and authorized on the server
- [ ] Double-booking prevented by a database index
- [ ] Passwords hashed; hash never exposed
- [ ] Rate limiting and lockout active
- [ ] Layout verified on phone, tablet, desktop
- [ ] Lists paginated; indexes verified
- [ ] README explains setup, environment variables, and how to run
- [ ] Test results (tables or screenshots) included in the report

---

## 20. Points to Include in Your Report or Viva

- **Architecture:** browser → Express REST API → MongoDB, with cookie-based JWT sessions.
- **Why MongoDB:** flexible schema, easy hosted setup, strong indexing, natural fit for document-shaped appointments.
- **Key security decisions and the threat each addresses:** hashing (database leak), httpOnly cookie (XSS token theft), SameSite and CSRF protection (cross-site requests), validation and sanitization (injection), rate limiting and lockout (brute force), ownership checks (IDOR), helmet and CSP (browser-level attacks), least-privilege database user (blast radius).
- **Key correctness decision:** unique partial index to eliminate race-condition double bookings.
- **Responsiveness approach:** mobile-first, fluid layouts, table-to-card pattern, touch-friendly controls.
- **Optimization approach:** indexing, pagination, lean queries, compression, caching, debounced search.
- **Limitations and future work:** email and SMS reminders, password reset, two-factor authentication, multiple providers, calendar view, audit dashboard, automated test suite, continuous deployment.

# Admin panel — explained for the external examiner

**URL:** `/admin` (separate layout, dark sidebar). Normal citizens never see a link
to it. If they type the URL they get an "Admin access only" screen, and every admin
API answers **403 Forbidden** for them.

## How login and security work (say this first)
- **Sign-in is handled by Emergent-managed authentication (Clerk).** It supports
  email + password and Google. It does the password hashing, email verification,
  sessions and signed **JWT** tokens. The app never stores a password.
- Every request from the browser carries the JWT (`Authorization: Bearer …`). The
  FastAPI backend **verifies the token's signature** (RS256 public keys) before doing
  anything (`backend/clerk_auth.py`).
- **Authorization (roles):** each person has a record in the MongoDB `users`
  collection with `role = admin | citizen`. The backend reads the role **from the
  database on every request**, never from the browser, so it can't be faked.
  Every admin route has a `require_admin` check (`backend/lib/auth.py`).
- **Who is admin:** only the email in `ADMIN_EMAIL` (`apexkiller2005@gmail.com`).
  It becomes admin on first sign-in, and only after the email is verified.
  Everyone else is a citizen.
- **Data isolation:** a citizen only sees and deletes their own scans. Another
  person's record answers 404.

## The admin features
| Page | What it does | Real database operation |
|---|---|---|
| **Dashboard** | Totals for users, waste identifications, open feedback and active facilities. Bar chart of the last 14 days, category pie chart, most-identified items, recent activity feed | MongoDB aggregation pipelines on `scans`, `users`, `feedback`, `facilities` |
| **Waste records** | Every scan by every citizen. Search by item, filter by category, period, low confidence or user. View full details, delete, export CSV | `find` with regex and filters plus paging; `delete_one` |
| **Categories & rules** | Add, edit or delete waste categories and their official disposal steps, hazards, eco points and colour. Hide a category | `guidelines` collection. **The AI uses these rules immediately** when citizens scan or chat |
| **Facilities** | Add, edit or delete recycling centres, e-waste hubs, scrap dealers and collection points in Chiplun. **Activate or deactivate** with one click | `facilities` collection. Inactive ones disappear from the citizen map and the AI assistant instantly |
| **Users** | Everyone who signed in, with scans count, join date and last activity. Change role (citizen or admin). "View scans" for one user. Blocking is done in Manage → Users & Auth | `users` + aggregation of `scans` per user; `update_one` role. The last admin can't be removed (409) |
| **Feedback** | Complaints and suggestions citizens send with the new Feedback button. Filter by status, reply, mark in progress or resolved, delete spam | `feedback` collection. The citizen sees the reply in their Feedback window |
| **Audit log** | Read-only history of every admin action (who, what, when) | Append-only `admin_audit` collection |

## Why these choices (viva answers)
- **Managed auth instead of hand-written login:** fewer security bugs. It gives
  password reset, email verification, Google sign-in and bot protection for free.
  The app still does its own role-based authorization.
- **Roles in my own database, not inside the token:** a role change applies on
  the very next request, without waiting for tokens to expire.
- **Deactivate vs delete:** facilities that close temporarily (monsoon, holidays)
  can be hidden and restored without losing their data.
- **Audit log:** accountability for an NGO setting (Sahyadri Nisarg Mitra) with
  several staff members.

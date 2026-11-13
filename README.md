# NovaDesk — AI Customer Support Desk

NovaDesk combines a React support dashboard, FastAPI APIs, PostgreSQL with pgvector, and local Ollama models. It includes tenant-isolated accounts, collaborative tickets, a PDF knowledge base, and measurable AI answer evaluations.

## Features

- Email/password authentication with Argon2 password hashes and short-lived JWT access tokens.
- Tenant-scoped workspaces, administrator/agent roles, and expiring email invitations.
- PostgreSQL persistence with pgvector cosine-distance retrieval; SQLite remains available for local development and tests.
- Tenant-filtered conversations, documents, tickets, comments, and audit history.
- Ticket assignment, customer/internal comments, audit events, and SMTP notifications.
- Structured AI ticket suggestions for category, priority, and sentiment. Suggestions remain pending until a signed-in human approves them.
- An evaluation runner measuring answer-term correctness, evidence-term groundedness, retrieval recall, latency, and estimated inference cost.
- JSON request logs, health checks, backend/API tests, and GitHub Actions CI.

## Run with Docker Compose

Docker Compose starts PostgreSQL/pgvector, the API, a production-built React frontend, and Mailpit for local email testing.

1. Copy `.env.example` to `.env`.
2. Replace `POSTGRES_PASSWORD` and `JWT_SECRET_KEY` with random values. For example, generate a random hexadecimal string with:

   ```powershell
   python -c "import secrets; print(secrets.token_hex(32))"
   ```

3. If migrating an existing local database, set `BOOTSTRAP_ADMIN_EMAIL` to the intended owner before starting the API. This prevents another first-time registrant from claiming the legacy workspace.
4. Start Ollama on the host and pull the configured models:

   ```powershell
   ollama pull llama3.2
   ollama pull nomic-embed-text
   ```

5. From the project root:

   ```powershell
   docker compose up --build
   ```

Open the app at http://localhost:5173. Create the first account to initialize the workspace; use an invitation link to add additional team members. Mailpit captures local messages at http://localhost:8025.

The Compose setup uses Mailpit for development. For deployment, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, and `SMTP_USE_TLS` for your mail service, use strong generated database/JWT secrets, and set the correct `FRONTEND_PUBLIC_URL` and `CORS_ORIGINS`. The frontend image is built as static assets and served by Nginx; `/api` and `/ws` are reverse-proxied to FastAPI.

## Run locally with SQLite

Python 3.11+, Node.js 20+, and Ollama are recommended.

```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

If `backend\.env` does not already exist, copy `backend\.env.example` to `backend\.env`. Keep any existing `.env` file; it may contain local credentials. Set `DATABASE_URL=sqlite:///./support_desk.db` and a development-only `JWT_SECRET_KEY`. If the existing SQLite database contains tickets or documents, set `BOOTSTRAP_ADMIN_EMAIL` to the intended owner.

From `backend`:

```powershell
alembic upgrade head
uvicorn app.main:app --reload
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

The API is at http://localhost:8000, Swagger docs at http://localhost:8000/docs, and the UI at http://localhost:5173. Configure an SMTP server to send invitations and ticket notifications; without SMTP, ticket notifications are logged as skipped and invitation creation returns a configuration error.

## Authentication and tenant setup

- The first registration creates the initial administrator and workspace. Later registrations create separate workspaces.
- Set `BOOTSTRAP_ADMIN_EMAIL` when migrating a local database with existing records. Only that address can claim the initial legacy workspace.
- Every resource query is scoped to the authenticated tenant; conversation history is additionally scoped to its owner. WebSocket connections use short-lived, tenant-scoped tokens.
- Access tokens expire after 30 minutes by default. Change `JWT_ACCESS_TOKEN_MINUTES` if required.
- To sign out, select the sign-out icon at the bottom of the left sidebar, beside your name and role.

## Team management

Open **Team** from the left sidebar to view active workspace members. Workspace administrators can invite teammates by email and choose the **Support agent** or **Administrator** role. The invitee follows the single-use email link to set their name and password; invitations expire after 24 hours. Configure SMTP to deliver invitations (local Docker Compose captures them in Mailpit at http://localhost:8025).

## Ticket workflow

Tickets can be assigned to active workspace members. Comments can be marked internal; internal notes are not emailed to the customer. Ticket creation, updates, assignment, comments, and AI suggestion decisions are recorded in an audit history.

Use **AI classify** on a ticket to generate category, priority, sentiment, and a short reason. The current ticket fields do not change until a human selects **Approve**. Rejecting a suggestion is also recorded.

Notifications go to the assignee or workspace owner and, when provided, the customer's email. New comments notify the assignee and customer unless the comment is internal. SMTP failures are logged in structured form.

## AI evaluations

The sample evaluation cases use synthetic shipping, refund, and support-hours policies. With Docker Compose, get the `tenant_id` from `GET /api/auth/me`, then seed the fixture passages and run the benchmark:

```powershell
docker compose exec api python -m app.seed_evaluation_data --tenant-id 1
docker compose exec api python -m app.evaluation --email you@example.com
```

Use the tenant ID returned by `/api/auth/me` instead of `1` for additional workspaces. The evaluation runner prompts for the account password and emits per-case and aggregate JSON:

- **Correctness:** fraction of expected answer phrases present.
- **Groundedness:** fraction of expected evidence phrases present when an expected source was retrieved.
- **Retrieval recall:** fraction of expected source documents returned.
- **Latency:** Ollama-reported duration, falling back to measured API time.
- **Estimated cost:** configured per-million-token rates times Ollama usage counts. Local Ollama defaults to zero cost.

The phrase-based correctness/groundedness scores are deterministic regression indicators, not a semantic model judge. Extend `backend/evaluation/cases.json` with domain-specific expected phrases and source files.

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create the first workspace or a new tenant |
| POST | `/api/auth/login` | Authenticate and receive an access token |
| GET | `/api/auth/me` | Current user and workspace |
| POST | `/api/auth/ws-token` | Mint a short-lived WebSocket token |
| GET/POST | `/api/team` and `/api/team/invitations` | List members and invite users |
| POST | `/api/auth/accept-invitation` | Accept an invitation |
| POST | `/api/chat` | Ask a grounded assistant question |
| GET/POST | `/api/tickets` | List or create tickets |
| PATCH | `/api/tickets/{id}` | Update status, priority, category, or assignee |
| POST | `/api/tickets/{id}/classify` | Generate pending AI classification |
| POST | `/api/tickets/{id}/classification/{approve\|reject}` | Human decision on classification |
| GET/POST | `/api/tickets/{id}/comments` | Read or add comments |
| GET | `/api/tickets/{id}/audit` | Read ticket audit history |
| POST/GET/DELETE | `/api/documents` | Upload, list, or delete tenant documents |
| GET | `/api/health` | API, database, and Ollama health |
| WS | `/ws?token=...` | Tenant-isolated live ticket updates |

Protected endpoints require `Authorization: Bearer <access_token>`.

## Migrations, tests, and CI

Run database migrations with `alembic upgrade head` from `backend`. The migration preserves legacy SQLite ticket, conversation, and document rows in the initial workspace. PostgreSQL enables the `vector` extension and stores embeddings as fixed-dimension vectors with an HNSW cosine index.

Run backend tests and the frontend production build:

```powershell
cd backend
python -m pytest -q
cd ..\frontend
npm ci
npm run build
```

GitHub Actions runs the migration, backend tests, and frontend build on pushes and pull requests to `main`.

## Project layout

```text
backend/
  app/                 FastAPI endpoints, auth, models, evaluation, and services
  evaluation/          Synthetic benchmark cases and policy fixtures
  migrations/          Alembic database migration
  tests/               API, migration, and evaluation tests
frontend/
  src/                 React UI
  Dockerfile           Static production build
  nginx.conf           SPA and API/WebSocket reverse proxy
docker-compose.yml     PostgreSQL/pgvector, API, Mailpit, and web
```

## Operational notes

- Health checks verify PostgreSQL connectivity and frontend/API responsiveness. Ollama is reported separately so the API can start while the local model service is unavailable.
- Uploaded PDFs are extracted in memory; files are not retained on the API container.
- `EMBEDDING_DIMENSION` must match the configured embedding model. The default 768 dimension matches `nomic-embed-text`.
- Avoid exposing Swagger, Mailpit, PostgreSQL, or an Ollama host port publicly without appropriate network controls.
- This starter does not yet include password reset, rate limiting, identity federation, or a customer-facing ticket portal.

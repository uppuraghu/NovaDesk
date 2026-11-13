# NovaDesk — Full-Stack AI Customer Support Desk (Day 6)

A runnable hackathon-style project built with React + Vite, FastAPI, SQLite, Ollama, PDF ingestion, retrieval-augmented generation (RAG), and WebSockets.

## Features

- React dashboard with overview, assistant, tickets, and knowledge-base pages.
- FastAPI REST API with interactive Swagger docs at `/docs`.
- Local LLM responses through Ollama (`llama3.2`).
- PDF knowledge ingestion with page-aware chunking.
- RAG: `nomic-embed-text` embeddings stored in SQLite and cosine-similarity retrieval.
- Source references returned with AI answers.
- Ticket create/update workflow with persistent SQLite storage.
- WebSocket broadcasts for ticket creation and updates.
- Responsive UI and Docker Compose setup.

> This is a learning/hackathon starter, not a production-ready customer support system. It has no user authentication, authorization, rate limiting, or tenant isolation. Do not upload confidential customer data.

## Architecture

```text
React UI (5173)
   | REST + WebSocket
FastAPI (8000)
   |-- SQLite: tickets, conversations, messages, document chunks
   |-- PDF extraction -> chunking -> Ollama embeddings -> vector similarity retrieval
   |-- Ollama chat model -> grounded response + source references
Ollama (11434)
   |-- llama3.2
   |-- nomic-embed-text
```

## Requirements

- Python 3.10+
- Node.js 18+
- Ollama installed and running
- At least one Ollama chat model and one embedding model

## 1. Start Ollama

Open a terminal:

```bash
ollama pull llama3.2
ollama pull nomic-embed-text
ollama serve
```

If Ollama is already running as a Windows background service, you do not need to run `ollama serve` again. Verify:

```bash
ollama list
```

## 2. Start the backend (Windows PowerShell)

Open terminal 1:

```powershell
cd day6-ai-support-desk/backend
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

Backend:
- API: http://localhost:8000
- Swagger docs: http://localhost:8000/docs
- Health: http://localhost:8000/api/health

If PowerShell blocks activation, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`, then activate again. Or use `py -m pip install -r requirements.txt` without activating the environment.

## 3. Start the React UI

Open terminal 2:

```powershell
cd day6-ai-support-desk/frontend
npm install
npm run dev
```

Open http://localhost:5173.

## 4. Try the full workflow

1. Open **Knowledge base** and upload a PDF with selectable text.
2. Wait for the indexing success message.
3. Open **AI Assistant** and ask a question answered by the PDF.
4. Inspect the source filename, page and similarity score below the answer.
5. Open **Tickets**, create a ticket and change its status.
6. Open another browser tab to the dashboard: ticket changes are broadcast over WebSocket and the UI refreshes live.

For a useful demo, create a short PDF containing your own fictional company policies, such as refund rules, support hours, delivery timelines, and password-reset steps.

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | API and Ollama health |
| POST | `/api/chat` | Ask the AI assistant |
| GET | `/api/conversations` | List recent conversations |
| POST | `/api/documents/upload` | Upload and index a PDF |
| GET | `/api/documents` | List indexed documents |
| DELETE | `/api/documents/{filename}` | Remove indexed chunks |
| GET | `/api/tickets` | List tickets |
| POST | `/api/tickets` | Create ticket |
| PATCH | `/api/tickets/{ticket_id}` | Update status/priority |
| GET | `/api/stats` | Dashboard counts |
| WS | `/ws` | Live ticket events |

## Example API request

```json
{
  "message": "What is the refund policy?",
  "conversation_id": null
}
```

Send to `POST http://localhost:8000/api/chat`.

## RAG implementation details

- `pypdf` extracts text from each PDF page.
- `split_text()` creates chunks of about 850 characters with 120 characters overlap.
- Ollama `nomic-embed-text` converts each chunk into a vector.
- Vectors are saved as JSON in SQLite for this small local demo.
- Each query is embedded and compared with stored vectors using cosine similarity.
- Top matching passages are passed to `llama3.2` as context.
- The API returns source filename and page number.

The similarity cutoff in this starter is a simple heuristic, not a calibrated confidence score. For larger datasets, move vectors to Chroma, FAISS, or pgvector and add metadata filters, reranking, and retrieval evaluation.

## Docker option

Keep Ollama running on the host, then from the project root:

```bash
docker compose up --build
```

Open http://localhost:5173. The API container reaches host Ollama through `host.docker.internal`. If this networking setup is unavailable, run backend and frontend directly using the steps above.

## Troubleshooting

- **Ollama not detected:** run `ollama list`; start Ollama; check `http://localhost:11434/api/tags`.
- **Model not found:** run `ollama pull llama3.2` and `ollama pull nomic-embed-text`.
- **Chat returns 503:** verify Ollama is reachable and both models are installed.
- **PDF upload fails:** check that it is a text-based PDF and smaller than 15 MB. Scanned PDFs need OCR.
- **Frontend cannot connect:** confirm FastAPI is running on port 8000 and Vite on 5173.
- **Port already in use:** stop the process using that port or change the port in the run command/configuration.
- **No live updates:** check browser console and ensure the WebSocket URL `ws://localhost:8000/ws` is reachable.

## Suggested hackathon improvements

1. Add authentication and per-user/tenant access control.
2. Use PostgreSQL + pgvector for production persistence and vector search.
3. Add ticket assignment, comments, audit history, and email notifications.
4. Add structured AI classification (category, priority, sentiment) and human approval before actions.
5. Add evaluation cases for answer correctness, groundedness, retrieval recall, latency, and cost.
6. Add tests, structured logs, Docker health checks, and CI.

## How to explain this project in an interview

"I built a full-stack AI support desk. The frontend is React and the backend is FastAPI. I integrated a local Ollama model so customer questions can be answered without sending data to an external LLM provider. For company-specific answers, I implemented a RAG pipeline: PDFs are extracted, split into overlapping chunks, embedded with an embedding model, stored in SQLite, and retrieved using cosine similarity. The retrieved passages are added to the LLM prompt, and the API returns source references. I also built ticket CRUD APIs, dashboard metrics, and WebSocket events so ticket updates appear live in the UI. I chose SQLite to make the demo easy to run locally, and I would move to PostgreSQL with pgvector, add authentication, and introduce retrieval evaluation before production."

## Project structure

```text
day6-ai-support-desk/
├── backend/
│   ├── app/
│   │   ├── ai.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── realtime.py
│   │   └── schemas.py
│   ├── uploads/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml
└── README.md
```

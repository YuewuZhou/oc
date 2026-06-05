# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install deps (first time)
python3 -m venv venv && venv/bin/pip install -r requirements.txt

# Run the API server
venv/bin/uvicorn api:app --reload

# Run all tests
venv/bin/python -m pytest tests/ -v

# Run a single test
venv/bin/python -m pytest tests/test_smoke.py::test_notify_creates_job -v
```

## Architecture

Request flow: `POST /notify` → validates template exists → enqueues `EmailJob` into SQLite → returns job_id. A background asyncio worker (started in FastAPI lifespan) polls the DB every 5s, calls `render_template` + `send_email` for each due job, and updates status.

**Key files:**
- `api.py` — FastAPI app + Pydantic request/response models. The lifespan starts the queue worker. `JobDetail` uses `ConfigDict(from_attributes=True)` to serialize from the `EmailJob` dataclass.
- `email_queue.py` — SQLite-backed `EmailQueue` (named `email_queue`, not `queue` — stdlib name collision). `cancel()` sets status to `'failed'` for pending jobs only.
- `sender.py` — `send_email()` uses aiosmtplib. Port 465 = SSL, 587 = STARTTLS. Retries 3× with exponential backoff; auth failures are non-retryable.
- `templates.py` — Jinja2 loader from `templates/`. `render_template()` returns `(html_body, text_body)`. `template_exists()` is used for pre-validation in the API without a full render.
- `config.py` — uses `pydantic_settings.BaseSettings` (separate package from pydantic v2). All settings are read from env vars; see `.env.example`.

**Adding a template:** drop a `<name>.html` file in `templates/` extending `base.html`. Use `{% block content %}` for the body and `{% block subject %}` for the heading. The name (without `.html`) is the `template_name` in POST /notify.

## Known gotchas

- `pydantic_settings` must be installed separately (`pydantic-settings` package); `BaseSettings` was removed from pydantic v2 core.
- Do not rename `email_queue.py` back to `queue.py` — it shadows the stdlib `queue` module and breaks `aiosqlite`.
- The queue worker holds an open `aiosqlite` connection per poll cycle; each `enqueue`/`get`/`list` opens its own connection. This is intentional for simplicity but means high-frequency polling could be a bottleneck under load.

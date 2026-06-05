# Email Notification Service

A small FastAPI-based email notification scaffold with SMTP configuration, template rendering, and job queue placeholders.

## Setup

1. Copy `.env.example` to `.env` and adjust values.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

## Run

Start the API server with Uvicorn:

```bash
uvicorn api:app --reload
```

## Environment variables

| Variable | Description | Example |
| --- | --- | --- |
| `SMTP_HOST` | SMTP server hostname | `localhost` |
| `SMTP_PORT` | SMTP server port | `1025` |
| `SMTP_USER` | SMTP username | `demo-user` |
| `SMTP_PASS` | SMTP password | `demo-password` |
| `FROM_EMAIL` | Default sender address | `no-reply@example.com` |

The service currently exposes placeholder notification and job routes, plus Jinja2 templates for welcome, alert, and digest emails.

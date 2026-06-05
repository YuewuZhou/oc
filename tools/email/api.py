from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from email_queue import EmailJob, EmailQueue
from sender import send_email
from templates import render_template, TemplateNotFoundError, template_exists

queue = EmailQueue()


class NotifyRequest(BaseModel):
    to: str
    subject: str
    template_name: str
    context: dict[str, Any] = Field(default_factory=dict)
    scheduled_at: Optional[datetime] = None


class JobResponse(BaseModel):
    job_id: str
    status: str


class JobDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    to: str
    subject: str
    template_name: str
    context: dict[str, Any]
    status: str
    retries: int
    max_retries: int
    scheduled_at: datetime
    created_at: datetime


@asynccontextmanager
async def lifespan(app: FastAPI):
    await queue._ensure_db()
    app.state.queue = queue
    yield


async def _send_job(job: EmailJob) -> None:
    html_body, text_body = render_template(job.template_name, job.context)
    await send_email(job.to, job.subject, html_body, text_body)


app = FastAPI(title="Email Notification Service", lifespan=lifespan)


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.post("/notify", response_model=JobResponse)
async def notify(payload: NotifyRequest) -> JobResponse:
    if not template_exists(payload.template_name):
        raise HTTPException(status_code=422, detail=f"Template '{payload.template_name}' not found")
    scheduled_at = payload.scheduled_at or datetime.utcnow()
    job = EmailJob(
        to=payload.to,
        subject=payload.subject,
        template_name=payload.template_name,
        context=payload.context,
        scheduled_at=scheduled_at,
    )
    job_id = await queue.enqueue(job)
    return JobResponse(job_id=job_id, status=job.status)


@app.get("/jobs")
async def list_jobs(status: Optional[str] = None) -> list[JobDetail]:
    jobs = await queue.list(status=status)
    return [JobDetail.model_validate(job) for job in jobs]


@app.get("/jobs/{job_id}", response_model=JobDetail)
async def get_job(job_id: str) -> JobDetail:
    job = await queue.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobDetail.model_validate(job)


@app.delete("/jobs/{job_id}")
async def delete_job(job_id: str) -> dict[str, str]:
    cancelled = await queue.cancel(job_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"detail": "Job cancelled"}

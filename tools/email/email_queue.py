from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional

import aiosqlite

from config import settings


@dataclass
class EmailJob:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    to: str = ""
    subject: str = ""
    template_name: str = ""
    context: Dict[str, Any] = field(default_factory=dict)
    status: str = "pending"
    retries: int = 0
    max_retries: int = 3
    scheduled_at: datetime = field(default_factory=datetime.utcnow)
    created_at: datetime = field(default_factory=datetime.utcnow)


class EmailQueue:
    def __init__(self, db_path: str = settings.DB_PATH) -> None:
        self.db_path = db_path
        self._init_lock = asyncio.Lock()
        self._initialized = False

    async def _ensure_db(self) -> None:
        if self._initialized:
            return
        async with self._init_lock:
            if self._initialized:
                return
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(
                    """
                    CREATE TABLE IF NOT EXISTS email_jobs (
                        id TEXT PRIMARY KEY,
                        to_email TEXT NOT NULL,
                        subject TEXT NOT NULL,
                        template_name TEXT NOT NULL,
                        context TEXT NOT NULL,
                        status TEXT NOT NULL,
                        retries INTEGER NOT NULL,
                        max_retries INTEGER NOT NULL,
                        scheduled_at TEXT NOT NULL,
                        created_at TEXT NOT NULL
                    )
                    """
                )
                await db.commit()
            self._initialized = True

    @staticmethod
    def _serialize_dt(value: datetime) -> str:
        return value.isoformat()

    @staticmethod
    def _deserialize_dt(value: str) -> datetime:
        return datetime.fromisoformat(value)

    @staticmethod
    def _row_to_job(row: aiosqlite.Row) -> EmailJob:
        return EmailJob(
            id=row[0],
            to=row[1],
            subject=row[2],
            template_name=row[3],
            context=json.loads(row[4]),
            status=row[5],
            retries=row[6],
            max_retries=row[7],
            scheduled_at=datetime.fromisoformat(row[8]),
            created_at=datetime.fromisoformat(row[9]),
        )

    async def enqueue(self, job: EmailJob) -> str:
        await self._ensure_db()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                INSERT INTO email_jobs (
                    id, to_email, subject, template_name, context, status,
                    retries, max_retries, scheduled_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job.id,
                    job.to,
                    job.subject,
                    job.template_name,
                    json.dumps(job.context),
                    job.status,
                    job.retries,
                    job.max_retries,
                    self._serialize_dt(job.scheduled_at),
                    self._serialize_dt(job.created_at),
                ),
            )
            await db.commit()
        return job.id

    async def get(self, job_id: str) -> Optional[EmailJob]:
        await self._ensure_db()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM email_jobs WHERE id = ?", (job_id,))
            row = await cursor.fetchone()
            await cursor.close()
        return self._row_to_job(row) if row else None

    async def list(self, status: Optional[str] = None) -> List[EmailJob]:
        await self._ensure_db()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            if status is None:
                cursor = await db.execute("SELECT * FROM email_jobs ORDER BY created_at ASC")
            else:
                cursor = await db.execute(
                    "SELECT * FROM email_jobs WHERE status = ? ORDER BY created_at ASC",
                    (status,),
                )
            rows = await cursor.fetchall()
            await cursor.close()
        return [self._row_to_job(row) for row in rows]

    async def cancel(self, job_id: str) -> bool:
        await self._ensure_db()
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "UPDATE email_jobs SET status = 'failed' WHERE id = ? AND status = 'pending'",
                (job_id,),
            )
            await db.commit()
            return cursor.rowcount > 0

    async def worker(self, sender_fn: Callable[[EmailJob], Any]) -> None:
        await self._ensure_db()
        while True:
            now = datetime.utcnow()
            async with aiosqlite.connect(self.db_path) as db:
                db.row_factory = aiosqlite.Row
                cursor = await db.execute(
                    """
                    SELECT * FROM email_jobs
                    WHERE status = 'pending' AND scheduled_at <= ?
                    ORDER BY scheduled_at ASC
                    """,
                    (self._serialize_dt(now),),
                )
                rows = await cursor.fetchall()
                await cursor.close()
                for row in rows:
                    job = self._row_to_job(row)
                    try:
                        result = sender_fn(job)
                        if asyncio.iscoroutine(result):
                            await result
                        await db.execute(
                            "UPDATE email_jobs SET status = 'sent' WHERE id = ?",
                            (job.id,),
                        )
                    except Exception:
                        retries = job.retries + 1
                        if retries >= job.max_retries:
                            await db.execute(
                                "UPDATE email_jobs SET status = 'failed', retries = ? WHERE id = ?",
                                (retries, job.id),
                            )
                        else:
                            backoff_minutes = 2 ** job.retries
                            next_run = now + timedelta(minutes=backoff_minutes)
                            await db.execute(
                                """
                                UPDATE email_jobs
                                SET retries = ?, scheduled_at = ?
                                WHERE id = ?
                                """,
                                (retries, self._serialize_dt(next_run), job.id),
                            )
                await db.commit()
            await asyncio.sleep(5)

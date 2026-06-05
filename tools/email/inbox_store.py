from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import aiosqlite

from config import settings


@dataclass
class ReceivedMessage:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    from_address: str = ""
    to_address: str = ""
    subject: str = ""
    body_text: str = ""
    body_html: str = ""
    received_at: datetime = field(default_factory=datetime.utcnow)
    saved_at: datetime = field(default_factory=datetime.utcnow)
    read: bool = False


class InboxStore:
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
                    CREATE TABLE IF NOT EXISTS received_messages (
                        id TEXT PRIMARY KEY,
                        from_address TEXT NOT NULL,
                        to_address TEXT NOT NULL,
                        subject TEXT NOT NULL,
                        body_text TEXT NOT NULL,
                        body_html TEXT NOT NULL,
                        received_at TEXT NOT NULL,
                        saved_at TEXT NOT NULL,
                        read INTEGER NOT NULL
                    )
                    """
                )
                await db.commit()
            self._initialized = True

    @staticmethod
    def _serialize_dt(value: datetime) -> str:
        return value.isoformat()

    @staticmethod
    def _row_to_message(row: aiosqlite.Row) -> ReceivedMessage:
        return ReceivedMessage(
            id=row[0],
            from_address=row[1],
            to_address=row[2],
            subject=row[3],
            body_text=row[4],
            body_html=row[5],
            received_at=datetime.fromisoformat(row[6]),
            saved_at=datetime.fromisoformat(row[7]),
            read=bool(row[8]),
        )

    async def save(self, msg: ReceivedMessage) -> str:
        await self._ensure_db()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                INSERT OR IGNORE INTO received_messages (
                    id, from_address, to_address, subject, body_text, body_html,
                    received_at, saved_at, read
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    msg.id,
                    msg.from_address,
                    msg.to_address,
                    msg.subject,
                    msg.body_text,
                    msg.body_html,
                    self._serialize_dt(msg.received_at),
                    self._serialize_dt(msg.saved_at),
                    int(msg.read),
                ),
            )
            await db.commit()
        return msg.id

    async def get(self, msg_id: str) -> Optional[ReceivedMessage]:
        await self._ensure_db()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM received_messages WHERE id = ?", (msg_id,))
            row = await cursor.fetchone()
            await cursor.close()
        return self._row_to_message(row) if row else None

    async def list(self, read: bool | None = None) -> list[ReceivedMessage]:
        await self._ensure_db()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            if read is None:
                cursor = await db.execute("SELECT * FROM received_messages ORDER BY received_at DESC")
            else:
                cursor = await db.execute(
                    "SELECT * FROM received_messages WHERE read = ? ORDER BY received_at DESC",
                    (int(read),),
                )
            rows = await cursor.fetchall()
            await cursor.close()
        return [self._row_to_message(row) for row in rows]

    async def delete(self, msg_id: str) -> bool:
        await self._ensure_db()
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("DELETE FROM received_messages WHERE id = ?", (msg_id,))
            await db.commit()
            return cursor.rowcount > 0

    async def mark_read(self, msg_id: str) -> bool:
        await self._ensure_db()
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "UPDATE received_messages SET read = 1 WHERE id = ? AND read = 0",
                (msg_id,),
            )
            await db.commit()
            return cursor.rowcount > 0

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from email import message_from_bytes
from email.header import decode_header, make_header
from email.message import Message
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from typing import Awaitable, Callable

import aioimaplib

from config import settings

logger = logging.getLogger(__name__)


@dataclass
class ReceivedMessage:
    id: str
    from_address: str
    to_address: str
    subject: str
    body_text: str
    body_html: str
    received_at: datetime
    saved_at: datetime = field(default_factory=datetime.utcnow)
    read: bool = False


class _HTMLStripper(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def get_data(self) -> str:
        return "".join(self.parts)


def _decode_value(value: str | None) -> str:
    if not value:
        return ""
    return str(make_header(decode_header(value)))


def _strip_html(html: str) -> str:
    parser = _HTMLStripper()
    parser.feed(html)
    return re.sub(r"\s+", " ", parser.get_data()).strip()


def _get_body_parts(msg: Message) -> tuple[str, str]:
    text_body = ""
    html_body = ""

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = part.get_content_disposition()
            if content_disposition == "attachment":
                continue
            payload = part.get_payload(decode=True)
            if payload is None:
                continue
            charset = part.get_content_charset() or "utf-8"
            body = payload.decode(charset, errors="replace")
            if content_type == "text/plain" and not text_body:
                text_body = body
            elif content_type == "text/html" and not html_body:
                html_body = body
    else:
        payload = msg.get_payload(decode=True)
        if payload is not None:
            charset = msg.get_content_charset() or "utf-8"
            body = payload.decode(charset, errors="replace")
            if msg.get_content_type() == "text/html":
                html_body = body
            else:
                text_body = body

    if not text_body and html_body:
        text_body = _strip_html(html_body)

    return text_body, html_body


async def fetch_unseen(current_settings=settings) -> list[ReceivedMessage]:
    client = aioimaplib.IMAP4_SSL(current_settings.imap_host, current_settings.imap_port)
    try:
        await client.wait_hello_from_server()
        await client.login(current_settings.imap_user, current_settings.imap_pass)
        await client.select(current_settings.imap_mailbox)
        subject_filter = current_settings.imap_subject_filter
        response = await client.search(f'UNSEEN SUBJECT "{subject_filter}"')
        message_ids = response.lines[0].decode().split() if response.lines and response.lines[0] else []
        messages: list[ReceivedMessage] = []

        for message_id in message_ids:
            fetch_response = await client.fetch(message_id, "(RFC822)")
            raw_message = fetch_response.lines[1]
            msg = message_from_bytes(raw_message)
            text_body, html_body = _get_body_parts(msg)
            received_at = datetime.utcnow()
            date_header = msg.get("Date")
            if date_header:
                try:
                    received_at = parsedate_to_datetime(date_header)
                except Exception:
                    received_at = datetime.utcnow()
            message_identifier = msg.get("Message-ID")
            if message_identifier:
                message_identifier = message_identifier.strip().strip("<>")
            else:
                message_identifier = str(uuid.uuid4())
            messages.append(
                ReceivedMessage(
                    id=message_identifier,
                    from_address=_decode_value(msg.get("From")),
                    to_address=_decode_value(msg.get("To")),
                    subject=_decode_value(msg.get("Subject")),
                    body_text=text_body,
                    body_html=html_body,
                    received_at=received_at,
                )
            )
            await client.store(message_id, "+FLAGS", "\\Seen")

        return messages
    finally:
        try:
            await client.logout()
        except Exception:
            pass


async def run_receiver(store_fn: Callable[[ReceivedMessage], Awaitable[None]]) -> None:
    while True:
        logger.info("Starting IMAP fetch cycle")
        try:
            messages = await fetch_unseen()
            logger.info("Fetched %d messages", len(messages))
            for message in messages:
                await store_fn(message)
        except Exception:
            logger.exception("IMAP fetch cycle failed")
        await asyncio.sleep(settings.imap_poll_interval)

from __future__ import annotations

import importlib
import sys

import pytest
from aiosmtpd.controller import Controller
from pydantic_settings import BaseSettings


class CapturingHandler:
    def __init__(self, messages: list[dict[str, object]]) -> None:
        self.messages = messages

    async def handle_DATA(self, server, session, envelope):
        self.messages.append(
            {
                "mail_from": envelope.mail_from,
                "rcpt_tos": list(envelope.rcpt_tos),
                "content": envelope.content.decode("utf-8", errors="replace"),
            }
        )
        return "250 Message accepted"


class TestSettings(BaseSettings):
    smtp_host: str
    smtp_port: int
    smtp_user: str = ""
    smtp_pass: str = ""
    from_email: str = "no-reply@example.com"
    DB_PATH: str

    model_config = {"env_prefix": "", "case_sensitive": False}


@pytest.fixture
def smtp_server(unused_tcp_port):
    messages: list[dict[str, object]] = []
    handler = CapturingHandler(messages)
    controller = Controller(handler, hostname="127.0.0.1", port=unused_tcp_port)
    controller.start()
    try:
        yield {
            "host": controller.hostname,
            "port": controller.port,
            "messages": messages,
        }
    finally:
        controller.stop()


@pytest.fixture
def app(tmp_path, monkeypatch, smtp_server):
    db_path = tmp_path / "jobs.db"
    monkeypatch.setenv("SMTP_HOST", smtp_server["host"])
    monkeypatch.setenv("SMTP_PORT", str(smtp_server["port"]))
    monkeypatch.setenv("FROM_EMAIL", "no-reply@example.com")
    monkeypatch.setenv("DB_PATH", str(db_path))

    for module_name in ("config", "email_queue", "sender", "api"):
        sys.modules.pop(module_name, None)

    config = importlib.import_module("config")
    config.settings = TestSettings()
    email_queue = importlib.import_module("email_queue")
    email_queue.settings = config.settings
    sender = importlib.import_module("sender")
    sender.settings = config.settings
    api = importlib.import_module("api")
    api.queue = email_queue.EmailQueue(db_path=str(db_path))
    return api.app

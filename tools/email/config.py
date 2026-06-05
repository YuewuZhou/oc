from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_pass: str = ""
    from_email: str = "no-reply@example.com"
    DB_PATH: str = "jobs.db"
    imap_host: str = "imap.gmail.com"
    imap_port: int = 993
    imap_user: str = ""
    imap_pass: str = ""
    imap_mailbox: str = "INBOX"
    imap_poll_interval: int = 30  # seconds between polls
    imap_subject_filter: str = "JARVAN"  # IMAP SUBJECT search term; matches subject contains
    claude_model: str = "claude-sonnet-4-6"
    claude_system_prompt: str = "You are a helpful assistant communicating via email. Be concise and friendly. Do not include subject lines or email headers in your reply — just the body text."

    class Config:
        env_prefix = ""
        case_sensitive = False


settings = Settings()

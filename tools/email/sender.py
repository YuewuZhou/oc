import asyncio
import logging
from email.message import EmailMessage
from typing import Any

import aiosmtplib
from aiosmtplib.errors import SMTPAuthenticationError, SMTPException

from config import settings

logger = logging.getLogger(__name__)


class EmailSendError(Exception):
    def __init__(self, message: str, recipient: str, original_exc: Exception) -> None:
        super().__init__(message)
        self.recipient = recipient
        self.original_exc = original_exc


async def send_email(to: str, subject: str, html_body: str, text_body: str) -> None:
    message = EmailMessage()
    message["From"] = settings.from_email
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    use_ssl = settings.smtp_port == 465
    start_tls = settings.smtp_port == 587
    last_exc: Exception | None = None

    for attempt in range(1, 4):
        logger.info("Sending email to %s (attempt %d/3)", to, attempt)
        smtp = aiosmtplib.SMTP(
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            use_tls=use_ssl,
            start_tls=start_tls,
        )
        try:
            await smtp.connect()
            if settings.smtp_user:
                await smtp.login(settings.smtp_user, settings.smtp_pass)
            await smtp.send_message(message)
            logger.info("Sent email to %s", to)
            return
        except SMTPAuthenticationError as exc:
            logger.error("Permanent SMTP auth failure sending email to %s: %s", to, exc)
            raise EmailSendError("Failed to send email", to, exc) from exc
        except SMTPException as exc:
            last_exc = exc
            if attempt == 3:
                logger.error("Permanent SMTP failure sending email to %s: %s", to, exc)
                raise EmailSendError("Failed to send email", to, exc) from exc
            delay = 2 ** (attempt - 1)
            logger.warning(
                "Transient SMTP failure sending email to %s on attempt %d/3: %s; retrying in %ds",
                to,
                attempt,
                exc,
                delay,
            )
            await asyncio.sleep(delay)
        except Exception as exc:
            logger.error("Unexpected failure sending email to %s: %s", to, exc)
            raise EmailSendError("Failed to send email", to, exc) from exc
        finally:
            try:
                await smtp.quit()
            except Exception:
                pass

    if last_exc is not None:
        raise EmailSendError("Failed to send email", to, last_exc)

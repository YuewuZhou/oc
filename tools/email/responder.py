import asyncio, logging
from receiver import ReceivedMessage
from sender import send_email

logger = logging.getLogger(__name__)
import os as _os
OPENCLAUDE = _os.path.join(_os.path.dirname(_os.path.realpath(__file__)), "../../dist/cli.mjs")


async def respond(msg: ReceivedMessage) -> None:
    reply_subject = msg.subject if msg.subject.lower().startswith("re:") else f"Re: {msg.subject}"
    prompt = f"""You are an email assistant replying on behalf of the recipient.
Output ONLY the reply body — no subject line, no "From:" header, no signature. Just the response text.

From: {msg.from_address}
Subject: {msg.subject}

{msg.body_text or msg.body_html}"""
    proc = await asyncio.create_subprocess_exec(
        "node", OPENCLAUDE, "-p",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(prompt.encode()), timeout=300)
    reply_text = stdout.decode().strip()
    if not reply_text or proc.returncode != 0:
        logger.error("Kevin failed for %s: %s", msg.from_address, stderr.decode().strip())
        raise RuntimeError("Kevin failed to generate a reply")
    html_body = f"<p>{reply_text.replace(chr(10), '<br>')}</p>"
    await send_email(to=msg.from_address, subject=reply_subject, html_body=html_body, text_body=reply_text)
    logger.info("Sent reply to %s", msg.from_address)

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv


async def main() -> None:
    load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")
    from inbox_store import InboxStore
    from receiver import fetch_unseen
    from responder import respond

    store = InboxStore()
    await store._ensure_db()
    messages = await fetch_unseen()
    processed = 0
    for msg in messages:
        await store.save(msg)
        try:
            await respond(msg)
        except Exception:
            pass
        processed += 1
    print(f"Poll complete: {processed} new messages processed")


if __name__ == "__main__":
    asyncio.run(main())

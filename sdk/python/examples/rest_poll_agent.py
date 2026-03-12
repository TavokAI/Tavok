"""REST Poll Agent — no WebSocket required.

Uses HTTP long-polling instead of WebSocket. Ideal for serverless
environments (AWS Lambda, Cloud Functions), cron jobs, or systems
that cannot hold persistent connections.

Usage:
    export TAVOK_API_KEY="sk-tvk-..."
    export TAVOK_AGENT_ID="01HXY..."

    pip install httpx
    python rest_poll_agent.py
"""

import asyncio
import logging
import os

from tavok.rest import RestAgent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

API_URL = os.environ.get("TAVOK_API_URL", "http://localhost:5555")
API_KEY = os.environ.get("TAVOK_API_KEY", "")
AGENT_ID = os.environ.get("TAVOK_AGENT_ID", "")


async def main() -> None:
    agent = RestAgent(
        api_url=API_URL,
        api_key=API_KEY,
        agent_id=AGENT_ID,
    )

    print(f"REST poll agent started (id={AGENT_ID})")
    print("Polling for messages... Press Ctrl+C to stop.")

    try:
        while True:
            # Long-poll: waits up to 10s for new messages
            messages = await agent.poll(wait=10, ack=True)

            for msg in messages:
                print(f"[{msg.channel_id}] {msg.author_name}: {msg.content}")

                # Stream a response token-by-token
                stream = await agent.start_stream(msg.channel_id)
                words = f"You said: {msg.content}".split()
                for word in words:
                    await stream.token(word + " ")
                    await asyncio.sleep(0.05)  # Simulate thinking
                await stream.complete(" ".join(words))

            if not messages:
                await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    asyncio.run(main())

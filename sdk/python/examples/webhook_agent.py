"""Webhook Agent — receive messages via HTTP POST.

Tavok pushes messages to your server's webhook URL. No polling or
WebSocket needed — just expose an HTTP endpoint. Perfect for
existing web services that want to add agent capabilities.

Usage:
    export TAVOK_WEBHOOK_SECRET="your-webhook-secret"
    export TAVOK_API_KEY="sk-tvk-..."
    export TAVOK_AGENT_ID="01HXY..."

    pip install fastapi uvicorn httpx
    python webhook_agent.py

Then configure the agent's webhookUrl in Tavok to point to your
server (e.g., https://your-domain.com/webhook).
"""

import logging
import os

from fastapi import FastAPI, Request, Response
from tavok.webhook import WebhookHandler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

WEBHOOK_SECRET = os.environ.get("TAVOK_WEBHOOK_SECRET", "")

app = FastAPI(title="Tavok Webhook Agent")
handler = WebhookHandler(secret=WEBHOOK_SECRET)


@app.post("/webhook")
async def webhook(request: Request) -> dict:
    """Handle incoming messages from Tavok."""
    event = await handler.verify_and_parse_async(request)

    if event.type == "message":
        msg = event.trigger_message
        logging.info(f"Message from {msg.author_name}: {msg.content}")

        # Return a response — Tavok will deliver it to the channel
        return {
            "content": f"Webhook received: {msg.content}",
        }

    return {"status": "ok"}


@app.get("/health")
async def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)

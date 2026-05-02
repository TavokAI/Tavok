"""Echo Agent — the simplest possible Tavok agent.

Echoes back any message that @mentions it.

Usage:
    tavok init
    # Create an SDK agent named "Echo Agent" during init, or set:
    # export TAVOK_API_KEY="sk-tvk-..."
    # export TAVOK_AGENT_ID="01HXY..."
    python echo_agent.py
"""

import logging
import os

from tavok import Agent, Message

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

SERVER_ID = os.environ.get("TAVOK_SERVER_ID")
CHANNEL_ID = os.environ.get("TAVOK_CHANNEL_ID")

agent = Agent(
    name="Echo Agent",
    capabilities=["chat", "echo"],
)


@agent.on_mention
async def echo(msg: Message) -> None:
    """Echo back the message content, stripping the mention."""
    # Remove the @mention prefix if present
    content = msg.content
    if agent.agent_id:
        content = content.replace(f"<@{agent.agent_id}>", "").strip()

    await agent.send(msg.channel_id, f"You said: {content}")


if __name__ == "__main__":
    run_opts = {}
    if SERVER_ID:
        run_opts["server_id"] = SERVER_ID
    if CHANNEL_ID:
        run_opts["channel_ids"] = [CHANNEL_ID]
    agent.run(**run_opts)

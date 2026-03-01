"""Tavok Python SDK — build AI agents for Tavok in 10 lines of code.

Quick start::

    from tavok import Agent

    agent = Agent(
        url="ws://localhost:4001",
        api_url="http://localhost:3000",
        name="my-agent",
    )

    @agent.on_mention
    async def handle(msg):
        async with agent.stream(msg.channel_id) as s:
            await s.token("Hello! I'm an agent.")

    agent.run(server_id="YOUR_SERVER_ID", channel_ids=["YOUR_CHANNEL_ID"])
"""

from .agent import Agent
from .auth import deregister_agent, register_agent, update_agent
from .stream import StreamContext
from .types import (
    AuthorType,
    Message,
    MessageType,
    RegistrationResult,
    StreamComplete,
    StreamError,
    StreamStart,
    StreamStatus,
    StreamToken,
)

__all__ = [
    "Agent",
    "AuthorType",
    "Message",
    "MessageType",
    "RegistrationResult",
    "StreamComplete",
    "StreamContext",
    "StreamError",
    "StreamStart",
    "StreamStatus",
    "StreamToken",
    "deregister_agent",
    "register_agent",
    "update_agent",
]

__version__ = "0.1.0"

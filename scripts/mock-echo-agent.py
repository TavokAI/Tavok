#!/usr/bin/env python3
"""
Mock Echo Agent for Tavok V1 E2E testing.

Streams back whatever it receives, word-by-word, with a delay between tokens.
Used by Section 15 (Agent Streaming) tests.

Usage:
    python scripts/mock-echo-agent.py \
        --api-key sk-tvk-... \
        --agent-id 01ABC... \
        --server-id 01DEF... \
        --channel-id 01GHI...

Requires: pip install -e sdk/python
"""

import argparse
import asyncio
import sys
import os

# Add SDK to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "python"))

from tavok import Agent, Message


def main():
    parser = argparse.ArgumentParser(description="Mock echo agent for testing")
    parser.add_argument("--api-key", required=True, help="Agent API key (sk-tvk-...)")
    parser.add_argument("--agent-id", required=True, help="Agent ULID")
    parser.add_argument("--server-id", required=True, help="Server ULID")
    parser.add_argument("--channel-id", required=True, help="Channel ULID")
    parser.add_argument("--url", default="ws://localhost:4001", help="Gateway WebSocket URL")
    parser.add_argument("--api-url", default="http://localhost:5555", help="Web API URL")
    parser.add_argument("--delay", type=float, default=0.1, help="Delay between tokens (seconds)")
    args = parser.parse_args()

    agent = Agent(
        url=args.url,
        api_url=args.api_url,
        name="Echo Agent",
        api_key=args.api_key,
        agent_id=args.agent_id,
    )

    token_delay = args.delay

    @agent.on_mention
    async def echo(msg: Message) -> None:
        """Echo back the user's message word-by-word with streaming."""
        # Strip the mention from the content
        content = msg.content
        if f"<@{agent.agent_id}>" in content:
            content = content.replace(f"<@{agent.agent_id}>", "").strip()
        elif "@Echo Agent" in content:
            content = content.replace("@Echo Agent", "").strip()

        if not content:
            content = "Hello! I'm the echo agent."

        words = content.split()
        prefix = "Echo: "

        async with agent.stream(msg.channel_id, reply_to=msg.id) as s:
            await s.token(prefix)
            for i, word in enumerate(words):
                separator = "" if i == 0 else " "
                await s.token(separator + word)
                await asyncio.sleep(token_delay)

    print(f"Starting echo agent (id={args.agent_id})...")
    print(f"Server: {args.server_id}, Channel: {args.channel_id}")
    print(f"Token delay: {token_delay}s")

    agent.run(server_id=args.server_id, channel_ids=[args.channel_id])


if __name__ == "__main__":
    main()

"""OpenAI-Compatible Agent — works with any OpenAI-compatible API.

Shows how to connect any OpenAI-compatible provider (OpenAI, Groq,
Together, Ollama, vLLM, etc.) to Tavok with streaming responses.

Usage:
    # OpenAI
    export OPENAI_API_KEY="sk-..."
    python openai_compat_agent.py

    # Groq
    export OPENAI_BASE_URL="https://api.groq.com/openai/v1"
    export OPENAI_API_KEY="gsk_..."
    export OPENAI_MODEL="llama-3.3-70b-versatile"
    python openai_compat_agent.py

    # Ollama (local)
    export OPENAI_BASE_URL="http://localhost:11434/v1"
    export OPENAI_API_KEY="ollama"
    export OPENAI_MODEL="llama3"
    python openai_compat_agent.py

    # Together AI
    export OPENAI_BASE_URL="https://api.together.xyz/v1"
    export OPENAI_API_KEY="..."
    export OPENAI_MODEL="meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo"
    python openai_compat_agent.py

Requires:
    export TAVOK_SERVER_ID="01HXY..."
    export TAVOK_CHANNEL_ID="01HXY..."
    pip install openai
"""

import logging
import os

from tavok import Agent, Message

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

SERVER_ID = os.environ.get("TAVOK_SERVER_ID", "YOUR_SERVER_ID")
CHANNEL_ID = os.environ.get("TAVOK_CHANNEL_ID", "YOUR_CHANNEL_ID")
API_KEY = os.environ.get("TAVOK_API_KEY")
AGENT_ID = os.environ.get("TAVOK_AGENT_ID")

# OpenAI-compatible provider config
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL")  # None = default OpenAI
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o")

agent = Agent(
    url=os.environ.get("TAVOK_WS_URL", "ws://localhost:4001"),
    api_url=os.environ.get("TAVOK_API_URL", "http://localhost:5555"),
    name=f"{OPENAI_MODEL} Agent",
    api_key=API_KEY,
    agent_id=AGENT_ID,
    model=OPENAI_MODEL,
    capabilities=["chat", "streaming"],
)


@agent.on_mention
async def respond(msg: Message) -> None:
    """Stream a response from any OpenAI-compatible provider."""
    from openai import AsyncOpenAI

    content = msg.content
    if agent.agent_id:
        content = content.replace(f"<@{agent.agent_id}>", "").strip()

    if not content:
        await agent.send(msg.channel_id, "Ask me something!")
        return

    # Works with any OpenAI-compatible endpoint
    client = AsyncOpenAI(
        api_key=OPENAI_API_KEY,
        base_url=OPENAI_BASE_URL,  # None uses default OpenAI URL
    )

    async with agent.stream(msg.channel_id, reply_to=msg.id) as s:
        await s.status("Thinking")

        stream = await client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": content},
            ],
            max_tokens=1024,
            stream=True,
        )

        await s.status("Writing")
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                await s.token(delta.content)


if __name__ == "__main__":
    print(f"Starting {OPENAI_MODEL} agent...")
    if OPENAI_BASE_URL:
        print(f"Using endpoint: {OPENAI_BASE_URL}")
    agent.run(server_id=SERVER_ID, channel_ids=[CHANNEL_ID])

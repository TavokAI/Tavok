"""CrewAI Agent — connect a CrewAI crew to Tavok.

Bridges CrewAI's multi-agent task execution with Tavok's
streaming pipeline. Each crew task result is streamed back
to the channel.

Usage:
    export TAVOK_SERVER_ID="01HXY..."
    export TAVOK_CHANNEL_ID="01HXY..."
    export OPENAI_API_KEY="sk-..."

    pip install crewai crewai-tools
    python crewai_agent.py
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

agent = Agent(
    url=os.environ.get("TAVOK_WS_URL", "ws://localhost:4001"),
    api_url=os.environ.get("TAVOK_API_URL", "http://localhost:5555"),
    name="CrewAI Research Agent",
    api_key=API_KEY,
    agent_id=AGENT_ID,
    capabilities=["chat", "research"],
)


def build_crew(topic: str):
    """Build a CrewAI crew for researching a topic."""
    from crewai import Agent as CrewAgent, Crew, Task

    researcher = CrewAgent(
        role="Research Analyst",
        goal=f"Research and summarize information about: {topic}",
        backstory="You are an expert research analyst who provides "
        "clear, concise summaries.",
        verbose=False,
    )

    task = Task(
        description=f"Research the following topic and provide a clear "
        f"summary with key points: {topic}",
        agent=researcher,
        expected_output="A concise summary with 3-5 bullet points.",
    )

    return Crew(agents=[researcher], tasks=[task], verbose=False)


@agent.on_mention
async def handle(msg: Message) -> None:
    """Run the CrewAI crew and stream the result."""
    content = msg.content
    if agent.agent_id:
        content = content.replace(f"<@{agent.agent_id}>", "").strip()

    if not content:
        await agent.send(msg.channel_id, "Mention me with a topic to research!")
        return

    async with agent.stream(msg.channel_id, reply_to=msg.id) as s:
        await s.status("Assembling research crew...")

        crew = build_crew(content)

        await s.status("Researching...")
        # CrewAI's kickoff is synchronous — run in executor
        import asyncio

        result = await asyncio.get_event_loop().run_in_executor(
            None, crew.kickoff
        )

        # Stream the result line by line for visual effect
        for line in str(result).split("\n"):
            await s.token(line + "\n")


if __name__ == "__main__":
    agent.run(server_id=SERVER_ID, channel_ids=[CHANNEL_ID])

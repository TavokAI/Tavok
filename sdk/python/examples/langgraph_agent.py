"""LangGraph Agent — connect a LangGraph workflow to Tavok.

Shows how to bridge LangGraph's stateful graph execution with
Tavok's streaming pipeline. The graph processes messages and
streams responses token-by-token.

Usage:
    export TAVOK_SERVER_ID="01HXY..."
    export TAVOK_CHANNEL_ID="01HXY..."
    export OPENAI_API_KEY="sk-..."

    pip install langgraph langchain-openai
    python langgraph_agent.py
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
    name="LangGraph Agent",
    api_key=API_KEY,
    agent_id=AGENT_ID,
    capabilities=["chat", "reasoning"],
)


def build_graph():
    """Build a simple LangGraph workflow.

    This creates a two-node graph:
    1. 'think' — uses the LLM to reason about the input
    2. 'respond' — formats and returns the final answer
    """
    from langchain_openai import ChatOpenAI
    from langgraph.graph import StateGraph, MessagesState

    llm = ChatOpenAI(model="gpt-4o", streaming=True)

    def think(state: MessagesState) -> dict:
        """Process the user message with the LLM."""
        response = llm.invoke(state["messages"])
        return {"messages": [response]}

    # Build the graph
    graph = StateGraph(MessagesState)
    graph.add_node("think", think)
    graph.set_entry_point("think")
    graph.set_finish_point("think")

    return graph.compile()


# Build once at startup
workflow = build_graph()


@agent.on_mention
async def handle(msg: Message) -> None:
    """Run the LangGraph workflow and stream the result."""
    content = msg.content
    if agent.agent_id:
        content = content.replace(f"<@{agent.agent_id}>", "").strip()

    if not content:
        await agent.send(msg.channel_id, "Mention me with a question!")
        return

    async with agent.stream(msg.channel_id, reply_to=msg.id) as s:
        await s.status("Thinking with LangGraph...")

        # Run the graph with streaming
        from langchain_core.messages import HumanMessage

        async for event in workflow.astream_events(
            {"messages": [HumanMessage(content=content)]},
            version="v2",
        ):
            kind = event["event"]
            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if chunk.content:
                    await s.token(chunk.content)


if __name__ == "__main__":
    agent.run(server_id=SERVER_ID, channel_ids=[CHANNEL_ID])

from __future__ import annotations

from typing import Any

import pytest

from tavok.rest import RestStream


class FakeResponse:
    def __init__(self, payload: dict[str, Any] | None = None) -> None:
        self._payload = payload or {"ok": True}

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return self._payload


class FakeClient:
    def __init__(self) -> None:
        self.posts: list[dict[str, Any]] = []

    async def post(self, url: str, **kwargs: Any) -> FakeResponse:
        self.posts.append({"url": url, **kwargs})
        return FakeResponse()


@pytest.mark.asyncio
async def test_rest_stream_posts_to_stream_url_with_monotonic_token_offset():
    client = FakeClient()
    stream = RestStream(
        client=client,  # type: ignore[arg-type]
        stream_url="http://localhost:5555/api/v1/agents/agent-1/messages/msg-1/stream",
        message_id="msg-1",
        headers={"Authorization": "Bearer sk-tvk-test"},
    )

    await stream.token("Hello ")
    await stream.token("world!")

    assert client.posts[0]["url"].endswith("/api/v1/agents/agent-1/messages/msg-1/stream")
    assert client.posts[0]["json"] == {
        "tokens": ["Hello "],
        "done": False,
        "tokenOffset": 0,
    }
    assert client.posts[1]["json"] == {
        "tokens": ["world!"],
        "done": False,
        "tokenOffset": 1,
    }


@pytest.mark.asyncio
async def test_rest_stream_uses_current_thinking_completion_and_error_payloads():
    client = FakeClient()
    stream = RestStream(
        client=client,  # type: ignore[arg-type]
        stream_url="http://localhost:5555/api/v1/agents/agent-1/messages/msg-1/stream",
        message_id="msg-1",
        headers={"Authorization": "Bearer sk-tvk-test"},
    )

    await stream.thinking("Searching", "querying vector DB")
    await stream.complete("Final answer", {"model": "gpt-4"})
    await stream.error("LLM timeout", "partial")

    assert client.posts[0]["json"] == {
        "thinking": {"phase": "Searching", "detail": "querying vector DB"}
    }
    assert client.posts[1]["json"] == {
        "tokens": [],
        "done": True,
        "finalContent": "Final answer",
        "metadata": {"model": "gpt-4"},
    }
    assert client.posts[2]["json"] == {
        "error": "LLM timeout",
        "finalContent": "partial",
    }

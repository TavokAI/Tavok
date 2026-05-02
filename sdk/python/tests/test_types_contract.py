from tavok.types import Message, MessageType, StreamComplete, StreamError, StreamStart, StreamStatus


def test_message_from_payload_accepts_current_contract_fields():
    msg = Message.from_payload(
        {
            "id": "msg-1",
            "channelId": "ch-1",
            "authorId": "agent-1",
            "authorName": "Agent",
            "authorType": "AGENT",
            "content": '{"state":"thinking"}',
            "type": "STATUS",
            "streamingStatus": "ACTIVE",
            "sequence": "42",
            "createdAt": "2026-03-01T12:00:00.000Z",
            "metadata": {"model": "gpt-4o"},
            "tokenHistory": [{"o": 0, "t": 12}],
            "checkpoints": [{"index": 0, "label": "start", "contentOffset": 0}],
        }
    )

    assert MessageType.STATUS == "STATUS"
    assert StreamStatus.ACTIVE == "ACTIVE"
    assert msg.type is MessageType.STATUS
    assert msg.streaming_status is StreamStatus.ACTIVE
    assert msg.metadata == {"model": "gpt-4o"}
    assert msg.token_history == [{"o": 0, "t": 12}]
    assert msg.checkpoints == [{"index": 0, "label": "start", "contentOffset": 0}]


def test_stream_payloads_preserve_status_metadata_and_error_code():
    start = StreamStart.from_payload(
        {
            "messageId": "msg-1",
            "agentId": "agent-1",
            "agentName": "Agent",
            "agentAvatarUrl": None,
            "sequence": "43",
            "status": "active",
        }
    )
    complete = StreamComplete.from_payload(
        {
            "messageId": "msg-1",
            "finalContent": "done",
            "thinkingTimeline": [{"phase": "Writing", "timestamp": "now"}],
            "metadata": {"provider": "openai", "tokensOut": 12},
        }
    )
    error = StreamError.from_payload(
        {
            "messageId": "msg-2",
            "error": "All stream slots are full",
            "partialContent": "partial",
            "code": "CAPACITY_EXCEEDED",
        }
    )

    assert start.status == "active"
    assert complete.metadata == {"provider": "openai", "tokensOut": 12}
    assert error.code == "CAPACITY_EXCEEDED"

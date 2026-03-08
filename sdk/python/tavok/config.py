"""Configuration auto-discovery for Tavok agents.

Resolution order (highest priority first):
1. Explicit constructor arguments
2. Environment variables (TAVOK_URL, TAVOK_GATEWAY_URL, TAVOK_SERVER_ID, TAVOK_CHANNEL_ID)
3. .tavok.json file (walk up from cwd, max 10 directories)
4. Localhost defaults

Security notes:
- .tavok.json contains ONLY topology info (URLs, IDs). No secrets.
- API keys are read from TAVOK_API_KEY env var, never from config files.
- Logs when auto-discovered config file is used, so users know what's being read.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger("tavok")

_MAX_WALK_DEPTH = 10


@dataclass
class TavokConfig:
    """Discovered Tavok connection configuration."""

    url: str
    """Web server URL (e.g. http://localhost:5555)."""

    gateway_url: str
    """Gateway WebSocket URL (e.g. ws://localhost:4001/socket)."""

    server_id: str | None
    """Default server ULID, or None if not discovered."""

    channel_id: str | None
    """Default channel ULID, or None if not discovered."""

    @classmethod
    def discover(cls) -> TavokConfig:
        """Discover configuration from env vars and .tavok.json.

        Checks environment variables first, then walks up from the current
        directory looking for .tavok.json.
        """
        file_config = _find_tavok_json()

        return cls(
            url=(
                os.environ.get("TAVOK_URL")
                or file_config.get("url", "http://localhost:5555")
            ),
            gateway_url=(
                os.environ.get("TAVOK_GATEWAY_URL")
                or file_config.get("gatewayUrl", "ws://localhost:4001/socket")
            ),
            server_id=(
                os.environ.get("TAVOK_SERVER_ID")
                or file_config.get("serverId")
            ),
            channel_id=(
                os.environ.get("TAVOK_CHANNEL_ID")
                or file_config.get("channelId")
            ),
        )


def _find_tavok_json() -> dict:
    """Walk up from cwd looking for .tavok.json (max 10 levels)."""
    try:
        current = Path.cwd()
    except OSError:
        return {}

    for _ in range(_MAX_WALK_DEPTH):
        candidate = current / ".tavok.json"
        if candidate.is_file():
            try:
                with open(candidate) as f:
                    data = json.load(f)
                logger.info("Using config from %s", candidate)
                return data if isinstance(data, dict) else {}
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Failed to read %s: %s", candidate, exc)
                return {}

        parent = current.parent
        if parent == current:
            break  # filesystem root
        current = parent

    return {}

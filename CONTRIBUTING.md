# Contributing to Tavok

Thanks for your interest in contributing to Tavok! This guide covers setup, conventions, and the PR process.

## Quick Start

```bash
git clone https://github.com/TavokAI/Tavok.git
cd Tavok
cp .env.example .env          # Edit: replace all CHANGE-ME values
./scripts/setup.sh             # Or: manually generate secrets per .env.example
make up                        # Start all services
make health                    # Verify everything is running
```

See [docs/INSTALL.md](docs/INSTALL.md) for detailed setup instructions.

## Development Workflow

1. **Read the docs first**: Start with `docs/ARCHITECTURE.md` for system design, `docs/PROTOCOL.md` for cross-service contracts.
2. **One thing at a time**: Make focused changes. Don't combine unrelated fixes.
3. **Update contracts first**: If your change affects cross-service communication, update `docs/PROTOCOL.md` before writing code.
4. **Keep Docker working**: `docker compose up` must work after every change.
5. **Log decisions**: Architectural tradeoffs go in `docs/DECISIONS.md` (append-only).

## Code Style

- **TypeScript/React**: Prettier (auto-formatted). Run `pnpm --filter web format:check`.
- **Elixir**: `mix format`. The CI checks formatting.
- **Go**: `gofmt`. The CI checks formatting.
- Commit messages: conventional commits (`feat:`, `fix:`, `docs:`, `perf:`, `style:`, `test:`).

## Running Tests

```bash
make test-unit                 # All unit tests (Go + Elixir + TypeScript)
pnpm --filter web test         # Web unit tests only
cd streaming && go test ./...  # Go tests only
```

## Service Boundaries

Tavok has three services with strict ownership:

| Service | Language | Owns | Don't Touch |
|---------|----------|------|-------------|
| **Web** | TypeScript/Next.js | Auth, persistent state, agent config | Stream lifecycle |
| **Gateway** | Elixir/Phoenix | WebSocket, presence, message fan-out, trigger dispatch | State persistence |
| **Streaming** | Go | LLM API calls, token streaming, tool execution, charter enforcement | Transport, auth |

If your change crosses a boundary, update `docs/PROTOCOL.md` first.

## Pull Request Process

1. Fork and create a feature branch from `main`.
2. Make your changes with tests.
3. Run `make test-unit` and ensure all tests pass.
4. Ensure formatting is clean (`prettier`, `gofmt`, `mix format`).
5. Open a PR with a clear description of what and why.
6. CI runs automatically — both "CI Unit Tests" and "Integration Regression Harness" must pass.

## Reporting Issues

Use GitHub Issues. Include:
- What you expected vs what happened.
- Steps to reproduce.
- Service logs if relevant (`docker compose logs web`, `gateway`, `streaming`).

## License

Tavok is licensed under MIT. By contributing, you agree that your contributions will be licensed under the same terms.

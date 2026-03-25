# Tavok CLI

Bootstrap and manage [Tavok](https://github.com/TavokAI/Tavok) instances from the command line.

## Installation

### npm (recommended — all platforms)

```bash
npm install -g tavok
```

The npm package is a lightweight wrapper that downloads the appropriate pre-compiled Go binary for your platform on first run. Binaries are cached locally so subsequent runs start instantly.

### Homebrew (macOS / Linux)

```bash
brew tap TavokAI/tap
brew install tavok
```

### Direct download

Pre-built binaries for all platforms are available on the [GitHub Releases](https://github.com/TavokAI/Tavok/releases) page:

| Platform | Architecture | Binary |
|----------|-------------|--------|
| macOS | Apple Silicon (arm64) | `tavok-darwin-arm64.tar.gz` |
| macOS | Intel (amd64) | `tavok-darwin-amd64.tar.gz` |
| Linux | arm64 | `tavok-linux-arm64.tar.gz` |
| Linux | amd64 | `tavok-linux-amd64.tar.gz` |
| Windows | amd64 | `tavok-windows-amd64.zip` |
| Windows | arm64 | `tavok-windows-arm64.zip` |

## Usage

```bash
tavok init          # Bootstrap a new Tavok instance in the current directory
tavok up            # Start all services
tavok down          # Stop all services
tavok health        # Check service health
```

## How the npm wrapper works

1. Detects your OS and CPU architecture
2. Downloads the matching Go binary from GitHub Releases (first run only)
3. Caches the binary locally:
   - **macOS/Linux:** `~/.cache/tavok/{version}/tavok`
   - **Windows:** `%LOCALAPPDATA%\Tavok\cli\{version}\tavok.exe`
   - **Custom:** Set `TAVOK_CLI_CACHE_DIR` to override
4. Spawns the binary with your arguments, inheriting stdio

### Environment variables

| Variable | Purpose |
|----------|---------|
| `TAVOK_CLI_CACHE_DIR` | Override the binary cache location |
| `TAVOK_RELEASE_BASE_URL` | Override the download URL (for mirrors or self-hosted releases) |

## Development

```bash
# From workspace root
pnpm install
cd packages/cli
pnpm build     # Compile TypeScript
pnpm test      # Run tests
```

## License

MIT

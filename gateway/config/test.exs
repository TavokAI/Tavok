import Config

config :tavok_gateway, TavokGatewayWeb.Endpoint,
  server: false,
  check_origin: false,
  secret_key_base: "test-secret-key-base-that-is-at-least-64-bytes-long-for-tests-only"

config :logger, level: :warning

config :tavok_gateway,
  jwt_secret: "test-jwt-secret-test-jwt-secret-test-jwt-secret",
  internal_api_secret: "test-internal-secret",
  redis_url: "redis://127.0.0.1:6399",
  web_url: "http://127.0.0.1:1",
  stream_watchdog_timeout_ms: 45_000

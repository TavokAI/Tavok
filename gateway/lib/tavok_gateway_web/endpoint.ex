defmodule TavokGatewayWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :tavok_gateway

  # WebSocket transport for Phoenix Channels
  socket("/socket", TavokGatewayWeb.UserSocket,
    websocket: [
      timeout: 45_000,
      compress: true
    ],
    longpoll: false
  )

  # CORS support — restrict to configured origins (default: localhost dev ports)
  plug(CORSPlug,
    origin:
      String.split(
        System.get_env("CORS_ALLOWED_ORIGINS") || "http://localhost:5555,http://localhost:3000",
        ","
      ),
    methods: ["GET", "POST"],
    headers: ["content-type", "x-internal-secret", "x-request-id", "authorization"]
  )

  # Parse JSON bodies for internal API
  plug(Plug.Parsers,
    parsers: [:json],
    pass: ["application/json"],
    json_decoder: Jason
  )

  # Request ID for correlation
  plug(Plug.RequestId)

  # Logger
  plug(Plug.Logger)

  # Router
  plug(TavokGatewayWeb.Router)
end

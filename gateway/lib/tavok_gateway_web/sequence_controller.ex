defmodule TavokGatewayWeb.SequenceController do
  @moduledoc """
  Internal sequence contract for non-WebSocket agent adapters.

  Returns the next channel sequence number from the same Gateway-owned Redis
  counter used by WebSocket room events.
  """

  use TavokGatewayWeb, :controller

  require Logger

  @doc """
  GET /api/internal/sequence?channelId=...
  """
  def index(conn, %{"channelId" => channel_id}) when is_binary(channel_id) and byte_size(channel_id) > 0 do
    internal_secret = Application.get_env(:tavok_gateway, :internal_api_secret)

    provided_secret =
      conn
      |> get_req_header("x-internal-secret")
      |> List.first()

    if not is_binary(internal_secret) or internal_secret == "" or provided_secret != internal_secret do
      conn
      |> put_status(401)
      |> json(%{error: "Unauthorized"})
    else
      sequence_module = Application.get_env(:tavok_gateway, :sequence_module, TavokGateway.Sequence)

      case sequence_module.next_channel_sequence(channel_id) do
        {:ok, sequence} ->
          conn
          |> put_status(200)
          |> json(%{sequence: Integer.to_string(sequence)})

        {:error, reason} ->
          Logger.error(
            "Failed to allocate sequence: channel=#{channel_id} reason=#{inspect(reason)}"
          )

          conn
          |> put_status(503)
          |> json(%{error: "Sequence unavailable"})
      end
    end
  end

  def index(conn, _params) do
    conn
    |> put_status(400)
    |> json(%{error: "channelId is required"})
  end
end

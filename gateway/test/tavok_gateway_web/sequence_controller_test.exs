defmodule TavokGatewayWeb.SequenceControllerTest do
  use ExUnit.Case, async: true
  import Plug.Conn
  import Phoenix.ConnTest

  @endpoint TavokGatewayWeb.Endpoint

  defmodule FakeSequence do
    def next_channel_sequence(channel_id) do
      handler = Process.get({__MODULE__, :handler}) || raise "missing sequence handler"
      handler.(channel_id)
    end
  end

  setup do
    original_secret = Application.get_env(:tavok_gateway, :internal_api_secret)
    original_sequence_module = Application.get_env(:tavok_gateway, :sequence_module)

    Application.put_env(:tavok_gateway, :internal_api_secret, "test-secret")
    Application.put_env(:tavok_gateway, :sequence_module, FakeSequence)
    Process.delete({FakeSequence, :handler})

    on_exit(fn ->
      restore_env(:internal_api_secret, original_secret)
      restore_env(:sequence_module, original_sequence_module)
    end)

    :ok
  end

  test "returns the next sequence for authorized requests" do
    Process.put({FakeSequence, :handler}, fn "channel-1" -> {:ok, 42} end)

    conn =
      build_conn()
      |> put_req_header("x-internal-secret", "test-secret")
      |> get("/api/internal/sequence", %{"channelId" => "channel-1"})

    assert json_response(conn, 200) == %{"sequence" => "42"}
  end

  test "rejects unauthorized requests" do
    conn =
      build_conn()
      |> put_req_header("x-internal-secret", "wrong-secret")
      |> get("/api/internal/sequence", %{"channelId" => "channel-1"})

    assert json_response(conn, 401) == %{"error" => "Unauthorized"}
  end

  test "rejects requests when the internal secret is unset" do
    Application.delete_env(:tavok_gateway, :internal_api_secret)

    conn =
      build_conn()
      |> get("/api/internal/sequence", %{"channelId" => "channel-1"})

    assert json_response(conn, 401) == %{"error" => "Unauthorized"}
  end

  test "requires channelId" do
    conn =
      build_conn()
      |> put_req_header("x-internal-secret", "test-secret")
      |> get("/api/internal/sequence")

    assert json_response(conn, 400) == %{"error" => "channelId is required"}
  end

  test "returns 503 when sequence allocation fails" do
    Process.put({FakeSequence, :handler}, fn "channel-1" -> {:error, :redis_down} end)

    conn =
      build_conn()
      |> put_req_header("x-internal-secret", "test-secret")
      |> get("/api/internal/sequence", %{"channelId" => "channel-1"})

    assert json_response(conn, 503) == %{"error" => "Sequence unavailable"}
  end

  defp restore_env(key, nil), do: Application.delete_env(:tavok_gateway, key)
  defp restore_env(key, value), do: Application.put_env(:tavok_gateway, key, value)
end

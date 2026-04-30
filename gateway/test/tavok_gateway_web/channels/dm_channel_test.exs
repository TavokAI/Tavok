defmodule TavokGatewayWeb.DmChannelTest do
  @moduledoc """
  Unit tests for DmChannel pure/deterministic logic.
  """
  use ExUnit.Case

  @moduletag :unit

  alias TavokGatewayWeb.DmChannel

  defmodule WebClientStub do
    def get_dm_messages(params) do
      handler =
        Process.get({__MODULE__, :get_dm_messages}) ||
          raise "missing get_dm_messages handler"

      handler.(params)
    end

    def post_dm_message(body) do
      handler = Process.get({__MODULE__, :post_dm_message}, fn _body -> {:ok, %{}} end)
      handler.(body)
    end
  end

  defmodule RedisStub do
    def command(:redix, _command), do: {:error, :disconnected}
  end

  describe "parse_sequence/1" do
    test "accepts nil and numeric sequence values" do
      assert DmChannel.parse_sequence(nil) == {:ok, nil}
      assert DmChannel.parse_sequence(123) == {:ok, 123}
      assert DmChannel.parse_sequence("123") == {:ok, 123}
      assert DmChannel.parse_sequence("0") == {:ok, 0}
      assert DmChannel.parse_sequence(0) == {:ok, 0}
    end

    test "rejects invalid sequence values" do
      assert DmChannel.parse_sequence("abc") == {:error, :invalid_sequence}
      assert DmChannel.parse_sequence(1.5) == {:error, :invalid_sequence}
      assert DmChannel.parse_sequence(:bad) == {:error, :invalid_sequence}
    end

    test "sync rejects missing lastSequence key" do
      socket = %Phoenix.Socket{}

      {:reply, {:error, %{reason: reason}}, _socket} =
        DmChannel.handle_in("sync", %{}, socket)

      assert reason == "invalid_payload"
    end

    test "sync rejects non-map payload" do
      socket = %Phoenix.Socket{}

      {:reply, {:error, %{reason: reason}}, _socket} =
        DmChannel.handle_in("sync", "not-a-map", socket)

      assert reason == "invalid_payload"
    end
  end

  describe "sync handler" do
    setup do
      original_web_client = Application.get_env(:tavok_gateway, :web_client)
      Application.put_env(:tavok_gateway, :web_client, WebClientStub)
      Process.delete({WebClientStub, :get_dm_messages})

      on_exit(fn ->
        restore_env(:web_client, original_web_client)
        Process.delete({WebClientStub, :get_dm_messages})
      end)

      socket = %Phoenix.Socket{
        assigns: %{
          dm_id: "dm-test-123",
          user_id: "user-1",
          username: "tester",
          display_name: "Tester"
        }
      }

      {:ok, socket: socket}
    end

    test "fetches messages with the parsed sequence", %{socket: socket} do
      Process.put({WebClientStub, :get_dm_messages}, fn %{
                                                          dmId: "dm-test-123",
                                                          afterSequence: 123,
                                                          limit: 100
                                                        } ->
        {:ok, %{"messages" => [%{"id" => "dm-message-1"}]}}
      end)

      assert {:reply, {:ok, %{messages: [%{"id" => "dm-message-1"}]}}, ^socket} =
               DmChannel.handle_in("sync", %{"lastSequence" => "123"}, socket)
    end

    test "returns sync_failed when message fetch fails", %{socket: socket} do
      Process.put({WebClientStub, :get_dm_messages}, fn _params -> {:error, :unavailable} end)

      assert {:reply, {:error, %{reason: "sync_failed"}}, ^socket} =
               DmChannel.handle_in("sync", %{"lastSequence" => 123}, socket)
    end
  end

  describe "new_message content validation" do
    setup do
      original_redis_client = Application.get_env(:tavok_gateway, :redis_client)
      Application.put_env(:tavok_gateway, :redis_client, RedisStub)

      on_exit(fn ->
        restore_env(:redis_client, original_redis_client)
      end)

      socket = %Phoenix.Socket{
        assigns: %{
          dm_id: "dm-test-456",
          user_id: "user-1",
          username: "tester",
          display_name: "Tester"
        }
      }

      {:ok, socket: socket}
    end

    test "rejects empty string content", %{socket: socket} do
      {:reply, {:error, %{reason: reason}}, _socket} =
        DmChannel.handle_in("new_message", %{"content" => ""}, socket)

      assert reason == "empty_content"
    end

    test "rejects whitespace-only content", %{socket: socket} do
      {:reply, {:error, %{reason: reason}}, _socket} =
        DmChannel.handle_in("new_message", %{"content" => "   \t\n  "}, socket)

      assert reason == "empty_content"
    end

    test "rejects content exceeding 4000 characters", %{socket: socket} do
      long_content = String.duplicate("a", 4001)

      {:reply, {:error, %{reason: reason, max: max}}, _socket} =
        DmChannel.handle_in("new_message", %{"content" => long_content}, socket)

      assert reason == "content_too_long"
      assert max == 4000
    end

    test "content at exactly 4000 characters passes validation", %{socket: socket} do
      exact_content = String.duplicate("a", 4000)

      {:reply, {:error, %{reason: reason}}, _socket} =
        DmChannel.handle_in("new_message", %{"content" => exact_content}, socket)

      refute reason == "content_too_long",
             "Content at exactly 4000 chars should pass length validation"

      refute reason == "empty_content",
             "Non-empty content should pass empty check"
    end

    test "valid content passes validation", %{socket: socket} do
      {:reply, {:error, %{reason: reason}}, _socket} =
        DmChannel.handle_in("new_message", %{"content" => "Hello there"}, socket)

      refute reason == "empty_content"
      refute reason == "content_too_long"
    end

    test "rejects non-binary content (missing content key)", %{socket: socket} do
      {:reply, {:error, %{reason: reason}}, _socket} =
        DmChannel.handle_in("new_message", %{"wrong_key" => "hello"}, socket)

      assert reason == "invalid_payload"
    end

    test "rejects integer content", %{socket: socket} do
      {:reply, {:error, %{reason: reason}}, _socket} =
        DmChannel.handle_in("new_message", %{"content" => 42}, socket)

      assert reason == "invalid_payload"
    end
  end

  describe "message_edit content validation" do
    setup do
      socket = %Phoenix.Socket{
        assigns: %{
          dm_id: "dm-test-789",
          user_id: "user-1",
          username: "tester",
          display_name: "Tester"
        }
      }

      {:ok, socket: socket}
    end

    test "rejects empty content on edit", %{socket: socket} do
      {:reply, {:error, %{reason: reason}}, _socket} =
        DmChannel.handle_in(
          "message_edit",
          %{"messageId" => "msg-1", "content" => ""},
          socket
        )

      assert reason == "empty_content"
    end

    test "rejects whitespace-only content on edit", %{socket: socket} do
      {:reply, {:error, %{reason: reason}}, _socket} =
        DmChannel.handle_in(
          "message_edit",
          %{"messageId" => "msg-1", "content" => "   "},
          socket
        )

      assert reason == "empty_content"
    end

    test "rejects missing messageId", %{socket: socket} do
      {:reply, {:error, %{reason: reason}}, _socket} =
        DmChannel.handle_in(
          "message_edit",
          %{"content" => "hello"},
          socket
        )

      assert reason == "invalid_payload"
    end

    test "rejects missing content key", %{socket: socket} do
      {:reply, {:error, %{reason: reason}}, _socket} =
        DmChannel.handle_in(
          "message_edit",
          %{"messageId" => "msg-1"},
          socket
        )

      assert reason == "invalid_payload"
    end
  end

  describe "message_delete payload validation" do
    setup do
      socket = %Phoenix.Socket{
        assigns: %{
          dm_id: "dm-test-del",
          user_id: "user-1",
          username: "tester",
          display_name: "Tester"
        }
      }

      {:ok, socket: socket}
    end

    test "rejects missing messageId", %{socket: socket} do
      {:reply, {:error, %{reason: reason}}, _socket} =
        DmChannel.handle_in("message_delete", %{}, socket)

      assert reason == "invalid_payload"
    end

    test "rejects non-string messageId", %{socket: socket} do
      {:reply, {:error, %{reason: reason}}, _socket} =
        DmChannel.handle_in("message_delete", %{"messageId" => 123}, socket)

      assert reason == "invalid_payload"
    end
  end

  describe "agent join rejection" do
    test "agents cannot join DM channels" do
      socket = %Phoenix.Socket{
        assigns: %{
          user_id: "agent-1",
          username: "agent",
          display_name: "Agent",
          author_type: "AGENT"
        }
      }

      result = DmChannel.join("dm:dm-channel-1", %{}, socket)

      assert {:error, %{reason: "agents_cannot_join_dms"}} = result
    end
  end

  describe "history payload validation" do
    setup do
      socket = %Phoenix.Socket{
        assigns: %{
          dm_id: "dm-test-hist",
          user_id: "user-1",
          username: "tester",
          display_name: "Tester"
        }
      }

      {:ok, socket: socket}
    end

    test "rejects non-map payload", %{socket: socket} do
      {:reply, {:error, %{reason: reason}}, _socket} =
        DmChannel.handle_in("history", "not-a-map", socket)

      assert reason == "invalid_payload"
    end
  end

  defp restore_env(key, nil), do: Application.delete_env(:tavok_gateway, key)
  defp restore_env(key, value), do: Application.put_env(:tavok_gateway, key, value)
end

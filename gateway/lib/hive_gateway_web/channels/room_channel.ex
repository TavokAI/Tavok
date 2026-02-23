defmodule HiveGatewayWeb.RoomChannel do
  @moduledoc """
  Channel handler for chat rooms.

  Topic: "room:{channelId}"

  Handles:
  - Join with optional lastSequence for reconnection sync
  - new_message — user sends a chat message
  - typing — user is typing
  - sync — request missed messages
  - history — request older messages

  See docs/PROTOCOL.md §1 for event payloads.
  """
  use Phoenix.Channel

  alias HiveGatewayWeb.Presence
  alias HiveGateway.WebClient

  require Logger

  @impl true
  def join("room:" <> channel_id, params, socket) do
    Logger.info(
      "User #{socket.assigns.user_id} joining room:#{channel_id}"
    )

    socket = assign(socket, :channel_id, channel_id)

    # Track presence on join
    send(self(), :after_join)

    # If client provides lastSequence, schedule sync after join completes
    case Map.get(params, "lastSequence") do
      nil ->
        {:ok, socket}

      last_sequence ->
        Logger.info(
          "Reconnection sync requested: channel=#{channel_id} lastSequence=#{last_sequence}"
        )

        send(self(), {:sync_on_join, last_sequence})
        {:ok, socket}
    end
  end

  @impl true
  def handle_info(:after_join, socket) do
    # Track this user's presence in the channel
    {:ok, _} =
      Presence.track(socket, socket.assigns.user_id, %{
        username: socket.assigns.username,
        display_name: socket.assigns.display_name,
        online_at: inspect(System.system_time(:second)),
        status: "online"
      })

    # Push current presence state to the joining user
    push(socket, "presence_state", Presence.list(socket))

    {:noreply, socket}
  end

  @impl true
  def handle_info({:sync_on_join, last_sequence}, socket) do
    case WebClient.get_messages(%{
           channelId: socket.assigns.channel_id,
           afterSequence: last_sequence,
           limit: 100
         }) do
      {:ok, body} ->
        push(socket, "sync_response", body)

      {:error, _reason} ->
        push(socket, "sync_response", %{"messages" => [], "hasMore" => false})
    end

    {:noreply, socket}
  end

  @impl true
  def handle_in("new_message", %{"content" => content}, socket) do
    channel_id = socket.assigns.channel_id
    user_id = socket.assigns.user_id
    display_name = socket.assigns.display_name

    # 1. Generate ULID for the message
    message_id = Ulid.generate()

    # 2. Get next sequence number from Redis INCR
    case Redix.command(:redix, ["INCR", "hive:channel:#{channel_id}:seq"]) do
      {:ok, sequence} ->
        # 3. Build persist request body (matches PersistMessageRequest type)
        body = %{
          id: message_id,
          channelId: channel_id,
          authorId: user_id,
          authorType: "USER",
          content: content,
          type: "STANDARD",
          streamingStatus: nil,
          sequence: sequence
        }

        # 4. Persist via internal API
        case WebClient.post_message(body) do
          {:ok, _response} ->
            # 5. Build MessagePayload for broadcast
            message_payload = %{
              id: message_id,
              channelId: channel_id,
              authorId: user_id,
              authorType: "USER",
              authorName: display_name,
              authorAvatarUrl: nil,
              content: content,
              type: "STANDARD",
              streamingStatus: nil,
              sequence: sequence,
              createdAt: DateTime.utc_now() |> DateTime.to_iso8601()
            }

            # 6. Broadcast to all clients in channel
            broadcast!(socket, "message_new", message_payload)

            # 7. Reply to sender with message id and sequence
            {:reply, {:ok, %{id: message_id, sequence: sequence}}, socket}

          {:error, reason} ->
            Logger.error(
              "Failed to persist message: channel=#{channel_id} error=#{inspect(reason)}"
            )

            {:reply, {:error, %{reason: "persistence_failed"}}, socket}
        end

      {:error, reason} ->
        Logger.error("Redis INCR failed: #{inspect(reason)}")
        {:reply, {:error, %{reason: "sequence_failed"}}, socket}
    end
  end

  @impl true
  def handle_in("typing", _payload, socket) do
    # Broadcast typing indicator to other users in the channel
    broadcast_from(socket, "user_typing", %{
      userId: socket.assigns.user_id,
      username: socket.assigns.username,
      displayName: socket.assigns.display_name
    })

    {:noreply, socket}
  end

  @impl true
  def handle_in("sync", %{"lastSequence" => last_sequence}, socket) do
    case WebClient.get_messages(%{
           channelId: socket.assigns.channel_id,
           afterSequence: last_sequence,
           limit: 100
         }) do
      {:ok, body} ->
        push(socket, "sync_response", body)

      {:error, _reason} ->
        push(socket, "sync_response", %{"messages" => [], "hasMore" => false})
    end

    {:noreply, socket}
  end

  @impl true
  def handle_in("history", params, socket) do
    before = Map.get(params, "before")
    limit = min(Map.get(params, "limit", 50), 100)

    query_params = %{channelId: socket.assigns.channel_id, limit: limit}

    query_params =
      if before, do: Map.put(query_params, :before, before), else: query_params

    case WebClient.get_messages(query_params) do
      {:ok, body} ->
        push(socket, "history_response", body)

      {:error, _reason} ->
        push(socket, "history_response", %{"messages" => [], "hasMore" => false})
    end

    {:noreply, socket}
  end
end

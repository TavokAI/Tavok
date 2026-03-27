defmodule TavokGateway.StreamOrchestrator do
  @moduledoc """
  Durable-first orchestration for Gateway-owned stream startup.

  The Web service owns durable message state. Gateway must persist the ACTIVE
  placeholder before it advertises `stream_start` or publishes a Redis request
  for downstream processing.
  """

  require Logger

  alias TavokGateway.Broadcast
  alias TavokGateway.Sequence
  alias TavokGateway.StreamWatchdog
  alias TavokGateway.WebClient

  def start_byok_stream(
        channel_id,
        agent_config,
        trigger_message_id,
        trigger_content,
        opts \\ []
      )
      when is_binary(channel_id) and is_map(agent_config) and is_binary(trigger_message_id) and
             is_binary(trigger_content) do
    id_generator = Keyword.get(opts, :id_generator, &Ulid.generate/0)
    sequence_allocator = Keyword.get(opts, :sequence_allocator, &Sequence.next_channel_sequence/1)

    start_placeholder =
      Keyword.get(opts, :start_placeholder, &WebClient.start_stream_placeholder/1)

    broadcaster = Keyword.get(opts, :broadcaster, &default_broadcaster/3)
    register_watchdog = Keyword.get(opts, :register_watchdog, &StreamWatchdog.register_stream/2)
    context_fetcher = Keyword.get(opts, :context_fetcher, &fetch_context_messages/2)
    publish_request = Keyword.get(opts, :publish_request, &default_publish_request/1)
    request_id_generator = Keyword.get(opts, :request_id_generator, &default_request_id/0)
    traceparent_getter = Keyword.get(opts, :traceparent_getter, &current_traceparent/0)

    agent_id = Map.get(agent_config, "id")
    agent_name = Map.get(agent_config, "name")
    agent_avatar_url = Map.get(agent_config, "avatarUrl")
    message_id = id_generator.()

    case sequence_allocator.(channel_id) do
      {:ok, sequence} ->
        sequence_str = Integer.to_string(sequence)

        placeholder = %{
          id: message_id,
          channelId: channel_id,
          authorId: agent_id,
          authorType: "AGENT",
          content: "",
          type: "STREAMING",
          streamingStatus: "ACTIVE",
          sequence: sequence_str
        }

        case start_placeholder.(placeholder) do
          {:ok, _persisted_placeholder} ->
            broadcaster.("room:#{channel_id}", "stream_start", %{
              messageId: message_id,
              agentId: agent_id,
              agentName: agent_name,
              agentAvatarUrl: agent_avatar_url,
              sequence: sequence_str
            })

            register_watchdog.(channel_id, message_id)

            stream_request = %{
              channelId: channel_id,
              messageId: message_id,
              agentId: agent_id,
              triggerMessageId: trigger_message_id,
              contextMessages: context_fetcher.(channel_id, trigger_content),
              requestId: request_id_generator.(),
              traceparent: traceparent_getter.()
            }

            case publish_request.(stream_request) do
              :ok ->
                Logger.info(
                  "Stream request published: channel=#{channel_id} message=#{message_id} agent=#{agent_id}"
                )

                {:ok, %{message_id: message_id, sequence: sequence_str}}

              {:error, reason} ->
                Logger.error("Failed to publish stream request: #{inspect(reason)}")
                {:error, {:publish_failed, reason}}
            end

          {:error, reason} ->
            Logger.error(
              "Failed to persist durable stream start: channel=#{channel_id} agent=#{agent_id} reason=#{inspect(reason)}"
            )

            {:error, {:persist_failed, reason}}
        end

      {:error, reason} ->
        Logger.error("Redis INCR failed for streaming message: #{inspect(reason)}")
        {:error, {:sequence_failed, reason}}
    end
  end

  defp fetch_context_messages(channel_id, trigger_content) do
    history =
      case WebClient.get_messages(%{channelId: channel_id, limit: 20}) do
        {:ok, %{"messages" => messages}} ->
          messages
          |> Enum.filter(fn m ->
            Map.get(m, "type") == "STANDARD" or
              (Map.get(m, "type") == "STREAMING" and
                 Map.get(m, "streamingStatus") == "COMPLETE")
          end)
          |> Enum.map(fn m ->
            role =
              case Map.get(m, "authorType") do
                "AGENT" -> "assistant"
                _ -> "user"
              end

            %{"role" => role, "content" => Map.get(m, "content") || ""}
          end)
          |> Enum.filter(fn m ->
            content = Map.get(m, "content", "")
            String.trim(content) != ""
          end)

        {:error, _reason} ->
          []
      end

    trigger_msg = %{"role" => "user", "content" => trigger_content}

    already_present =
      case List.last(history) do
        %{"role" => "user", "content" => ^trigger_content} -> true
        _ -> false
      end

    if already_present do
      history
    else
      history ++ [trigger_msg]
    end
  end

  defp default_broadcaster(topic, event, payload) do
    Broadcast.endpoint_broadcast!(topic, event, payload)
    :ok
  end

  defp default_publish_request(stream_request) do
    case Redix.command(:redix, ["PUBLISH", "hive:stream:request", Jason.encode!(stream_request)]) do
      {:ok, _} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  defp default_request_id do
    Logger.metadata()[:request_id] || Ulid.generate()
  end

  defp current_traceparent do
    try do
      :otel_propagator_text_map.inject([], fn acc, key, value ->
        [{key, value} | acc]
      end)
      |> Enum.find_value("", fn {k, v} -> if k == "traceparent", do: v end)
    rescue
      _ -> ""
    end
  end
end

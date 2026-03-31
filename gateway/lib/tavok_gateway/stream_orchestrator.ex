defmodule TavokGateway.StreamOrchestrator do
  @moduledoc """
  Durable-first orchestration for Gateway-owned stream startup.

  The Web service owns durable message state. Gateway must persist the ACTIVE
  placeholder before it advertises `stream_start` or publishes a Redis request
  for downstream processing.
  """

  require Logger
  require OpenTelemetry.Tracer, as: Tracer

  alias TavokGateway.Broadcast
  alias TavokGateway.Sequence
  alias TavokGateway.StreamWatchdog
  alias TavokGateway.WebClient

  @dispatch_failure_error "Stream failed before request dispatch"

  def start_byok_stream(
        channel_id,
        agent_config,
        trigger_message_id,
        trigger_content,
        opts \\ []
      )
      when is_binary(channel_id) and is_map(agent_config) and is_binary(trigger_message_id) and
             is_binary(trigger_content) do
    Tracer.with_span "stream_orchestrator.start_byok_stream", %{
      attributes: %{"tavok.channel_id" => channel_id}
    } do
      id_generator = Keyword.get(opts, :id_generator, &Ulid.generate/0)

      sequence_allocator =
        Keyword.get(opts, :sequence_allocator, &Sequence.next_channel_sequence/1)

      start_placeholder =
        Keyword.get(opts, :start_placeholder, &WebClient.start_stream_placeholder/1)

      broadcaster = Keyword.get(opts, :broadcaster, &default_broadcaster/3)
      register_watchdog = Keyword.get(opts, :register_watchdog, &StreamWatchdog.register_stream/2)

      deregister_watchdog =
        Keyword.get(opts, :deregister_watchdog, &StreamWatchdog.deregister_stream/1)

      context_fetcher = Keyword.get(opts, :context_fetcher, &fetch_context_messages/2)
      publish_request = Keyword.get(opts, :publish_request, &default_publish_request/1)
      fail_stream = Keyword.get(opts, :fail_stream, &WebClient.fail_stream/2)
      task_starter = Keyword.get(opts, :task_starter, &default_task_starter/1)
      request_id_generator = Keyword.get(opts, :request_id_generator, &default_request_id/0)
      traceparent_getter = Keyword.get(opts, :traceparent_getter, &current_traceparent/0)

      agent_id = Map.get(agent_config, "id")
      agent_name = Map.get(agent_config, "name")
      agent_avatar_url = Map.get(agent_config, "avatarUrl")
      message_id = id_generator.()

      Tracer.set_attributes(
        trace_attributes(channel_id, agent_id, %{
          "tavok.message_id" => message_id
        })
      )

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
              Tracer.add_event(
                "stream_orchestrator.placeholder_persisted",
                trace_attributes(channel_id, agent_id, %{
                  "tavok.message_id" => message_id
                })
              )

              Logger.info(
                "Durable stream start committed: channel=#{channel_id} message=#{message_id} agent=#{agent_id} sequence=#{sequence_str}"
              )

              broadcaster.("room:#{channel_id}", "stream_start", %{
                messageId: message_id,
                agentId: agent_id,
                agentName: agent_name,
                agentAvatarUrl: agent_avatar_url,
                sequence: sequence_str,
                status: "active"
              })

              Logger.info(
                "stream_start broadcast queued: channel=#{channel_id} message=#{message_id} agent=#{agent_id} sequence=#{sequence_str}"
              )

              register_watchdog.(channel_id, message_id)

              Tracer.add_event(
                "stream_orchestrator.watchdog_registered",
                trace_attributes(channel_id, agent_id, %{
                  "tavok.message_id" => message_id
                })
              )

              stream_request = %{
                channelId: channel_id,
                messageId: message_id,
                agentId: agent_id,
                triggerMessageId: trigger_message_id,
                contextMessages: context_fetcher.(channel_id, trigger_content),
                requestId: request_id_generator.(),
                traceparent: traceparent_getter.()
              }

              dispatch_ctx = OpenTelemetry.Ctx.get_current()

              case task_starter.(fn ->
                     Tracer.with_span dispatch_ctx,
                                      "stream_orchestrator.dispatch_stream_request",
                                      %{
                                        attributes:
                                          trace_attributes(channel_id, agent_id, %{
                                            "tavok.message_id" => message_id
                                          })
                                      } do
                       dispatch_stream_request(
                         channel_id,
                         message_id,
                         agent_id,
                         stream_request,
                         publish_request,
                         fail_stream,
                         deregister_watchdog,
                         broadcaster
                       )
                     end
                   end) do
                {:ok, _task} ->
                  Tracer.add_event(
                    "stream_orchestrator.dispatch_scheduled",
                    trace_attributes(channel_id, agent_id, %{
                      "tavok.message_id" => message_id
                    })
                  )

                  Logger.info(
                    "Stream request dispatch scheduled: channel=#{channel_id} message=#{message_id} agent=#{agent_id}"
                  )

                  {:ok, %{message_id: message_id, sequence: sequence_str}}

                {:error, reason} ->
                  Logger.error(
                    "Failed to schedule stream request dispatch: channel=#{channel_id} message=#{message_id} agent=#{agent_id} reason=#{inspect(reason)}"
                  )

                  deregister_watchdog.(message_id)

                  case recover_dispatch_failure(
                         channel_id,
                         message_id,
                         agent_id,
                         fail_stream,
                         broadcaster,
                         reason
                       ) do
                    :ok -> {:error, {:publish_failed, reason}}
                    {:error, recovery_reason} -> {:error, {:publish_failed, recovery_reason}}
                  end
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

  defp default_task_starter(fun) do
    Task.Supervisor.start_child(TavokGateway.TaskSupervisor, fun)
  end

  defp trace_attributes(channel_id, agent_id, extra \\ %{}) do
    %{
      "tavok.channel_id" => channel_id,
      "tavok.agent_id" => agent_id
    }
    |> Map.merge(extra)
    |> Enum.reject(fn {_key, value} -> is_nil(value) end)
    |> Enum.into(%{})
  end

  defp dispatch_stream_request(
         channel_id,
         message_id,
         agent_id,
         stream_request,
         publish_request,
         fail_stream,
         deregister_watchdog,
         broadcaster
       ) do
    case publish_request.(stream_request) do
      :ok ->
        Tracer.add_event(
          "stream_orchestrator.request_published",
          trace_attributes(channel_id, agent_id, %{
            "tavok.message_id" => message_id
          })
        )

        Logger.info(
          "Stream request published: channel=#{channel_id} message=#{message_id} agent=#{agent_id}"
        )

        :ok

      {:error, reason} ->
        Tracer.add_event(
          "stream_orchestrator.request_publish_failed",
          trace_attributes(channel_id, agent_id, %{
            "tavok.message_id" => message_id,
            "tavok.publish_reason" => inspect(reason)
          })
        )

        Logger.error(
          "Failed to publish stream request: channel=#{channel_id} message=#{message_id} agent=#{agent_id} reason=#{inspect(reason)}"
        )

        deregister_watchdog.(message_id)

        recover_dispatch_failure(
          channel_id,
          message_id,
          agent_id,
          fail_stream,
          broadcaster,
          reason
        )
    end
  end

  defp recover_dispatch_failure(
         channel_id,
         message_id,
         agent_id,
         fail_stream,
         broadcaster,
         reason
       ) do
    case fail_stream.(message_id, %{"content" => "[Error: #{@dispatch_failure_error}]"}) do
      {:ok, _response} ->
        Tracer.add_event(
          "stream_orchestrator.dispatch_failure_recovered",
          trace_attributes(channel_id, agent_id, %{
            "tavok.message_id" => message_id
          })
        )

        Logger.info(
          "Durably failed stream after dispatch error: channel=#{channel_id} message=#{message_id} agent=#{agent_id}"
        )

        broadcaster.("room:#{channel_id}", "stream_error", %{
          messageId: message_id,
          status: "error",
          error: @dispatch_failure_error,
          partialContent: nil
        })

        Logger.info(
          "stream_error broadcast queued after dispatch failure: channel=#{channel_id} message=#{message_id} agent=#{agent_id}"
        )

        :ok

      {:error, fail_reason} ->
        Tracer.add_event(
          "stream_orchestrator.dispatch_failure_recovery_failed",
          trace_attributes(channel_id, agent_id, %{
            "tavok.message_id" => message_id,
            "tavok.fail_reason" => inspect(fail_reason)
          })
        )

        Logger.error(
          "Failed to durably fail stream after dispatch error: channel=#{channel_id} message=#{message_id} agent=#{agent_id} publish_reason=#{inspect(reason)} fail_reason=#{inspect(fail_reason)}"
        )

        {:error, fail_reason}
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

defmodule TavokGateway.SequenceTest do
  use ExUnit.Case, async: true

  alias TavokGateway.Sequence

  defmodule FakeRedis do
    def command(:redix, command) do
      handler = Process.get({__MODULE__, :handler}) || raise "missing redis handler"
      handler.(command)
    end
  end

  defmodule FakeWebClient do
    def get_channel_info(channel_id) do
      handler = Process.get({__MODULE__, :handler}) || raise "missing web client handler"
      handler.(channel_id)
    end
  end

  setup do
    Process.delete({FakeRedis, :handler})
    Process.delete({FakeWebClient, :handler})
    Process.delete(:redis_commands)
    Process.delete(:sleep_delays)
    :ok
  end

  test "returns sequence 1 for a fresh channel" do
    Process.put({FakeRedis, :handler}, fn
      ["EVAL", script, "1", "hive:channel:channel-1:seq", "0"] ->
        assert script =~ "return redis.call(\"INCR\", KEYS[1])"
        {:ok, 1}
    end)

    Process.put({FakeWebClient, :handler}, fn "channel-1" ->
      {:ok, %{"lastSequence" => nil}}
    end)

    assert Sequence.next_channel_sequence("channel-1",
             redis_client: FakeRedis,
             web_client: FakeWebClient
           ) == {:ok, 1}
  end

  test "reseeds Redis from persisted lastSequence after restart" do
    Process.put(:redis_commands, [])

    Process.put({FakeRedis, :handler}, fn command ->
      Process.put(:redis_commands, Process.get(:redis_commands) ++ [command])

      case command do
        ["EVAL", _script, "1", "hive:channel:channel-2:seq", "41"] ->
          {:ok, 42}
      end
    end)

    Process.put({FakeWebClient, :handler}, fn "channel-2" ->
      {:ok, %{"lastSequence" => "41"}}
    end)

    assert Sequence.next_channel_sequence("channel-2",
             redis_client: FakeRedis,
             web_client: FakeWebClient
           ) == {:ok, 42}

    assert [
             ["EVAL", script, "1", "hive:channel:channel-2:seq", "41"]
           ] = Process.get(:redis_commands)

    assert script =~ "if current_num < seed_num then"
  end

  test "uses an atomic redis script to avoid reseed races" do
    Process.put({FakeRedis, :handler}, fn
      ["EVAL", script, "1", "hive:channel:channel-atomic:seq", "41"] ->
        assert script =~ "redis.call(\"SET\", KEYS[1], seed_num)"
        {:ok, 42}
    end)

    Process.put({FakeWebClient, :handler}, fn "channel-atomic" ->
      {:ok, %{"lastSequence" => "41"}}
    end)

    assert Sequence.next_channel_sequence("channel-atomic",
             redis_client: FakeRedis,
             web_client: FakeWebClient
           ) == {:ok, 42}
  end

  test "retries transient Redis errors before succeeding" do
    Process.put(:sleep_delays, [])

    Process.put({FakeRedis, :handler}, fn ["EVAL", _script, "1", "hive:channel:channel-3:seq", "0"] ->
      attempts = Process.get(:attempts, 0)
      Process.put(:attempts, attempts + 1)

      case attempts do
        0 -> {:error, :disconnected}
        _ -> {:ok, 7}
      end
    end)

    Process.put({FakeWebClient, :handler}, fn "channel-3" ->
      {:ok, %{"lastSequence" => nil}}
    end)

    sleep_fn = fn delay ->
      Process.put(:sleep_delays, Process.get(:sleep_delays) ++ [delay])
    end

    assert Sequence.next_channel_sequence("channel-3",
             redis_client: FakeRedis,
             web_client: FakeWebClient,
             sleep_fn: sleep_fn
           ) == {:ok, 7}

    assert Process.get(:sleep_delays) == [100]
  end
end

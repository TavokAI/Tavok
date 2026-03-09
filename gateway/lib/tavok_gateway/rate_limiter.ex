defmodule TavokGateway.RateLimiter do
  @moduledoc """
  Message rate limiter using ETS counters.

  Two layers of rate limiting:
  1. **Per-channel** — 20 msg/sec across all users (existing, DEC-0035)
  2. **Per-user-per-channel** — 5 msg/10sec per user per channel (BUG-005)

  Uses ETS with :public + write_concurrency for lock-free atomic increments
  from channel processes — no GenServer mailbox bottleneck.

  See docs/DECISIONS.md DEC-0035.
  """
  use GenServer

  require Logger

  # ---------- Configuration ----------

  @table_name :hive_rate_limiter
  @max_messages_per_second 20
  @reset_interval_ms 1_000

  # BUG-005: Per-user rate limiting
  @user_table_name :hive_user_rate_limiter
  @max_user_messages_per_window 5
  @user_reset_interval_ms 10_000

  # ---------- Public API ----------

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Check if a message can be sent in the given channel.
  Returns :ok if under the rate limit, {:error, :rate_limited} if over.
  Atomically increments the counter.
  """
  def check_and_increment(channel_id) do
    try do
      count = :ets.update_counter(@table_name, channel_id, {2, 1}, {channel_id, 0})

      if count <= @max_messages_per_second do
        :ok
      else
        {:error, :rate_limited}
      end
    rescue
      ArgumentError ->
        # Table not yet created (shouldn't happen after init)
        :ok
    end
  end

  @doc """
  Check per-user message rate in a channel (BUG-005).
  Returns :ok if under the rate limit, {:error, :rate_limited} if over.
  Limits to #{@max_user_messages_per_window} messages per #{@user_reset_interval_ms}ms per user per channel.
  """
  def check_user_rate(channel_id, user_id) do
    key = {channel_id, user_id}

    try do
      count = :ets.update_counter(@user_table_name, key, {2, 1}, {key, 0})

      if count <= @max_user_messages_per_window do
        :ok
      else
        {:error, :rate_limited}
      end
    rescue
      ArgumentError ->
        # Table not yet created (shouldn't happen after init)
        :ok
    end
  end

  @doc "Return the current message count for a channel (for debugging)."
  def get_count(channel_id) do
    try do
      case :ets.lookup(@table_name, channel_id) do
        [{^channel_id, count}] -> count
        [] -> 0
      end
    rescue
      ArgumentError -> 0
    end
  end

  @doc "Return the current per-user message count (for debugging)."
  def get_user_count(channel_id, user_id) do
    key = {channel_id, user_id}

    try do
      case :ets.lookup(@user_table_name, key) do
        [{^key, count}] -> count
        [] -> 0
      end
    rescue
      ArgumentError -> 0
    end
  end

  @doc "Return rate limiter statistics."
  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  # ---------- GenServer callbacks ----------

  @impl true
  def init(_opts) do
    :ets.new(@table_name, [
      :named_table,
      :set,
      :public,
      write_concurrency: true
    ])

    # BUG-005: Per-user rate limiter table
    :ets.new(@user_table_name, [
      :named_table,
      :set,
      :public,
      write_concurrency: true
    ])

    schedule_reset()
    schedule_user_reset()

    Logger.info(
      "[RateLimiter] Started — channel=#{@max_messages_per_second}/s, user=#{@max_user_messages_per_window}/#{div(@user_reset_interval_ms, 1000)}s"
    )

    {:ok, %{rejections: 0}}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    info = :ets.info(@table_name)
    size = Keyword.get(info, :size, 0)
    user_info = :ets.info(@user_table_name)
    user_size = Keyword.get(user_info, :size, 0)

    {:reply,
     %{
       active_channels: size,
       active_user_slots: user_size,
       rejections: state.rejections,
       max_per_second: @max_messages_per_second,
       max_per_user_window: @max_user_messages_per_window
     }, state}
  end

  @impl true
  def handle_info(:reset, state) do
    # Clear all channel counters — new window starts
    :ets.delete_all_objects(@table_name)
    schedule_reset()
    {:noreply, state}
  end

  @impl true
  def handle_info(:user_reset, state) do
    # Clear all per-user counters — new window starts
    :ets.delete_all_objects(@user_table_name)
    schedule_user_reset()
    {:noreply, state}
  end

  @impl true
  def handle_info(msg, state) do
    Logger.debug("[RateLimiter] Unexpected message: #{inspect(msg)}")
    {:noreply, state}
  end

  defp schedule_reset do
    Process.send_after(self(), :reset, @reset_interval_ms)
  end

  defp schedule_user_reset do
    Process.send_after(self(), :user_reset, @user_reset_interval_ms)
  end
end

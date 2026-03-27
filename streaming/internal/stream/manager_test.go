package stream

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"log/slog"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/TavokAI/Tavok/streaming/internal/provider"
	"github.com/TavokAI/Tavok/streaming/internal/tools"
)

func silentLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestNewManagerDefaultsToConfiguredConcurrency(t *testing.T) {
	manager := NewManager(silentLogger(), nil, nil, nil, nil, 3, 0)

	if manager.maxConcurrentStreams != 3 {
		t.Fatalf("expected maxConcurrentStreams=3, got %d", manager.maxConcurrentStreams)
	}
	if cap(manager.semaphore) != 3 {
		t.Fatalf("expected semaphore cap=3, got %d", cap(manager.semaphore))
	}
}

func TestNewManagerDefaultsConcurrencyWhenZero(t *testing.T) {
	manager := NewManager(silentLogger(), nil, nil, nil, nil, 0, 0)

	if manager.maxConcurrentStreams != 32 {
		t.Fatalf("expected default maxConcurrentStreams=32, got %d", manager.maxConcurrentStreams)
	}
	if cap(manager.semaphore) != 32 {
		t.Fatalf("expected default semaphore cap=32, got %d", cap(manager.semaphore))
	}
}

func TestNewManagerDefaultsConcurrencyWhenNegative(t *testing.T) {
	manager := NewManager(silentLogger(), nil, nil, nil, nil, -5, 0)

	if manager.maxConcurrentStreams != 32 {
		t.Fatalf("expected default maxConcurrentStreams=32, got %d", manager.maxConcurrentStreams)
	}
}

func TestConcurrencyLimitRejectsAdditionalSlots(t *testing.T) {
	manager := &Manager{
		logger:               silentLogger(),
		active:               make(map[string]struct{}),
		maxConcurrentStreams: 1,
		semaphore:            make(chan struct{}, 1),
	}

	if !manager.tryAcquireSlot() {
		t.Fatal("expected first slot to be acquired")
	}
	if manager.tryAcquireSlot() {
		t.Fatal("expected second slot acquisition to be rejected")
	}

	manager.releaseSlot()

	if !manager.tryAcquireSlot() {
		t.Fatal("expected slot to be reusable after release")
	}
}

func TestActiveCountStartsAtZero(t *testing.T) {
	manager := NewManager(silentLogger(), nil, nil, nil, nil, 10, 0)

	if manager.ActiveCount() != 0 {
		t.Fatalf("expected ActiveCount=0, got %d", manager.ActiveCount())
	}
}

func TestActiveCountTracksConcurrentStreams(t *testing.T) {
	manager := &Manager{
		logger:               silentLogger(),
		active:               make(map[string]struct{}),
		maxConcurrentStreams: 10,
		semaphore:            make(chan struct{}, 10),
	}

	manager.mu.Lock()
	manager.active["msg-1"] = struct{}{}
	manager.active["msg-2"] = struct{}{}
	manager.active["msg-3"] = struct{}{}
	manager.mu.Unlock()

	if manager.ActiveCount() != 3 {
		t.Fatalf("expected ActiveCount=3, got %d", manager.ActiveCount())
	}

	manager.mu.Lock()
	delete(manager.active, "msg-2")
	manager.mu.Unlock()

	if manager.ActiveCount() != 2 {
		t.Fatalf("expected ActiveCount=2, got %d", manager.ActiveCount())
	}
}

func TestSemaphoreConcurrency(t *testing.T) {
	manager := &Manager{
		logger:               silentLogger(),
		active:               make(map[string]struct{}),
		maxConcurrentStreams: 5,
		semaphore:            make(chan struct{}, 5),
	}

	for i := 0; i < 5; i++ {
		if !manager.tryAcquireSlot() {
			t.Fatalf("expected slot %d to be acquired", i)
		}
	}

	if manager.tryAcquireSlot() {
		t.Fatal("expected slot 6 to be rejected")
	}

	for i := 0; i < 5; i++ {
		manager.releaseSlot()
	}

	if !manager.tryAcquireSlot() {
		t.Fatal("expected slot to be available after release")
	}
}

func TestStreamRequestDeserialization(t *testing.T) {
	raw := `{
		"channelId": "ch-1",
		"messageId": "msg-1",
		"agentId": "agent-1",
		"triggerMessageId": "trigger-1",
		"contextMessages": [
			{"role": "user", "content": "hello"},
			{"role": "assistant", "content": "hi"}
		]
	}`

	var req streamRequest
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}

	if req.ChannelID != "ch-1" {
		t.Errorf("ChannelID = %q, want %q", req.ChannelID, "ch-1")
	}
	if req.MessageID != "msg-1" {
		t.Errorf("MessageID = %q, want %q", req.MessageID, "msg-1")
	}
	if req.AgentID != "agent-1" {
		t.Errorf("AgentID = %q, want %q", req.AgentID, "agent-1")
	}
	if req.TriggerMsgID != "trigger-1" {
		t.Errorf("TriggerMsgID = %q, want %q", req.TriggerMsgID, "trigger-1")
	}
	if len(req.ContextMessages) != 2 {
		t.Fatalf("ContextMessages len = %d, want 2", len(req.ContextMessages))
	}
	if req.ContextMessages[0].Role != "user" {
		t.Errorf("ContextMessages[0].Role = %q, want %q", req.ContextMessages[0].Role, "user")
	}
}

func TestStreamRequestDeserializationInvalid(t *testing.T) {
	var req streamRequest
	err := json.Unmarshal([]byte("not json"), &req)
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestStreamRequestDeserializationEmpty(t *testing.T) {
	var req streamRequest
	err := json.Unmarshal([]byte(`{}`), &req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if req.ChannelID != "" {
		t.Errorf("ChannelID = %q, want empty", req.ChannelID)
	}
	if len(req.ContextMessages) != 0 {
		t.Errorf("ContextMessages len = %d, want 0", len(req.ContextMessages))
	}
}

// --- TASK-0012: Multi-Stream in One Channel Tests ---

func TestMultipleAgentsTrackedIndependently(t *testing.T) {
	manager := &Manager{
		logger:               silentLogger(),
		active:               make(map[string]struct{}),
		maxConcurrentStreams: 10,
		semaphore:            make(chan struct{}, 10),
	}

	// Simulate 3 agents streaming concurrently in the same channel
	// Each agent gets a unique messageId (per the multi-agent protocol)
	agentMessages := []string{"msg-agent1-ch1", "msg-agent2-ch1", "msg-agent3-ch1"}

	for _, msgID := range agentMessages {
		if !manager.tryAcquireSlot() {
			t.Fatalf("failed to acquire slot for %s", msgID)
		}
		manager.mu.Lock()
		manager.active[msgID] = struct{}{}
		manager.mu.Unlock()
	}

	if manager.ActiveCount() != 3 {
		t.Fatalf("expected 3 active streams, got %d", manager.ActiveCount())
	}

	// First agent completes
	manager.mu.Lock()
	delete(manager.active, "msg-agent1-ch1")
	manager.mu.Unlock()
	manager.releaseSlot()

	if manager.ActiveCount() != 2 {
		t.Fatalf("expected 2 active streams after agent1 completes, got %d", manager.ActiveCount())
	}

	// Second agent errors — still tracked until removed
	manager.mu.Lock()
	delete(manager.active, "msg-agent2-ch1")
	manager.mu.Unlock()
	manager.releaseSlot()

	if manager.ActiveCount() != 1 {
		t.Fatalf("expected 1 active stream after agent2 errors, got %d", manager.ActiveCount())
	}

	// Third agent completes
	manager.mu.Lock()
	delete(manager.active, "msg-agent3-ch1")
	manager.mu.Unlock()
	manager.releaseSlot()

	if manager.ActiveCount() != 0 {
		t.Fatalf("expected 0 active streams after all complete, got %d", manager.ActiveCount())
	}
}

func TestMultiStreamSemaphoreIsolation(t *testing.T) {
	// With concurrency limit of 3, exactly 3 agents can stream simultaneously
	manager := &Manager{
		logger:               silentLogger(),
		active:               make(map[string]struct{}),
		maxConcurrentStreams: 3,
		semaphore:            make(chan struct{}, 3),
	}

	// Acquire 3 slots (one per agent)
	for i := 0; i < 3; i++ {
		if !manager.tryAcquireSlot() {
			t.Fatalf("expected slot %d to be acquired", i)
		}
	}

	// 4th agent in same channel should be rejected (semaphore full)
	if manager.tryAcquireSlot() {
		t.Fatal("expected 4th concurrent stream to be rejected")
	}

	// Release one slot — 4th agent can now proceed
	manager.releaseSlot()
	if !manager.tryAcquireSlot() {
		t.Fatal("expected slot to be available after release")
	}
}

func TestMultiStreamRequestDeserialization(t *testing.T) {
	// Verify two stream requests for the same channel but different agents
	// can coexist without field collision
	raw1 := `{
		"channelId": "ch-1",
		"messageId": "msg-agent1",
		"agentId": "agent-1",
		"triggerMessageId": "trigger-1",
		"contextMessages": [{"role": "user", "content": "hello"}]
	}`
	raw2 := `{
		"channelId": "ch-1",
		"messageId": "msg-agent2",
		"agentId": "agent-2",
		"triggerMessageId": "trigger-1",
		"contextMessages": [{"role": "user", "content": "hello"}]
	}`

	var req1, req2 streamRequest
	if err := json.Unmarshal([]byte(raw1), &req1); err != nil {
		t.Fatalf("unmarshal req1: %v", err)
	}
	if err := json.Unmarshal([]byte(raw2), &req2); err != nil {
		t.Fatalf("unmarshal req2: %v", err)
	}

	// Same channel, same trigger
	if req1.ChannelID != req2.ChannelID {
		t.Errorf("ChannelIDs should match: %q != %q", req1.ChannelID, req2.ChannelID)
	}
	if req1.TriggerMsgID != req2.TriggerMsgID {
		t.Errorf("TriggerMsgIDs should match: %q != %q", req1.TriggerMsgID, req2.TriggerMsgID)
	}

	// Different message IDs and agent IDs
	if req1.MessageID == req2.MessageID {
		t.Error("MessageIDs should differ for multi-agent")
	}
	if req1.AgentID == req2.AgentID {
		t.Error("AgentIDs should differ for multi-agent")
	}
}

func TestActiveCountIsThreadSafe(t *testing.T) {
	manager := &Manager{
		logger:               silentLogger(),
		active:               make(map[string]struct{}),
		maxConcurrentStreams: 100,
		semaphore:            make(chan struct{}, 100),
	}

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			key := string(rune('A' + id))
			manager.mu.Lock()
			manager.active[key] = struct{}{}
			manager.mu.Unlock()
			_ = manager.ActiveCount()
			manager.mu.Lock()
			delete(manager.active, key)
			manager.mu.Unlock()
		}(i)
	}
	wg.Wait()

	if manager.ActiveCount() != 0 {
		t.Fatalf("expected ActiveCount=0 after all goroutines done, got %d", manager.ActiveCount())
	}
}

// --- Concurrent Slot Exhaustion Tests (X5) ---

func TestConcurrentSlotExhaustion(t *testing.T) {
	const maxSlots = 5
	const totalGoroutines = 50

	manager := &Manager{
		logger:               silentLogger(),
		active:               make(map[string]struct{}),
		maxConcurrentStreams: maxSlots,
		semaphore:            make(chan struct{}, maxSlots),
	}

	var (
		wg       sync.WaitGroup
		mu       sync.Mutex
		acquired int
		rejected int
		held     = make(chan struct{}) // blocks goroutines that acquired a slot
	)

	// Launch many goroutines simultaneously racing for limited slots
	wg.Add(totalGoroutines)
	for i := 0; i < totalGoroutines; i++ {
		go func() {
			defer wg.Done()
			if manager.tryAcquireSlot() {
				mu.Lock()
				acquired++
				mu.Unlock()
				// Hold the slot until test releases
				<-held
				manager.releaseSlot()
			} else {
				mu.Lock()
				rejected++
				mu.Unlock()
			}
		}()
	}

	// Wait briefly for all goroutines to attempt acquisition
	// (they'll either acquire and block on <-held, or get rejected and finish)
	// Poll until rejected count stabilizes
	for {
		mu.Lock()
		r := rejected
		a := acquired
		mu.Unlock()
		if r+a == totalGoroutines {
			break
		}
	}

	mu.Lock()
	finalAcquired := acquired
	finalRejected := rejected
	mu.Unlock()

	// Exactly maxSlots goroutines should have acquired
	if finalAcquired != maxSlots {
		t.Fatalf("expected exactly %d acquired, got %d", maxSlots, finalAcquired)
	}
	if finalRejected != totalGoroutines-maxSlots {
		t.Fatalf("expected %d rejected, got %d", totalGoroutines-maxSlots, finalRejected)
	}

	// Release held goroutines
	close(held)
	wg.Wait()

	// All slots should be free now
	for i := 0; i < maxSlots; i++ {
		if !manager.tryAcquireSlot() {
			t.Fatalf("expected slot %d to be available after release", i)
		}
	}
	// And the next one should fail
	if manager.tryAcquireSlot() {
		t.Fatal("expected slot to be rejected after re-acquiring all")
	}
}

func TestConcurrentAcquireReleaseCycles(t *testing.T) {
	const maxSlots = 3
	const cycles = 100
	const goroutines = 10

	manager := &Manager{
		logger:               silentLogger(),
		active:               make(map[string]struct{}),
		maxConcurrentStreams: maxSlots,
		semaphore:            make(chan struct{}, maxSlots),
	}

	// Multiple goroutines repeatedly acquire and release slots
	// to verify no slot leaks under contention
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for g := 0; g < goroutines; g++ {
		go func() {
			defer wg.Done()
			for c := 0; c < cycles; c++ {
				if manager.tryAcquireSlot() {
					// Simulate brief work
					manager.releaseSlot()
				}
			}
		}()
	}
	wg.Wait()

	// After all cycles, all slots must be free (no leaks)
	for i := 0; i < maxSlots; i++ {
		if !manager.tryAcquireSlot() {
			t.Fatalf("slot leak detected: slot %d unavailable after all cycles", i)
		}
	}
	if manager.tryAcquireSlot() {
		t.Fatal("more slots available than maxSlots — something is wrong")
	}
}

// --- appendToolContext Tests (TASK-0018) ---

func newTestManager() *Manager {
	return &Manager{
		logger:               silentLogger(),
		active:               make(map[string]struct{}),
		maxConcurrentStreams: 10,
		semaphore:            make(chan struct{}, 10),
	}
}

func TestAppendToolContext_SingleToolCall(t *testing.T) {
	m := newTestManager()

	initialMsgs := []provider.StreamMessage{
		{Role: "user", Content: "What time is it?"},
	}

	toolCalls := []provider.ToolCall{
		{ID: "call-1", Name: "current_time", Arguments: map[string]interface{}{"timezone": "UTC"}},
	}

	results := []tools.ToolCallResult{
		{CallID: "call-1", Name: "current_time", Content: "2026-03-02T12:00:00Z", IsError: false},
	}

	got := m.appendToolContext(initialMsgs, toolCalls, results, "anthropic")

	// Should have: original message + assistant tool_use message + user tool_result message
	if len(got) != 3 {
		t.Fatalf("expected 3 messages, got %d", len(got))
	}

	// First message unchanged
	if got[0].Role != "user" || got[0].Content != "What time is it?" {
		t.Errorf("first message modified: role=%q content=%q", got[0].Role, got[0].Content)
	}

	// Second message: assistant with structured tool calls
	if got[1].Role != "assistant" {
		t.Errorf("second message role = %q, want assistant", got[1].Role)
	}
	if len(got[1].ToolCalls) != 1 {
		t.Fatalf("expected 1 tool call, got %d", len(got[1].ToolCalls))
	}
	if got[1].ToolCalls[0].Name != "current_time" {
		t.Errorf("tool call name = %q, want current_time", got[1].ToolCalls[0].Name)
	}
	if got[1].ToolCalls[0].ID != "call-1" {
		t.Errorf("tool call ID = %q, want call-1", got[1].ToolCalls[0].ID)
	}

	// Third message: user with structured tool results (Anthropic format)
	if got[2].Role != "user" {
		t.Errorf("third message role = %q, want user", got[2].Role)
	}
	if len(got[2].ToolResults) != 1 {
		t.Fatalf("expected 1 tool result, got %d", len(got[2].ToolResults))
	}
	if got[2].ToolResults[0].ToolUseID != "call-1" {
		t.Errorf("tool result ID = %q, want call-1", got[2].ToolResults[0].ToolUseID)
	}
	if got[2].ToolResults[0].Content != "2026-03-02T12:00:00Z" {
		t.Errorf("tool result content = %q, want 2026-03-02T12:00:00Z", got[2].ToolResults[0].Content)
	}
}

func TestAppendToolContext_MultipleToolCalls(t *testing.T) {
	m := newTestManager()

	initialMsgs := []provider.StreamMessage{
		{Role: "user", Content: "Search and tell me the time"},
	}

	toolCalls := []provider.ToolCall{
		{ID: "call-1", Name: "web_search", Arguments: map[string]interface{}{"query": "news"}},
		{ID: "call-2", Name: "current_time", Arguments: map[string]interface{}{}},
	}

	results := []tools.ToolCallResult{
		{CallID: "call-1", Name: "web_search", Content: "Found 10 results", IsError: false},
		{CallID: "call-2", Name: "current_time", Content: "12:00 UTC", IsError: false},
	}

	got := m.appendToolContext(initialMsgs, toolCalls, results, "anthropic")

	// Anthropic: original + 1 assistant (with tool calls) + 1 user (with all tool results) = 3
	if len(got) != 3 {
		t.Fatalf("expected 3 messages, got %d", len(got))
	}

	// Assistant message should have both tool calls
	if len(got[1].ToolCalls) != 2 {
		t.Fatalf("expected 2 tool calls, got %d", len(got[1].ToolCalls))
	}
	if got[1].ToolCalls[0].Name != "web_search" {
		t.Errorf("first tool call name = %q, want web_search", got[1].ToolCalls[0].Name)
	}
	if got[1].ToolCalls[1].Name != "current_time" {
		t.Errorf("second tool call name = %q, want current_time", got[1].ToolCalls[1].Name)
	}

	// User message should contain both tool results
	if len(got[2].ToolResults) != 2 {
		t.Fatalf("expected 2 tool results, got %d", len(got[2].ToolResults))
	}
	if got[2].ToolResults[0].ToolUseID != "call-1" {
		t.Errorf("first result ID = %q, want call-1", got[2].ToolResults[0].ToolUseID)
	}
	if got[2].ToolResults[1].ToolUseID != "call-2" {
		t.Errorf("second result ID = %q, want call-2", got[2].ToolResults[1].ToolUseID)
	}
}

func TestAppendToolContext_ErrorResult(t *testing.T) {
	m := newTestManager()

	initialMsgs := []provider.StreamMessage{}

	toolCalls := []provider.ToolCall{
		{ID: "call-err", Name: "web_search", Arguments: map[string]interface{}{"query": "test"}},
	}

	results := []tools.ToolCallResult{
		{CallID: "call-err", Name: "web_search", Content: "connection refused", IsError: true},
	}

	got := m.appendToolContext(initialMsgs, toolCalls, results, "openai")

	// OpenAI: assistant + 1 tool message = 2
	if len(got) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(got))
	}

	// OpenAI tool message should have the content and tool call ID
	if got[1].Role != "tool" {
		t.Errorf("result message role = %q, want tool", got[1].Role)
	}
	if got[1].ToolCallID != "call-err" {
		t.Errorf("result message ToolCallID = %q, want call-err", got[1].ToolCallID)
	}
	if got[1].Content != "connection refused" {
		t.Errorf("result message content = %q, want connection refused", got[1].Content)
	}
}

func TestAppendToolContext_NonErrorResultNotWrapped(t *testing.T) {
	m := newTestManager()

	toolCalls := []provider.ToolCall{
		{ID: "call-ok", Name: "my_tool", Arguments: map[string]interface{}{}},
	}

	results := []tools.ToolCallResult{
		{CallID: "call-ok", Name: "my_tool", Content: "success data", IsError: false},
	}

	got := m.appendToolContext(nil, toolCalls, results, "anthropic")

	// Anthropic: assistant + user (with tool results) = 2
	if len(got) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(got))
	}

	// Tool result should not be marked as error
	if len(got[1].ToolResults) != 1 {
		t.Fatalf("expected 1 tool result, got %d", len(got[1].ToolResults))
	}
	if got[1].ToolResults[0].IsError {
		t.Errorf("non-error result should have IsError=false")
	}
	if got[1].ToolResults[0].Content != "success data" {
		t.Errorf("result content = %q, want success data", got[1].ToolResults[0].Content)
	}
}

func TestAppendToolContext_PreservesExistingMessages(t *testing.T) {
	m := newTestManager()

	existing := []provider.StreamMessage{
		{Role: "system", Content: "You are helpful"},
		{Role: "user", Content: "Hello"},
		{Role: "assistant", Content: "Hi there"},
		{Role: "user", Content: "Use a tool"},
	}

	toolCalls := []provider.ToolCall{
		{ID: "c1", Name: "tool1", Arguments: map[string]interface{}{}},
	}

	results := []tools.ToolCallResult{
		{CallID: "c1", Name: "tool1", Content: "done", IsError: false},
	}

	got := m.appendToolContext(existing, toolCalls, results, "anthropic")

	// 4 existing + 1 assistant + 1 result = 6
	if len(got) != 6 {
		t.Fatalf("expected 6 messages, got %d", len(got))
	}

	// Verify existing messages are untouched
	for i := 0; i < 4; i++ {
		if got[i].Role != existing[i].Role || got[i].Content != existing[i].Content {
			t.Errorf("message[%d] modified: got {%q, %q}, want {%q, %q}",
				i, got[i].Role, got[i].Content, existing[i].Role, existing[i].Content)
		}
	}
}

func TestAppendToolContext_EmptyToolCallsAndResults(t *testing.T) {
	m := newTestManager()

	existing := []provider.StreamMessage{
		{Role: "user", Content: "test"},
	}

	got := m.appendToolContext(existing, []provider.ToolCall{}, []tools.ToolCallResult{}, "anthropic")

	// Anthropic: original + 1 assistant (empty tool calls) + 1 user (empty tool results) = 3
	if len(got) != 3 {
		t.Fatalf("expected 3 messages, got %d", len(got))
	}
	if got[1].Role != "assistant" {
		t.Errorf("second message role = %q, want assistant", got[1].Role)
	}
	if len(got[1].ToolCalls) != 0 {
		t.Errorf("expected 0 tool calls, got %d", len(got[1].ToolCalls))
	}
}

func TestAppendToolContext_NilInitialMessages(t *testing.T) {
	m := newTestManager()

	toolCalls := []provider.ToolCall{
		{ID: "c1", Name: "tool1", Arguments: map[string]interface{}{}},
	}
	results := []tools.ToolCallResult{
		{CallID: "c1", Name: "tool1", Content: "result", IsError: false},
	}

	got := m.appendToolContext(nil, toolCalls, results, "openai")

	// nil + 1 assistant + 1 result = 2
	if len(got) != 2 {
		t.Fatalf("expected 2 messages from nil initial, got %d", len(got))
	}
}

func TestAppendToolContext_ToolCallsStructured(t *testing.T) {
	m := newTestManager()

	toolCalls := []provider.ToolCall{
		{ID: "tc-42", Name: "web_search", Arguments: map[string]interface{}{"query": "golang testing"}},
	}
	results := []tools.ToolCallResult{
		{CallID: "tc-42", Name: "web_search", Content: "results", IsError: false},
	}

	got := m.appendToolContext(nil, toolCalls, results, "anthropic")

	// Assistant message should carry structured tool calls, not serialized text
	if got[0].Role != "assistant" {
		t.Fatalf("first message role = %q, want assistant", got[0].Role)
	}
	if got[0].Content != "" {
		t.Errorf("assistant message content should be empty, got %q", got[0].Content)
	}
	if len(got[0].ToolCalls) != 1 {
		t.Fatalf("expected 1 tool call, got %d", len(got[0].ToolCalls))
	}
	if got[0].ToolCalls[0].Name != "web_search" {
		t.Errorf("tool call name = %q, want web_search", got[0].ToolCalls[0].Name)
	}
	if got[0].ToolCalls[0].ID != "tc-42" {
		t.Errorf("tool call ID = %q, want tc-42", got[0].ToolCalls[0].ID)
	}
	q, ok := got[0].ToolCalls[0].Arguments["query"]
	if !ok || q != "golang testing" {
		t.Errorf("tool call arguments[query] = %v, want golang testing", q)
	}
}

func TestAppendToolContext_ResultMessageFormat(t *testing.T) {
	m := newTestManager()

	toolCalls := []provider.ToolCall{
		{ID: "id-99", Name: "my_tool", Arguments: map[string]interface{}{}},
	}
	results := []tools.ToolCallResult{
		{CallID: "id-99", Name: "my_tool", Content: "the result", IsError: false},
	}

	got := m.appendToolContext(nil, toolCalls, results, "anthropic")

	// Anthropic: user message with structured ToolResults
	if got[1].Role != "user" {
		t.Errorf("result message role = %q, want user", got[1].Role)
	}
	if len(got[1].ToolResults) != 1 {
		t.Fatalf("expected 1 tool result, got %d", len(got[1].ToolResults))
	}
	r := got[1].ToolResults[0]
	if r.ToolUseID != "id-99" {
		t.Errorf("tool result ID = %q, want id-99", r.ToolUseID)
	}
	if r.Content != "the result" {
		t.Errorf("tool result content = %q, want 'the result'", r.Content)
	}
	if r.Type != "tool_result" {
		t.Errorf("tool result type = %q, want tool_result", r.Type)
	}
}

// --- Empty Response Guard Tests (ISSUE-027) ---
// These test the logic from handleStream where empty final content gets a placeholder.
// Since handleStream has many dependencies, we test the logic pattern directly.

func TestEmptyResponseGuard_EmptyContent(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    string
	}{
		{"empty string", "", "*[No response generated]*"},
		{"only spaces", "   ", "*[No response generated]*"},
		{"only newlines", "\n\n", "*[No response generated]*"},
		{"only tabs", "\t\t", "*[No response generated]*"},
		{"mixed whitespace", " \n \t ", "*[No response generated]*"},
		{"has content", "Hello world", "Hello world"},
		{"has content with whitespace", "  Hello  ", "  Hello  "},
		{"single char", "x", "x"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Replicate the guard logic from handleStream (line 419-425)
			finalContent := tt.content
			if strings.TrimSpace(finalContent) == "" {
				finalContent = "*[No response generated]*"
			}

			if finalContent != tt.want {
				t.Errorf("empty guard: got %q, want %q", finalContent, tt.want)
			}
		})
	}
}

func TestEmptyResponseGuard_PlaceholderIsNonEmpty(t *testing.T) {
	placeholder := "*[No response generated]*"
	if strings.TrimSpace(placeholder) == "" {
		t.Fatal("placeholder itself should not be considered empty")
	}
}

func TestHandleStreamFinalizesBeforePublishingCompletionStatus(t *testing.T) {
	callOrder := selectorCallOrderForFunc(t, "handleStream")

	finalizeIdx := selectorCallIndex(t, callOrder, "FinalizeMessageFull")
	publishIdx := selectorCallIndex(t, callOrder, "PublishStatus")

	if finalizeIdx >= publishIdx {
		t.Fatalf(
			"expected handleStream to durably finalize before publishing completion status, call order was %v",
			callOrder,
		)
	}
}

func TestPublishErrorFinalizesBeforePublishingErrorStatus(t *testing.T) {
	callOrder := selectorCallOrderForFunc(t, "publishError")

	finalizeIdx := selectorCallIndex(t, callOrder, "FinalizeMessageWithRetry")
	publishIdx := selectorCallIndex(t, callOrder, "PublishStatus")

	if finalizeIdx >= publishIdx {
		t.Fatalf(
			"expected publishError to durably finalize before publishing error status, call order was %v",
			callOrder,
		)
	}
}

func selectorCallOrderForFunc(t *testing.T, funcName string) []string {
	t.Helper()

	fset := token.NewFileSet()
	path := filepath.Join(".", "manager.go")
	file, err := parser.ParseFile(fset, path, nil, 0)
	if err != nil {
		t.Fatalf("parse manager.go: %v", err)
	}

	var fn *ast.FuncDecl
	for _, decl := range file.Decls {
		candidate, ok := decl.(*ast.FuncDecl)
		if ok && candidate.Name.Name == funcName {
			fn = candidate
			break
		}
	}

	if fn == nil || fn.Body == nil {
		t.Fatalf("function %s not found in manager.go", funcName)
	}

	var calls []string
	ast.Inspect(fn.Body, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}

		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}

		calls = append(calls, selector.Sel.Name)
		return true
	})

	return calls
}

func selectorCallIndex(t *testing.T, callOrder []string, target string) int {
	t.Helper()

	for idx, call := range callOrder {
		if call == target {
			return idx
		}
	}

	t.Fatalf("call %s not found in %v", target, callOrder)
	return -1
}

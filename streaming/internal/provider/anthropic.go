// Package provider — Anthropic (Claude) provider implementation.
//
// Handles SSE streaming from the Anthropic Messages API.
// Parses content_block_delta events to extract tokens.
// Uses x-api-key header (not Bearer token) and anthropic-version header.
package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/TavokAI/Tavok/streaming/internal/sse"
)

// Anthropic implements the Provider interface for the Anthropic Claude API.
type Anthropic struct {
	client *http.Client // reused across all Stream() calls (ISSUE-005)
}

func NewAnthropic() *Anthropic {
	return &Anthropic{
		client: NewStreamingHTTPClient(), // Shared tuned transport (DEC-0034)
	}
}

func (a *Anthropic) Name() string {
	return "anthropic"
}

// anthropicRequest is the POST body for /v1/messages
type anthropicRequest struct {
	Model       string             `json:"model"`
	MaxTokens   int                `json:"max_tokens"`
	System      string             `json:"system,omitempty"`
	Messages    []anthropicMessage `json:"messages"`
	Stream      bool               `json:"stream"`
	Temperature float64            `json:"temperature,omitempty"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// anthropicDelta is the content_block_delta event payload
type anthropicDelta struct {
	Type  string `json:"type"`
	Delta struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"delta"`
}

func (a *Anthropic) Stream(ctx context.Context, req StreamRequest, tokens chan<- Token) (*StreamResult, error) {
	defer close(tokens)

	startTime := time.Now()

	// Build messages (Anthropic doesn't put system in messages, it's a separate field)
	// Consolidate consecutive same-role messages — Anthropic requires strictly
	// alternating user/assistant turns. In chat history, consecutive user messages
	// can appear when a previous bot response was empty or multiple users posted
	// in sequence. Sending non-alternating roles causes the model to intermittently
	// return empty responses (stopReason: "end_turn", zero content blocks). (ISSUE-027)
	rawMessages := make([]anthropicMessage, 0, len(req.ContextMessages))
	for _, m := range req.ContextMessages {
		rawMessages = append(rawMessages, anthropicMessage{Role: m.Role, Content: m.Content})
	}

	messages := consolidateMessages(rawMessages)

	// Default max tokens
	maxTokens := req.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 4096
	}

	// Build request body
	body := anthropicRequest{
		Model:       req.Model,
		MaxTokens:   maxTokens,
		System:      req.SystemPrompt,
		Messages:    messages,
		Stream:      true,
		Temperature: req.Temperature,
	}

	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	// Build endpoint URL — append /v1/messages if not already present
	endpoint := strings.TrimRight(req.APIEndpoint, "/")
	if !strings.HasSuffix(endpoint, "/v1/messages") {
		endpoint += "/v1/messages"
	}

	// Create HTTP request
	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(bodyJSON))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	httpReq.Header.Set("x-api-key", req.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	// Send request (reuse shared HTTP client — ISSUE-005)
	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("provider returned %d: %s", resp.StatusCode, string(respBody))
	}

	// Parse SSE stream
	var finalContent strings.Builder
	tokenIndex := 0
	var streamErr error // capture error events from SSE stream (ISSUE-002)

	// Counters for empty response detection (ISSUE-027)
	eventCounts := make(map[string]int)
	emptyTextDeltas := 0
	var stopReason string

	err = sse.Parse(resp.Body, func(event sse.Event) {
		eventCounts[event.EventType]++

		switch event.EventType {
		case "content_block_delta":
			var delta anthropicDelta
			if err := json.Unmarshal([]byte(event.Data), &delta); err != nil {
				slog.Warn("Failed to parse Anthropic delta", "error", err, "data", event.Data)
				return
			}

			text := delta.Delta.Text
			if text == "" {
				emptyTextDeltas++
				// Log first empty delta for diagnostics
				if emptyTextDeltas == 1 {
					slog.Warn("Anthropic content_block_delta with empty text",
						"deltaType", delta.Delta.Type,
						"outerType", delta.Type,
						"rawData", event.Data,
					)
				}
				return
			}

			finalContent.WriteString(text)
			// Context-aware channel send — prevents goroutine leak if manager
			// stops reading (timeout, cancel). (ISSUE-005)
			select {
			case tokens <- Token{
				Text:  text,
				Index: tokenIndex,
			}:
				tokenIndex++
			case <-ctx.Done():
				return
			}

		case "message_stop":
			// Stream is done
			return

		case "message_delta":
			// Capture stop_reason for diagnostics
			var md struct {
				Delta struct {
					StopReason string `json:"stop_reason"`
				} `json:"delta"`
			}
			if err := json.Unmarshal([]byte(event.Data), &md); err == nil {
				stopReason = md.Delta.StopReason
			}
			return

		case "message_start", "content_block_start", "content_block_stop", "ping":
			// Expected events, no action needed
			return

		case "error":
			// Anthropic sends error events for rate limits, auth failures, and
			// overloaded errors. Capture as a real error so the manager publishes
			// stream_error instead of stream_complete. (ISSUE-002)
			slog.Error("Anthropic stream error event", "data", event.Data)
			streamErr = fmt.Errorf("anthropic error event: %s", event.Data)
			return

		default:
			// Unknown event type — log but don't crash
			slog.Debug("Unknown Anthropic SSE event", "event", event.EventType)
		}
	})

	// Debug-level stream summary (promoted to Warn for empty responses below)
	slog.Debug("Anthropic SSE stream summary",
		"tokenIndex", tokenIndex,
		"emptyTextDeltas", emptyTextDeltas,
		"eventCounts", eventCounts,
		"finalContentLen", finalContent.Len(),
		"stopReason", stopReason,
	)

	if err != nil {
		return &StreamResult{
			FinalContent: finalContent.String(),
			TokenCount:   tokenIndex,
			DurationMs:   time.Since(startTime).Milliseconds(),
			Error:        fmt.Errorf("sse parse error: %w", err),
		}, err
	}

	// Check for error events captured during parsing (ISSUE-002)
	if streamErr != nil {
		return &StreamResult{
			FinalContent: finalContent.String(),
			TokenCount:   tokenIndex,
			DurationMs:   time.Since(startTime).Milliseconds(),
			Error:        streamErr,
		}, streamErr
	}

	// Detect empty responses — model returned valid SSE stream but no content blocks.
	// This happens intermittently and can cascade if empty content is persisted and
	// included in future context. Log a warning for monitoring. (ISSUE-027)
	if tokenIndex == 0 && finalContent.Len() == 0 {
		slog.Warn("Anthropic returned empty response (no content blocks)",
			"stopReason", stopReason,
			"eventCounts", eventCounts,
			"durationMs", time.Since(startTime).Milliseconds(),
		)
	}

	return &StreamResult{
		FinalContent: finalContent.String(),
		TokenCount:   tokenIndex,
		DurationMs:   time.Since(startTime).Milliseconds(),
	}, nil
}

// consolidateMessages merges consecutive same-role messages into single messages.
// Anthropic's Messages API requires strictly alternating user/assistant turns.
// Consecutive same-role messages can appear in chat history when:
//   - A previous bot response was empty (now persisted as placeholder)
//   - Multiple users posted without bot responses between them
//   - Messages were deleted leaving gaps
//
// Without consolidation, the model intermittently returns empty responses. (ISSUE-027)
func consolidateMessages(messages []anthropicMessage) []anthropicMessage {
	if len(messages) == 0 {
		return messages
	}

	consolidated := make([]anthropicMessage, 0, len(messages))
	consolidated = append(consolidated, messages[0])

	for i := 1; i < len(messages); i++ {
		last := &consolidated[len(consolidated)-1]
		if messages[i].Role == last.Role {
			// Merge: append content with newline separator
			last.Content += "\n\n" + messages[i].Content
		} else {
			consolidated = append(consolidated, messages[i])
		}
	}

	// Anthropic requires the first message to be from "user" role.
	// If the first message is "assistant", prepend a synthetic user message.
	if len(consolidated) > 0 && consolidated[0].Role == "assistant" {
		consolidated = append([]anthropicMessage{{
			Role:    "user",
			Content: "[Previous conversation context follows]",
		}}, consolidated...)
	}

	if len(consolidated) != len(messages) {
		slog.Info("Consolidated context messages for Anthropic API",
			"original", len(messages),
			"consolidated", len(consolidated),
		)
	}

	return consolidated
}

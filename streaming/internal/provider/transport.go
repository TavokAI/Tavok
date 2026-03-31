// Package provider — Transport abstraction for LLM API connections.
//
// Transport decouples the HTTP connection from the response format parsing.
// Both OpenAI and Anthropic use HTTP POST → SSE response, but this interface
// allows future extension to WebSocket, gRPC, or other transports (TASK-0013).
package provider

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Transport is the interface for opening a streaming connection to an LLM API.
// Implementations handle the HTTP mechanics; callers handle format parsing.
type Transport interface {
	// OpenStream sends the HTTP request and returns the response body for SSE parsing.
	// The caller is responsible for closing the returned ReadCloser.
	// Returns an error if the response status is not 200 OK.
	OpenStream(ctx context.Context, req *http.Request) (io.ReadCloser, error)
}

// HTTPSSETransport implements Transport using standard HTTP POST → SSE response.
// This is the default transport used by all providers today.
type HTTPSSETransport struct {
	Client       *http.Client
	ProviderName string
	Logger       *slog.Logger
	Sleep        func(context.Context, time.Duration) error
	Now          func() time.Time
}

// NewHTTPSSETransport creates a transport using the shared streaming HTTP client.
func NewHTTPSSETransport(providerName ...string) *HTTPSSETransport {
	name := ""
	if len(providerName) > 0 {
		name = providerName[0]
	}
	return &HTTPSSETransport{
		Client:       NewStreamingHTTPClient(),
		ProviderName: name,
	}
}

// OpenStream sends the HTTP request and returns the SSE response body.
// Returns an error if the status code is not 200 OK.
func (t *HTTPSSETransport) OpenStream(ctx context.Context, req *http.Request) (io.ReadCloser, error) {
	client := t.Client
	if client == nil {
		client = NewStreamingHTTPClient()
	}

	for attempt := 0; attempt <= 3; attempt++ {
		attemptReq, err := cloneRequestWithBody(ctx, req)
		if err != nil {
			return nil, err
		}

		resp, err := client.Do(attemptReq)
		if err != nil {
			return nil, fmt.Errorf("http request: %w", err)
		}

		if resp.StatusCode == http.StatusOK {
			return resp.Body, nil
		}

		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		_ = resp.Body.Close()

		if resp.StatusCode != http.StatusTooManyRequests || attempt == 3 {
			return nil, fmt.Errorf("provider returned %d: %s", resp.StatusCode, string(body))
		}

		delay := t.retryDelay(resp.Header.Get("Retry-After"), attempt)
		t.logger().Warn(
			"LLM rate limited, retrying",
			"provider", t.providerName(),
			"attempt", attempt+1,
			"retryAfterMs", delay.Milliseconds(),
		)

		if err := t.sleep(ctx, delay); err != nil {
			return nil, err
		}
	}

	return nil, fmt.Errorf("provider returned %d: exhausted retries", http.StatusTooManyRequests)
}

func cloneRequestWithBody(ctx context.Context, req *http.Request) (*http.Request, error) {
	cloned := req.Clone(ctx)
	if req.GetBody == nil {
		return cloned, nil
	}

	body, err := req.GetBody()
	if err != nil {
		return nil, fmt.Errorf("reset request body: %w", err)
	}
	cloned.Body = body
	return cloned, nil
}

func (t *HTTPSSETransport) providerName() string {
	if strings.TrimSpace(t.ProviderName) == "" {
		return "unknown"
	}
	return t.ProviderName
}

func (t *HTTPSSETransport) logger() *slog.Logger {
	if t.Logger != nil {
		return t.Logger
	}
	return slog.Default()
}

func (t *HTTPSSETransport) sleep(ctx context.Context, d time.Duration) error {
	if t.Sleep != nil {
		return t.Sleep(ctx, d)
	}

	timer := time.NewTimer(d)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (t *HTTPSSETransport) retryDelay(header string, attempt int) time.Duration {
	base := parseRetryAfter(header, t.now())
	delay := base * time.Duration(1<<attempt)
	if delay > 30*time.Second {
		return 30 * time.Second
	}
	return delay
}

func (t *HTTPSSETransport) now() time.Time {
	if t.Now != nil {
		return t.Now()
	}
	return time.Now()
}

func parseRetryAfter(header string, now time.Time) time.Duration {
	header = strings.TrimSpace(header)
	if header == "" {
		return time.Second
	}

	if seconds, err := strconv.Atoi(header); err == nil && seconds > 0 {
		return time.Duration(seconds) * time.Second
	}

	if retryAt, err := http.ParseTime(header); err == nil {
		delay := retryAt.Sub(now)
		if delay > 0 {
			return delay
		}
	}

	return time.Second
}

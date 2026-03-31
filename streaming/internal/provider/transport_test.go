package provider

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHTTPSSETransportRetriesRateLimitAndEventuallySucceeds(t *testing.T) {
	var attempts int
	var slept []time.Duration

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts < 3 {
			w.Header().Set("Retry-After", "1")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`rate limited`))
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("data: ok\n\n"))
	}))
	defer srv.Close()

	var logs bytes.Buffer
	transport := &HTTPSSETransport{
		Client:       srv.Client(),
		ProviderName: "openai",
		Logger:       slog.New(slog.NewTextHandler(&logs, nil)),
		Sleep: func(_ context.Context, d time.Duration) error {
			slept = append(slept, d)
			return nil
		},
	}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, srv.URL, strings.NewReader(`{}`))
	if err != nil {
		t.Fatalf("NewRequestWithContext() error = %v", err)
	}

	body, err := transport.OpenStream(context.Background(), req)
	if err != nil {
		t.Fatalf("OpenStream() error = %v", err)
	}
	defer body.Close()

	payload, err := io.ReadAll(body)
	if err != nil {
		t.Fatalf("ReadAll() error = %v", err)
	}

	if attempts != 3 {
		t.Fatalf("attempts = %d, want 3", attempts)
	}
	if len(slept) != 2 {
		t.Fatalf("len(slept) = %d, want 2", len(slept))
	}
	if slept[0] != 1*time.Second {
		t.Errorf("slept[0] = %v, want %v", slept[0], 1*time.Second)
	}
	if slept[1] != 2*time.Second {
		t.Errorf("slept[1] = %v, want %v", slept[1], 2*time.Second)
	}
	if !strings.Contains(logs.String(), "LLM rate limited, retrying") {
		t.Errorf("logs = %q, want retry warning", logs.String())
	}
	if string(payload) != "data: ok\n\n" {
		t.Errorf("payload = %q, want %q", string(payload), "data: ok\n\n")
	}
}

func TestHTTPSSETransportReturns429AfterMaxRetries(t *testing.T) {
	var attempts int
	var slept []time.Duration

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`still limited`))
	}))
	defer srv.Close()

	transport := &HTTPSSETransport{
		Client:       srv.Client(),
		ProviderName: "anthropic",
		Sleep: func(_ context.Context, d time.Duration) error {
			slept = append(slept, d)
			return nil
		},
	}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, srv.URL, strings.NewReader(`{}`))
	if err != nil {
		t.Fatalf("NewRequestWithContext() error = %v", err)
	}

	_, err = transport.OpenStream(context.Background(), req)
	if err == nil {
		t.Fatal("expected error after exhausting retries")
	}
	if !strings.Contains(err.Error(), "429") {
		t.Fatalf("error = %v, want 429 in message", err)
	}
	if attempts != 4 {
		t.Fatalf("attempts = %d, want 4", attempts)
	}
	if len(slept) != 3 {
		t.Fatalf("len(slept) = %d, want 3", len(slept))
	}
	if slept[0] != 1*time.Second || slept[1] != 2*time.Second || slept[2] != 4*time.Second {
		t.Fatalf("slept = %v, want [1s 2s 4s]", slept)
	}
}

func TestHTTPSSETransportDoesNotRetryNon429(t *testing.T) {
	var attempts int

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`boom`))
	}))
	defer srv.Close()

	transport := &HTTPSSETransport{
		Client: srv.Client(),
		Sleep: func(_ context.Context, d time.Duration) error {
			t.Fatalf("unexpected sleep for non-429 response: %v", d)
			return nil
		},
	}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, srv.URL, strings.NewReader(`{}`))
	if err != nil {
		t.Fatalf("NewRequestWithContext() error = %v", err)
	}

	_, err = transport.OpenStream(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for 500 response")
	}
	if attempts != 1 {
		t.Fatalf("attempts = %d, want 1", attempts)
	}
}

func TestHTTPSSETransportParsesHTTPDateRetryAfter(t *testing.T) {
	var attempts int
	var slept []time.Duration
	now := time.Date(2026, 3, 31, 12, 0, 0, 0, time.UTC)
	retryAfter := now.Add(3 * time.Second).Format(http.TimeFormat)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts == 1 {
			w.Header().Set("Retry-After", retryAfter)
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`retry later`))
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("data: ok\n\n"))
	}))
	defer srv.Close()

	transport := &HTTPSSETransport{
		Client: srv.Client(),
		Now: func() time.Time {
			return now
		},
		Sleep: func(_ context.Context, d time.Duration) error {
			slept = append(slept, d)
			return nil
		},
	}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, srv.URL, strings.NewReader(`{}`))
	if err != nil {
		t.Fatalf("NewRequestWithContext() error = %v", err)
	}

	body, err := transport.OpenStream(context.Background(), req)
	if err != nil {
		t.Fatalf("OpenStream() error = %v", err)
	}
	defer body.Close()

	if len(slept) != 1 {
		t.Fatalf("len(slept) = %d, want 1", len(slept))
	}
	if slept[0] != 3*time.Second {
		t.Fatalf("slept[0] = %v, want %v", slept[0], 3*time.Second)
	}
}

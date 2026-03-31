package main

import (
	"os"
	"slices"
	"strings"
	"testing"
)

func TestCleanEnvForComposeStripsComposeProjectName(t *testing.T) {
	const key = "COMPOSE_PROJECT_NAME"
	const value = "unexpected-project"

	original, hadOriginal := os.LookupEnv(key)
	if err := os.Setenv(key, value); err != nil {
		t.Fatalf("set env: %v", err)
	}
	defer func() {
		if hadOriginal {
			_ = os.Setenv(key, original)
		} else {
			_ = os.Unsetenv(key)
		}
	}()

	env := cleanEnvForCompose()

	found := slices.ContainsFunc(env, func(entry string) bool {
		return strings.HasPrefix(entry, key+"=")
	})
	if found {
		t.Fatalf("%s should be stripped from docker compose env", key)
	}
}

func TestBuildInitNextStepsIncludesManualAgentRegistration(t *testing.T) {
	steps := buildInitNextSteps("http://localhost:5555", "srv_123", "chan_456", nil)

	expectedSnippets := []string{
		"POST http://localhost:5555/api/v1/bootstrap/agents",
		"Authorization: Bearer admin-$TAVOK_ADMIN_TOKEN",
		"\"serverId\": \"srv_123\"",
		"\"connectionMethod\": \"WEBSOCKET\"",
	}

	for _, snippet := range expectedSnippets {
		if !strings.Contains(steps, snippet) {
			t.Fatalf("expected init next steps to contain %q\nfull output:\n%s", snippet, steps)
		}
	}
}

func TestBuildInitNextStepsIncludesWireFormatExample(t *testing.T) {
	steps := buildInitNextSteps("http://localhost:5555", "srv_123", "chan_456", nil)

	expectedSnippets := []string{
		"[join_ref, ref, topic, event, payload]",
		"room:chan_456",
		"\"new_message\"",
		"\"content\": \"Hello from Tavok\"",
	}

	for _, snippet := range expectedSnippets {
		if !strings.Contains(steps, snippet) {
			t.Fatalf("expected init next steps to contain %q\nfull output:\n%s", snippet, steps)
		}
	}
}

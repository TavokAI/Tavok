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

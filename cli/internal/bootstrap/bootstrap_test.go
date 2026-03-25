package bootstrap

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBuildConfigForLocalhost(t *testing.T) {
	secrets := Secrets{
		JWTSecret:         "jwt-secret",
		InternalAPISecret: "internal-secret",
		SecretKeyBase:     "secret-key-base",
		EncryptionKey:     "encryption-key",
		PostgresPassword:  "postgres-password",
		RedisPassword:     "redis-password",
		AdminToken:        "admin-token",
	}

	config := BuildConfig("localhost", time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC), secrets)

	if config.NextAuthURL != "http://localhost:5555" {
		t.Fatalf("expected localhost auth URL, got %q", config.NextAuthURL)
	}

	if config.GatewayURL != "ws://localhost:4001/socket" {
		t.Fatalf("expected localhost gateway URL, got %q", config.GatewayURL)
	}

	if config.BindAddress != "127.0.0.1" {
		t.Fatalf("expected localhost bind address 127.0.0.1, got %q", config.BindAddress)
	}
}

func TestBuildConfigForProductionBindsAllInterfaces(t *testing.T) {
	secrets := Secrets{}
	config := BuildConfig("chat.example.com", time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC), secrets)

	if config.BindAddress != "0.0.0.0" {
		t.Fatalf("expected production bind address 0.0.0.0, got %q", config.BindAddress)
	}
}

func TestRenderEnvIncludesExpectedFields(t *testing.T) {
	secrets := Secrets{
		JWTSecret:         "jwt-secret",
		InternalAPISecret: "internal-secret",
		SecretKeyBase:     "secret-key-base",
		EncryptionKey:     "encryption-key",
		PostgresPassword:  "postgres-password",
		RedisPassword:     "redis-password",
		AdminToken:        "admin-token",
	}

	config := BuildConfig("chat.example.com", time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC), secrets)
	output := RenderEnv(config)

	expectedLines := []string{
		"DOMAIN=chat.example.com",
		"NEXTAUTH_URL=https://chat.example.com",
		"NEXT_PUBLIC_GATEWAY_URL=wss://chat.example.com/socket",
		"BIND_ADDRESS=0.0.0.0",
		"POSTGRES_PASSWORD=postgres-password",
		"REDIS_PASSWORD=redis-password",
		"JWT_SECRET=jwt-secret",
		"INTERNAL_API_SECRET=internal-secret",
		"SECRET_KEY_BASE=secret-key-base",
		"ENCRYPTION_KEY=encryption-key",
		"TAVOK_ADMIN_TOKEN=admin-token",
	}

	for _, expected := range expectedLines {
		if !strings.Contains(output, expected) {
			t.Fatalf("expected rendered env to contain %q", expected)
		}
	}
}

func TestNewSecretsPopulatesAllFields(t *testing.T) {
	secrets, err := NewSecrets()
	if err != nil {
		t.Fatalf("NewSecrets: %v", err)
	}

	fields := map[string]string{
		"JWTSecret":         secrets.JWTSecret,
		"InternalAPISecret": secrets.InternalAPISecret,
		"SecretKeyBase":     secrets.SecretKeyBase,
		"EncryptionKey":     secrets.EncryptionKey,
		"PostgresPassword":  secrets.PostgresPassword,
		"RedisPassword":     secrets.RedisPassword,
		"AdminToken":        secrets.AdminToken,
	}

	for name, value := range fields {
		if value == "" {
			t.Fatalf("%s is empty", name)
		}
	}
}

func TestNewSecretsAreUnique(t *testing.T) {
	a, err := NewSecrets()
	if err != nil {
		t.Fatalf("NewSecrets (first): %v", err)
	}

	b, err := NewSecrets()
	if err != nil {
		t.Fatalf("NewSecrets (second): %v", err)
	}

	if a.JWTSecret == b.JWTSecret {
		t.Fatal("two calls to NewSecrets produced identical JWTSecret")
	}

	if a.RedisPassword == b.RedisPassword {
		t.Fatal("two calls to NewSecrets produced identical RedisPassword")
	}
}

func TestNormalizeDomain(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"localhost", "localhost"},
		{"chat.example.com", "chat.example.com"},
		{"https://chat.example.com", "chat.example.com"},
		{"http://chat.example.com", "chat.example.com"},
		{"chat.example.com/", "chat.example.com"},
		{"https://chat.example.com/", "chat.example.com"},
		{"  chat.example.com  ", "chat.example.com"},
		{"", "localhost"},
		{"   ", "localhost"},
	}

	for _, tt := range tests {
		result := normalizeDomain(tt.input)
		if result != tt.expected {
			t.Fatalf("normalizeDomain(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestRedisPasswordIsURLSafe(t *testing.T) {
	// DEC-0057: Redis password must not contain /, +, or = because
	// the Go streaming service parses it as part of a redis:// URL.
	for i := 0; i < 50; i++ {
		secrets, err := NewSecrets()
		if err != nil {
			t.Fatalf("NewSecrets: %v", err)
		}
		if strings.ContainsAny(secrets.RedisPassword, "/+=") {
			t.Fatalf("RedisPassword contains URL-unsafe character: %q", secrets.RedisPassword)
		}
		if strings.ContainsAny(secrets.PostgresPassword, "/+=") {
			t.Fatalf("PostgresPassword contains URL-unsafe character: %q", secrets.PostgresPassword)
		}
	}
}

func TestParseEnvSecrets(t *testing.T) {
	dir := t.TempDir()
	envPath := filepath.Join(dir, ".env")

	envContent := `# Tavok Config
DOMAIN=localhost
JWT_SECRET=my-jwt-secret
INTERNAL_API_SECRET=my-internal-secret
SECRET_KEY_BASE=my-secret-key
ENCRYPTION_KEY=my-enc-key
POSTGRES_PASSWORD=my-pg-pass
REDIS_PASSWORD=my-redis-pass
TAVOK_ADMIN_TOKEN=my-admin-token
`
	if err := os.WriteFile(envPath, []byte(envContent), 0o600); err != nil {
		t.Fatal(err)
	}

	secrets, err := ParseEnvSecrets(envPath)
	if err != nil {
		t.Fatalf("ParseEnvSecrets: %v", err)
	}

	if secrets.AdminToken != "my-admin-token" {
		t.Fatalf("AdminToken = %q, want %q", secrets.AdminToken, "my-admin-token")
	}
	if secrets.RedisPassword != "my-redis-pass" {
		t.Fatalf("RedisPassword = %q, want %q", secrets.RedisPassword, "my-redis-pass")
	}
	if secrets.PostgresPassword != "my-pg-pass" {
		t.Fatalf("PostgresPassword = %q, want %q", secrets.PostgresPassword, "my-pg-pass")
	}
}

func TestParseEnvSecretsFailsWithoutAdminToken(t *testing.T) {
	dir := t.TempDir()
	envPath := filepath.Join(dir, ".env")

	envContent := `DOMAIN=localhost
POSTGRES_PASSWORD=test
`
	if err := os.WriteFile(envPath, []byte(envContent), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err := ParseEnvSecrets(envPath)
	if err == nil {
		t.Fatal("expected error when TAVOK_ADMIN_TOKEN is missing")
	}
	if !strings.Contains(err.Error(), "TAVOK_ADMIN_TOKEN") {
		t.Fatalf("expected admin token error, got: %v", err)
	}
}

func TestWriteEnvFileRejectsOverwriteWithoutForce(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")

	if err := os.WriteFile(path, []byte("existing"), 0o600); err != nil {
		t.Fatalf("seed env file: %v", err)
	}

	config := BuildConfig("localhost", time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC), Secrets{})

	err := WriteEnvFile(path, config, false)
	if err == nil {
		t.Fatal("expected overwrite protection error")
	}

	if !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("expected overwrite error, got %v", err)
	}
}

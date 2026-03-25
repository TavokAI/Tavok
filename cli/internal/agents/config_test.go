package agents

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseConfigFile(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		expected []AgentEntry
		wantErr  bool
	}{
		{
			name: "basic agents",
			content: `agents:
  - name: Jack
  - name: Axis
`,
			expected: []AgentEntry{
				{Name: "Jack"},
				{Name: "Axis"},
			},
		},
		{
			name: "agent with URL",
			content: `agents:
  - name: Jack
    url: http://localhost:8000
  - name: Nexus
`,
			expected: []AgentEntry{
				{Name: "Jack", URL: "http://localhost:8000"},
				{Name: "Nexus"},
			},
		},
		{
			name: "comments and blank lines",
			content: `# My agents
agents:
  # The main agent
  - name: Jack
    url: http://localhost:8000

  # A helper agent
  - name: Helper
`,
			expected: []AgentEntry{
				{Name: "Jack", URL: "http://localhost:8000"},
				{Name: "Helper"},
			},
		},
		{
			name:     "empty file",
			content:  "",
			expected: nil,
		},
		{
			name: "agents header only",
			content: `agents:
`,
			expected: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, "tavok-agents.yml")
			if err := os.WriteFile(path, []byte(tt.content), 0o644); err != nil {
				t.Fatal(err)
			}

			entries, err := ParseConfigFile(path)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ParseConfigFile() error = %v, wantErr %v", err, tt.wantErr)
			}

			if len(entries) != len(tt.expected) {
				t.Fatalf("got %d entries, want %d", len(entries), len(tt.expected))
			}

			for i, got := range entries {
				want := tt.expected[i]
				if got.Name != want.Name {
					t.Errorf("entry[%d].Name = %q, want %q", i, got.Name, want.Name)
				}
				if got.URL != want.URL {
					t.Errorf("entry[%d].URL = %q, want %q", i, got.URL, want.URL)
				}
			}
		})
	}
}

func TestSanitizeFilename(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"My Agent", "my_agent"},
		{"hello-world", "hello_world"},
		{"assistant", "assistant"},
		{"Agent 2.0", "agent_2_0"},
		{"  spaces  ", "spaces"},
		{"UPPER", "upper"},
		{"special!@#chars", "specialchars"},
		{"multi---dashes", "multi_dashes"},
		{"", "agent"},
		{"___", "agent"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := sanitizeFilename(tt.input)
			if got != tt.expected {
				t.Errorf("sanitizeFilename(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestScaffoldAgentFile(t *testing.T) {
	dir := t.TempDir()

	agent := CreatedAgent{
		Name:             "echo",
		ID:               "test-id",
		APIKey:           "sk-tvk-test",
		ConnectionMethod: "WEBSOCKET",
	}

	filename, err := ScaffoldAgentFile(dir, agent)
	if err != nil {
		t.Fatal(err)
	}

	if filename != "echo_agent.py" {
		t.Errorf("filename = %q, want %q", filename, "echo_agent.py")
	}

	content, err := os.ReadFile(filepath.Join(dir, filename))
	if err != nil {
		t.Fatal(err)
	}

	// Verify key parts are present
	s := string(content)
	if !containsAll(s, "from tavok import Agent", `Agent(name="echo")`, "@agent.on_mention", "agent.run()") {
		t.Errorf("scaffold content missing expected patterns:\n%s", s)
	}
}

func TestScaffoldAgentFileNoOverwrite(t *testing.T) {
	dir := t.TempDir()

	// Create existing file
	existing := filepath.Join(dir, "echo_agent.py")
	if err := os.WriteFile(existing, []byte("existing"), 0o644); err != nil {
		t.Fatal(err)
	}

	agent := CreatedAgent{Name: "echo"}
	filename, err := ScaffoldAgentFile(dir, agent)
	if err != nil {
		t.Fatal(err)
	}

	// Should return empty string (no file written)
	if filename != "" {
		t.Errorf("expected empty filename for existing file, got %q", filename)
	}

	// Verify original content preserved
	content, err := os.ReadFile(existing)
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "existing" {
		t.Error("existing file was overwritten")
	}
}

func containsAll(s string, substrs ...string) bool {
	for _, sub := range substrs {
		if !strings.Contains(s, sub) {
			return false
		}
	}
	return true
}

func TestConfigFileExists(t *testing.T) {
	dir := t.TempDir()

	// Should not exist yet
	if ConfigFileExists(dir) {
		t.Fatal("ConfigFileExists should return false for empty dir")
	}

	// Create the file
	path := filepath.Join(dir, "tavok-agents.yml")
	if err := os.WriteFile(path, []byte("agents:\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Should exist now
	if !ConfigFileExists(dir) {
		t.Fatal("ConfigFileExists should return true after file creation")
	}
}

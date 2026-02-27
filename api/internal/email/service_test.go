package email

import (
	"strings"
	"testing"
)

func TestServiceIsConfigured(t *testing.T) {
	tests := []struct {
		name     string
		config   Config
		expected bool
	}{
		{
			name:     "empty config",
			config:   Config{},
			expected: false,
		},
		{
			name: "missing host",
			config: Config{
				Port: "587",
				From: "test@example.com",
			},
			expected: false,
		},
		{
			name: "missing port",
			config: Config{
				Host: "smtp.example.com",
				From: "test@example.com",
			},
			expected: false,
		},
		{
			name: "missing from",
			config: Config{
				Host: "smtp.example.com",
				Port: "587",
			},
			expected: false,
		},
		{
			name: "fully configured",
			config: Config{
				Host: "smtp.example.com",
				Port: "587",
				From: "test@example.com",
			},
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := NewService(tt.config)
			if svc.IsConfigured() != tt.expected {
				t.Errorf("IsConfigured() = %v, want %v", svc.IsConfigured(), tt.expected)
			}
		})
	}
}

func TestRenderVerificationTemplate(t *testing.T) {
	data := VerificationData{
		AppName:         "Chronicle",
		UserName:        "Test User",
		VerificationURL: "https://example.com/verify?token=abc123",
	}

	html, err := renderTemplate(verificationEmailTemplate, data)
	if err != nil {
		t.Fatalf("renderTemplate failed: %v", err)
	}

	if !strings.Contains(html, "Chronicle") {
		t.Error("template should contain app name")
	}
	if !strings.Contains(html, "Test User") {
		t.Error("template should contain user name")
	}
	if !strings.Contains(html, "https://example.com/verify?token=abc123") {
		t.Error("template should contain verification URL")
	}
}

func TestRenderPasswordResetTemplate(t *testing.T) {
	data := PasswordResetData{
		AppName:  "Chronicle",
		UserName: "Test User",
		ResetURL: "https://example.com/reset?token=xyz789",
	}

	html, err := renderTemplate(passwordResetEmailTemplate, data)
	if err != nil {
		t.Fatalf("renderTemplate failed: %v", err)
	}

	if !strings.Contains(html, "Chronicle") {
		t.Error("template should contain app name")
	}
	if !strings.Contains(html, "Test User") {
		t.Error("template should contain user name")
	}
	if !strings.Contains(html, "https://example.com/reset?token=xyz789") {
		t.Error("template should contain reset URL")
	}
	if !strings.Contains(html, "1 hour") {
		t.Error("template should mention expiration time")
	}
}

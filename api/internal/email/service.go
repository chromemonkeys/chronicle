// Package email provides email sending capabilities via SMTP.
package email

import (
	"bytes"
	"fmt"
	"html/template"
	"net/smtp"
	"strings"
)

// Config holds SMTP configuration
type Config struct {
	Host       string
	Port       string
	Username   string
	Password   string
	From       string
	FromName   string
	EnableTLS  bool
}

// Service provides email sending
type Service struct {
	config Config
	server string
	auth   smtp.Auth
}

// NewService creates a new email service
func NewService(config Config) *Service {
	auth := smtp.PlainAuth("", config.Username, config.Password, config.Host)
	
	return &Service{
		config: config,
		server: config.Host + ":" + config.Port,
		auth:   auth,
	}
}

// IsConfigured returns true if email is configured
func (s *Service) IsConfigured() bool {
	return s.config.Host != "" && s.config.Port != "" && s.config.From != ""
}

// SendEmail sends a plain text email
func (s *Service) SendEmail(to []string, subject, body string) error {
	if !s.IsConfigured() {
		return fmt.Errorf("email not configured")
	}

	from := s.config.From
	if s.config.FromName != "" {
		from = fmt.Sprintf("%s <%s>", s.config.FromName, s.config.From)
	}

	msg := []byte(fmt.Sprintf(
		"To: %s\r\n"+
		"From: %s\r\n"+
		"Subject: %s\r\n"+
		"Content-Type: text/plain; charset=UTF-8\r\n"+
		"\r\n"+
		"%s",
		strings.Join(to, ", "),
		from,
		subject,
		body,
	))

	return smtp.SendMail(s.server, s.auth, s.config.From, to, msg)
}

// SendHTMLEmail sends an HTML email
func (s *Service) SendHTMLEmail(to []string, subject, htmlBody string) error {
	if !s.IsConfigured() {
		return fmt.Errorf("email not configured")
	}

	from := s.config.From
	if s.config.FromName != "" {
		from = fmt.Sprintf("%s <%s>", s.config.FromName, s.config.From)
	}

	// Simple multipart message
	boundary := "boundary-chronicle"
	
	var msg bytes.Buffer
	fmt.Fprintf(&msg, "To: %s\r\n", strings.Join(to, ", "))
	fmt.Fprintf(&msg, "From: %s\r\n", from)
	fmt.Fprintf(&msg, "Subject: %s\r\n", subject)
	fmt.Fprintf(&msg, "MIME-Version: 1.0\r\n")
	fmt.Fprintf(&msg, "Content-Type: multipart/alternative; boundary=\"%s\"\r\n", boundary)
	fmt.Fprintf(&msg, "\r\n")
	
	// Plain text part (fallback)
	fmt.Fprintf(&msg, "--%s\r\n", boundary)
	fmt.Fprintf(&msg, "Content-Type: text/plain; charset=UTF-8\r\n")
	fmt.Fprintf(&msg, "\r\n")
	fmt.Fprintf(&msg, "Please view this email in an HTML-capable email client.\r\n")
	fmt.Fprintf(&msg, "\r\n")
	
	// HTML part
	fmt.Fprintf(&msg, "--%s\r\n", boundary)
	fmt.Fprintf(&msg, "Content-Type: text/html; charset=UTF-8\r\n")
	fmt.Fprintf(&msg, "\r\n")
	fmt.Fprintf(&msg, "%s\r\n", htmlBody)
	fmt.Fprintf(&msg, "\r\n")
	fmt.Fprintf(&msg, "--%s--\r\n", boundary)

	return smtp.SendMail(s.server, s.auth, s.config.From, to, msg.Bytes())
}

// TemplateData holds data for email templates
type VerificationData struct {
	AppName string
	UserName string
	VerificationURL string
}

type PasswordResetData struct {
	AppName string
	UserName string
	ResetURL string
}

// SendVerificationEmail sends an email verification email
func (s *Service) SendVerificationEmail(to, userName, verificationURL string) error {
	data := VerificationData{
		AppName:         "Chronicle",
		UserName:        userName,
		VerificationURL: verificationURL,
	}

	subject := "Verify your Chronicle account"
	html, err := renderTemplate(verificationEmailTemplate, data)
	if err != nil {
		return fmt.Errorf("render verification template: %w", err)
	}

	return s.SendHTMLEmail([]string{to}, subject, html)
}

// SendPasswordResetEmail sends a password reset email
func (s *Service) SendPasswordResetEmail(to, userName, resetURL string) error {
	data := PasswordResetData{
		AppName:  "Chronicle",
		UserName: userName,
		ResetURL: resetURL,
	}

	subject := "Reset your Chronicle password"
	html, err := renderTemplate(passwordResetEmailTemplate, data)
	if err != nil {
		return fmt.Errorf("render password reset template: %w", err)
	}

	return s.SendHTMLEmail([]string{to}, subject, html)
}

func renderTemplate(tmpl string, data interface{}) (string, error) {
	t := template.Must(template.New("email").Parse(tmpl))
	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

const verificationEmailTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Verify your {{.AppName}} account</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { border-bottom: 2px solid #0066cc; padding-bottom: 10px; margin-bottom: 20px; }
        .button { display: inline-block; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        .link { word-break: break-all; color: #0066cc; }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{.AppName}}</h1>
    </div>
    
    <h2>Welcome, {{.UserName}}!</h2>
    
    <p>Thank you for signing up. Please verify your email address to activate your account.</p>
    
    <p>
        <a href="{{.VerificationURL}}" class="button">Verify Email Address</a>
    </p>
    
    <p>Or copy and paste this link into your browser:</p>
    <p class="link">{{.VerificationURL}}</p>
    
    <p>This verification link will expire in 24 hours.</p>
    
    <div class="footer">
        <p>If you didn't create an account with {{.AppName}}, you can safely ignore this email.</p>
    </div>
</body>
</html>`

const passwordResetEmailTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Reset your {{.AppName}} password</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { border-bottom: 2px solid #0066cc; padding-bottom: 10px; margin-bottom: 20px; }
        .button { display: inline-block; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        .link { word-break: break-all; color: #0066cc; }
        .warning { background: #fff3cd; padding: 12px; border-radius: 4px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{.AppName}}</h1>
    </div>
    
    <h2>Password Reset Request</h2>
    
    <p>Hi {{.UserName}},</p>
    
    <p>We received a request to reset your password. Click the button below to create a new password:</p>
    
    <p>
        <a href="{{.ResetURL}}" class="button">Reset Password</a>
    </p>
    
    <p>Or copy and paste this link into your browser:</p>
    <p class="link">{{.ResetURL}}</p>
    
    <div class="warning">
        <strong>Important:</strong> This reset link will expire in 1 hour.
    </div>
    
    <div class="footer">
        <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
    </div>
</body>
</html>`

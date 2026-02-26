package auth

import (
	"testing"
	"time"
)

func TestIssueAndParseToken(t *testing.T) {
	secret := []byte("secret")
	issued, err := IssueToken(secret, Claims{
		Sub:  "user-1",
		Name: "Avery",
		Role: "editor",
		JTI:  "jti-1",
		Exp:  time.Now().Add(time.Hour).Unix(),
	})
	if err != nil {
		t.Fatalf("IssueToken() error = %v", err)
	}
	claims, err := ParseToken(secret, issued)
	if err != nil {
		t.Fatalf("ParseToken() error = %v", err)
	}
	if claims.Sub != "user-1" || claims.Name != "Avery" || claims.Role != "editor" {
		t.Fatalf("unexpected claims: %+v", claims)
	}
}

func TestParseTokenRejectsExpired(t *testing.T) {
	secret := []byte("secret")
	issued, err := IssueToken(secret, Claims{
		Sub:  "user-1",
		Name: "Avery",
		Role: "editor",
		JTI:  "jti-1",
		Exp:  time.Now().Add(-time.Minute).Unix(),
	})
	if err != nil {
		t.Fatalf("IssueToken() error = %v", err)
	}
	_, err = ParseToken(secret, issued)
	if err == nil {
		t.Fatal("expected ParseToken() to fail for expired token")
	}
}

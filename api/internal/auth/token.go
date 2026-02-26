package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type Claims struct {
	Sub  string `json:"sub"`
	Name string `json:"name"`
	Role string `json:"role"`
	JTI  string `json:"jti"`
	Exp  int64  `json:"exp"`
}

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("expired token")
)

func IssueToken(secret []byte, claims Claims) (string, error) {
	payloadBytes, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("marshal claims: %w", err)
	}
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	signature := sign(secret, payload)
	return payload + "." + signature, nil
}

func ParseToken(secret []byte, token string) (Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return Claims{}, ErrInvalidToken
	}
	payload := parts[0]
	signature := parts[1]

	expected := sign(secret, payload)
	if !hmac.Equal([]byte(signature), []byte(expected)) {
		return Claims{}, ErrInvalidToken
	}

	decoded, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return Claims{}, ErrInvalidToken
	}

	var claims Claims
	if err := json.Unmarshal(decoded, &claims); err != nil {
		return Claims{}, ErrInvalidToken
	}
	if claims.Sub == "" || claims.Name == "" || claims.JTI == "" || claims.Exp == 0 {
		return Claims{}, ErrInvalidToken
	}
	if time.Now().Unix() >= claims.Exp {
		return Claims{}, ErrExpiredToken
	}
	return claims, nil
}

func sign(secret []byte, payload string) string {
	sum := hmac.New(sha256.New, secret)
	_, _ = sum.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(sum.Sum(nil))
}

func HashToken(value string) string {
	sum := sha256.Sum256([]byte(value))
	return fmt.Sprintf("%x", sum)
}

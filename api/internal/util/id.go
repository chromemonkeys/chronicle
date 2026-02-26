package util

import (
	"crypto/rand"
	"encoding/hex"
)

func NewID(prefix string) string {
	bytes := make([]byte, 16)
	_, _ = rand.Read(bytes)
	if prefix == "" {
		return hex.EncodeToString(bytes)
	}
	return prefix + "_" + hex.EncodeToString(bytes)
}

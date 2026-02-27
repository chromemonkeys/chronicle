#!/usr/bin/env sh
set -eu

docker run --rm \
  -v "$PWD":/workspace \
  -w /workspace/api \
  golang:1.22-alpine \
  /usr/local/go/bin/go test "$@"

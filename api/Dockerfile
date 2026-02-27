# syntax=docker/dockerfile:1
FROM golang:1.22-alpine AS builder
WORKDIR /src

COPY api/go.mod ./api/go.mod
RUN cd api && go mod download

COPY api ./api
RUN cd api && go mod tidy && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/chronicle-api ./cmd/api

# Create the repos directory with correct ownership for nonroot (uid 65532)
RUN mkdir -p /out/repos && chown 65532:65532 /out/repos

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /out/chronicle-api /app/chronicle-api
COPY --from=builder /out/repos /data/repos
COPY db /app/db

RUN addgroup -S app && adduser -S -G app -u 65532 app \
    && i=0; until [ "$i" -ge 5 ]; do \
         apk update && apk add --no-cache ca-certificates wget chromium pandoc ttf-freefont && break; \
         i=$((i + 1)); \
         echo "apk install failed (attempt $i/5), retrying..."; \
         sleep $((i * 2)); \
       done \
    && [ "$i" -lt 5 ] \
    && update-ca-certificates \
    && chown -R app:app /app /data

USER app

ENV API_ADDR=:8787
ENV CHRONICLE_MIGRATIONS_DIR=/app/db/migrations
ENV CHRONICLE_REPOS_DIR=/data/repos

EXPOSE 8787
ENTRYPOINT ["/app/chronicle-api"]

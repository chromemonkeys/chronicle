# syntax=docker/dockerfile:1
FROM golang:1.22-alpine AS builder
WORKDIR /src

COPY api/go.mod ./api/go.mod
RUN cd api && go mod download

COPY api ./api
RUN cd api && go mod tidy && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/chronicle-api ./cmd/api

# Create the repos directory with correct ownership for nonroot (uid 65532)
RUN mkdir -p /out/repos && chown 65532:65532 /out/repos

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=builder /out/chronicle-api /app/chronicle-api
COPY --from=builder --chown=nonroot:nonroot /out/repos /data/repos
COPY db /app/db

ENV API_ADDR=:8787
ENV CHRONICLE_MIGRATIONS_DIR=/app/db/migrations
ENV CHRONICLE_REPOS_DIR=/data/repos

EXPOSE 8787
ENTRYPOINT ["/app/chronicle-api"]

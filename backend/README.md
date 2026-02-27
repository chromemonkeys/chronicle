# Chronicle Backend

## ⚠️ IMPORTANT: This is NOT the main API

The main Chronicle API is written in **Go** and located in `../api/`.

## What's in this folder?

This folder contains the **Sync Gateway** - a WebSocket server for real-time collaborative editing.

### Files

| File | Purpose |
|------|---------|
| `sync.mjs` | WebSocket server for Yjs CRDT sync (port 8788) |
| `auth-token.mjs` | JWT utilities shared with sync service |
| `README.md` | This file |

### Why Node.js?

The sync service uses the **Yjs** library which is JavaScript-native. While Go bindings exist, the Node.js implementation is more mature and production-tested for CRDT synchronization.

### Architecture

```
┌─────────┐      WebSocket      ┌──────────┐      HTTP       ┌─────────┐
│ Client  │ ◄──────────────────► │  Sync    │ ◄─────────────► │ Go API  │
│ (Yjs)   │      Port 8788       │ Gateway  │   Internal      │ Port    │
└─────────┘                      │ (Node)   │   Calls         │ 8787    │
                                 └──────────┘                 └─────────┘
```

### Do NOT Modify

- `sync.mjs` - Critical for real-time collaboration
- `auth-token.mjs` - Shared JWT logic

### For API Development

Go to `../api/` for the main REST API implementation.

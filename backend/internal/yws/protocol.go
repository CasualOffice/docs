// Copyright (c) 2026 Casual Office. All rights reserved.

// Package yws implements the wire-level y-websocket protocol.
//
// Message types per the canonical y-protocols spec
// (https://github.com/yjs/y-protocols):
//
//	┌───────────────┬──────┬──────────────────────────────────────┐
//	│ Type          │ Code │ Meaning                              │
//	├───────────────┼──────┼──────────────────────────────────────┤
//	│ SyncStep1     │   0  │ "what's your state vector?" — the    │
//	│               │      │ joining peer sends its sv; the other │
//	│               │      │ peer replies with SyncStep2.         │
//	├───────────────┼──────┼──────────────────────────────────────┤
//	│ SyncStep2     │   1  │ "here's everything you're missing"   │
//	│               │      │ — encoded as a single Y.update.      │
//	├───────────────┼──────┼──────────────────────────────────────┤
//	│ Update        │   2  │ live local edit. Forwarded to every  │
//	│               │      │ other client in the room verbatim.   │
//	├───────────────┼──────┼──────────────────────────────────────┤
//	│ Awareness     │   3  │ presence diff (cursor, selection,    │
//	│               │      │ user metadata). Forwarded to others. │
//	└───────────────┴──────┴──────────────────────────────────────┘
//
// We only inspect the type byte for routing — the payload is
// opaque CRDT bytes that the in-process Y.Doc consumes via cgo/
// embedded WASM in a future commit. For M1 we ship the byte
// constants + a helper that classifies an incoming frame.
package yws

// MessageType is the y-websocket wire-level message-type byte.
type MessageType byte

const (
	// MessageSyncStep1 is sent by a joining client to ask the
	// peer (here: the server) for any updates the client is
	// missing. Payload: encoded Yjs state vector.
	MessageSyncStep1 MessageType = 0

	// MessageSyncStep2 is the reply containing every update the
	// asker doesn't have. Payload: encoded Yjs update.
	MessageSyncStep2 MessageType = 1

	// MessageUpdate is a live edit produced by a client. Payload:
	// encoded Yjs update. The server applies it to the room's
	// authoritative Y.Doc and broadcasts to every other client.
	MessageUpdate MessageType = 2

	// MessageAwareness is a presence diff (cursor position,
	// selection, user metadata). Forwarded to every other
	// client; not applied to the document state.
	MessageAwareness MessageType = 3
)

// Classify reads the first byte of a binary frame and returns the
// corresponding MessageType. Returns ok=false when the frame is
// empty — caller should drop the connection (protocol violation).
//
// The y-websocket protocol expects every frame to start with a
// 1-byte type prefix followed by a variable-length payload.
func Classify(frame []byte) (MessageType, bool) {
	if len(frame) == 0 {
		return 0, false
	}
	return MessageType(frame[0]), true
}

// String returns a human-readable name for the message type, used
// in log lines so failed-handshake / unexpected-update traffic is
// easier to debug.
func (t MessageType) String() string {
	switch t {
	case MessageSyncStep1:
		return "sync-step-1"
	case MessageSyncStep2:
		return "sync-step-2"
	case MessageUpdate:
		return "update"
	case MessageAwareness:
		return "awareness"
	default:
		return "unknown"
	}
}

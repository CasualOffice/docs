// Casual Editor — Go backend.
//
// Stateless y-websocket gateway + room manager + WOPI client.
// See ../docs/05-backend-design.md for the design and lifecycle.
//
// Module name uses the github.com/schnsrw/docx prefix even though
// the Go code lives in a subdirectory of the doc-service repo —
// makes future split-into-its-own-repo trivial.
module github.com/schnsrw/docx/backend

go 1.24

require github.com/coder/websocket v1.8.13

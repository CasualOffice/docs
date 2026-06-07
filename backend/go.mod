// Casual Editor — Go backend.
//
// Stateless y-websocket gateway + room manager + WOPI client.
// See ../docs/05-backend-design.md for the design and lifecycle.
//
// Module name uses the github.com/schnsrw/docx prefix even though
// the Go code lives in a subdirectory of the doc-service repo —
// makes future split-into-its-own-repo trivial.
module github.com/schnsrw/docx/backend

go 1.25.0

require (
	github.com/coder/websocket v1.8.13
	golang.org/x/time v0.5.0
)

require (
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/golang-jwt/jwt/v5 v5.3.1 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/ncruces/go-strftime v1.0.0 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	golang.org/x/crypto v0.52.0 // indirect
	golang.org/x/sys v0.45.0 // indirect
	golang.org/x/term v0.43.0 // indirect
	modernc.org/libc v1.72.3 // indirect
	modernc.org/mathutil v1.7.1 // indirect
	modernc.org/memory v1.11.0 // indirect
	modernc.org/sqlite v1.52.0 // indirect
)

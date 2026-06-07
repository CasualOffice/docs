// Package version is the single source of truth for the running
// gateway + CLI build version.
//
// Why a package and not just a constant in cmd/gateway:
//
//   - The CLI (cmd/casual-docs) and the gateway should both report
//     the same version when asked. Pulling from a shared package
//     prevents drift.
//   - Future release tooling can sed `Version` here to bump per
//     release without touching every cmd/main.go.
//   - The Commit / BuildTime fields are reserved for `-ldflags`
//     injection at build time. The defaults below are fine for
//     local-dev builds where the operator only needs a "yes this is
//     a dev binary" signal.
package version

// Version is the human-readable release version. Set by the release
// script (or `-ldflags "-X version.Version=v1.2.3"`); the literal
// here is the local-dev fallback.
var Version = "0.0.0-dev"

// Commit is the short git SHA the binary was built from. Set by
// `-ldflags "-X version.Commit=$(git rev-parse --short HEAD)"`; "dev"
// when running from a working tree without ldflags.
var Commit = "dev"

// BuildTime is the RFC3339 timestamp of the build. Set via ldflags
// the same way as Commit; empty for local-dev builds where no build
// step ran.
var BuildTime = ""

// Info bundles the three fields into a single struct so callers
// (the /health endpoint, the CLI's version subcommand) can format
// them consistently.
type Info struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildTime string `json:"buildTime,omitempty"`
}

// Get returns a snapshot of the current build info. Cheap; just
// reads the package-level vars. Returning a value (not pointers)
// keeps the result immutable from the caller's side.
func Get() Info {
	return Info{
		Version:   Version,
		Commit:    Commit,
		BuildTime: BuildTime,
	}
}

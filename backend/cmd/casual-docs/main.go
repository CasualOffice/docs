// Copyright (c) 2026 Casual Office. All rights reserved.

// Command casual-docs is the operator CLI for a Casual Editor
// Mode 3 (Standalone) deploy. It's the recovery + admin surface that
// pairs with the y-websocket gateway: things the operator should be
// able to do from inside the container, ssh'd into the host, without
// needing the editor UI to come up first.
//
// Subcommands:
//
//	casual-docs reset-password <email> [--password <p>]
//	    Reset the bcrypt password for a user. Reads the new password
//	    from stdin (no echo) when --password isn't passed. The classic
//	    "I forgot the only login on the only server" recovery path.
//
//	casual-docs list-users
//	    Print the user table in two-column form (email, displayName,
//	    isAdmin, createdAt). Operator triage.
//
//	casual-docs promote <email>
//	casual-docs demote <email>
//	    Toggle the is_admin flag.
//
// All subcommands operate on the SQLite users.db under
// <root>/.casual/users.db where <root> defaults to
// $CASUAL_LOCAL_PATH or /data — same convention as the gateway.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"golang.org/x/term"

	"github.com/schnsrw/docx/backend/internal/auth/personal"
	"github.com/schnsrw/docx/backend/internal/version"
)

// runner bundles the things the CLI subcommands need: the user
// store, an io.Writer for human output, an io.Reader for password
// prompts. Threaded through so tests can drive subcommands without
// hitting os.Stdin/os.Stdout/os.Exit.
type runner struct {
	users *personal.UserStore
	out   io.Writer
	in    io.Reader
}

// usage prints the top-level help and exits 2 (the conventional
// "command-line syntax error" code).
func usage(w io.Writer) {
	fmt.Fprintln(w, "usage: casual-docs <subcommand> [args]")
	fmt.Fprintln(w, "subcommands:")
	fmt.Fprintln(w, "  reset-password <email> [--password <p>]")
	fmt.Fprintln(w, "  list-users")
	fmt.Fprintln(w, "  promote <email>")
	fmt.Fprintln(w, "  demote <email>")
	fmt.Fprintln(w, "  version")
	fmt.Fprintln(w, "")
	fmt.Fprintln(w, "global flags:")
	fmt.Fprintln(w, "  --root <path>   data root (defaults to $CASUAL_LOCAL_PATH or /data)")
}

func main() {
	code := run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr)
	os.Exit(code)
}

// run is the testable entry point — same signature as main() but with
// stdio injected. Returns the exit code rather than calling os.Exit
// so tests don't kill the test process.
func run(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		usage(stderr)
		return 2
	}

	// Pull out the global --root flag without forcing every subcommand
	// to redeclare it. Anything before the subcommand name is treated
	// as a global flag; anything after is the subcommand's own.
	root, rest := extractRoot(args)
	if len(rest) == 0 {
		usage(stderr)
		return 2
	}

	// `version` short-circuits the user-store open so it works on
	// a host without `--root` configured — operators often run
	// `casual-docs version` to confirm the binary identity before
	// even thinking about data paths.
	if rest[0] == "version" {
		info := version.Get()
		fmt.Fprintf(stdout, "casual-docs %s (%s)", info.Version, info.Commit)
		if info.BuildTime != "" {
			fmt.Fprintf(stdout, " built %s", info.BuildTime)
		}
		fmt.Fprintln(stdout)
		return 0
	}

	users, err := openUsers(root)
	if err != nil {
		fmt.Fprintf(stderr, "open user store: %v\n", err)
		return 1
	}
	defer users.Close()

	r := &runner{users: users, out: stdout, in: stdin}
	sub := rest[0]
	rest = rest[1:]
	switch sub {
	case "reset-password":
		return r.resetPassword(rest, stderr)
	case "list-users":
		return r.listUsers(rest, stderr)
	case "promote":
		return r.setAdmin(rest, true, stderr)
	case "demote":
		return r.setAdmin(rest, false, stderr)
	case "help", "-h", "--help":
		usage(stdout)
		return 0
	default:
		fmt.Fprintf(stderr, "unknown subcommand: %q\n", sub)
		usage(stderr)
		return 2
	}
}

// extractRoot strips a leading `--root <path>` (or `--root=<path>`)
// from args, returning the resolved root + the remaining args. When
// --root isn't supplied, falls back to $CASUAL_LOCAL_PATH or /data —
// matching the gateway's default so an operator never has to think
// about which path they're addressing.
func extractRoot(args []string) (string, []string) {
	root := os.Getenv("CASUAL_LOCAL_PATH")
	if root == "" {
		root = "/data"
	}
	for i := 0; i < len(args); i++ {
		a := args[i]
		switch {
		case a == "--root":
			if i+1 < len(args) {
				root = args[i+1]
				return root, append(args[:i:i], args[i+2:]...)
			}
		case strings.HasPrefix(a, "--root="):
			root = strings.TrimPrefix(a, "--root=")
			return root, append(args[:i:i], args[i+1:]...)
		}
	}
	return root, args
}

// reorderFlagsFirst pushes every `--name` / `--name=value` token to
// the front of args so the stdlib `flag` package can parse them.
// `flag.Parse` stops at the first non-flag token, which makes the
// natural CLI shape `subcommand <positional> --flag` fail by default.
// This little dance lets the operator type either order.
//
// A flag whose value comes from the next token (e.g. `--password p`)
// keeps the value adjacent so it pairs correctly. Tokens starting
// with `--` and no `=` consume the next token as their value.
func reorderFlagsFirst(args []string) []string {
	var flags, positional []string
	for i := 0; i < len(args); i++ {
		a := args[i]
		switch {
		case strings.HasPrefix(a, "--") && strings.Contains(a, "="):
			flags = append(flags, a)
		case strings.HasPrefix(a, "--"):
			flags = append(flags, a)
			if i+1 < len(args) {
				flags = append(flags, args[i+1])
				i++
			}
		default:
			positional = append(positional, a)
		}
	}
	return append(flags, positional...)
}

func openUsers(root string) (*personal.UserStore, error) {
	if root == "" {
		return nil, fmt.Errorf("missing data root; pass --root or set CASUAL_LOCAL_PATH")
	}
	return personal.New(root)
}

// resetPassword runs the reset-password subcommand. Reads the new
// password from --password or, when unset, from stdin via no-echo
// prompt (when stdin is a tty) / raw read (when it isn't, e.g. piped
// in from a test).
func (r *runner) resetPassword(args []string, stderr io.Writer) int {
	fs := flag.NewFlagSet("reset-password", flag.ContinueOnError)
	fs.SetOutput(stderr)
	password := fs.String("password", "", "new password (prompted via stdin when unset)")
	if err := fs.Parse(reorderFlagsFirst(args)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(stderr, "usage: reset-password <email> [--password <p>]")
		return 2
	}
	email := fs.Arg(0)

	if *password == "" {
		p, err := readPassword(r.in, r.out, "New password: ")
		if err != nil {
			fmt.Fprintf(stderr, "read password: %v\n", err)
			return 1
		}
		*password = p
	}
	if err := r.users.ResetPassword(context.Background(), email, *password); err != nil {
		switch {
		case errors.Is(err, personal.ErrUserNotFound):
			fmt.Fprintf(stderr, "no user with email %q\n", email)
			return 1
		case errors.Is(err, personal.ErrWeakPassword):
			fmt.Fprintln(stderr, "password too short (need 8+ chars)")
			return 1
		default:
			fmt.Fprintf(stderr, "reset failed: %v\n", err)
			return 1
		}
	}
	fmt.Fprintf(r.out, "password reset for %s\n", email)
	return 0
}

// listUsers prints every user as one line of tab-separated columns
// (email, displayName, admin?, createdAt). Operator triage; not a
// machine-readable surface.
func (r *runner) listUsers(args []string, stderr io.Writer) int {
	if len(args) > 0 {
		fmt.Fprintln(stderr, "usage: list-users (no args)")
		return 2
	}
	users, err := r.users.List(context.Background())
	if err != nil {
		fmt.Fprintf(stderr, "list users: %v\n", err)
		return 1
	}
	if len(users) == 0 {
		fmt.Fprintln(r.out, "(no users)")
		return 0
	}
	for _, u := range users {
		admin := ""
		if u.IsAdmin {
			admin = " (admin)"
		}
		fmt.Fprintf(r.out, "%s\t%s%s\t%s\n",
			u.Email, u.DisplayName, admin, u.CreatedAt.Format("2006-01-02"))
	}
	return 0
}

// setAdmin flips the is_admin flag on the user identified by email.
// `to=true` is the promote subcommand; `false` is demote.
func (r *runner) setAdmin(args []string, to bool, stderr io.Writer) int {
	if len(args) != 1 {
		if to {
			fmt.Fprintln(stderr, "usage: promote <email>")
		} else {
			fmt.Fprintln(stderr, "usage: demote <email>")
		}
		return 2
	}
	u, err := r.users.GetByEmail(context.Background(), args[0])
	if err != nil {
		if errors.Is(err, personal.ErrUserNotFound) {
			fmt.Fprintf(stderr, "no user with email %q\n", args[0])
			return 1
		}
		fmt.Fprintf(stderr, "lookup user: %v\n", err)
		return 1
	}
	if err := r.users.SetAdmin(context.Background(), u.ID, to); err != nil {
		fmt.Fprintf(stderr, "set admin: %v\n", err)
		return 1
	}
	if to {
		fmt.Fprintf(r.out, "%s promoted to admin\n", u.Email)
	} else {
		fmt.Fprintf(r.out, "%s demoted\n", u.Email)
	}
	return 0
}

// readPassword reads a password from stdin. When stdin is a terminal,
// uses term.ReadPassword for no-echo input — what an operator at the
// host expects. When stdin isn't a terminal (the test harness, or a
// piped invocation like `echo p | casual-docs ...`), falls back to a
// plain line read so the CLI is still scriptable.
//
// The trailing newline (if any) is stripped; an empty password is
// rejected here rather than at ResetPassword so the operator gets a
// clearer error.
func readPassword(in io.Reader, out io.Writer, prompt string) (string, error) {
	if f, ok := in.(*os.File); ok && term.IsTerminal(int(f.Fd())) {
		fmt.Fprint(out, prompt)
		raw, err := term.ReadPassword(int(f.Fd()))
		fmt.Fprintln(out)
		if err != nil {
			return "", err
		}
		s := strings.TrimRight(string(raw), "\r\n")
		if s == "" {
			return "", fmt.Errorf("empty password")
		}
		return s, nil
	}
	// Non-tty path: read one line.
	buf := make([]byte, 4096)
	n, err := in.Read(buf)
	if err != nil && err != io.EOF {
		return "", err
	}
	s := strings.TrimRight(string(buf[:n]), "\r\n")
	if s == "" {
		return "", fmt.Errorf("empty password")
	}
	return s, nil
}

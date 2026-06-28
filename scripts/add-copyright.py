#!/usr/bin/env python3
# Copyright (c) 2026 Casual Office. All rights reserved.

"""Idempotently prepend a Casual Office copyright header to first-party source files.

Scope: tracked source files only (git ls-files), excluding submodules, vendored
third-party schemas, generated output, and binary/data files. Re-running is a
no-op on files that already carry the header.
"""
from __future__ import annotations

import re
import subprocess
import sys

YEAR = "2026"
LINE = f"Copyright (c) {YEAR} Casual Office. All rights reserved."
MARKER = "Casual Office. All rights reserved."

# Extensions we add headers to, grouped by comment style.
BLOCK = {"ts", "tsx", "js", "jsx", "mjs", "cjs", "css", "scss"}  # /* ... */
HASH = {"py", "sh"}  # # ...
GO = {"go"}  # // ... (build-tag aware)

# Path prefixes to skip entirely (submodules + vendored third-party).
SKIP_PREFIXES = (
    "collab/",  # submodule (separate repo)
    "docx-editor/vendor/",  # submodule (design-book)
    "docx-editor/reference/",  # third-party ECMA-376 schemas
    "docx-editor/ds-bundle/",  # generated design-system bundle
    "docx-editor/.ds-sync/",  # design-system sync tooling (special @ds-bundle header)
    "docx-editor/.design-sync/",  # design-system sync artifacts
)
# Substrings that mark generated / vendored trees (defensive — usually untracked).
SKIP_SUBSTR = ("/node_modules/", "/dist/", "/build/", "/.next/", ".min.")

DIRECTIVE_RE = re.compile(r"""^\s*(['"])use (client|strict)\1;?\s*$""")
GO_BUILD_RE = re.compile(r"^//(go:build|\s*\+build)\b")


def block_header() -> str:
    return f"/*\n * {LINE}\n */\n\n"


def hash_header() -> str:
    return f"# {LINE}\n\n"


def go_header() -> str:
    return f"// {LINE}\n\n"


def insert(text: str, ext: str) -> str | None:
    if MARKER in text[:600]:
        return None  # already has it

    lines = text.split("\n")
    idx = 0  # index where header should be inserted

    # Preserve a shebang line.
    if lines and lines[0].startswith("#!"):
        idx = 1

    if ext in BLOCK:
        # Preserve a leading JS directive ("use client"/"use strict").
        if idx < len(lines) and DIRECTIVE_RE.match(lines[idx]):
            idx += 1
        header = block_header()
    elif ext in GO:
        # Leave any leading //go:build / // +build constraint lines (and the
        # blank line that must follow them) at the very top.
        while idx < len(lines) and GO_BUILD_RE.match(lines[idx]):
            idx += 1
            if idx < len(lines) and lines[idx].strip() == "":
                idx += 1
        header = go_header()
    elif ext in HASH:
        header = hash_header()
    else:
        return None

    prefix = "\n".join(lines[:idx])
    rest = "\n".join(lines[idx:])
    if prefix and not prefix.endswith("\n"):
        prefix += "\n"
    return prefix + header + rest


def main() -> int:
    files = subprocess.check_output(["git", "ls-files"], text=True).splitlines()
    changed = 0
    skipped_existing = 0
    for path in files:
        if path.startswith(SKIP_PREFIXES) or any(s in path for s in SKIP_SUBSTR):
            continue
        ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
        if ext not in BLOCK and ext not in HASH and ext not in GO:
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                text = f.read()
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        out = insert(text, ext)
        if out is None:
            if MARKER in text[:600]:
                skipped_existing += 1
            continue
        with open(path, "w", encoding="utf-8") as f:
            f.write(out)
        changed += 1
    print(f"headers added: {changed}; already-present skipped: {skipped_existing}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

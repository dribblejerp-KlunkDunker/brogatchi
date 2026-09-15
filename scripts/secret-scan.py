"""Secret-pattern scanner for the Bro OS repo.

Walks the repo (skipping node_modules/.git/dist), matches secret-shaped
strings, and reports hits with location + a redacted 16-char prefix.
Files that legitimately hold secrets (.env, bridge runtime data) are
allowlisted. Exits 1 when any hit is found, so a pre-push hook can
block the push.

Usage: python scripts/secret-scan.py [root]   (default: repo root)
"""
import os
import re
import sys

SKIP_DIRS = {"node_modules", ".git", "dist", "dist-preview", ".freebuff"}
ALLOW_FILES = {
    ".env",
    os.path.join("bridge", "state.json"),
    os.path.join("bridge", "memory.jsonl"),
    os.path.join("bridge", "actions.log"),
}
ALLOW_EXT = (".png", ".jpg", ".woff2", ".ico", ".zip", ".lock")

PATTERNS = {
    "GCP/AI key (AQ.)": re.compile(r"\bAQ\.[A-Za-z0-9_\-]{35,}\b"),
    "Google API key (AIza)": re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b"),
    "GitHub PAT (classic)": re.compile(r"\bghp_[A-Za-z0-9]{36,}\b"),
    "GitHub PAT (fine)": re.compile(r"\bgithub_pat_[A-Za-z0-9_]{22,}\b"),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "OpenAI sk": re.compile(r"\bsk-[A-Za-z0-9_\-]{20,}\b"),
    "Anthropic sk": re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{20,}\b"),
    "Slack token": re.compile(r"\bxox[baprs]-[A-Za-z0-9\-]{10,}\b"),
    "private key block": re.compile(r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "generic Bearer": re.compile(r"(?i)authorization[\"\s:=]+bearer\s+[A-Za-z0-9._\-]{20,}"),
    "generic secret assignment": re.compile(
        r"(?i)\b(api[_-]?key|secret|token|password)[\"\s:=]+[\"']?[A-Za-z0-9+/=_\-]{24,}"
    ),
}


def scan(root):
    hits = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root)
            if rel.replace(os.sep, "/") in {p.replace(os.sep, "/") for p in ALLOW_FILES}:
                continue
            if fn.endswith(ALLOW_EXT):
                continue
            try:
                with open(full, "r", encoding="utf-8", errors="ignore") as fh:
                    text = fh.read()
            except OSError:
                continue
            for name, rx in PATTERNS.items():
                for m in rx.finditer(text):
                    hits.append((name, rel.replace(os.sep, "/"), m.start(), m.group(0)[:16]))
    return hits


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    hits = scan(root)
    if not hits:
        print("CLEAN: no secret-shaped strings outside allowlisted files")
        return 0
    for name, rel, pos, frag in hits:
        print(f"HIT [{name}] {rel}@{pos}: {frag}...")
    print(f"scan found {len(hits)} candidate(s) — do not push until resolved")
    return 1


if __name__ == "__main__":
    sys.exit(main())

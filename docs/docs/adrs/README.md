# Architecture Decision Records (ADRs)

This folder records significant architectural / design decisions made in Magda —
the context, the decision, its consequences, and the alternatives considered — so
the reasoning behind non-obvious choices isn't lost.

Use an ADR when a change involves a decision that is expensive to reverse, affects
a public interface or the security model, or would otherwise leave future readers
wondering "why was it done this way?".

## Format & conventions

- One decision per file, named `NNNN-short-title.md` (zero-padded, incrementing).
- Suggested sections: **Status** (Proposed / Accepted / Superseded), **Context**,
  **Decision**, **Consequences**, **Alternatives considered**, and any
  implementation notes worth preserving near the decision.
- Prefer linking to GitHub issues/PRs for tracking, and to the relevant code.

## Index

- [0001 — Large file upload/download support for magda-storage-api](./0001-large-file-storage-support.md)
- [0002 — Classify outcomes by a stable signal, not by a tool's output text](./0002-classify-outcomes-by-stable-signal.md)

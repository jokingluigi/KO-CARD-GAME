---
name: Online background failure containment
description: Contain detached online timer and WebSocket failures without hiding request-path errors or leaking query details.
---

Detached promises started by online timers, WebSocket event handlers, and connection cleanup must handle their own rejections. Log a request ID, route, match ID when available, error category, and safe database code; do not log raw SQL parameters or return raw database errors to clients.

**Why:** A production Node 24 process exited after a turn-timeout timer's database rejection became unhandled. The rejection came from daily quest progress, but the scheduler boundary—not a UI fallback—was what allowed the process to terminate.

**How to apply:** Route new timer and event-emitter work through the shared online background-task handler. Keep awaited request failures visible as errors; never convert a failed quest query into an empty success. Preserve transaction rollback when core match persistence fails.
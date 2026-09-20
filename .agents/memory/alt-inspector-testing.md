---
name: ALT inspector UI testing boundary
description: Keep ALT placement, metadata projection, and numeric-change calculations testable without loading the React renderer.
---

ALT Inspector placement and metadata projection should live in a non-React utility module, while the React component should export only UI components.

**Why:** Direct Node tests otherwise pull in Vite-only `import.meta.env` code from the card renderer, and utility exports from a React component can trigger Fast Refresh invalidation warnings.

**How to apply:** Add or extend focused tests against the utility module and keep card rendering, hover, touch, and ALT visibility behavior in the component layer.
# Project Notes

## AI Labeling Rules

This project uses AI labels to clearly separate:
- coordination/messaging code that was AI-assisted
- regular business logic that should stay easy for teammates to explain and maintain

### Purpose

The labeling system helps the team:
1. identify AI-assisted code blocks quickly during review and demos
2. keep function ownership clear across teammates
3. avoid over-commenting generated coordination code while keeping business logic readable

### Label Types

- `AI_GENERATED_START` / `AI_GENERATED_END`
  - Use these markers for AI-assisted coordination code blocks (for example runtime messaging, tab communication, and cross-module action routing).
  - Do not add extra inline explanation comments inside these marked blocks.

- `AI_GENERATED` (file header style marker)
  - Use this at the top of frontend UI files (HTML/CSS) that were AI-generated or AI-shaped.

### How To Use

1. For cross-module communication or routing functions, wrap the function body (or major block) with:
   - `AI_GENERATED_START`
   - `AI_GENERATED_END`
2. For detailed business logic functions, do not use AI block markers; instead, keep normal Input/Output and step comments.
3. For UI-only files (`.html`, `.css`), keep the file-level `AI_GENERATED` header marker.
4. Keep this README high-level. Do not maintain a per-function tracking table here.

### Demo Guidance

During demos, present:
1. skeleton architecture and module boundaries first
2. design decisions second
3. only dive into specific function internals if asked

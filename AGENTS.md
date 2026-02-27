# Chronicle Agent Instructions

## Startup Memory Load (Required)
At the start of every new agent session, load these files before taking actions:

1. `docs/agent-memory/README.md`
2. `docs/agent-memory/Chronicle_Product_Vision_v2.txt`
3. `docs/agent-memory/Chronicle_Technical_Architecture.txt`

If a `.txt` file is missing, load the matching `.md` file instead.

## First-Response Verification (Required)
After completing the startup memory load, include this exact codeword in the first response of the session:

`CHRONICLE-READY`

## Purpose
These files are the canonical product and architecture context for this repository and should be treated as baseline memory for all tasks.

## Playwright Backend Policy (Required)
- Do not use mocked backends for any Playwright test.
- Do not use or add mock API harnesses (for example in-process route mocking) when validating UI behavior.
- Run Playwright tests against the real Chronicle stack (real API + supporting services) so failures reflect production-like behavior.
- If the real backend is unavailable, report the backend failure and stop; do not switch to mocks as a fallback.

## Task Tracking Source of Truth (Required)
- The source of truth for task tracking is GitHub Issue `#76`.
- All tasks must be managed and worked from GitHub, not local backlog files.
- When starting work on any task, update its GitHub status immediately to reflect that it is in progress.

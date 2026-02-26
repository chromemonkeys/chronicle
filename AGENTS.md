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

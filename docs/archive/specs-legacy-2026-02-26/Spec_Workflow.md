# Spec Workflow (Mandatory)

## Goal
Prevent scaffold-only delivery by requiring detailed, verifiable implementation specs.

## Process
1. Create a new spec from `docs/specs/Technical_Spec_Checklist_Template.md`.
2. Break work into concrete fix items using `docs/specs/Fix_List_Item_Template.md`.
3. Get technical review approval on spec before coding starts.
4. Implement only against approved fix items.
5. Open PR using `.github/PULL_REQUEST_TEMPLATE.md`.
6. Reviewer blocks merge if any required item lacks evidence.

## Minimum Detail Bar
- Spec must include:
  - route contract matrix (request, response, error code)
  - function-level implementation checklist by file/function
  - state machines for workflow-critical states
  - UI element/state matrix for affected screens
  - explicit test case IDs tied to acceptance criteria
- Reference implementation examples:
  - `docs/specs/PHASE-1_Foundation_Detailed_Spec.md`
  - `docs/specs/PHASE-2_Core_Document_Engine_Detailed_Spec.md`

## Merge Gate Rules
- No “done” status without:
  - linked spec
  - completed implementation checklist
  - test evidence
  - explicit out-of-scope list
- “Scaffold only” or “placeholder logic” PRs are non-mergeable.
- Missing required function/UI element/test from spec is a hard fail.

# Fix Item Spec Template

Use this for each concrete implementation item. Keep language explicit and testable.

## Fix <N>: <Area> — <Outcome>

### Problem
- Current behavior:
- Why this is incorrect:
- User/system impact:
- Reproduction steps:

### Scope
- In scope:
- Out of scope:
- Non-goals:

### Files
- `<path/to/fileA>`: `<why it must change>`
- `<path/to/fileB>`: `<why it must change>`

### Required Changes
- `<path>:<function or module>`: `<exact required behavior>`
- `<path>:<function or module>`: `<exact required behavior>`
- `<path>:<event/handler/api route>`: `<exact required behavior>`

### Contracts
- Request contract:
- Response contract:
- Event/WebSocket contract:
- Error codes and status mapping:

### Data + Persistence
- Storage source of truth:
- Derived fields:
- Backward compatibility behavior:
- Migration/backfill needed:

### Acceptance Criteria
- [ ] Behavior `A` is observable in endpoint/UI/runtime
- [ ] Behavior `B` is observable in endpoint/UI/runtime
- [ ] No regression for `<legacy flow>`
- [ ] Edge case `<X>` handled

### Tests
- Unit:
- Integration:
- E2E:
- Negative-path tests:

### Evidence Required In PR
- Test files changed:
- API request/response examples:
- Before/after screenshot or recording:
- Log output proving branch/handler path executed:

### Risks and Mitigations
- Risk:
- Mitigation:

### Rollout
- Feature flag (if needed):
- Deploy/rollback plan:


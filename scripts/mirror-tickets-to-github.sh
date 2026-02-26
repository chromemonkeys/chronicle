#!/usr/bin/env bash
set -euo pipefail

BACKLOG_FILE="${1:-docs/specs/ACTIVE_Ticket_Backlog.md}"
GH_REPO="${GH_REPO:-}"
DRY_RUN="${DRY_RUN:-0}"

if [[ -z "$GH_REPO" ]]; then
  echo "GH_REPO is required (example: GH_REPO=owner/repo)."
  exit 1
fi

if [[ ! -f "$BACKLOG_FILE" ]]; then
  echo "Backlog file not found: $BACKLOG_FILE"
  exit 1
fi

echo "Using backlog: $BACKLOG_FILE"
echo "Target repo: $GH_REPO"
echo "Dry run: $DRY_RUN"

# Parse markdown table rows from the ticket table only.
awk '
  BEGIN { in_table=0 }
  /^## Ticket Table/ { in_table=1; next }
  /^## / && in_table==1 { exit }
  in_table==1 && /^\|/ { print }
' "$BACKLOG_FILE" | while IFS='|' read -r _ id area priority status estimate spec summary _; do
  id="$(echo "$id" | xargs)"
  area="$(echo "$area" | xargs)"
  priority="$(echo "$priority" | xargs)"
  status="$(echo "$status" | xargs)"
  estimate="$(echo "$estimate" | xargs)"
  spec="$(echo "$spec" | xargs)"
  summary="$(echo "$summary" | xargs)"

  # Skip header/separator rows.
  [[ "$id" == "Ticket ID" || "$id" == "---" || -z "$id" ]] && continue
  id="${id//\`/}"

  title="$id - $summary"
  body=$(cat <<EOF
Ticket ID: $id
Area: $area
Priority: $priority
Status: $status
Estimate: $estimate
Spec Link: $spec

Backlog source:
- docs/specs/ACTIVE_Ticket_Backlog.md
EOF
)

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY_RUN create: $title"
    continue
  fi

  # Avoid duplicates by exact title.
  if gh issue list --repo "$GH_REPO" --state all --search "\"$title\" in:title" --json number,title | rg -q "\"title\":\"$title\""; then
    echo "SKIP (exists): $title"
    continue
  fi

  gh issue create \
    --repo "$GH_REPO" \
    --title "$title" \
    --body "$body" \
    --label "ticket" \
    --label "priority:$priority" \
    --label "status:$status" \
    --label "area:$area"

  echo "CREATED: $title"
done

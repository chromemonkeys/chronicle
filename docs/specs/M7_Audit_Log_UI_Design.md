# M7 Audit Log UI Design Specification

## Overview

This document defines the UI design for permission audit logging features in Chronicle (M7.3/M7.4).

---

## 1. Permission Audit Log Page (#125)

### 1.1 Page Location
- **URL**: `/admin/audit-log`
- **Access**: Admin-only ( ActionAdmin required)
- **Navigation**: Admin section → "Audit Log" menu item

### 1.2 Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  Chronicle.    [Admin] [Users] [Audit Log]          [User ▼]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ← Back to Admin                     [Export CSV] [Export JSON] │
│                                                                 │
│  # Audit Log                                                    │
│  Track permission changes and access denials across workspace   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🔍 Search...  [Event Type ▼] [Resource ▼] [Date Range ▼] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ○  Event              Actor          Resource    Time   │   │
│  │ ─────────────────────────────────────────────────────── │   │
│  │ 🔴 Permission denied  john@corp.io   Document:123  2m   │   │
│  │ 🟢 Permission granted admin@corp.io  Space:456     1h   │   │
│  │ 🟡 Role changed       admin@corp.io  User:789       3h   │   │
│  │ 🔵 Public link created alice@corp.io Document:321  5h   │   │
│  │                                                         │   │
│  │           [1] [2] [3] ... [10]      Showing 1-25 of 342 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Event Types & Icons

| Event Type | Icon | Color | Description |
|------------|------|-------|-------------|
| `permission_denied` | 🔴 | Red | Access attempt was denied |
| `permission_granted` | 🟢 | Green | Permission was given to user/group |
| `permission_revoked` | ⚫ | Gray | Permission was removed |
| `role_changed` | 🟡 | Yellow | User's role was modified |
| `public_link_created` | 🔵 | Blue | Shareable link was created |
| `public_link_revoked` | 🔵 | Blue | Shareable link was disabled |
| `guest_invited` | 🟣 | Purple | External user was invited |
| `guest_removed` | 🟣 | Purple | External user access was removed |

### 1.4 Filter Components

**Event Type Filter:**
- Multi-select dropdown
- Options: All, Permission Denied, Permission Granted, Role Changed, Public Link, Guest Access

**Resource Filter:**
- Dropdown with hierarchy
- Options: All, Workspace, Space (list), Document (searchable)

**Date Range Filter:**
- Presets: Last 24h, Last 7 days, Last 30 days, Custom
- Date pickers for custom range

**User Filter:**
- Searchable dropdown
- Shows recent actors first

### 1.5 Table Columns

| Column | Description | Sortable |
|--------|-------------|----------|
| Event | Icon + event type label | Yes |
| Actor | Who performed the action (user email + name) | Yes |
| Subject | Who/what was affected (user, group, or link) | Yes |
| Resource | Workspace/Space/Document name with link | Yes |
| Role | Permission level (for grant/revoke events) | Yes |
| Previous → New | For role changes, shows before/after | No |
| Timestamp | Relative time (hover for full datetime) | Yes |

### 1.6 Detail View (Expandable Row)

Clicking a row expands to show:
```
┌────────────────────────────────────────────────────────┐
│ 🔴 Permission Denied                                    │
├────────────────────────────────────────────────────────┤
│ Actor:    John Smith (john@example.com)                │
│ Action:   Attempted to edit document                   │
│ Resource: RFC: OAuth Implementation (doc-123)          │
│ Path:     /workspace/rfc-oauth                         │
│ Reason:   User lacks 'editor' role on this document    │
│ Time:     2026-02-28 14:32:15 UTC                      │
│ IP:       192.168.1.45                                 │
│ User Agent: Mozilla/5.0 (Chrome 121)...               │
├────────────────────────────────────────────────────────┤
│ [View Document]  [View User Profile]  [Grant Access]   │
└────────────────────────────────────────────────────────┘
```

### 1.7 Export Options

- **CSV Export**: Standard spreadsheet format
- **JSON Export**: Full structured data for API integration
- Filters apply to export (export what you see)

---

## 2. Real-time Permission Denial Alert (Optional Enhancement)

### 2.1 Admin Dashboard Widget

```
┌────────────────────────────┐
│ ⚠️ Recent Permission Denials│
├────────────────────────────┤
│ 3 denials in last hour     │
│                            │
│ john@corp.io → doc-123     │
│ alice@corp.io → space-456  │
│ bob@corp.io → doc-789      │
│                            │
│ [View Audit Log]           │
└────────────────────────────┘
```

---

## 3. Integration Points

### 3.1 Backend API Endpoints Needed

```
GET /api/admin/audit-log
  Query params:
    - eventTypes[]: string[]
    - resourceType: 'workspace' | 'space' | 'document'
    - resourceId: string
    - actorId: string
    - dateFrom: ISO date
    - dateTo: ISO date
    - limit: number (default 25)
    - offset: number
  Response:
    {
      events: AuditEvent[],
      total: number,
      hasMore: boolean
    }

GET /api/admin/audit-log/export
  Query params: same as above + format: 'csv' | 'json'
  Response: File download
```

### 3.2 Database Query Requirements

- Index on `permission_denials.created_at` for date filtering
- Index on `permission_denials.actor_id` for user filtering
- Index on `permission_denials.resource_id` for resource filtering

---

## 4. Responsive Behavior

### Desktop (>1024px)
- Full table with all columns
- Filters in horizontal row

### Tablet (768-1024px)
- Collapse "Previous → New" column
- Filters wrap to 2 rows

### Mobile (<768px)
- Card-based list instead of table
- Filters in collapsible drawer
- Simplified detail view

---

## 5. Accessibility Requirements

- Color not sole indicator (icons + text labels)
- Keyboard navigation for filters and table
- ARIA labels for interactive elements
- Screen reader announcements for filter changes

---

## 6. Implementation Notes

### Component Structure
```
PermissionAuditLogPage/
├── AuditLogFilterBar/
│   ├── EventTypeFilter
│   ├── ResourceFilter
│   ├── DateRangeFilter
│   └── UserFilter
├── AuditLogTable/
│   ├── AuditLogRow (expandable)
│   └── AuditLogRowDetail
└── ExportButton/
```

### State Management
- Filters in URL query params (shareable links)
- Pagination server-side
- Export triggers download, no state change

---

## Wireframes

### Desktop View
```
┌─────────────────────────────────────────────────────────────────┐
│  [Event ▼] [Resource ▼] [User ▼] [Date ▼]      [🔍 Search]     │
├─────────────────────────────────────────────────────────────────┤
│ ○ Event          Actor              Subject    Resource   Time  │
├─────────────────────────────────────────────────────────────────┤
│ 🔴 Denied   john@corp.io      ─        Doc:RFC    2m ago       │
│ 🟢 Granted  admin@corp.io     alice    Space:Eng   1h ago       │
│ 🟡 Changed  admin@corp.io     bob      Doc:API     3h ago       │
│ 🔵 Link     alice@corp.io     ─        Doc:Spec    5h ago       │
├─────────────────────────────────────────────────────────────────┤
│             [1] [2] [3] [4] [5]          Showing 1-25 of 342   │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile Card View
```
┌─────────────────────────┐
│ 🔴 Permission Denied     │
│ john@corp.io attempted   │
│ to edit "RFC: OAuth"     │
│ 2 minutes ago            │
│ [View Details →]         │
├─────────────────────────┤
│ 🟢 Permission Granted    │
│ admin granted alice      │
│ editor on "Engineering"  │
│ 1 hour ago               │
└─────────────────────────┘
```

---

## Related Issues
- #125: Permission Audit Log UI (this design)
- #124: Permission Change Audit Events (backend)
- #123: Expired Permission Cleanup Job (backend)
- #126: Redis Permission Cache Layer (backend)

---

*Document Version: 1.0*
*Last Updated: 2026-02-28*
*Status: Ready for Implementation*

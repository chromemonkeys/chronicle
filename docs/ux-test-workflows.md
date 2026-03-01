# Chronicle UX Test Workflows

Structured test workflows for manual UX validation with screenshots.

---

## Workflow Format

Each workflow follows this pattern:
1. **Navigate** - Go to specific page/section
2. **Action** - Perform user action
3. **Screenshot** - Capture state
4. **Review** - UX checklist for validation

---

## 🎫 Issue #121: Guest Magic Link Authentication

### Workflow ML-1: Magic Link Landing Page (Valid Token)
```yaml
Navigate: |
  As a guest user, click magic link from email
  URL: http://localhost:8080/auth/magic-link/{valid_token}

Action: |
  Wait for auto-verification to complete
  Observe loading spinner → success state

Screenshot: |
  Capture: Full page showing success state with user info
  Filename: ml-01-success-state.png

Review Checklist:
  - [ ] Loading spinner centered and visible
  - [ ] Success icon (checkmark) clearly displayed
  - [ ] "Signed In!" heading prominent
  - [ ] User name displayed correctly
  - [ ] "Redirecting..." message visible
  - [ ] No layout shifts during state changes
  - [ ] Mobile: Text readable, no horizontal scroll
```

### Workflow ML-2: Magic Link Landing Page (Expired Token)
```yaml
Navigate: |
  Use expired/invalid magic link
  URL: http://localhost:8080/auth/magic-link/expired_token

Action: |
  Wait for verification to fail
  Observe error state

Screenshot: |
  Capture: Error state with CTA
  Filename: ml-02-error-state.png

Review Checklist:
  - [ ] Error icon (X) clearly visible
  - [ ] "Link Expired or Invalid" heading prominent
  - [ ] Error message explains issue clearly
  - [ ] "Sign In" button visible and clickable
  - [ ] No confusing error technical details
  - [ ] Adequate spacing around elements
```

### Workflow ML-3: Magic Link Landing Page (Loading State)
```yaml
Navigate: |
  Fresh magic link page
  URL: http://localhost:8080/auth/magic-link/{token}

Action: |
  Immediately capture loading state (before verification completes)

Screenshot: |
  Capture: Loading spinner only
  Filename: ml-03-loading-state.png

Review Checklist:
  - [ ] Spinner animation visible
  - [ ] "Verifying Magic Link" text clear
  - [ ] No flicker or layout jump
  - [ ] Spinner centered vertically/horizontally
  - [ ] Background color consistent with app
```

---

## 🎫 Issue #122: Guest UI Indicators & Access Restrictions

### Workflow GI-1: Guest Warning Banner
```yaml
Navigate: |
  Sign in as guest user
  Go to any document: http://localhost:8080/workspace/{doc-id}

Action: |
  Observe banner at top of page
  Try dismissing banner (X button)

Screenshots:
  - Filename: gi-01-banner-visible.png
    Capture: Full page showing warning banner
  - Filename: gi-02-banner-dismissed.png
    Capture: After dismissing banner

Review Checklist:
  - [ ] Banner spans full width
  - [ ] Warning icon (triangle) visible
  - [ ] "You are viewing as a guest" text clear
  - [ ] Amber/yellow color consistent with design system
  - [ ] Close button functional
  - [ ] Banner doesn't push content down awkwardly
  - [ ] Stays visible on scroll (sticky)
  - [ ] Mobile: Text wraps properly
```

### Workflow GI-2: Guest Badge in Thread List
```yaml
Navigate: |
  Sign in as guest
  Go to document with threads by guest users
  http://localhost:8080/workspace/{doc-id}

Action: |
  Open Discussions panel
  Look for threads created by guest users

Screenshot: |
  Capture: Thread card showing guest badge
  Filename: gi-02-thread-guest-badge.png

Review Checklist:
  - [ ] "GUEST" badge visible next to author name
  - [ ] Badge uses amber/yellow color
  - [ ] Badge doesn't overlap author name
  - [ ] Badge size proportional to text
  - [ ] Multiple guests show multiple badges correctly
  - [ ] Badge aligned with author info
```

### Workflow GI-3: Guest Badge in Share Dialog
```yaml
Navigate: |
  Sign in as admin/regular user
  Open document and click Share button

Action: |
  View permissions list with guest users

Screenshot: |
  Capture: Share dialog showing guest users with badges
  Filename: gi-03-share-dialog-guests.png

Review Checklist:
  - [ ] Guest badge shown for external users
  - [ ] Badge positioned correctly in user row
  - [ ] Consistent with thread list badge
  - [ ] Role label still visible (Viewer/Commenter)
  - [ ] Badge doesn't break row layout
```

### Workflow GI-4: Guest Avatar Styling
```yaml
Navigate: |
  Sign in as guest
  Go to document with presence bar

Action: |
  Observe avatar in presence bar and thread list

Screenshot: |
  Capture: Guest avatar with distinctive ring
  Filename: gi-04-guest-avatar.png

Review Checklist:
  - [ ] Amber/orange ring around avatar
  - [ ] Ring thickness consistent
  - [ ] Visible at all avatar sizes (sm/md/lg)
  - [ ] Ring color contrasts with avatar background
  - [ ] Small guest indicator icon visible
```

### Workflow GI-5: Hidden Navigation for Guests
```yaml
Navigate: |
  Sign in as guest
  View main navigation sidebar

Action: |
  Compare navigation items visible vs internal user

Screenshot: |
  Capture: Sidebar navigation (guest view)
  Filename: gi-05-guest-navigation.png

Review Checklist:
  - [ ] "People" directory NOT visible
  - [ ] "Space Settings" NOT visible
  - [ ] "Create Space" button NOT visible
  - [ ] Only guest-accessible items shown
  - [ ] No broken or empty menu sections
  - [ ] Navigation still usable at mobile breakpoint
```

### Workflow GI-6: Hidden Create Buttons
```yaml
Navigate: |
  Sign in as guest
  Go to Documents page and Workspace

Action: |
  Look for create buttons

Screenshot: |
  Capture: Documents page showing (no create buttons)
  Filename: gi-06-hidden-create-buttons.png

Review Checklist:
  - [ ] "Create Document" button NOT visible
  - [ ] "Create Space" button NOT visible
  - [ ] No empty placeholder where buttons were
  - [ ] Page still functional for viewing
  - [ ] Guest can still navigate documents
```

### Workflow GI-7: Thread Visibility Toggle Hidden
```yaml
Navigate: |
  Sign in as guest
  Go to document → Discussions
  Click "New Thread"

Action: |
  Observe thread composer

Screenshot: |
  Capture: Thread composer without visibility toggle
  Filename: gi-07-no-visibility-toggle.png

Review Checklist:
  - [ ] No INTERNAL/EXTERNAL toggle visible
  - [ ] Thread can still be created
  - [ ] Default visibility is EXTERNAL
  - [ ] Composer layout intact without toggle
  - [ ] No confusing missing element
```

### Workflow GI-8: Limited API Responses (Backend)
```yaml
Navigate: |
  Sign in as guest
  Open browser DevTools → Network tab

Action: |
  Go to Documents page
  Check API responses for /api/spaces and /api/workspaces

Screenshot: |
  Capture: DevTools showing API responses
  Filename: gi-08-api-restrictions.png

Review Checklist:
  - [ ] /api/spaces returns empty array []
  - [ ] /api/workspaces returns minimal data
  - [ ] No sensitive workspace settings exposed
  - [ ] No error messages in console
  - [ ] Page loads without breaking
```

---

## 🎫 Issue #96-102: Page Layout View

### Workflow PL-1: Page Header Redesign
```yaml
Navigate: |
  Go to any document
  http://localhost:8080/workspace/{doc-id}

Action: |
  View document header with prominent title

Screenshot: |
  Capture: Page header area
  Filename: pl-01-page-header.png

Review Checklist:
  - [ ] Document title prominent and readable
  - [ ] Subtitle visible (if exists)
  - [ ] Status badge visible
  - [ ] Action buttons aligned properly
  - [ ] Breadcrumb navigation clear
  - [ ] Mobile: Title wraps properly
```

### Workflow PL-2: Table of Contents Component
```yaml
Navigate: |
  Go to document with headings
  http://localhost:8080/workspace/{doc-id}

Action: |
  View Table of Contents sidebar
  Click on TOC item to navigate

Screenshots:
  - Filename: pl-02-toc-default.png
    Capture: TOC sidebar visible
  - Filename: pl-03-toc-active.png
    Capture: After clicking TOC item

Review Checklist:
  - [ ] TOC shows all headings
  - [ ] Hierarchical indentation correct
  - [ ] Active section highlighted
  - [ ] Click navigates to section
  - [ ] Smooth scroll behavior
  - [ ] TOC scrolls with long documents
```

### Workflow PL-3: Layout Width Toggle
```yaml
Navigate: |
  Go to document
  http://localhost:8080/workspace/{doc-id}

Action: |
  Toggle between narrow and wide layouts
  Click width toggle button

Screenshots:
  - Filename: pl-04-layout-narrow.png
    Capture: Narrow layout mode
  - Filename: pl-05-layout-wide.png
    Capture: Wide layout mode

Review Checklist:
  - [ ] Toggle button accessible
  - [ ] Narrow: Comfortable reading width (~65ch)
  - [ ] Wide: Full width utilization
  - [ ] Content reflows correctly
  - [ ] Images scale appropriately
  - [ ] Preference persists on refresh
```

### Workflow PL-4: Multi-Column Layout
```yaml
Navigate: |
  Go to document with multi-column content
  http://localhost:8080/workspace/{doc-id}

Action: |
  View multi-column layout
  Resize browser window

Screenshot: |
  Capture: Multi-column content at desktop width
  Filename: pl-06-multi-column.png

Review Checklist:
  - [ ] Columns balanced (equal height)
  - [ ] Gutters between columns adequate
  - [ ] Responsive: Stacks on mobile
  - [ ] Content doesn't overflow
  - [ ] Images/videos span correctly
```

### Workflow PL-5: Page Footer Section
```yaml
Navigate: |
  Go to document
  Scroll to bottom

Action: |
  View page footer

Screenshot: |
  Capture: Page footer area
  Filename: pl-07-page-footer.png

Review Checklist:
  - [ ] Footer spans full width
  - [ ] Metadata visible (last edited, author)
  - [ ] Navigation links work
  - [ ] Consistent styling with header
  - [ ] Doesn't overlap content
```

---

## 🎫 Issue #118-120: Document Sharing

### Workflow DS-1: Share Dialog (Invite Only Mode)
```yaml
Navigate: |
  Sign in as admin
  Open document → Click Share

Action: |
  View Invite tab
  Enter email, select role, send invitation

Screenshots:
  - Filename: ds-01-share-invite-tab.png
    Capture: Invite tab with form
  - Filename: ds-02-share-invite-sent.png
    Capture: After sending invitation (success message)

Review Checklist:
  - [ ] Email input clearly labeled
  - [ ] Role dropdown has all options
  - [ ] Expiry date optional and clear
  - [ ] "Send Invitation" button prominent
  - [ ] Success toast appears
  - [ ] Error messages clear if validation fails
```

### Workflow DS-2: Share Dialog (Manage Access)
```yaml
Navigate: |
  Sign in as admin
  Open document with existing permissions → Click Share

Action: |
  Switch to "Manage Access" tab
  View permission list

Screenshot: |
  Capture: Manage Access tab with users
  Filename: ds-03-manage-access.png

Review Checklist:
  - [ ] All users listed with roles
  - [ ] Guest badges visible for external users
  - [ ] Role badges color-coded
  - [ ] Remove button accessible
  - [ ] Expiry dates shown if set
  - [ ] Count badge on tab accurate
```

### Workflow DS-3: Share Mode Selector
```yaml
Navigate: |
  Sign in as admin
  Open Share dialog

Action: |
  Change share mode (Private → Space → Invite → Link)

Screenshots:
  - Filename: ds-04-mode-private.png
    Capture: Private mode selected
  - Filename: ds-05-mode-space.png
    Capture: Space members mode
  - Filename: ds-06-mode-invite.png
    Capture: Invite only mode

Review Checklist:
  - [ ] Mode selector clear and usable
  - [ ] Each mode has description
  - [ ] Mode change reflects immediately
  - [ ] Appropriate warnings shown
  - [ ] Visual distinction between modes
```

---

## 🎫 Issue #127-128: Admin User Management

### Workflow AM-1: User List Page
```yaml
Navigate: |
  Sign in as admin
  Go to: http://localhost:8080/admin/users

Action: |
  View user list table

Screenshot: |
  Capture: Full user list page
  Filename: am-01-user-list.png

Review Checklist:
  - [ ] Table headers clear
  - [ ] User avatars visible
  - [ ] Role badges color-coded
  - [ ] Pagination controls visible
  - [ ] Search input accessible
  - [ ] Filter dropdowns functional
  - [ ] Loading state if data loading
```

### Workflow AM-2: User List Empty State
```yaml
Navigate: |
  Sign in as admin
  Go to admin/users (with no users or after search with no results)

Action: |
  View empty state

Screenshot: |
  Capture: Empty state with CTA
  Filename: am-02-empty-state.png

Review Checklist:
  - [ ] Friendly message (not just "No data")
  - [ ] Illustration or icon present
  - [ ] Clear CTA button ("Invite Users")
  - [ ] No broken table headers showing
  - [ ] Centered and balanced layout
```

### Workflow AM-3: User List Search
```yaml
Navigate: |
  Sign in as admin
  Go to admin/users

Action: |
  Type in search box
  Observe debounce behavior

Screenshot: |
  Capture: Search results
  Filename: am-03-search-results.png

Review Checklist:
  - [ ] Search has 300ms debounce (check network tab)
  - [ ] Results filter correctly
  - [ ] Clear search option available
  - [ ] No results state handled
  - [ ] Loading indicator during search
```

### Workflow AM-4: Invite Users Modal
```yaml
Navigate: |
  Sign in as admin
  admin/users → Click "Invite Users"

Action: |
  Open invite modal
  Enter multiple emails

Screenshot: |
  Capture: Invite modal with form
  Filename: am-04-invite-modal.png

Review Checklist:
  - [ ] Modal opens smoothly
  - [ ] Email textarea large enough
  - [ ] Role selector clear
  - [ ] Supports comma + newline separation
  - [ ] Validation shows for invalid emails
  - [ ] Submit button prominent
```

### Workflow AM-5: Bulk Invite Success
```yaml
Navigate: |
  Sign in as admin
  Invite modal open

Action: |
  Enter valid emails
  Submit invitation

Screenshot: |
  Capture: Success state after bulk invite
  Filename: am-05-bulk-invite-success.png

Review Checklist:
  - [ ] Success message clear
  - [ ] Count of invited users shown
  - [ ] Failed invites listed separately
  - [ ] Modal closes or shows done state
  - [ ] User list updates to show new users
```

---

## 📱 Responsive Breakpoints

Add these to ANY workflow above at mobile width (375px):

```yaml
Mobile Screenshot: |
  Resize browser to 375px width
  Capture same view
  Filename: {original-name}-mobile.png

Mobile Review:
  - [ ] No horizontal scroll
  - [ ] Text readable (16px minimum)
  - [ ] Touch targets 44px minimum
  - [ ] Layout stacks correctly
  - [ ] Modal fits screen
  - [ ] Tables scroll horizontally if needed
```

---

## 🎨 Accessibility Checks

Add these to ANY workflow:

```yaml
A11y Checks:
  Keyboard:
    - [ ] Tab navigation works
    - [ ] Focus visible
    - [ ] Escape closes modals
    - [ ] Enter activates buttons
  
  Screen Reader:
    - [ ] Headings properly labeled
    - [ ] Buttons have aria-labels
    - [ ] Live regions for alerts
    - [ ] Alt text on images
  
  Visual:
    - [ ] Color contrast WCAG AA
    - [ ] Text resizes to 200%
    - [ ] High contrast mode OK
```

---

## 📊 Screenshot Naming Convention

Format: `{issue-type}-{sequence}-{description}.png`

Examples:
- `ml-01-success-state.png` (Magic Link workflow 1)
- `gi-05-guest-navigation.png` (Guest Indicators workflow 5)
- `am-03-search-results.png` (Admin Management workflow 3)

---

## ✅ Review Sign-off Template

After completing workflows, fill this:

```markdown
## UX Review Completed: [Feature Name]

Date: YYYY-MM-DD
Reviewer: [Name]
Browser: [Chrome/Firefox/Safari] v[X.X]
Viewport: [Desktop 1280px / Mobile 375px]

### Workflows Tested
- [ ] Workflow X-1: [Name] - Status
- [ ] Workflow X-2: [Name] - Status
...

### Issues Found
| Severity | Issue | Screenshot | Notes |
|----------|-------|------------|-------|
| High | ... | file.png | ... |

### Sign-off
- [ ] All workflows tested
- [ ] Screenshots captured
- [ ] Issues documented
- [ ] Approved / Needs fixes
```

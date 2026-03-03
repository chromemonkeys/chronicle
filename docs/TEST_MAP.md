# Chronicle Comprehensive Test Map

> Every button. Every input. Every workflow. Every edge case.
>
> Generated: 2026-03-02

---

## How to Use This Document

Each test case has a **priority** (P0 = must-have, P1 = important, P2 = nice-to-have) and a **layer**:

| Layer | Tool | Scope | Status |
|-------|------|-------|--------|
| **Unit** | Vitest | Pure functions, transforms, state logic | — |
| **Integration** | Go `testing` / Vitest + MSW | API handlers + DB, component + API client | — |
| **E2E** | Playwright (real backend) | Full user journeys end-to-end | — |

---

## 1. AUTHENTICATION

### 1.1 Sign In Page (`/sign-in`)

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 1.1.1 | Renders sign-in form with email and password fields | Unit | P0 | — |
| 1.1.2 | Renders sign-up form when "Sign Up" tab clicked | Unit | P0 | — |
| 1.1.3 | Tab toggle switches between sign-in and sign-up forms | Unit | P0 | — |
| 1.1.4 | Email input updates state on change | Unit | P1 | — |
| 1.1.5 | Password input updates state on change | Unit | P1 | — |
| 1.1.6 | Submit button is disabled while `isSubmitting` is true | Unit | P0 | — |
| 1.1.7 | Submit button text shows "Signing in..." during submission | Unit | P1 | — |
| 1.1.8 | Successful sign-in navigates to `/documents` | Integration | P0 | — |
| 1.1.9 | Failed sign-in displays error message | Integration | P0 | — |
| 1.1.10 | "Forgot password?" link navigates to `/forgot-password` | Unit | P0 | — |
| 1.1.11 | Sign-up: display name input updates state | Unit | P1 | — |
| 1.1.12 | Sign-up: confirm password input updates state | Unit | P1 | — |
| 1.1.13 | Sign-up: password mismatch shows error | Unit | P0 | — |
| 1.1.14 | Sign-up: successful registration navigates to `/verify-email-pending` | Integration | P0 | — |
| 1.1.15 | Sign-up: duplicate email shows "EMAIL_EXISTS" error | Integration | P0 | — |
| 1.1.16 | "Use demo mode" button shows demo name input | Unit | P1 | — |
| 1.1.17 | Demo mode: name input + Enter triggers sign-in | Unit | P1 | — |
| 1.1.18 | Demo mode: "Sign in" button triggers demo login | Integration | P1 | — |
| 1.1.19 | Demo mode: "Cancel" button hides demo form | Unit | P1 | — |
| 1.1.20 | Dev bypass: shows "Verify Email Now" link with token | Unit | P2 | — |
| 1.1.21 | Redirects to `/documents` if already authenticated | Unit | P0 | — |
| 1.1.22 | E2E: Full sign-up -> verify email -> sign-in flow | E2E | P0 | — |
| 1.1.23 | E2E: Sign in with valid credentials | E2E | P0 | — |
| 1.1.24 | E2E: Sign in with invalid credentials shows error | E2E | P0 | — |

### 1.2 Forgot Password (`/forgot-password`)

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 1.2.1 | Renders email input and submit button | Unit | P0 | — |
| 1.2.2 | Submit button disabled while submitting | Unit | P1 | — |
| 1.2.3 | Shows "Sending..." during submission | Unit | P1 | — |
| 1.2.4 | Successful submission shows "Check your email" message | Integration | P0 | — |
| 1.2.5 | Error displays error message | Integration | P0 | — |
| 1.2.6 | "Back to Sign In" link navigates to `/sign-in` | Unit | P0 | — |
| 1.2.7 | Dev bypass: shows reset token link | Unit | P2 | — |
| 1.2.8 | E2E: Request password reset for valid email | E2E | P1 | — |

### 1.3 Reset Password (`/reset-password`)

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 1.3.1 | Renders token, new password, confirm password fields | Unit | P0 | — |
| 1.3.2 | Pre-fills token from URL query parameter | Unit | P0 | — |
| 1.3.3 | Submit disabled while submitting | Unit | P1 | — |
| 1.3.4 | Shows "Resetting..." during submission | Unit | P1 | — |
| 1.3.5 | Success shows "Password Reset!" and sign-in link | Integration | P0 | — |
| 1.3.6 | Error shows error message | Integration | P0 | — |
| 1.3.7 | "Back to Sign In" link works | Unit | P0 | — |
| 1.3.8 | "Request New Token" link navigates to `/forgot-password` | Unit | P1 | — |
| 1.3.9 | E2E: Full reset flow with valid token | E2E | P1 | — |

### 1.4 Email Verification (`/verify-email`)

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 1.4.1 | Renders token input and verify button | Unit | P0 | — |
| 1.4.2 | Auto-verifies when token in URL params | Integration | P0 | — |
| 1.4.3 | Shows "Verifying..." during verification | Unit | P1 | — |
| 1.4.4 | Success shows "Email Verified!" message | Integration | P0 | — |
| 1.4.5 | Error shows error message | Integration | P0 | — |
| 1.4.6 | "Sign In" link navigates to `/sign-in` | Unit | P0 | — |

### 1.5 Verification Pending (`/verify-email-pending`)

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 1.5.1 | Renders pending message | Unit | P1 | — |
| 1.5.2 | "I Have a Verification Token" links to `/verify-email` | Unit | P1 | — |
| 1.5.3 | "Back to Sign In" links to `/sign-in` | Unit | P1 | — |

### 1.6 Auth State (AuthProvider)

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 1.6.1 | `loadSession()` on mount sets user state if authenticated | Unit | P0 | — |
| 1.6.2 | `loadSession()` clears state if not authenticated | Unit | P0 | — |
| 1.6.3 | Network error falls back to localStorage local user | Unit | P1 | — |
| 1.6.4 | `signIn(name)` calls `login()` and updates state | Unit | P0 | — |
| 1.6.5 | `signInWithPassword(email, pw)` calls `signIn()` API and updates state | Unit | P0 | — |
| 1.6.6 | `signInWithPassword(email, "")` falls back to demo `login()` | Unit | P1 | — |
| 1.6.7 | `signUp()` calls API and returns response | Unit | P0 | — |
| 1.6.8 | `signOut()` calls `logout()` and clears all state | Unit | P0 | — |
| 1.6.9 | `isAdmin` is true when role is "admin" | Unit | P0 | — |
| 1.6.10 | Context throws when `useAuth()` used outside provider | Unit | P1 | — |

---

## 2. NAVIGATION & ROUTING

### 2.1 App Shell

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 2.1.1 | Shows "Loading session..." when `isAuthLoading` is true | Unit | P0 | — |
| 2.1.2 | Redirects to `/sign-in` if not authenticated | Unit | P0 | — |
| 2.1.3 | Brand link navigates to `/documents` | Unit | P0 | — |
| 2.1.4 | "Documents" nav link navigates to `/documents` | Unit | P0 | — |
| 2.1.5 | "Approvals" nav link navigates to `/approvals` | Unit | P0 | — |
| 2.1.6 | "Settings" nav link visible only for admin users | Unit | P0 | — |
| 2.1.7 | "Settings" nav link navigates to `/settings` | Unit | P0 | — |
| 2.1.8 | "Sign out" button calls `signOut()` | Unit | P0 | — |
| 2.1.9 | Header hidden on workspace routes (`/workspace/*`) | Unit | P1 | — |
| 2.1.10 | Active nav link is highlighted | Unit | P1 | — |

### 2.2 Router

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 2.2.1 | `/` redirects to `/documents` | Unit | P0 | — |
| 2.2.2 | `/sign-in` renders SignInPage | Unit | P0 | — |
| 2.2.3 | `/verify-email` renders VerifyEmailPage | Unit | P0 | — |
| 2.2.4 | `/forgot-password` renders ForgotPasswordPage | Unit | P0 | — |
| 2.2.5 | `/reset-password` renders ResetPasswordPage | Unit | P0 | — |
| 2.2.6 | `/share/:token` renders SharedDocumentPage | Unit | P0 | — |
| 2.2.7 | `/documents` renders DocumentsPage | Unit | P0 | — |
| 2.2.8 | `/spaces/:spaceId` renders DocumentsPage with space context | Unit | P0 | — |
| 2.2.9 | `/workspace/:docId` renders WorkspacePage | Unit | P0 | — |
| 2.2.10 | `/approvals` renders ApprovalsPage | Unit | P0 | — |
| 2.2.11 | `/settings` renders SettingsPage | Unit | P0 | — |
| 2.2.12 | Unknown route renders NotFoundPage | Unit | P0 | — |

### 2.3 Not Found Page

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 2.3.1 | "Go back" button calls `navigate(-1)` | Unit | P1 | — |
| 2.3.2 | "Go to Documents" link navigates to `/documents` | Unit | P1 | — |

---

## 3. DOCUMENTS PAGE

### 3.1 Document Listing

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 3.1.1 | Shows loading skeleton during fetch | Unit | P0 | — |
| 3.1.2 | Shows "No documents yet" when empty | Unit | P0 | — |
| 3.1.3 | Shows error message with retry button on fetch failure | Unit | P0 | — |
| 3.1.4 | Renders document cards in grid on success | Unit | P0 | — |
| 3.1.5 | Each card shows title, status, updatedBy, openThreads | Unit | P0 | — |
| 3.1.6 | "Open workspace" link navigates to `/workspace/{docId}` | Unit | P0 | — |
| 3.1.7 | E2E: Load documents page, see real documents from API | E2E | P0 | — |

### 3.2 Create Document

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 3.2.1 | "Create document" button calls `createDocument()` | Integration | P0 | — |
| 3.2.2 | Button shows "Creating..." and is disabled while creating | Unit | P0 | — |
| 3.2.3 | After creation, opens ShareDialog for the new document | Integration | P0 | — |
| 3.2.4 | Closing ShareDialog navigates to `/workspace/{newDocId}` | Integration | P0 | — |
| 3.2.5 | Create error displays error message | Integration | P0 | — |
| 3.2.6 | E2E: Create a new document and land in workspace | E2E | P0 | — |

### 3.3 Space Sidebar

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 3.3.1 | "All Documents" link always visible and navigates to `/documents` | Unit | P0 | — |
| 3.3.2 | Space links rendered for each space | Unit | P0 | — |
| 3.3.3 | Clicking a space navigates to `/spaces/{spaceId}` | Unit | P0 | — |
| 3.3.4 | Space link shows document count badge | Unit | P1 | — |
| 3.3.5 | Gear icon on space opens SpaceSettingsDialog | Unit | P0 | — |
| 3.3.6 | "+ New space" button opens CreateSpaceDialog | Unit | P0 | — |
| 3.3.7 | "Settings" button visible only when on a space with permission | Unit | P1 | — |

### 3.4 Create Space Dialog

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 3.4.1 | Renders name, description, visibility fields | Unit | P0 | — |
| 3.4.2 | Name input updates state | Unit | P1 | — |
| 3.4.3 | Description input updates state | Unit | P1 | — |
| 3.4.4 | Visibility radio buttons switch between "organization" and "restricted" | Unit | P0 | — |
| 3.4.5 | When restricted: shows permission search UI | Unit | P0 | — |
| 3.4.6 | Search input triggers debounced user/group search | Integration | P0 | — |
| 3.4.7 | Clicking user search result adds user permission | Unit | P0 | — |
| 3.4.8 | Clicking group search result adds group permission | Unit | P0 | — |
| 3.4.9 | Role dropdown changes permission role for new additions | Unit | P0 | — |
| 3.4.10 | Remove (x) button removes a permission entry | Unit | P0 | — |
| 3.4.11 | "Cancel" resets form and closes dialog | Unit | P0 | — |
| 3.4.12 | "Create Space" disabled if name is empty | Unit | P0 | — |
| 3.4.13 | "Create Space" disabled and shows "Creating..." while submitting | Unit | P1 | — |
| 3.4.14 | Successful creation updates space list and closes dialog | Integration | P0 | — |
| 3.4.15 | Error shows error message in dialog | Integration | P0 | — |
| 3.4.16 | E2E: Create a new space with permissions | E2E | P1 | — |

### 3.5 Space Settings Dialog

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 3.5.1 | Renders with "Details", "Permissions", "Guests" tabs | Unit | P0 | — |
| 3.5.2 | Tab buttons switch active tab | Unit | P0 | — |

#### Details Tab
| 3.5.3 | Name and description pre-filled from space data | Unit | P0 | — |
| 3.5.4 | Name input updates state | Unit | P1 | — |
| 3.5.5 | Description input updates state | Unit | P1 | — |
| 3.5.6 | Visibility radios update state | Unit | P0 | — |
| 3.5.7 | "Save changes" disabled if no changes or name empty | Unit | P0 | — |
| 3.5.8 | Shows "Saving..." while saving | Unit | P1 | — |
| 3.5.9 | Shows "Saved" confirmation after success | Unit | P1 | — |
| 3.5.10 | Calls `updateSpace()` API on save | Integration | P0 | — |

#### Permissions Tab
| 3.5.11 | Search input triggers user/group search | Integration | P0 | — |
| 3.5.12 | Clicking search result grants permission via API | Integration | P0 | — |
| 3.5.13 | Permission list shows current grants | Unit | P0 | — |
| 3.5.14 | "Remove" button revokes permission via API | Integration | P0 | — |

#### Guests Tab
| 3.5.15 | Email and role inputs render | Unit | P0 | — |
| 3.5.16 | "Invite" button calls `inviteGuest()` API | Integration | P0 | — |
| 3.5.17 | "Invite" disabled if email empty | Unit | P0 | — |
| 3.5.18 | Shows "Inviting..." while submitting | Unit | P1 | — |
| 3.5.19 | Guest list shows current guests | Unit | P0 | — |
| 3.5.20 | "Remove" button calls `removeGuest()` API | Integration | P0 | — |
| 3.5.21 | E2E: Update space settings and verify changes persist | E2E | P1 | — |

---

## 4. WORKSPACE / EDITOR PAGE

### 4.1 Page Loading

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.1.1 | Shows loading state during `fetchWorkspace()` | Unit | P0 | — |
| 4.1.2 | Shows error state on fetch failure | Unit | P0 | — |
| 4.1.3 | Renders editor with document content on success | Integration | P0 | — |
| 4.1.4 | Legacy content auto-converted via `legacyContentToDoc()` | Unit | P0 | — |
| 4.1.5 | E2E: Open workspace for an existing document | E2E | P0 | — |

### 4.2 Rich Text Editor (ChronicleEditor)

#### 4.2.1 Basic Text Editing
| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.2.1.1 | Editor renders with placeholder "Start writing..." | Unit | P0 | — |
| 4.2.1.2 | Typing text updates document content | Unit | P0 | — |
| 4.2.1.3 | `onUpdate` callback fires with JSON content on change | Unit | P0 | — |
| 4.2.1.4 | Tab key blurs editor (escapes focus) | Unit | P1 | — |
| 4.2.1.5 | Ctrl+Z undoes last action | Unit | P0 | — |
| 4.2.1.6 | Ctrl+Shift+Z redoes last undone action | Unit | P0 | — |

#### 4.2.2 Text Formatting (Toolbar Buttons)
| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.2.2.1 | Bold button toggles bold on selected text | Unit | P0 | — |
| 4.2.2.2 | Ctrl+B toggles bold | Unit | P0 | — |
| 4.2.2.3 | Italic button toggles italic on selected text | Unit | P0 | — |
| 4.2.2.4 | Ctrl+I toggles italic | Unit | P0 | — |
| 4.2.2.5 | Underline button toggles underline | Unit | P0 | — |
| 4.2.2.6 | Ctrl+U toggles underline | Unit | P0 | — |
| 4.2.2.7 | Strikethrough button toggles strikethrough | Unit | P0 | — |
| 4.2.2.8 | Subscript button toggles subscript | Unit | P1 | — |
| 4.2.2.9 | Superscript button toggles superscript | Unit | P1 | — |
| 4.2.2.10 | Code button toggles inline code | Unit | P0 | — |
| 4.2.2.11 | Bold button shows active state when cursor in bold text | Unit | P0 | — |
| 4.2.2.12 | Multiple formats can be applied to same text | Unit | P0 | — |
| 4.2.2.13 | Clear formatting button removes all marks | Unit | P0 | — |
| 4.2.2.14 | Clear formatting button converts blocks to paragraph | Unit | P0 | — |

#### 4.2.3 Block Types
| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.2.3.1 | Block type dropdown shows current type (Normal, H1, H2, H3) | Unit | P0 | — |
| 4.2.3.2 | Selecting "Heading 1" converts current block | Unit | P0 | — |
| 4.2.3.3 | Selecting "Heading 2" converts current block | Unit | P0 | — |
| 4.2.3.4 | Selecting "Heading 3" converts current block | Unit | P0 | — |
| 4.2.3.5 | Selecting "Normal" converts heading back to paragraph | Unit | P0 | — |
| 4.2.3.6 | `# ` at line start auto-converts to Heading 1 | Unit | P0 | — |
| 4.2.3.7 | `## ` auto-converts to Heading 2 | Unit | P0 | — |
| 4.2.3.8 | `### ` auto-converts to Heading 3 | Unit | P0 | — |

#### 4.2.4 Lists
| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.2.4.1 | Bullet list button toggles bullet list | Unit | P0 | — |
| 4.2.4.2 | Ordered list button toggles numbered list | Unit | P0 | — |
| 4.2.4.3 | Task list button toggles task list with checkboxes | Unit | P0 | — |
| 4.2.4.4 | `- ` at line start creates bullet list | Unit | P0 | — |
| 4.2.4.5 | `* ` at line start creates bullet list | Unit | P0 | — |
| 4.2.4.6 | `1. ` at line start creates ordered list | Unit | P0 | — |
| 4.2.4.7 | Task item checkbox toggles checked state | Unit | P0 | — |
| 4.2.4.8 | Nested task items supported | Unit | P1 | — |
| 4.2.4.9 | Blockquote button toggles blockquote | Unit | P0 | — |
| 4.2.4.10 | `> ` at line start creates blockquote | Unit | P0 | — |
| 4.2.4.11 | Increase indent button indents list item | Unit | P1 | — |
| 4.2.4.12 | Decrease indent button dedents list item | Unit | P1 | — |

#### 4.2.5 Font & Color
| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.2.5.1 | Font family dropdown opens on click | Unit | P0 | — |
| 4.2.5.2 | Selecting a font family applies it to selection | Unit | P0 | — |
| 4.2.5.3 | All 11 font families render correctly | Unit | P1 | — |
| 4.2.5.4 | "Default" option resets font family | Unit | P1 | — |
| 4.2.5.5 | Font size dropdown opens on click | Unit | P0 | — |
| 4.2.5.6 | Selecting a font size applies it | Unit | P0 | — |
| 4.2.5.7 | All 15 sizes (8pt-72pt) available | Unit | P1 | — |
| 4.2.5.8 | "Default" option resets font size | Unit | P1 | — |
| 4.2.5.9 | Text color picker opens on click | Unit | P0 | — |
| 4.2.5.10 | Selecting a color applies text color | Unit | P0 | — |
| 4.2.5.11 | All 9 text colors available | Unit | P1 | — |
| 4.2.5.12 | "Default" option resets text color | Unit | P1 | — |
| 4.2.5.13 | Highlight picker opens on click | Unit | P0 | — |
| 4.2.5.14 | Selecting a highlight color applies background | Unit | P0 | — |
| 4.2.5.15 | All 5 highlight colors available | Unit | P1 | — |
| 4.2.5.16 | "No highlight" option removes highlight | Unit | P1 | — |
| 4.2.5.17 | Color swatches scale on hover (scale 1.15) | Unit | P2 | — |

#### 4.2.6 Text Alignment
| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.2.6.1 | Left align button aligns text left | Unit | P0 | — |
| 4.2.6.2 | Center align button centers text | Unit | P0 | — |
| 4.2.6.3 | Right align button aligns text right | Unit | P0 | — |
| 4.2.6.4 | Justify button justifies text | Unit | P0 | — |
| 4.2.6.5 | Active alignment button shows highlight state | Unit | P1 | — |

#### 4.2.7 Links
| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.2.7.1 | Link button opens URL popover | Unit | P0 | — |
| 4.2.7.2 | URL input accepts text | Unit | P0 | — |
| 4.2.7.3 | "Set Link" button applies link to selection | Unit | P0 | — |
| 4.2.7.4 | Enter key in URL input applies link | Unit | P0 | — |
| 4.2.7.5 | "Remove Link" button removes existing link | Unit | P0 | — |
| 4.2.7.6 | Escape key closes link popover | Unit | P1 | — |
| 4.2.7.7 | Click outside closes link popover | Unit | P1 | — |
| 4.2.7.8 | Popover shows existing URL when cursor in link | Unit | P1 | — |

#### 4.2.8 Tables
| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.2.8.1 | Table menu opens on click | Unit | P0 | — |
| 4.2.8.2 | "Insert table" creates 3x3 table | Unit | P0 | — |
| 4.2.8.3 | "Add row below" adds a row | Unit | P0 | — |
| 4.2.8.4 | "Add column right" adds a column | Unit | P0 | — |
| 4.2.8.5 | "Delete row" removes current row | Unit | P0 | — |
| 4.2.8.6 | "Delete column" removes current column | Unit | P0 | — |
| 4.2.8.7 | "Merge cells" merges selected cells | Unit | P1 | — |
| 4.2.8.8 | "Split cell" splits merged cell | Unit | P1 | — |
| 4.2.8.9 | "Delete table" removes entire table | Unit | P0 | — |
| 4.2.8.10 | Table is resizable (column drag handles) | Unit | P1 | — |
| 4.2.8.11 | Table operations disabled when not inside a table | Unit | P0 | — |

#### 4.2.9 Code Blocks
| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.2.9.1 | Code block button inserts code block | Unit | P0 | — |
| 4.2.9.2 | ``` at line start creates code block | Unit | P0 | — |
| 4.2.9.3 | Language selector changes syntax highlighting | Unit | P1 | — |
| 4.2.9.4 | Code block renders with monospace font | Unit | P1 | — |

#### 4.2.10 Images
| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.2.10.1 | Image button opens file picker | Unit | P0 | — |
| 4.2.10.2 | Selecting file uploads via `POST /api/documents/{id}/uploads` | Integration | P0 | — |
| 4.2.10.3 | Uploaded image inserted into editor | Integration | P0 | — |
| 4.2.10.4 | Falls back to data URI if upload fails | Integration | P1 | — |
| 4.2.10.5 | Only image/* files accepted | Unit | P0 | — |

#### 4.2.11 Horizontal Rule
| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.2.11.1 | HR button inserts horizontal divider | Unit | P0 | — |
| 4.2.11.2 | `---` on its own line creates HR | Unit | P0 | — |
| 4.2.11.3 | `***` on its own line creates HR | Unit | P1 | — |

#### 4.2.12 Typography
| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.2.12.1 | `"text"` auto-converts to smart quotes | Unit | P2 | — |
| 4.2.12.2 | `--` converts to en-dash | Unit | P2 | — |
| 4.2.12.3 | `---` converts to em-dash | Unit | P2 | — |
| 4.2.12.4 | `...` converts to ellipsis | Unit | P2 | — |

#### 4.2.13 Word Count
| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.2.13.1 | Word count displays in toolbar | Unit | P1 | — |
| 4.2.13.2 | Count updates as user types | Unit | P1 | — |

### 4.3 Slash Commands

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.3.1 | Typing "/" at start of empty paragraph opens menu | Unit | P0 | — |
| 4.3.2 | Menu shows all 11 options | Unit | P0 | — |
| 4.3.3 | ArrowDown moves selection down | Unit | P0 | — |
| 4.3.4 | ArrowUp moves selection up | Unit | P0 | — |
| 4.3.5 | Enter executes selected command | Unit | P0 | — |
| 4.3.6 | Escape closes menu | Unit | P0 | — |
| 4.3.7 | Any other key closes menu | Unit | P1 | — |
| 4.3.8 | Clicking menu item executes command | Unit | P0 | — |
| 4.3.9 | "Heading 1" option creates h1 | Unit | P0 | — |
| 4.3.10 | "Heading 2" option creates h2 | Unit | P0 | — |
| 4.3.11 | "Heading 3" option creates h3 | Unit | P0 | — |
| 4.3.12 | "Bullet List" option creates bullet list | Unit | P0 | — |
| 4.3.13 | "Ordered List" option creates ordered list | Unit | P0 | — |
| 4.3.14 | "Code Block" option creates code block | Unit | P0 | — |
| 4.3.15 | "Blockquote" option creates blockquote | Unit | P0 | — |
| 4.3.16 | "Task List" option creates task list | Unit | P0 | — |
| 4.3.17 | "Table" option creates 3x3 table | Unit | P0 | — |
| 4.3.18 | "Horizontal Rule" option inserts HR | Unit | P0 | — |
| 4.3.19 | "Image" option opens file picker | Unit | P0 | — |
| 4.3.20 | Menu positioned within viewport bounds | Unit | P1 | — |
| 4.3.21 | "/" character removed after command execution | Unit | P0 | — |

### 4.4 Find & Replace

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.4.1 | Find & Replace button toggles FindReplaceBar visibility | Unit | P0 | — |
| 4.4.2 | Find input updates search term | Unit | P0 | — |
| 4.4.3 | Matches highlighted inline (case-insensitive) | Unit | P0 | — |
| 4.4.4 | Match counter shows "X of Y" | Unit | P0 | — |
| 4.4.5 | Match counter shows "No results" when no matches | Unit | P0 | — |
| 4.4.6 | Next button (Down arrow) navigates to next match | Unit | P0 | — |
| 4.4.7 | Previous button (Up arrow) navigates to previous match | Unit | P0 | — |
| 4.4.8 | Enter in find input goes to next match | Unit | P0 | — |
| 4.4.9 | Shift+Enter in find input goes to previous match | Unit | P0 | — |
| 4.4.10 | Close button closes bar and clears search | Unit | P0 | — |
| 4.4.11 | Escape in find input closes bar | Unit | P0 | — |
| 4.4.12 | Replace input updates replace text | Unit | P0 | — |
| 4.4.13 | "Replace" button replaces current match | Unit | P0 | — |
| 4.4.14 | "All" button replaces all matches | Unit | P0 | — |
| 4.4.15 | Replace/All buttons disabled when no matches | Unit | P0 | — |
| 4.4.16 | Prev/Next buttons disabled when no matches | Unit | P0 | — |
| 4.4.17 | Active match visually distinct from other matches | Unit | P1 | — |
| 4.4.18 | Escape in replace input closes bar | Unit | P1 | — |

### 4.5 Node IDs (Extension)

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.5.1 | New paragraphs get auto-generated UUID nodeId | Unit | P0 | — |
| 4.5.2 | All block types get nodeId (heading, blockquote, list, etc.) | Unit | P0 | — |
| 4.5.3 | Duplicate nodeIds are detected and regenerated | Unit | P0 | — |
| 4.5.4 | nodeId stored as `data-node-id` HTML attribute | Unit | P0 | — |
| 4.5.5 | nodeId survives document save/load cycle | Integration | P0 | — |

### 4.6 Suggestion Mode

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.6.1 | Suggestion mode toggle button activates tracked changes | Unit | P0 | — |
| 4.6.2 | Typing in suggestion mode wraps text in `suggestionInsert` mark | Unit | P0 | — |
| 4.6.3 | Deleting in suggestion mode wraps text in `suggestionDelete` mark (non-destructive) | Unit | P0 | — |
| 4.6.4 | Backspace in suggestion mode marks char as deleted, moves cursor | Unit | P0 | — |
| 4.6.5 | Delete key in suggestion mode marks char at cursor as deleted | Unit | P0 | — |
| 4.6.6 | Selection + delete marks entire range as deleted | Unit | P0 | — |
| 4.6.7 | Selection + type marks selection as deleted, inserts new with insert mark | Unit | P0 | — |
| 4.6.8 | `acceptSuggestions()` removes insert marks, deletes delete-marked content | Unit | P0 | — |
| 4.6.9 | `rejectSuggestions()` deletes insert-marked content, removes delete marks | Unit | P0 | — |
| 4.6.10 | Inserted text has `.suggestion-insert` CSS class (green underline) | Unit | P1 | — |
| 4.6.11 | Deleted text has `.suggestion-delete` CSS class (red strikethrough) | Unit | P1 | — |

### 4.7 Active Block Tracking

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.7.1 | Moving cursor updates `activeNodeId` | Unit | P0 | — |
| 4.7.2 | Active block gets `.block-active` CSS class | Unit | P1 | — |
| 4.7.3 | `onActiveBlockChange` callback fires on selection change | Unit | P0 | — |

### 4.8 Hover Block Tracking (Blame Attribution)

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 4.8.1 | Hovering over block fires `onHoverBlockChange` with nodeId | Unit | P0 | — |
| 4.8.2 | Leaving editor fires `onHoverBlockChange(null)` | Unit | P0 | — |
| 4.8.3 | Hovered block gets `.block-hover-attribution` CSS class | Unit | P1 | — |
| 4.8.4 | Extension can be disabled via `enabled: false` | Unit | P1 | — |

---

## 5. SIDEBAR TABS (Workspace Page)

### 5.1 Tab System

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 5.1.1 | All 7 tabs render: Discussions, Approvals, History, Decisions, Changes, Blame, Branches | Unit | P0 | — |
| 5.1.2 | Clicking a tab switches active panel | Unit | P0 | — |
| 5.1.3 | ArrowRight/ArrowDown moves to next tab | Unit | P0 | — |
| 5.1.4 | ArrowLeft/ArrowUp moves to previous tab | Unit | P0 | — |
| 5.1.5 | Home key jumps to first tab | Unit | P1 | — |
| 5.1.6 | End key jumps to last tab | Unit | P1 | — |
| 5.1.7 | Selected tab has active styling | Unit | P1 | — |

### 5.2 Discussions Tab

#### Thread Composer
| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 5.2.1 | Thread textarea accepts text input | Unit | P0 | — |
| 5.2.2 | Thread type selector changes type (Technical, Security, etc.) | Unit | P0 | — |
| 5.2.3 | Visibility selector switches between INTERNAL/EXTERNAL | Unit | P0 | — |
| 5.2.4 | "Comment" button disabled if text is empty | Unit | P0 | — |
| 5.2.5 | "Comment" button disabled while submitting | Unit | P0 | — |
| 5.2.6 | Ctrl/Cmd+Enter submits thread | Unit | P0 | — |
| 5.2.7 | Successful submission calls `createProposalThread()` | Integration | P0 | — |
| 5.2.8 | Thread anchored to active block nodeId | Integration | P0 | — |

#### Thread Card
| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 5.2.9 | Thread card renders with author, time, text, anchor | Unit | P0 | — |
| 5.2.10 | Clicking thread card selects it (`onSelect`) | Unit | P0 | — |
| 5.2.11 | Enter/Space key on thread card selects it | Unit | P1 | — |
| 5.2.12 | Visibility toggle button changes thread visibility | Integration | P0 | — |
| 5.2.13 | Reply button toggles reply form | Unit | P0 | — |
| 5.2.14 | Reply textarea accepts input | Unit | P0 | — |
| 5.2.15 | Ctrl/Cmd+Enter submits reply | Unit | P0 | — |
| 5.2.16 | "Post reply" button submits reply | Integration | P0 | — |
| 5.2.17 | Resolve button toggles resolve form | Unit | P0 | — |
| 5.2.18 | Outcome dropdown selects ACCEPTED/REJECTED/DEFERRED | Unit | P0 | — |
| 5.2.19 | Rationale textarea accepts input | Unit | P0 | — |
| 5.2.20 | "Resolve" button calls `resolveProposalThread()` | Integration | P0 | — |
| 5.2.21 | Resolved thread shows "Reopen" button | Unit | P0 | — |
| 5.2.22 | "Reopen" button calls `reopenProposalThread()` | Integration | P0 | — |
| 5.2.23 | Up vote button calls `voteProposalThread("up")` | Integration | P0 | — |
| 5.2.24 | Down vote button calls `voteProposalThread("down")` | Integration | P0 | — |
| 5.2.25 | Expand/collapse button toggles replies visibility | Unit | P0 | — |
| 5.2.26 | Collapsed state shows reply count badge | Unit | P1 | — |
| 5.2.27 | Reaction emoji buttons call `reactProposalThread()` | Integration | P1 | — |
| 5.2.28 | Thread markers show on editor blocks with threads | Unit | P0 | — |
| 5.2.29 | E2E: Create thread, reply, resolve, reopen | E2E | P0 | — |

### 5.3 Approvals Tab

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 5.3.1 | Shows approval workflow groups with status | Unit | P0 | — |
| 5.3.2 | Each group shows: name, status dot, member list, progress bar | Unit | P0 | — |
| 5.3.3 | "Approve" button visible for current user's group | Unit | P0 | — |
| 5.3.4 | "Approve" button calls `approveProposalGroup()` | Integration | P0 | — |
| 5.3.5 | "Reject" button visible for current user's group | Unit | P0 | — |
| 5.3.6 | "Reject" button calls `rejectProposalGroup()` | Integration | P0 | — |
| 5.3.7 | Stale badge shown when approvals are outdated | Unit | P1 | — |
| 5.3.8 | Progress bar reflects min approvals met | Unit | P1 | — |
| 5.3.9 | V1 legacy gates display as fallback | Unit | P1 | — |
| 5.3.10 | E2E: Approve a proposal group | E2E | P0 | — |

### 5.4 History Tab

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 5.4.1 | Branch timeline renders commit history | Unit | P0 | — |
| 5.4.2 | Main branch shown as central rail | Unit | P0 | — |
| 5.4.3 | Proposal branches shown as forked branches | Unit | P1 | — |
| 5.4.4 | Merge connectors visible at merge points | Unit | P1 | — |
| 5.4.5 | Clicking commit shows detail tooltip (message, author, time) | Unit | P0 | — |
| 5.4.6 | Hovering commit shows tooltip | Unit | P0 | — |
| 5.4.7 | Expand button shows fullscreen view | Unit | P1 | — |
| 5.4.8 | Close button in expanded view returns to normal | Unit | P1 | — |
| 5.4.9 | Selecting commit triggers comparison mode | Integration | P1 | — |

### 5.5 Decisions Tab

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 5.5.1 | Decision log table renders entries | Unit | P0 | — |
| 5.5.2 | Each entry shows: date, tags, text, author | Unit | P0 | — |
| 5.5.3 | Decision log is read-only (no interactive elements) | Unit | P1 | — |

### 5.6 Changes Tab (Diff Navigator)

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 5.6.1 | Type filter dropdown filters by change type | Unit | P0 | — |
| 5.6.2 | State filter dropdown filters by review state | Unit | P0 | — |
| 5.6.3 | "Unresolved only" button toggles filter | Unit | P0 | — |
| 5.6.4 | "Prev" button navigates to previous change | Unit | P0 | — |
| 5.6.5 | "Next" button navigates to next change | Unit | P0 | — |
| 5.6.6 | Clicking change row selects it and shows in diff | Unit | P0 | — |
| 5.6.7 | Enter/Space on change row selects it | Unit | P1 | — |
| 5.6.8 | "Accept" button calls `updateChangeReviewState("accepted")` | Integration | P0 | — |
| 5.6.9 | "Reject" button calls `updateChangeReviewState("rejected")` | Integration | P0 | — |
| 5.6.10 | "Defer" button calls `updateChangeReviewState("deferred")` | Integration | P0 | — |
| 5.6.11 | Active change has highlighted styling | Unit | P1 | — |
| 5.6.12 | E2E: Navigate changes and accept/reject/defer | E2E | P0 | — |

### 5.7 Blame Tab

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 5.7.1 | Loading state shows spinner | Unit | P0 | — |
| 5.7.2 | Error state shows error message | Unit | P0 | — |
| 5.7.3 | Empty state shows "No blame data" | Unit | P0 | — |
| 5.7.4 | Success state shows contributor summary | Unit | P0 | — |
| 5.7.5 | Blame entries show: author, relative time, commit hash | Unit | P0 | — |
| 5.7.6 | Clicking contributor navigates to commit | Unit | P0 | — |
| 5.7.7 | Thread link opens thread in discussions | Unit | P1 | — |
| 5.7.8 | Thread status badge shows OPEN/RESOLVED/ORPHANED | Unit | P1 | — |

### 5.8 Branches Tab

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 5.8.1 | Branch graph renders main branch | Unit | P0 | — |
| 5.8.2 | Proposal branches shown with fork points | Unit | P0 | — |
| 5.8.3 | Commit nodes are clickable/hoverable | Unit | P0 | — |
| 5.8.4 | Selecting commit in expanded view triggers action | Unit | P1 | — |

---

## 6. DIFF VIEWS

### 6.1 Diff Toggle

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 6.1.1 | Diff toggle button enables/disables diff view | Unit | P0 | — |
| 6.1.2 | Split/Unified mode selector switches diff format | Unit | P0 | — |

### 6.2 Unified Diff

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 6.2.1 | Shows added nodes with `diff-added` class | Unit | P0 | — |
| 6.2.2 | Shows removed nodes with `diff-removed` class | Unit | P0 | — |
| 6.2.3 | Shows changed nodes with `diff-changed` class | Unit | P0 | — |
| 6.2.4 | Inline insertions marked with `cm-diff-ins` class | Unit | P0 | — |
| 6.2.5 | Stats display: +added, -removed, ~changed | Unit | P0 | — |
| 6.2.6 | Active change highlighted differently | Unit | P1 | — |

### 6.3 Side-by-Side Diff

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 6.3.1 | Two panes render (before and after) | Unit | P0 | — |
| 6.3.2 | Added/removed/changed nodes highlighted | Unit | P0 | — |
| 6.3.3 | Synchronized scrolling works | Unit | P1 | — |
| 6.3.4 | Sync scroll toggle button works | Unit | P1 | — |
| 6.3.5 | Change count shown on center divider | Unit | P1 | — |

### 6.4 Diff Computation

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 6.4.1 | `diffDocs()` detects added nodes | Unit | P0 | PASS |
| 6.4.2 | `diffDocs()` detects removed nodes | Unit | P0 | PASS |
| 6.4.3 | `diffDocs()` detects changed nodes | Unit | P0 | PASS |
| 6.4.4 | `diffDocs()` identifies unchanged nodes | Unit | P0 | PASS |
| 6.4.5 | Word-level inline diff computed for changed nodes | Unit | P0 | PASS |
| 6.4.6 | Empty document diffed against populated document | Unit | P1 | PASS |
| 6.4.7 | Identical documents produce empty diff | Unit | P0 | PASS |

---

## 7. PROPOSALS & MERGE

### 7.1 Proposal Workflow

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 7.1.1 | "Create proposal" action calls `createProposal()` | Integration | P0 | — |
| 7.1.2 | "Request review" button calls `requestProposalReview()` | Integration | P0 | — |
| 7.1.3 | "Save named version" calls `saveNamedVersion()` | Integration | P0 | — |
| 7.1.4 | "Merge" button calls `mergeProposal()` with confirmation | Integration | P0 | — |
| 7.1.5 | Merge blocked when approval gates not met | Integration | P0 | — |
| 7.1.6 | Merge blocked when unresolved threads exist | Integration | P0 | — |
| 7.1.7 | Successful merge updates document to merged state | Integration | P0 | — |
| 7.1.8 | E2E: Full proposal lifecycle (create -> review -> approve -> merge) | E2E | P0 | — |

### 7.2 Merge Gate Badge

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 7.2.1 | V2: Shows approval group count "X/Y groups" | Unit | P0 | — |
| 7.2.2 | V2: Each group row shows status dot | Unit | P0 | — |
| 7.2.3 | V2: Progress shows "X/Y" approvals per group | Unit | P0 | — |
| 7.2.4 | V1: Gate labels and status pills displayed | Unit | P1 | — |
| 7.2.5 | V1: Summary shows "Awaiting X approvals" if pending | Unit | P1 | — |

---

## 8. APPROVAL RULES EDITOR

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 8.1 | Mode radio buttons switch between "parallel" and "sequential" | Unit | P0 | — |
| 8.2 | "Add Group" button creates new group | Unit | P0 | — |
| 8.3 | Group header click toggles expand/collapse | Unit | P0 | — |
| 8.4 | "Remove" button removes group | Unit | P0 | — |
| 8.5 | Drag handle allows reordering groups | Unit | P1 | — |
| 8.6 | Group name input updates name | Unit | P0 | — |
| 8.7 | Description input updates description | Unit | P1 | — |
| 8.8 | Min approvals slider changes threshold | Unit | P0 | — |
| 8.9 | "+ Add member" button opens member search | Unit | P0 | — |
| 8.10 | Member search input triggers debounced search | Integration | P0 | — |
| 8.11 | Clicking search result adds member to group | Unit | P0 | — |
| 8.12 | "Remove" button removes member from group | Unit | P0 | — |
| 8.13 | Move up/down buttons reorder members | Unit | P1 | — |
| 8.14 | "Save" button calls `onSave()` with compiled payload | Integration | P0 | — |
| 8.15 | "Cancel" button calls `onCancel()` | Unit | P0 | — |
| 8.16 | E2E: Configure approval rules and verify persistence | E2E | P1 | — |

---

## 9. SHARE DIALOG

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 9.1 | Dialog opens with document sharing info loaded | Integration | P0 | — |
| 9.2 | General access role dropdown changes access level | Integration | P0 | — |
| 9.3 | Search input triggers debounced user/group search | Integration | P0 | — |
| 9.4 | Clicking search result adds to direct permissions | Integration | P0 | — |
| 9.5 | Add role dropdown changes role for new additions | Unit | P0 | — |
| 9.6 | "Add by email" button grants permission by email | Integration | P0 | — |
| 9.7 | Per-person role dropdown updates role via API | Integration | P0 | — |
| 9.8 | Per-person "Remove" button revokes permission | Integration | P0 | — |
| 9.9 | "Create public link" button shows link form | Unit | P0 | — |
| 9.10 | Link role dropdown selects viewer/commenter | Unit | P0 | — |
| 9.11 | Password input sets optional password | Unit | P1 | — |
| 9.12 | Expiry date input sets optional expiry | Unit | P1 | — |
| 9.13 | "Create" button calls `createPublicLink()` | Integration | P0 | — |
| 9.14 | "Cancel" button hides link form | Unit | P0 | — |
| 9.15 | Existing links: copy button copies URL to clipboard and shows "Copied!" | Unit | P0 | — |
| 9.16 | Existing links: "Revoke" button calls `revokePublicLink()` | Integration | P0 | — |
| 9.17 | Links expand/collapse toggle works | Unit | P1 | — |
| 9.18 | Invite link shows URL and email for guest without account | Unit | P1 | — |
| 9.19 | Close button closes dialog | Unit | P0 | — |
| 9.20 | Escape key closes dialog | Unit | P0 | — |
| 9.21 | E2E: Share document with user, create public link, revoke | E2E | P0 | — |

---

## 10. APPROVALS PAGE (`/approvals`)

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 10.1 | Shows "Loading approval queue..." during fetch | Unit | P0 | — |
| 10.2 | After 4s delay, shows "This is taking longer..." with retry button | Unit | P1 | — |
| 10.3 | Shows skeleton cards while loading | Unit | P1 | — |
| 10.4 | Empty state shows "No pending approvals" | Unit | P0 | — |
| 10.5 | Error state shows error message with retry button | Unit | P0 | — |
| 10.6 | Blocked queue (needs your review) displays items | Unit | P0 | — |
| 10.7 | Ready queue (waiting on others) displays items | Unit | P0 | — |
| 10.8 | Each item links to `/workspace/{documentId}` | Unit | P0 | — |
| 10.9 | Approval status badge shows correct state | Unit | P1 | — |
| 10.10 | "Browse documents" link navigates to `/documents` | Unit | P0 | — |
| 10.11 | "Review next request" links to first blocked item | Unit | P1 | — |
| 10.12 | E2E: Load approvals page with real pending approvals | E2E | P1 | — |

---

## 11. SETTINGS PAGE (`/settings`)

### 11.1 Page Access

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 11.1.1 | Redirects non-admin users to `/documents` | Unit | P0 | — |
| 11.1.2 | Admin users see the settings page | Unit | P0 | — |
| 11.1.3 | Tab buttons: Users, Groups, Roles | Unit | P0 | — |

### 11.2 Users Tab

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 11.2.1 | Users table loads and displays user list | Integration | P0 | — |
| 11.2.2 | Search input filters users (debounced) | Integration | P0 | — |
| 11.2.3 | "Previous" pagination button works | Unit | P0 | — |
| 11.2.4 | "Next" pagination button works | Unit | P0 | — |
| 11.2.5 | Pagination buttons disabled at boundaries | Unit | P0 | — |
| 11.2.6 | "Add User" button toggles create form | Unit | P0 | — |
| 11.2.7 | Display name input in create form | Unit | P0 | — |
| 11.2.8 | Role dropdown in create form | Unit | P0 | — |
| 11.2.9 | Submit creates user via API | Integration | P0 | — |
| 11.2.10 | Submit disabled if name empty or creating | Unit | P0 | — |
| 11.2.11 | Per-user role dropdown changes role via API | Integration | P0 | — |
| 11.2.12 | "Deactivate" button deactivates user via API | Integration | P0 | — |
| 11.2.13 | "Reactivate" button reactivates user via API | Integration | P0 | — |
| 11.2.14 | Deactivated users show different styling | Unit | P1 | — |
| 11.2.15 | Status badge shows "Active" or "Inactive" | Unit | P1 | — |
| 11.2.16 | E2E: Create user, change role, deactivate | E2E | P1 | — |

### 11.3 Groups Tab

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 11.3.1 | Groups list loads from API | Integration | P0 | — |
| 11.3.2 | "Create Group" button toggles form | Unit | P0 | — |
| 11.3.3 | Group name and description inputs work | Unit | P0 | — |
| 11.3.4 | Create group calls API | Integration | P0 | — |
| 11.3.5 | Submit disabled if name empty or creating | Unit | P0 | — |
| 11.3.6 | Group header click expands/collapses (shows members) | Unit | P0 | — |
| 11.3.7 | Expand indicator shows correct arrow direction | Unit | P1 | — |
| 11.3.8 | "Delete" button deletes group via API | Integration | P0 | — |
| 11.3.9 | Members listed when expanded | Unit | P0 | — |
| 11.3.10 | "Remove" button removes member via API | Integration | P0 | — |
| 11.3.11 | "+ Add member" button opens member search | Unit | P0 | — |
| 11.3.12 | Member search input triggers debounced search | Integration | P0 | — |
| 11.3.13 | Clicking search result adds member via API | Integration | P0 | — |
| 11.3.14 | "Cancel" button resets search state | Unit | P0 | — |
| 11.3.15 | E2E: Create group, add members, remove member, delete group | E2E | P1 | — |

### 11.4 Roles Tab

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 11.4.1 | Roles matrix displayed (read-only) | Unit | P1 | — |
| 11.4.2 | All 5 roles shown with correct capabilities | Unit | P1 | — |

---

## 12. DOCUMENT TREE (Sidebar Navigation)

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 12.1 | Tree items render for documents and folders | Unit | P0 | — |
| 12.2 | Clicking document item calls `onSelect()` | Unit | P0 | — |
| 12.3 | Clicking folder item calls `onToggle()` to expand/collapse | Unit | P0 | — |
| 12.4 | Toggle arrow shows correct direction | Unit | P1 | — |
| 12.5 | Right-click shows context menu | Unit | P0 | — |
| 12.6 | Context menu "Rename" enters rename mode | Unit | P0 | — |
| 12.7 | Rename input pre-filled with current name | Unit | P0 | — |
| 12.8 | Rename input: Enter submits rename | Unit | P0 | — |
| 12.9 | Rename input: Escape cancels rename | Unit | P0 | — |
| 12.10 | Rename input: blur submits rename | Unit | P0 | — |
| 12.11 | "Move to space" context menu shows space selector | Unit | P1 | — |
| 12.12 | Drag start on item stores `draggedItem` | Unit | P1 | — |
| 12.13 | Drag over folder shows visual feedback | Unit | P1 | — |
| 12.14 | Drop on folder calls `onMoveDocument()` | Unit | P1 | — |
| 12.15 | Drag end clears drag state | Unit | P1 | — |
| 12.16 | "+" button on folder calls `onCreateDocument(folderId)` | Unit | P0 | — |
| 12.17 | Status legend info button toggles legend visibility | Unit | P1 | — |
| 12.18 | Legend closes on mouse leave | Unit | P1 | — |
| 12.19 | Badge tooltips show on hover after 300ms | Unit | P2 | — |
| 12.20 | E2E: Navigate tree, rename document, drag to folder | E2E | P1 | — |

---

## 13. SEARCH BAR

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 13.1 | Search input accepts text | Unit | P0 | — |
| 13.2 | Dropdown opens after typing 2+ characters | Unit | P0 | — |
| 13.3 | Debounced search (300ms delay) | Unit | P0 | — |
| 13.4 | Filter pills: "All", "Document", "Thread", "Decision" | Unit | P0 | — |
| 13.5 | Clicking filter pill sets filter type | Unit | P0 | — |
| 13.6 | ArrowDown moves active index down in results | Unit | P0 | — |
| 13.7 | ArrowUp moves active index up | Unit | P0 | — |
| 13.8 | Enter navigates to selected result | Unit | P0 | — |
| 13.9 | Escape closes dropdown | Unit | P0 | — |
| 13.10 | Clicking result navigates to it | Unit | P0 | — |
| 13.11 | MouseEnter on result updates active index | Unit | P1 | — |
| 13.12 | Focus on input opens dropdown if query >= 2 chars | Unit | P1 | — |
| 13.13 | Outside click closes dropdown | Unit | P0 | — |
| 13.14 | Results show snippet with highlighted matches | Unit | P1 | — |
| 13.15 | Loading state shown during search | Unit | P1 | — |
| 13.16 | Error state shown on search failure | Unit | P1 | — |
| 13.17 | E2E: Search for document, click result, verify navigation | E2E | P1 | — |

---

## 14. SHARED DOCUMENT PAGE (`/share/:token`)

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 14.1 | Loading state shows "Loading shared document..." | Unit | P0 | — |
| 14.2 | Error state shows error message | Unit | P0 | — |
| 14.3 | Ready state shows document content with metadata | Unit | P0 | — |
| 14.4 | Auto-fetches document on mount using token param | Integration | P0 | — |
| 14.5 | Document is read-only (no editing) | Unit | P0 | — |
| 14.6 | E2E: Access shared document via public link | E2E | P1 | — |

---

## 15. EXPORT MENU

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 15.1 | "Export" button toggles dropdown | Unit | P0 | — |
| 15.2 | "Download as PDF" calls `exportDocument("pdf")` | Integration | P0 | — |
| 15.3 | "Download as DOCX" calls `exportDocument("docx")` | Integration | P0 | — |
| 15.4 | Shows loading state during export | Unit | P1 | — |
| 15.5 | Error shown on export failure | Unit | P0 | — |
| 15.6 | Auto-downloads file on success | Integration | P0 | — |
| 15.7 | E2E: Export document as PDF and DOCX | E2E | P1 | — |

---

## 16. REUSABLE UI COMPONENTS

### 16.1 Dialog

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 16.1.1 | Escape key calls `onClose()` | Unit | P0 | — |
| 16.1.2 | Overlay click calls `onClose()` | Unit | P0 | — |
| 16.1.3 | Close button (x) calls `onClose()` | Unit | P0 | — |
| 16.1.4 | Body overflow set to hidden when open | Unit | P1 | — |
| 16.1.5 | Focus trap prevents tab outside dialog | Unit | P1 | — |
| 16.1.6 | Cleanup runs on unmount | Unit | P1 | — |

### 16.2 Button

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 16.2.1 | "primary" variant applies primary styling | Unit | P1 | — |
| 16.2.2 | "ghost" variant applies ghost styling | Unit | P1 | — |
| 16.2.3 | HTML button attributes passed through | Unit | P1 | — |

### 16.3 Tabs (Accessible)

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 16.3.1 | Tabs render with correct ARIA roles | Unit | P0 | — |
| 16.3.2 | Clicking tab calls `onTabChange` | Unit | P0 | — |
| 16.3.3 | ArrowRight/Down moves to next tab | Unit | P0 | — |
| 16.3.4 | ArrowLeft/Up moves to previous tab | Unit | P0 | — |
| 16.3.5 | Home goes to first tab | Unit | P1 | — |
| 16.3.6 | End goes to last tab | Unit | P1 | — |
| 16.3.7 | Auto-focus on selected tab after navigation | Unit | P1 | — |

### 16.4 StatusPill

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 16.4.1 | Each variant renders correct CSS class | Unit | P1 | — |

### 16.5 EmptyState

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 16.5.1 | Loading variant shows skeleton | Unit | P1 | — |
| 16.5.2 | Error variant shows error icon | Unit | P1 | — |
| 16.5.3 | Empty variant shows info icon | Unit | P1 | — |
| 16.5.4 | Primary action button fires callback | Unit | P0 | — |
| 16.5.5 | "Go back" button navigates back | Unit | P1 | — |
| 16.5.6 | "Go to Documents" fallback link works | Unit | P1 | — |

### 16.6 Presence Bar

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 16.6.1 | Shows connected user avatars | Unit | P1 | — |
| 16.6.2 | Limits display to 5 users | Unit | P1 | — |
| 16.6.3 | Shows "X online" count | Unit | P1 | — |

---

## 17. GO API BACKEND

### 17.1 Auth Endpoints

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 17.1.1 | POST /api/auth/signup - creates user with hashed password | Integration | P0 | — |
| 17.1.2 | POST /api/auth/signup - rejects duplicate email (409) | Integration | P0 | — |
| 17.1.3 | POST /api/auth/signup - returns devVerificationToken in dev mode | Integration | P1 | — |
| 17.1.4 | POST /api/auth/signin - returns tokens on valid credentials | Integration | P0 | — |
| 17.1.5 | POST /api/auth/signin - returns 401 on invalid credentials | Integration | P0 | — |
| 17.1.6 | POST /api/auth/signin - returns 403 if email not verified | Integration | P0 | — |
| 17.1.7 | POST /api/auth/verify-email - marks email as verified | Integration | P0 | — |
| 17.1.8 | POST /api/auth/verify-email - rejects invalid/expired token | Integration | P0 | — |
| 17.1.9 | POST /api/auth/reset-password/request - creates reset token | Integration | P0 | — |
| 17.1.10 | POST /api/auth/reset-password - resets password with valid token | Integration | P0 | — |
| 17.1.11 | POST /api/auth/reset-password - rejects invalid token | Integration | P0 | — |
| 17.1.12 | All auth endpoints return 503 if auth not configured | Integration | P1 | — |

### 17.2 Session Endpoints

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 17.2.1 | GET /api/session - returns auth status | Integration | P0 | — |
| 17.2.2 | POST /api/session/login - demo mode login | Integration | P0 | — |
| 17.2.3 | POST /api/session/logout - clears session | Integration | P0 | — |
| 17.2.4 | POST /api/session/refresh - refreshes access token | Integration | P0 | — |
| 17.2.5 | POST /api/session/refresh - rejects invalid refresh token | Integration | P0 | — |

### 17.3 Document CRUD

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 17.3.1 | GET /api/documents - lists user's documents | Integration | P0 | — |
| 17.3.2 | POST /api/documents - creates document (title, spaceId) | Integration | P0 | — |
| 17.3.3 | PUT /api/documents/{id} - renames document | Integration | P0 | — |
| 17.3.4 | POST /api/documents/{id}/move - moves document to space | Integration | P0 | — |
| 17.3.5 | GET /api/workspace/{id} - returns full workspace payload | Integration | P0 | — |
| 17.3.6 | GET /api/workspace/{id}?view=published - returns read-only main branch | Integration | P0 | — |
| 17.3.7 | POST /api/workspace/{id} - saves document content | Integration | P0 | — |
| 17.3.8 | All document endpoints check permissions | Integration | P0 | — |
| 17.3.9 | Returns 404 for non-existent documents | Integration | P0 | — |
| 17.3.10 | Returns 403 for insufficient permissions | Integration | P0 | — |

### 17.4 Proposal/Branch Endpoints

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 17.4.1 | POST /api/documents/{id}/proposals - creates proposal branch | Integration | P0 | — |
| 17.4.2 | POST /api/documents/{id}/proposals/{pid}/submit - submits for review | Integration | P0 | — |
| 17.4.3 | POST /api/documents/{id}/proposals/{pid}/merge - merges proposal | Integration | P0 | — |
| 17.4.4 | Merge blocked when gates not met | Integration | P0 | — |
| 17.4.5 | Merge performs three-way git merge | Integration | P0 | — |
| 17.4.6 | Conflict detection blocks merge | Integration | P1 | — |
| 17.4.7 | Successful merge deletes proposal branch | Integration | P0 | — |

### 17.5 Approval Endpoints

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 17.5.1 | GET /api/documents/{id}/approval-rules - returns rules | Integration | P0 | — |
| 17.5.2 | PUT /api/documents/{id}/approval-rules - saves rules | Integration | P0 | — |
| 17.5.3 | POST .../group-approvals - approves for group | Integration | P0 | — |
| 17.5.4 | POST .../group-approvals (rejected) - rejects for group | Integration | P0 | — |
| 17.5.5 | GET /api/approvals - returns approval queue | Integration | P0 | — |
| 17.5.6 | Sequential mode blocks out-of-order approvals | Integration | P0 | — |
| 17.5.7 | Stale approvals detected after new commits | Integration | P1 | — |

### 17.6 Thread/Deliberation Endpoints

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 17.6.1 | POST .../threads - creates thread with anchor | Integration | P0 | — |
| 17.6.2 | POST .../threads/{tid}/replies - adds reply | Integration | P0 | — |
| 17.6.3 | POST .../threads/{tid}/vote - records up/down vote | Integration | P0 | — |
| 17.6.4 | POST .../threads/{tid}/reactions - adds reaction | Integration | P1 | — |
| 17.6.5 | POST .../threads/{tid}/resolve - resolves thread | Integration | P0 | — |
| 17.6.6 | POST .../threads/{tid}/reopen - reopens thread | Integration | P0 | — |
| 17.6.7 | POST .../threads/{tid}/visibility - changes visibility | Integration | P0 | — |
| 17.6.8 | Thread visibility filtering (INTERNAL vs EXTERNAL) | Integration | P0 | — |

### 17.7 History & Comparison

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 17.7.1 | GET /api/documents/{id}/history - returns commit history | Integration | P0 | — |
| 17.7.2 | GET /api/documents/{id}/compare - returns field diffs | Integration | P0 | — |
| 17.7.3 | GET /api/documents/{id}/blame - returns attribution entries | Integration | P0 | — |
| 17.7.4 | History includes proposal-specific commits when proposalId given | Integration | P0 | — |

### 17.8 Decision Log & Search

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 17.8.1 | GET /api/documents/{id}/decision-log - returns decisions | Integration | P0 | — |
| 17.8.2 | Decision log filters: proposalId, outcome, query, author, limit | Integration | P1 | — |
| 17.8.3 | GET /api/search - returns global search results | Integration | P0 | — |
| 17.8.4 | Search filters: type, spaceId, limit, offset | Integration | P1 | — |

### 17.9 Change Review

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 17.9.1 | POST .../changes/{cid}/review - sets review state | Integration | P0 | — |
| 17.9.2 | GET .../changes/review-states - returns current states | Integration | P0 | — |
| 17.9.3 | Review states: accepted, rejected, deferred | Integration | P0 | — |

### 17.10 Export

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 17.10.1 | POST /api/documents/{id}/export format=pdf - returns PDF blob | Integration | P0 | — |
| 17.10.2 | POST /api/documents/{id}/export format=docx - returns DOCX blob | Integration | P0 | — |
| 17.10.3 | Export with includeThreads option | Integration | P1 | — |

### 17.11 Space Endpoints

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 17.11.1 | GET /api/workspaces - returns workspace and spaces | Integration | P0 | — |
| 17.11.2 | POST /api/spaces - creates space | Integration | P0 | — |
| 17.11.3 | PUT /api/spaces/{id} - updates space (name, description, visibility) | Integration | P0 | — |
| 17.11.4 | GET /api/spaces/{id}/documents - lists space documents | Integration | P0 | — |

### 17.12 Permission Endpoints

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 17.12.1 | GET /api/documents/{id}/share - returns share info | Integration | P0 | — |
| 17.12.2 | POST /api/documents/{id}/permissions - grants permission | Integration | P0 | — |
| 17.12.3 | DELETE /api/documents/{id}/permissions/{userId} - revokes permission | Integration | P0 | — |
| 17.12.4 | GET /api/documents/{id}/share/search - searches candidates | Integration | P0 | — |
| 17.12.5 | POST /api/documents/{id}/public-links - creates public link | Integration | P0 | — |
| 17.12.6 | DELETE /api/documents/{id}/public-links/{linkId} - revokes link | Integration | P0 | — |
| 17.12.7 | GET /api/share/{token} - fetches shared document (no auth) | Integration | P0 | — |
| 17.12.8 | GET /api/spaces/{id}/permissions - returns space permissions | Integration | P0 | — |
| 17.12.9 | POST /api/spaces/{id}/permissions - grants space permission | Integration | P0 | — |
| 17.12.10 | DELETE /api/spaces/{id}/permissions/{permId} - revokes | Integration | P0 | — |
| 17.12.11 | POST /api/spaces/{id}/guests - invites guest | Integration | P0 | — |
| 17.12.12 | DELETE /api/spaces/{id}/guests/{userId} - removes guest | Integration | P0 | — |

### 17.13 Admin Endpoints

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 17.13.1 | GET /api/admin/users - lists all users (admin only) | Integration | P0 | — |
| 17.13.2 | POST /api/admin/users - creates user (admin only) | Integration | P0 | — |
| 17.13.3 | PUT /api/admin/users/{id}/role - changes role | Integration | P0 | — |
| 17.13.4 | PUT /api/admin/users/{id}/status - activates/deactivates | Integration | P0 | — |
| 17.13.5 | All admin endpoints return 403 for non-admin | Integration | P0 | — |

### 17.14 Group Endpoints

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 17.14.1 | GET /api/workspaces/{id}/groups - lists groups | Integration | P0 | — |
| 17.14.2 | POST /api/workspaces/{id}/groups - creates group | Integration | P0 | — |
| 17.14.3 | PUT /api/groups/{id} - updates group | Integration | P0 | — |
| 17.14.4 | DELETE /api/groups/{id} - deletes group | Integration | P0 | — |
| 17.14.5 | GET /api/groups/{id}/members - lists members | Integration | P0 | — |
| 17.14.6 | POST /api/groups/{id}/members - adds member | Integration | P0 | — |
| 17.14.7 | DELETE /api/groups/{id}/members/{userId} - removes member | Integration | P0 | — |

### 17.15 Upload Endpoints

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 17.15.1 | POST /api/documents/{id}/uploads - uploads image to S3 | Integration | P0 | — |
| 17.15.2 | GET /api/uploads/{key} - serves uploaded file | Integration | P0 | — |
| 17.15.3 | Upload validates file type | Integration | P1 | — |

### 17.16 RBAC Service

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 17.16.1 | `rbac.Can(viewer, read)` returns true | Unit | P0 | — |
| 17.16.2 | `rbac.Can(viewer, write)` returns false | Unit | P0 | — |
| 17.16.3 | `rbac.Can(editor, approve)` returns true | Unit | P0 | — |
| 17.16.4 | `rbac.Can(admin, admin)` returns true | Unit | P0 | — |
| 17.16.5 | Full role hierarchy matrix tested | Unit | P0 | — |
| 17.16.6 | `GetEffectiveRole()` resolves document_permissions over workspace_memberships | Unit | P0 | — |
| 17.16.7 | `GetEffectiveRole()` returns no access for external without grant | Unit | P0 | — |
| 17.16.8 | Time-limited grants expire correctly | Unit | P0 | — |
| 17.16.9 | Permission denial logged to `permission_denials` table | Integration | P0 | — |
| 17.16.10 | `forbid()` returns standardized 403 response | Unit | P0 | — |

---

## 18. API CLIENT (Frontend)

### 18.1 Core Request Handling

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 18.1.1 | `apiRequest` adds Authorization header when token exists | Unit | P0 | — |
| 18.1.2 | `apiRequest` adds Content-Type for POST/PUT/DELETE | Unit | P0 | — |
| 18.1.3 | `apiRequest` attempts token refresh on 401 | Unit | P0 | — |
| 18.1.4 | `apiRequest` clears auth on refresh failure | Unit | P0 | — |
| 18.1.5 | `apiRequest` does NOT refresh on login/refresh paths | Unit | P0 | — |
| 18.1.6 | Error responses parsed with `error`, `code`, `details` | Unit | P0 | — |
| 18.1.7 | Network errors mapped to `NETWORK_ERROR` code | Unit | P0 | — |

### 18.2 Token Management

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 18.2.1 | `setToken` persists to localStorage | Unit | P0 | — |
| 18.2.2 | `getToken` retrieves from localStorage | Unit | P0 | — |
| 18.2.3 | `clearToken` removes from localStorage | Unit | P0 | — |
| 18.2.4 | `clearAuthStorage` clears all auth keys | Unit | P0 | — |
| 18.2.5 | `getLocalUser` and `setLocalUser` manage demo mode | Unit | P1 | — |

### 18.3 Error Mapping

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 18.3.1 | `codeFromStatus(401)` returns "AUTH_REQUIRED" | Unit | P0 | PASS |
| 18.3.2 | `codeFromStatus(403)` returns "FORBIDDEN" | Unit | P0 | PASS |
| 18.3.3 | `codeFromStatus(404)` returns "NOT_FOUND" | Unit | P0 | PASS |
| 18.3.4 | `isApiError` correctly identifies ApiError instances | Unit | P0 | PASS |
| 18.3.5 | `parseApiErrorCode` validates known codes | Unit | P0 | PASS |

---

## 19. SCHEMA & CONTENT CONVERSION

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 19.1 | `legacyContentToDoc()` converts flat fields to ProseMirror JSON | Unit | P0 | PASS |
| 19.2 | `legacyContentToDoc()` creates h1, subtitle p, section headings | Unit | P0 | PASS |
| 19.3 | `legacyContentToDoc()` assigns stable nodeIds from map | Unit | P0 | PASS |
| 19.4 | `legacyContentToDoc()` generates UUIDs when no map given | Unit | P0 | PASS |
| 19.5 | `docToLegacyContent()` extracts title from h1 | Unit | P0 | PASS |
| 19.6 | `docToLegacyContent()` extracts purpose, tiers, enforce by section headings | Unit | P0 | PASS |
| 19.7 | `extractText()` recursively gets text from nested nodes | Unit | P0 | PASS |
| 19.8 | Round-trip: legacy -> doc -> legacy preserves content | Unit | P0 | PASS |

---

## 20. METRICS LIBRARY

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 20.1 | `startReviewSession()` creates session event | Unit | P0 | PASS |
| 20.2 | `endReviewSession()` records duration and review stats | Unit | P0 | PASS |
| 20.3 | `hasActiveSession()` returns correct boolean | Unit | P0 | PASS |
| 20.4 | `trackNavigatorChangeClick()` logs navigation event | Unit | P0 | PASS |
| 20.5 | `trackChangeAction()` logs accept/reject/defer | Unit | P0 | PASS |
| 20.6 | `trackMergeAttempt()` logs merge initiation | Unit | P0 | PASS |
| 20.7 | `trackMergeCompleted()` logs successful merge | Unit | P0 | PASS |
| 20.8 | `trackMergeBlocked()` logs blocked merge with reason | Unit | P0 | PASS |
| 20.9 | `queryMetrics()` computes KPIs from event data | Unit | P0 | PASS |
| 20.10 | `getEvents()` returns stored events | Unit | P0 | PASS |
| 20.11 | `clearEvents()` wipes all events | Unit | P0 | PASS |
| 20.12 | `exportMetrics()` returns valid JSON | Unit | P0 | PASS |
| 20.13 | Events persisted to localStorage | Unit | P0 | PASS |
| 20.14 | Circular buffer respects MAX_EVENTS (10,000) | Unit | P1 | — |

---

## 21. REAL-TIME SYNC

| # | Test Case | Layer | Priority | Status |
|---|-----------|-------|----------|--------|
| 21.1 | `connectWorkspaceRealtime()` creates WebSocket with token | Unit | P0 | — |
| 21.2 | Returns null if no token | Unit | P0 | — |
| 21.3 | `onEvent` callback receives parsed events | Unit | P0 | — |
| 21.4 | `onClose` callback fires on disconnect | Unit | P0 | — |
| 21.5 | `sendWorkspaceRealtimeUpdate()` sends doc_update frame | Unit | P0 | — |
| 21.6 | Handles "connected" event type | Unit | P0 | — |
| 21.7 | Handles "presence" event type (joined/left) | Unit | P0 | — |
| 21.8 | Handles "snapshot" event type | Unit | P0 | — |
| 21.9 | Handles "document_update" event type | Unit | P0 | — |

---

## 22. E2E USER JOURNEYS (Playwright, Real Backend)

These are the critical end-to-end flows testing complete user paths:

| # | Journey | Priority | Status |
|---|---------|----------|--------|
| 22.1 | **New user onboarding**: Sign up -> verify email -> sign in -> create first document | P0 | — |
| 22.2 | **Document authoring**: Create doc -> write content -> format text -> add headings/lists -> save | P0 | — |
| 22.3 | **Proposal lifecycle**: Create proposal -> edit -> request review -> approve -> merge | P0 | — |
| 22.4 | **Deliberation flow**: Open thread -> reply -> vote -> resolve with outcome -> verify in decisions | P0 | — |
| 22.5 | **Change review flow**: Compare versions -> navigate changes -> accept/reject/defer each -> merge | P0 | — |
| 22.6 | **Sharing & permissions**: Share doc with user -> create public link -> access via link -> revoke | P0 | — |
| 22.7 | **Admin management**: Create user -> change role -> create group -> add members -> deactivate user | P1 | — |
| 22.8 | **Space organization**: Create space -> move docs to space -> update space settings -> delete space | P1 | — |
| 22.9 | **Search workflow**: Create content -> search for it -> click result -> verify navigation | P1 | — |
| 22.10 | **Export workflow**: Open document -> export as PDF -> export as DOCX -> verify downloads | P1 | — |
| 22.11 | **Blame attribution**: Edit document -> check blame view -> verify author shown -> click to commit | P1 | — |
| 22.12 | **Branch visualization**: Create proposals -> view branch graph -> verify topology | P2 | — |
| 22.13 | **Approval rules config**: Set parallel mode -> add groups -> set thresholds -> save -> verify enforcement | P1 | — |
| 22.14 | **Multi-user collaboration**: Two users edit simultaneously -> verify sync -> check presence bar | P1 | — |
| 22.15 | **Password reset flow**: Forgot password -> receive token -> reset -> sign in with new password | P1 | — |
| 22.16 | **Guest access**: Invite guest to space -> guest accesses via link -> verify restricted permissions | P2 | — |
| 22.17 | **Document tree operations**: Rename doc -> drag to folder -> context menu actions | P1 | — |
| 22.18 | **Editor slash commands**: Type "/" -> navigate menu -> insert each block type -> verify rendering | P1 | — |
| 22.19 | **Find & replace**: Write content -> find text -> replace single -> replace all -> verify | P1 | — |
| 22.20 | **Suggestion mode**: Enable -> type text -> delete text -> accept suggestions -> reject suggestions | P1 | — |

---

## TOTALS

| Category | Test Cases | Status |
|----------|-----------|--------|
| Authentication (1.x) | 53 | — |
| Navigation & Routing (2.x) | 15 | — |
| Documents Page (3.x) | 38 | — |
| Workspace / Editor (4.x) | 115 | — |
| Sidebar Tabs (5.x) | 51 | — |
| Diff Views (6.x) | 19 | 7 PASS |
| Proposals & Merge (7.x) | 13 | — |
| Approval Rules Editor (8.x) | 16 | — |
| Share Dialog (9.x) | 21 | — |
| Approvals Page (10.x) | 12 | — |
| Settings Page (11.x) | 24 | — |
| Document Tree (12.x) | 20 | — |
| Search Bar (13.x) | 17 | — |
| Shared Document (14.x) | 6 | — |
| Export Menu (15.x) | 7 | — |
| Reusable UI Components (16.x) | 19 | — |
| Go API Backend (17.x) | 82 | — |
| API Client Frontend (18.x) | 12 | 5 PASS |
| Schema & Conversion (19.x) | 8 | 8 PASS |
| Metrics Library (20.x) | 14 | 13 PASS |
| Real-time Sync (21.x) | 9 | — |
| E2E User Journeys (22.x) | 20 | — |

**GRAND TOTAL: ~591 test cases**

---

## IMPLEMENTATION ORDER (Recommended)

### Sprint 1: Test Infrastructure + Highest ROI
1. Set up Vitest for frontend, Go test harness for backend
2. RBAC service unit tests (17.16.x) — pure logic, highest risk
3. Schema conversion unit tests (19.x) — pure functions
4. API client core tests (18.x) — request/error handling
5. Metrics library tests (20.x) — pure functions

### Sprint 2: API Integration Tests
6. Auth endpoints (17.1-17.2)
7. Document CRUD (17.3)
8. Proposal/merge endpoints (17.4-17.5)
9. Thread endpoints (17.6)
10. Permission endpoints (17.12-17.13)

### Sprint 3: Frontend Component Tests
11. Editor extensions (4.5-4.8, 4.6)
12. Diff computation (6.4)
13. Find & replace (4.4)
14. Slash commands (4.3)
15. Dialog, Tabs, EmptyState (16.x)

### Sprint 4: Integration & Page Tests
16. Auth pages (1.x)
17. Documents page (3.x)
18. Workspace page loading (4.1)
19. Settings page (11.x)
20. Search bar (13.x)

### Sprint 5: E2E Journeys
21. Critical path E2E tests (22.1-22.6)
22. Secondary E2E tests (22.7-22.20)

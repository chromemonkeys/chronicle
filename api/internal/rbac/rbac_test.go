package rbac

import "testing"

func TestCan(t *testing.T) {
	cases := []struct {
		name   string
		role   Role
		action Action
		allow  bool
	}{
		{name: "viewer read", role: RoleViewer, action: ActionRead, allow: true},
		{name: "viewer comment denied", role: RoleViewer, action: ActionComment, allow: false},
		{name: "viewer write denied", role: RoleViewer, action: ActionWrite, allow: false},
		{name: "viewer approve denied", role: RoleViewer, action: ActionApprove, allow: false},
		{name: "viewer admin denied", role: RoleViewer, action: ActionAdmin, allow: false},

		{name: "commenter read", role: RoleCommenter, action: ActionRead, allow: true},
		{name: "commenter comment", role: RoleCommenter, action: ActionComment, allow: true},
		{name: "commenter write denied", role: RoleCommenter, action: ActionWrite, allow: false},
		{name: "commenter approve denied", role: RoleCommenter, action: ActionApprove, allow: false},
		{name: "commenter admin denied", role: RoleCommenter, action: ActionAdmin, allow: false},

		{name: "editor read", role: RoleEditor, action: ActionRead, allow: true},
		{name: "editor comment", role: RoleEditor, action: ActionComment, allow: true},
		{name: "editor write", role: RoleEditor, action: ActionWrite, allow: true},
		{name: "editor approve", role: RoleEditor, action: ActionApprove, allow: true},
		{name: "editor admin denied", role: RoleEditor, action: ActionAdmin, allow: false},

		{name: "admin read", role: RoleAdmin, action: ActionRead, allow: true},
		{name: "admin comment", role: RoleAdmin, action: ActionComment, allow: true},
		{name: "admin write", role: RoleAdmin, action: ActionWrite, allow: true},
		{name: "admin approve", role: RoleAdmin, action: ActionApprove, allow: true},
		{name: "admin admin", role: RoleAdmin, action: ActionAdmin, allow: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Can(tc.role, tc.action); got != tc.allow {
				t.Fatalf("Can(%q, %q) = %v, want %v", tc.role, tc.action, got, tc.allow)
			}
		})
	}
}

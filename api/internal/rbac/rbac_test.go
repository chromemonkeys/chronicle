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
		{name: "viewer write", role: RoleViewer, action: ActionWrite, allow: false},
		{name: "viewer comment", role: RoleViewer, action: ActionComment, allow: false},
		{name: "editor approve", role: RoleEditor, action: ActionApprove, allow: true},
		{name: "commenter read", role: RoleCommenter, action: ActionRead, allow: true},
		{name: "commenter comment", role: RoleCommenter, action: ActionComment, allow: true},
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

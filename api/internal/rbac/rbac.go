package rbac

type Role string
type Action string

const (
	RoleViewer    Role = "viewer"
	RoleCommenter Role = "commenter"
	RoleEditor    Role = "editor"
	RoleAdmin     Role = "admin"
)

const (
	ActionRead    Action = "read"
	ActionComment Action = "comment"
	ActionWrite   Action = "write"
	ActionApprove Action = "approve"
	ActionAdmin   Action = "admin"
)

func Can(role Role, action Action) bool {
	switch role {
	case RoleAdmin:
		return true
	case RoleEditor:
		return action == ActionRead || action == ActionComment || action == ActionWrite || action == ActionApprove
	case RoleCommenter:
		return action == ActionRead || action == ActionComment
	case RoleViewer:
		return action == ActionRead
	default:
		return false
	}
}

func Normalize(role string) Role {
	switch Role(role) {
	case RoleViewer, RoleCommenter, RoleEditor, RoleAdmin:
		return Role(role)
	default:
		return RoleViewer
	}
}

package app

import "fmt"

type DomainError struct {
	Status  int
	Code    string
	Message string
	Details any
}

func (e *DomainError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func domainError(status int, code, message string, details any) *DomainError {
	return &DomainError{
		Status:  status,
		Code:    code,
		Message: message,
		Details: details,
	}
}

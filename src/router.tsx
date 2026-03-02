import { Navigate, createBrowserRouter } from "react-router-dom";
import { AppShell } from "./ui/AppShell";
import { ApprovalsPage } from "./views/ApprovalsPage";
import { DocumentsPage } from "./views/DocumentsPage";
import { ForgotPasswordPage } from "./views/ForgotPasswordPage";
import { NotFoundPage } from "./views/NotFoundPage";
import { ResetPasswordPage } from "./views/ResetPasswordPage";
import { SettingsPage } from "./views/SettingsPage";
import { SignInPage } from "./views/SignInPage";
import { VerificationPendingPage } from "./views/VerificationPendingPage";
import { VerifyEmailPage } from "./views/VerifyEmailPage";
import { WorkspacePage } from "./views/WorkspacePage";

export const router = createBrowserRouter([
  {
    path: "/sign-in",
    element: <SignInPage />
  },
  {
    path: "/verify-email",
    element: <VerifyEmailPage />
  },
  {
    path: "/verify-email-pending",
    element: <VerificationPendingPage />
  },
  {
    path: "/forgot-password",
    element: <ForgotPasswordPage />
  },
  {
    path: "/reset-password",
    element: <ResetPasswordPage />
  },
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/documents" replace /> },
      { path: "documents", element: <DocumentsPage /> },
      { path: "spaces/:spaceId", element: <DocumentsPage /> },
      { path: "workspace/:docId", element: <WorkspacePage /> },
      { path: "approvals", element: <ApprovalsPage /> },
      { path: "settings", element: <SettingsPage /> }
    ]
  },
  {
    path: "*",
    element: <NotFoundPage />
  }
]);

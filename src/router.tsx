import { Navigate, createBrowserRouter } from "react-router-dom";
import { AppShell } from "./ui/AppShell";
import { ApprovalsPage } from "./views/ApprovalsPage";
import { DocumentsPage } from "./views/DocumentsPage";
import { NotFoundPage } from "./views/NotFoundPage";
import { SignInPage } from "./views/SignInPage";
import { WorkspacePage } from "./views/WorkspacePage";

export const router = createBrowserRouter([
  {
    path: "/sign-in",
    element: <SignInPage />
  },
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/documents" replace /> },
      { path: "documents", element: <DocumentsPage /> },
      { path: "spaces/:spaceId", element: <DocumentsPage /> },
      { path: "workspace/:docId", element: <WorkspacePage /> },
      { path: "approvals", element: <ApprovalsPage /> }
    ]
  },
  {
    path: "*",
    element: <NotFoundPage />
  }
]);

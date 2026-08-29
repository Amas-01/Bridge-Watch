import { Navigate, Outlet } from "react-router-dom";
import { useSessionValidation } from "../hooks/useSessionValidation";

/**
 * Gates its child routes on initial session-token verification
 * (useSessionValidation). While that check is in flight, renders a
 * full-page loading skeleton instead of the route tree -- this is what
 * prevents the brief flash of unauthenticated/landing content described
 * in issue #931. Once verification resolves, either renders the nested
 * routes (Outlet) or redirects to "/" if there's no valid session.
 */
export default function ProtectedRoute() {
  const { status } = useSessionValidation();

  if (status === "loading") {
    return <FullPageLoadingSkeleton />;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function FullPageLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Verifying session"
      className="min-h-screen bg-stellar-dark flex flex-col"
    >
      <div className="h-16 border-b border-stellar-border bg-stellar-card flex items-center px-6">
        <div className="h-6 w-32 rounded bg-stellar-border animate-pulse" />
      </div>
      <div className="flex-1 p-6 space-y-4">
        <div className="h-8 w-64 rounded bg-stellar-border animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-24 rounded-xl bg-stellar-card border border-stellar-border animate-pulse" />
          <div className="h-24 rounded-xl bg-stellar-card border border-stellar-border animate-pulse" />
          <div className="h-24 rounded-xl bg-stellar-card border border-stellar-border animate-pulse" />
        </div>
        <div className="h-64 rounded-xl bg-stellar-card border border-stellar-border animate-pulse" />
      </div>
      <span className="sr-only">Verifying your session…</span>
    </div>
  );
}

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      const path = typeof window !== "undefined" ? window.location.pathname : "/dashboard";
      navigate({ to: "/auth", search: { redirect: path }, replace: true });
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (profile && !profile.active) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-bold">الحساب معطّل / Account disabled</h1>
          <p className="text-sm text-muted-foreground mt-2">راجع المسؤول / Contact admin</p>
        </div>
      </div>
    );
  }

  return <AppShell><Outlet /></AppShell>;
}

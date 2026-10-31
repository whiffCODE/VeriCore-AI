import type { ReactNode } from "react";
import { ProtectedRoute } from "@/components/auth/protected-route";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

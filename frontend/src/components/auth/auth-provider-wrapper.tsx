"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/auth-provider";

export function AuthProviderWrapper({
  children,
}: {
  children: ReactNode;
}) {
  return <AuthProvider>{children}</AuthProvider>;
}

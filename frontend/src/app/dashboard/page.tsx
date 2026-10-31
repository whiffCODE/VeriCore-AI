"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  async function handleLogout() {
    await signOut();
    router.replace("/login");
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">VeriCore AI</p>
          <h1 className="text-3xl font-semibold">
            Welcome, {user?.firstName}
          </h1>
        </div>
        <Button variant="outline" onClick={handleLogout}>
          Sign out
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Your workspace</CardTitle>
          <CardDescription>
            Your authenticated dashboard shell is ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Email:</strong> {user?.email}</p>
          <p><strong>Role:</strong> {user?.role}</p>
          <p className="text-muted-foreground">
            Knowledge search and billing features will be connected in their
            respective milestones.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

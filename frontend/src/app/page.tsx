import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const features = [
  {
    title: "Knowledge Assistant",
    description:
      "Ask questions about company SOPs and get evidence-backed answers.",
    status: "Core platform",
  },
  {
    title: "Subscription & Billing",
    description:
      "Manage your plan, payment methods, transaction history, and receipts.",
    status: "Phase 5J",
  },
  {
    title: "Admin Console",
    description:
      "Manage documents, users, billing, and reconciliation reports.",
    status: "Admin",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            VeriCore <span className="text-muted-foreground">AI</span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
  href="/login"
  className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
>
  Sign in
</Link>
            <Link
  href="/register"
  className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
>
  Get started
</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-20">
        <Badge variant="secondary">Enterprise Knowledge Platform</Badge>

        <div className="mt-6 max-w-3xl space-y-5">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            Company knowledge, with answers you can verify.
          </h1>

          <p className="max-w-2xl text-lg text-muted-foreground">
            Search your organization’s SOPs, get grounded answers with
            citations, and manage your knowledge workflows in one secure
            workspace.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
  href="/register"
  className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
>
  Start using VeriCore
</Link>
            <Link
  href="/pricing"
  className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
>
  View plans
</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-6 pb-20 md:grid-cols-3">
        {features.map((feature) => (
          <Card key={feature.title} className="h-full">
            <CardHeader>
              <Badge variant="outline" className="w-fit">
                {feature.status}
              </Badge>
              <CardTitle>{feature.title}</CardTitle>
              <CardDescription>{feature.description}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </section>

      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-6 py-6 text-sm text-muted-foreground">
          VeriCore AI · Enterprise knowledge, grounded in evidence.
        </div>
      </footer>
    </main>
  );
}

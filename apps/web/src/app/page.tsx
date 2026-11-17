
import {
  ArrowUpRight,
  Files,
  MessageSquare,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const metrics = [
  {
    label: "Documents",
    value: "00",
    description: "No documents indexed yet",
    icon: Files,
  },
  {
    label: "Conversations",
    value: "00",
    description: "Your knowledge sessions",
    icon: MessageSquare,
  },
  {
    label: "Verified answers",
    value: "00",
    description: "Evidence-grounded responses",
    icon: ShieldCheck,
  },
];

export default function Home() {
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-9">
        <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-medium tracking-[0.15em] text-muted-foreground">
              OVERVIEW / WORKSPACE
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Knowledge starts here.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Your enterprise knowledge workspace. Organize documents,
              discover connected information and build evidence-grounded
              answers.
            </p>
          </div>

          <Button disabled className="w-fit gap-2">
            <Upload size={16} />
            Upload documents
          </Button>
        </section>

        <Separator />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.map((metric) => {
            const Icon = metric.icon;

            return (
              <Card key={metric.label} className="rounded-lg shadow-none">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-sm font-medium">
                    {metric.label}
                  </CardTitle>
                  <Icon
                    size={18}
                    strokeWidth={1.6}
                    className="text-muted-foreground"
                  />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold tracking-tight">
                    {metric.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {metric.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Get started</CardTitle>
              <p className="text-sm text-muted-foreground">
                Your knowledge platform is being assembled.
              </p>
            </CardHeader>
            <CardContent>
              <div className="rounded-md bg-secondary/70 p-5 sm:p-7">
                <p className="text-xs font-medium tracking-wider text-muted-foreground">
                  FIRST STEP
                </p>
                <h2 className="mt-3 text-xl font-semibold tracking-tight">
                  Bring your knowledge together.
                </h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  Document ingestion, extraction, indexing and evidence
                  retrieval will become available as we implement the
                  processing pipeline.
                </p>
                <Button disabled variant="outline" className="mt-5 gap-2">
                  Explore document library
                  <ArrowUpRight size={15} />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Platform status</CardTitle>
              <p className="text-sm text-muted-foreground">
                Local development instance
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Frontend</span>
                <span className="text-xs font-medium">Running</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm">Document processing</span>
                <span className="text-xs text-muted-foreground">Not configured</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm">AI retrieval</span>
                <span className="text-xs text-muted-foreground">Not configured</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm">Authentication</span>
                <span className="text-xs text-muted-foreground">Not configured</span>
              </div>
            </CardContent>
          </Card>
        </section>

        <footer className="flex flex-col justify-between gap-2 border-t pt-5 text-[10px] tracking-wide text-muted-foreground sm:flex-row">
          <span>VERICORE AI 3.0</span>
          <span>Evidence before answers.</span>
        </footer>
      </div>
    </AppShell>
  );
}

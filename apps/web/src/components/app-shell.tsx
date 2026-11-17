
"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  Activity,
  Files,
  LayoutDashboard,
  MessageSquare,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Menu,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

const navigation = [
  {
    heading: "WORKSPACE",
    items: [
      { label: "Overview", icon: LayoutDashboard, href: "/", active: true },
      { label: "Documents", icon: Files, href: null },
      { label: "Knowledge chat", icon: MessageSquare, href: null },
      { label: "Search", icon: Search, href: null },
    ],
  },
  {
    heading: "MANAGEMENT",
    items: [
      { label: "Team", icon: Users, href: null },
      { label: "Activity", icon: Activity, href: null },
      { label: "Security", icon: ShieldCheck, href: null },
      { label: "Settings", icon: Settings, href: null },
    ],
  },
];

function Brand() {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <Image
        src="https://res.cloudinary.com/fdwexjk4/image/upload/v1794724304/VeriCore_AI_icon-removebg-preview.png"
        alt="VeriCore AI"
        width={36}
        height={36}
        priority
      />
      <div>
        <p className="text-sm font-semibold tracking-tight">VeriCore AI</p>
        <p className="text-[10px] text-muted-foreground">KNOWLEDGE INTELLIGENCE</p>
      </div>
    </div>
  );
}

function SidebarNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-7 px-3 py-5">
      {navigation.map((group) => (
        <div key={group.heading} className="space-y-2">
          <p className="px-3 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
            {group.heading}
          </p>

          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.href !== null && pathname === item.href;

              if (item.href === null) {
                return (
                  <div
                    key={item.label}
                    aria-disabled="true"
                    title="Coming soon"
                    className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2.5 text-sm text-muted-foreground/60"
                  >
                    <span className="flex items-center gap-3">
                      <Icon size={17} strokeWidth={1.7} />
                      {item.label}
                    </span>
                    <span className="text-[9px]">SOON</span>
                  </div>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Icon size={17} strokeWidth={1.7} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Sidebar() {
  return (
    <motion.aside
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="hidden h-screen w-[250px] shrink-0 flex-col border-r bg-sidebar lg:flex"
    >
      <Brand />
      <Separator />
      <SidebarNavigation />

      <div className="border-t p-4">
        <p className="text-xs font-medium">VeriCore AI 3.0</p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Enterprise Knowledge Platform
        </p>
      </div>
    </motion.aside>
  );
}

function MobileNavigation() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation">
          <Menu size={19} />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="flex w-[280px] flex-col p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>VeriCore navigation</SheetTitle>
          <SheetDescription>
            Navigate the VeriCore AI workspace.
          </SheetDescription>
        </SheetHeader>
        <Brand />
        <Separator />
        <SidebarNavigation />
      </SheetContent>
    </Sheet>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b bg-background/95 px-4 backdrop-blur-sm sm:px-7">
          <div className="flex items-center gap-3">
            <div className="lg:hidden">
              <MobileNavigation />
            </div>
            <div>
              <p className="text-sm font-medium">Workspace</p>
              <p className="text-[10px] text-muted-foreground">
                Personal workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium">Development environment</p>
              <p className="text-[10px] text-muted-foreground">
                Local instance
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
              VC
            </div>
          </div>
        </header>

        <main className="flex-1 p-5 sm:p-8 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}

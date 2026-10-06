"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/dashboard/tasks", label: "Today" },
  { href: "/dashboard/tasks/upcoming", label: "Upcoming" },
  { href: "/dashboard/tasks/inbox", label: "Inbox" },
  { href: "/dashboard/tasks/routines", label: "Routines" },
] as const;

export function TasksTabs({ inboxCount }: { inboxCount: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Task views" className="overflow-x-auto">
      <ul className="flex w-max gap-1 rounded-full border border-emerald-950/10 bg-white/70 p-1 shadow-sm">
        {tabs.map((tab) => {
          const active = pathname === tab.href;

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition focus-visible:ring-2 focus-visible:ring-emerald-700/40 ${
                  active ? "bg-emerald-950 text-emerald-50" : "text-emerald-950 hover:bg-white"
                }`}
              >
                {tab.label}
                {tab.label === "Inbox" && inboxCount > 0 ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      active ? "bg-emerald-50 text-emerald-950" : "bg-emerald-100 text-emerald-900"
                    }`}
                  >
                    {inboxCount}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

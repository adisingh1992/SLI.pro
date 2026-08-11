import { Fragment, ReactNode, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAdminRole } from "@/hooks/use-admin-role";
import { useAdminZoom } from "@/hooks/use-admin-zoom";
import { useLocation, Link } from "wouter";
import {
  BarChart3,
  Users,
  LogOut,
  BookOpen,
  Tag,
  Target,
  CalendarClock,
  Mail,
  ChevronsUpDown,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

/**
 * The admin shell.
 *
 * ── THE NAVIGATION WAS SERVING TWO PRODUCTS FROM ONE FLAT LIST ───────────
 * Ten items, no grouping, no hierarchy — and crucially, two different jobs
 * interleaved. Six of them are cohort operations: who are my students, what
 * happened in their sessions, what did we send them, what do the numbers say.
 * The other four are methodology engineering: which heuristic cards fire, what
 * counts as a finished session, how a transcript is read, what the classifier
 * has been taught.
 *
 * Those are not two areas of one product. They are two products with different
 * users. A career-centre director never needs the second set — and an editable
 * completion criterion reaches every student the moment it is saved, with no
 * review gate, so putting that button one mis-click from the student list was
 * a real hazard rather than untidiness.
 *
 * So: two groups, and the second is hidden for anyone who is not SLIpro
 * platform staff. The server enforces the same split independently
 * (server/admin-guards.ts) — hiding a link does not stop a request, and this
 * file is presentation, not security.
 *
 * ── WHY COLLAPSIBLE-ICON RATHER THAN A FIXED RAIL ────────────────────────
 * Several of these screens are long-form editors — a completion criterion or a
 * message template is a wall of text that wants the full width. Being able to
 * fold the sidebar to icons without losing your place is worth more here than
 * on a screen you glance at.
 */

type Tone = "brand" | "info" | "deep" | "warn";

type NavItem = {
  title: string;
  icon: LucideIcon;
  href: string;
  /** Extra paths that should light this item up. */
  alsoMatches?: string[];
  description: string;
  /**
   * The icon's colour.
   *
   * Not decoration — it is the fastest way to find a section you have used
   * before. Icon shape alone takes reading; a coloured icon in a known
   * position is recognised before it is read. The Methodology group is
   * uniformly `deep` so the two halves of the panel stay visually distinct.
   */
  tone: Tone;
};

const TONE: Record<Tone, { icon: string; activeIcon: string }> = {
  brand: { icon: "text-brand", activeIcon: "text-brand" },
  info: { icon: "text-info", activeIcon: "text-info" },
  deep: { icon: "text-deep", activeIcon: "text-deep" },
  warn: { icon: "text-warn", activeIcon: "text-warn" },
};

/** Cohort operations. Everyone with an admin role sees these. */
const OPERATIONS: NavItem[] = [
  {
    tone: "brand",
    title: "Overview",
    icon: BarChart3,
    href: "/admin/dashboard",
    description: "Engagement and outcomes, plus exports",
  },
  {
    tone: "info",
    title: "Students",
    icon: Users,
    href: "/admin/users",
    description: "The cohort, and each student's full record",
  },
  {
    tone: "warn",
    title: "Advising",
    icon: CalendarClock,
    href: "/admin/advisors",
    description: "Appointments and pre-meeting snapshots",
  },
  {
    tone: "brand",
    title: "Messages",
    icon: Mail,
    href: "/admin/messages",
    // The calendar configures dates that fire templates; the two were separate
    // screens, and configuring one without the other does nothing at all.
    alsoMatches: ["/admin/templates", "/admin/calendar"],
    description: "Templates, the academic calendar, and what was sent",
  },
];

/** The methodology engine. platform_admin only. */
const METHODOLOGY: NavItem[] = [
  {
    tone: "deep",
    title: "Methodology",
    icon: BookOpen,
    href: "/admin/methodology",
    alsoMatches: ["/admin/heuristics", "/admin/sequences"],
    description: "Heuristic cards and the sequences that make them live",
  },
  {
    tone: "deep",
    title: "Session design",
    icon: Target,
    href: "/admin/session-design",
    alsoMatches: ["/admin/objectives", "/admin/criteria"],
    description: "Objectives, completion criteria and transcript analysis",
  },
  {
    tone: "deep",
    title: "Tagging",
    icon: Tag,
    href: "/admin/tagging",
    description: "Hand-labelled turns, validation and the classifier prompt",
  },
];

/** Longest match wins, so /admin/users/12 highlights Students, not Overview. */
function matches(item: NavItem, location: string): boolean {
  return [item.href, ...(item.alsoMatches ?? [])].some(
    (p) => location === p || location.startsWith(`${p}/`),
  );
}

function initials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

function NavGroup({
  label,
  items,
  location,
}: {
  label: string;
  items: NavItem[];
  location: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="font-semibold uppercase tracking-wider text-[11px]">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={matches(item, location)}
                // The tooltip is the only label once collapsed to icons, so it
                // carries the description too — the icon alone does not
                // distinguish "Session design" from "Methodology".
                tooltip={{ children: <span>{item.description}</span> }}
              >
                <Link href={item.href}>
                  <item.icon
                    className={
                      matches(item, location)
                        ? TONE[item.tone].activeIcon
                        : `${TONE[item.tone].icon} opacity-70 transition-opacity group-hover/menu-item:opacity-100`
                    }
                  />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/**
 * Breadcrumbs from the URL, using the nav table as the label source.
 *
 * Screens can override the tail with `breadcrumb` when the last segment is an
 * id — "Students / 42" is worse than useless, and "Students / Maya Chen" is
 * the whole point of a breadcrumb.
 */
function Crumbs({ location, tail }: { location: string; tail?: ReactNode }) {
  const all = [...OPERATIONS, ...METHODOLOGY];
  const section = all.find((i) => matches(i, location));

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {section && (
          <Fragment>
            <BreadcrumbItem>
              {tail ? (
                <BreadcrumbLink asChild>
                  <Link href={section.href}>{section.title}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{section.title}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {tail && <BreadcrumbSeparator />}
          </Fragment>
        )}
        {tail && (
          <BreadcrumbItem>
            <BreadcrumbPage>{tail}</BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export default function AdminLayout({
  children,
  breadcrumb,
}: {
  children: ReactNode;
  /** Overrides the last crumb — pass a student's name rather than their id. */
  breadcrumb?: ReactNode;
}) {
  const { user, isLoading, logoutMutation } = useAuth();
  const { isPlatformAdmin } = useAdminRole();
  const [location, navigate] = useLocation();

  /*
   * ── THE AUTH GATE LIVES HERE, NOT IN EVERY SCREEN ────────────────────────
   * Admin routes are plain `<Route>` rather than `<ProtectedRoute>`, so each
   * screen used to carry its own `useEffect` redirect — twenty-odd copies of
   * the same four lines, which is exactly the kind of thing that gets left out
   * of the twenty-first screen. Consolidating the screens would have done
   * precisely that: the new pages inherited the bodies but not the guards, and
   * an unauthenticated visitor would have got a shell full of 401s instead of
   * the login page.
   *
   * Every admin screen renders this component, so this is the one place that
   * cannot be forgotten. It is a convenience, not the boundary — the server
   * refuses the requests regardless.
   */
  useEffect(() => {
    if (!isLoading && !user?.isAdmin) navigate("/admin/login", { replace: true });
  }, [isLoading, user, navigate]);

  // 90% for the whole panel, including the sign-in screen. See the hook.
  useAdminZoom();

  // Render nothing rather than a flash of empty chrome while auth resolves or
  // the redirect above lands.
  if (isLoading || !user?.isAdmin) return null;

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/admin/dashboard">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
                    <span className="text-sm font-semibold">W</span>
                  </div>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-semibold">SLI Pro</span>
                    <span
                      className={`truncate text-xs font-medium ${
                        isPlatformAdmin ? "text-deep" : "text-info"
                      }`}
                    >
                      {isPlatformAdmin ? "Platform admin" : "Institution admin"}
                    </span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <NavGroup label="Operations" items={OPERATIONS} location={location} />
          {/*
            Hidden, not disabled. A greyed-out "Methodology" group would tell a
            partner there is a thing they cannot have, which invites the
            question and answers it badly. They are not missing anything that
            belongs to them.
          */}
          {isPlatformAdmin && (
            <NavGroup label="Methodology" items={METHODOLOGY} location={location} />
          )}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-brand-soft text-xs font-semibold text-brand">
                        {initials(user?.firstName, user?.lastName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate text-sm font-medium">
                        {user?.firstName} {user?.lastName}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {user?.email}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>

                <DropdownMenuContent side="right" align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    {isPlatformAdmin
                      ? "SLIpro platform staff"
                      : "Institution admin"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={logoutMutation.isPending}
                    onClick={async () => {
                      await logoutMutation.mutateAsync();
                      navigate("/admin/login");
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        {/* Sticky so the breadcrumb and the sidebar toggle survive a long
            editor page — several of these screens scroll for a while. */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <Crumbs location={location} tail={breadcrumb} />
        </header>

        <main className="flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

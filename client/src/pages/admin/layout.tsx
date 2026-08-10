import { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { 
  BarChart, 
  Users, 
  LogOut, 
  Home,
  Menu,
  X,
  FileBarChart2,
  BookOpen,
  Tag,
  CheckSquare,
  ScanSearch,
  Target,
  CalendarClock,
  Mail
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, logoutMutation } = useAuth();
  const [location, navigate] = useLocation();

  const isActive = (path: string) => {
    return location.startsWith(path);
  };

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    navigate("/admin/login");
  };

  const navItems = [
    {
      title: "Dashboard",
      icon: BarChart,
      href: "/admin/dashboard",
      active: isActive("/admin/dashboard"),
    },
    {
      title: "Users",
      icon: Users,
      href: "/admin/users",
      active: isActive("/admin/users"),
    },
    {
      // The methodology library — cards and the sequences that make them live.
      title: "Methodology",
      icon: BookOpen,
      href: "/admin/heuristics",
      active: isActive("/admin/heuristics") || isActive("/admin/sequences"),
    },
    {
      // Hand-tagging: the gold standard the classifier is measured against.
      title: "Tagging",
      icon: Tag,
      href: "/admin/tagging",
      active: isActive("/admin/tagging"),
    },
    {
      // When a session counts as finished — one definition, both prompts.
      title: "Completion",
      icon: CheckSquare,
      href: "/admin/criteria",
      active: isActive("/admin/criteria"),
    },
    {
      // The beats a session is trying to reach. Sits before Completion and
      // Analysis because it is what the session DOES; those two judge it.
      title: "Objectives",
      icon: Target,
      href: "/admin/objectives",
      active: isActive("/admin/objectives"),
    },
    {
      // Named "Analysis", not "Methodology", because "Methodology" above
      // already means the heuristic card library — two identical labels with
      // the same icon, which is how this shipped for about ten minutes.
      //
      // The three are distinct surfaces and the labels should say so:
      //   Methodology  what Wing does DURING a conversation (cards, sequences)
      //   Completion   WHETHER a finished session counts as done
      //   Analysis     HOW a finished transcript is read on the way to that
      title: "Analysis",
      icon: ScanSearch,
      href: "/admin/methodology",
      active: isActive("/admin/methodology"),
    },
    {
      // Advising appointments and the pre-meeting snapshot. Named "Advising"
      // rather than "Appointments" because the appointment is an input, not the
      // thing — we brief advisors, we do not run a calendar.
      title: "Advising",
      icon: CalendarClock,
      href: "/admin/advisors",
      active: isActive("/admin/advisors"),
    },
    {
      // Everything Wing says outside a session. Sits next to Advising because
      // the advisor snapshot copy lives here too.
      title: "Messages",
      icon: Mail,
      href: "/admin/templates",
      active: isActive("/admin/templates"),
    },
  ];

  const reportItems = [
    {
      title: "Reports",
      icon: FileBarChart2,
      href: "/admin/reports",
      active: isActive("/admin/reports"),
    },
  ];

  const NavLink = ({
    href,
    icon: Icon,
    title,
    active,
    isMobile = false,
  }: {
    href: string;
    icon: typeof Home;
    title: string;
    active: boolean;
    isMobile?: boolean;
  }) => (
    <Button
      variant="ghost"
      className={cn(
        "w-full justify-start",
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
        isMobile ? "mb-1" : ""
      )}
      onClick={() => navigate(href)}
    >
      <Icon className="mr-2 h-4 w-4" />
      {title}
    </Button>
  );

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className={cn("space-y-4", isMobile ? "py-6" : "")}>
      <div className="px-3 py-2">
        <h2 className="px-4 text-lg font-semibold tracking-tight">
          SLI Pro Admin
        </h2>
        <p className="px-4 text-sm text-muted-foreground">
          {user?.firstName} {user?.lastName}
        </p>
      </div>
      <Separator />
      <div className="px-3 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            title={item.title}
            active={item.active}
            isMobile={isMobile}
          />
        ))}
      </div>
      <Separator />
      <div className="px-3 py-2">
        <p className="px-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Reports
        </p>
        {reportItems.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            title={item.title}
            active={item.active}
            isMobile={isMobile}
          />
        ))}
      </div>
      <Separator />
      <div className="px-3 py-2">
        <Button
          variant="ghost"
          className="w-full justify-start hover:bg-accent/50"
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Logout
          {logoutMutation.isPending && (
            <span className="ml-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden w-48 border-r bg-card lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-10 flex h-16 items-center border-b bg-card px-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="mr-2">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <div className="flex justify-end p-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <X className="h-5 w-5" />
                    <span className="sr-only">Close Menu</span>
                  </Button>
                </SheetTrigger>
              </Sheet>
            </div>
            <SidebarContent isMobile />
          </SheetContent>
        </Sheet>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">SLI Pro Admin</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1">
        <div className="lg:hidden h-16" />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
import { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  LogOut,
  ChevronRight,
  Menu,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import sliProLogo from "@/assets/sliPro-logos_aqua.png";

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, logoutMutation } = useAuth();
  const [location, navigate] = useLocation();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        navigate("/admin/login");
      },
    });
  };

  // Navigation items for the admin panel
  const navItems = [
    {
      label: "Dashboard",
      href: "/admin/dashboard",
      icon: <LayoutDashboard size={18} />,
    },
    {
      label: "Users",
      href: "/admin/users",
      icon: <Users size={18} />,
    },
  ];

  // Determine if a nav item is active
  const isActiveLink = (href: string) => location === href;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200">
        <div className="p-4 border-b">
          <Link href="/admin/dashboard">
            <img src={sliProLogo} alt="SLI.pro Logo" className="h-8" />
          </Link>
        </div>
        <nav className="flex flex-col flex-grow p-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActiveLink(item.href) ? "secondary" : "ghost"}
                className="w-full justify-start"
              >
                {item.icon}
                <span className="ml-2">{item.label}</span>
              </Button>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={handleLogout}
          >
            <LogOut size={18} />
            <span className="ml-2">Logout</span>
          </Button>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-10 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
        <Link href="/admin/dashboard">
          <img src={sliProLogo} alt="SLI.pro Logo" className="h-8" />
        </Link>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <div className="p-4 border-b">
              <Link href="/admin/dashboard">
                <img src={sliProLogo} alt="SLI.pro Logo" className="h-8" />
              </Link>
            </div>
            <nav className="flex flex-col p-4 space-y-1">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActiveLink(item.href) ? "secondary" : "ghost"}
                    className="w-full justify-start"
                  >
                    {item.icon}
                    <span className="ml-2">{item.label}</span>
                  </Button>
                </Link>
              ))}
            </nav>
            <div className="p-4 border-t mt-auto">
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={handleLogout}
              >
                <LogOut size={18} />
                <span className="ml-2">Logout</span>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Content */}
      <main className="flex-grow md:ml-0 pt-16 md:pt-0">
        {/* User info header */}
        <div className="bg-white border-b p-4 flex justify-between items-center">
          <div className="flex items-center">
            <span className="text-sm text-gray-500">
              {location !== "/admin/dashboard" && (
                <>
                  <Link href="/admin/dashboard" className="hover:underline">
                    Dashboard
                  </Link>
                  <ChevronRight className="inline h-4 w-4 mx-1" />
                  <span className="font-medium text-gray-800">
                    {navItems.find((item) => item.href === location)?.label ||
                      "Page"}
                  </span>
                </>
              )}
            </span>
          </div>
          {user && (
            <div className="flex items-center">
              <span className="mr-2 text-sm font-medium">
                {user.firstName} {user.lastName}
              </span>
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  {user.firstName?.[0]}
                  {user.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
        </div>
        {children}
      </main>
    </div>
  );
}
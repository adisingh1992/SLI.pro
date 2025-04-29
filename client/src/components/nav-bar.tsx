import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User, ChevronDown, MessageSquare, FileText } from "lucide-react";
import UserAvatar from "@/components/user-avatar";
import sliProLogo from "@/assets/sliPro-logos_aqua.png";
// This is a custom navigation function that will let the chat page's exit confirmation handle navigation
function useSafeNavigation() {
  const [, setLocation] = useLocation();
  
  // Just use the normal navigation - the chat page will intercept any navigation events
  return (path: string) => {
    setLocation(path);
  };
}

export default function NavBar() {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();
  const navigate = useSafeNavigation();

  const handleLogout = async () => {
    try {
      console.log('Logging out...');
      
      // First perform the logout
      await logoutMutation.mutateAsync();
      console.log('Logout successful, redirecting to auth page');
      
      // We need a small delay to allow the mutation to complete
      setTimeout(() => {
        // Then use the router navigation to go to auth page
        // This prevents a full page refresh
        navigate("/auth");
      }, 300);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const getInitials = () => {
    if (!user) return "";
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`;
  };

  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center cursor-pointer" onClick={() => navigate("/")}>
              <img 
                src={sliProLogo} 
                alt="SLI.pro Logo" 
                className="h-10 w-auto" 
              />
            </div>
            {/* Chat button removed as requested */}
          </div>
          
          {user ? (
            <div className="flex items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center space-x-2">
                    <UserAvatar 
                      firstName={user.firstName} 
                      lastName={user.lastName} 
                      size="small" 
                    />
                    <span className="font-medium text-[#333333]">
                      {user.firstName} {user.lastName}
                    </span>
                    <ChevronDown className="h-4 w-4 text-[#333333]" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    <span>View Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/summaries")} className="cursor-pointer">
                    <FileText className="mr-2 h-4 w-4" />
                    <span>Conversation Summaries</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-500">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="flex items-center">
              <Button 
                variant="ghost" 
                className="text-[#bed6d1]"
                onClick={() => navigate("/auth")}
              >
                Log In
              </Button>
              <Button 
                variant="default" 
                className="ml-4 bg-[#bed6d1] hover:bg-opacity-90"
                onClick={() => navigate("/auth")}
              >
                Sign Up
              </Button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function NotFound() {
  const [_, navigate] = useLocation();
  
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F5F5F5]">
      <Card className="w-full max-w-md mx-4 shadow-card">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center mb-6">
            <svg className="h-12 w-auto text-[#bed6d1] mb-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor"/>
            </svg>
            <div className="flex items-center gap-2 justify-center">
              <AlertCircle className="h-6 w-6 text-[#E34240]" />
              <h1 className="text-2xl font-bold text-[#333333]">404 Page Not Found</h1>
            </div>
          </div>

          <p className="text-center mb-6 text-gray-600">
            The page you're looking for doesn't exist or has been moved.
          </p>
          
          <Button 
            className="w-full bg-[#bed6d1] hover:bg-opacity-90"
            onClick={() => navigate("/")}
          >
            <Home className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

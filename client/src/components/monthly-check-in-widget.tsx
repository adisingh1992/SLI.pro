import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Calendar, ArrowRight, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scrollToTop } from "@/lib/utils";
import { MonthlyCheckIn } from "@shared/schema";

interface MonthlyCheckInWidgetProps {
  userId: number;
}

export default function MonthlyCheckInWidget({ userId }: MonthlyCheckInWidgetProps) {
  const [_, navigate] = useLocation();

  // Fetch user's monthly check-ins
  const { data: checkIns, isLoading } = useQuery<MonthlyCheckIn[]>({
    queryKey: ["/api/monthly-check-ins"],
    enabled: !!userId,
  });

  // Format month for display
  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  // Check if a check-in exists for the current month
  const getCurrentMonth = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const currentMonth = getCurrentMonth();
  
  const hasCurrentMonthCheckIn = checkIns?.some(
    checkIn => checkIn.month === currentMonth
  );

  // Get most recent check-in
  const mostRecentCheckIn = checkIns?.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];

  const hasCompletedAnyCheckIn = checkIns && checkIns.length > 0;

  return (
    <div className="mt-6 bg-[#f8f9ff] border border-blue-100 rounded-lg p-6">
      <div className="flex items-start">
        <div className="p-3 rounded-full bg-blue-100 text-blue-600 mr-4">
          <Calendar className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-medium text-[#333333] mb-2">
            Monthly Professional Brand Check-In
          </h2>
          <p className="text-gray-600 mb-4">
            {hasCurrentMonthCheckIn ? (
              <>You've completed your brand check-in for <span className="font-medium">{formatMonth(currentMonth)}</span>. Great job maintaining your professional presence!</>
            ) : hasCompletedAnyCheckIn ? (
              <>Time for your monthly check-in! Your last check-in was for <span className="font-medium">{formatMonth(mostRecentCheckIn?.month || '')}</span>. Keep tracking your professional brand growth.</>
            ) : (
              <>Track your LinkedIn activity each month to measure your professional brand growth. This 5-minute check-in helps you stay consistent and see your progress over time.</>
            )}
          </p>

          {hasCurrentMonthCheckIn ? (
            <div className="flex items-center gap-2 text-green-600 mb-4">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Current month completed</span>
            </div>
          ) : null}

          <Button
            className="flex items-center bg-blue-600 hover:bg-blue-700"
            onClick={() => {
              scrollToTop();
              // Direct to appropriate tab based on whether user has completed current month
              const url = hasCurrentMonthCheckIn ? 
                "/monthly-check-in?tab=history" : 
                "/monthly-check-in";
              navigate(url);
            }}
          >
            {hasCurrentMonthCheckIn ? "View Check-in History" : "Start Monthly Check-in"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
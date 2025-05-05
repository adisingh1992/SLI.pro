import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { FileText, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FreshnessReportSummary {
  id: number;
  createdAt: string;
}

interface ReportHistoryProps {
  reports: FreshnessReportSummary[];
  currentReportId: number;
  onSelectReport: (reportId: number) => void;
}

const ReportHistory: React.FC<ReportHistoryProps> = ({ 
  reports, 
  currentReportId,
  onSelectReport
}) => {
  // Format date for display - use a more compact format for the narrow column
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    
    // For the 20% column view, we use a more compact date format
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-1 pt-3">
        <CardTitle className="text-sm font-medium">Report History</CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        {reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <FileText className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">No previous reports found</p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-250px)] pr-2">
            <div className="space-y-2">
              {reports.map((report) => (
                <Button
                  key={report.id}
                  variant={report.id === currentReportId ? "default" : "outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal overflow-hidden h-auto py-1.5 px-2",
                    report.id === currentReportId ? "bg-primary text-primary-foreground" : ""
                  )}
                  onClick={() => onSelectReport(report.id)}
                >
                  <div className="flex items-center gap-1.5 w-full overflow-hidden">
                    <CalendarIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-xs font-medium truncate leading-tight mb-0.5">
                        {formatDate(report.createdAt)}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        Brand Assessment Report
                      </span>
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default ReportHistory;
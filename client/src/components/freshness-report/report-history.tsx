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
  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">Report History</CardTitle>
      </CardHeader>
      <CardContent>
        {reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No previous reports found</p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-250px)] pr-3">
            <div className="space-y-2">
              {reports.map((report) => (
                <Button
                  key={report.id}
                  variant={report.id === currentReportId ? "default" : "outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    report.id === currentReportId ? "bg-primary text-primary-foreground" : ""
                  )}
                  onClick={() => onSelectReport(report.id)}
                >
                  <div className="flex items-center gap-2 w-full">
                    <CalendarIcon className="h-4 w-4 shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        Report – {formatDate(report.createdAt)}
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
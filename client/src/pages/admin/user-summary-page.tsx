import React from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useEffect } from 'react';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConversationSummary } from '@shared/schema';
import { getQueryFn } from '@/lib/queryClient';
import AdminLayout from './layout';
import ConversationSummaryView from '@/components/conversation-summary/summary-view';
import SummaryList from '@/components/conversation-summary/summary-list';

interface AdminUserSummaryParams {
  userId?: string;
  summaryId?: string;
}

export default function AdminUserSummaryPage() {
  const { user, isLoading: authLoading } = useAuth();
  const params = useParams<AdminUserSummaryParams>();
  const [_, navigate] = useLocation();
  const userId = params.userId ? parseInt(params.userId) : undefined;
  const summaryId = params.summaryId;

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      navigate("/admin/login");
    }
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return null; // Will redirect in useEffect
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="mb-4">
          <Button 
            variant="ghost"
            size="sm"
            className="mb-2"
            onClick={() => navigate(`/admin/users/${userId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to User Details
          </Button>
        </div>

        {summaryId ? (
          // Show specific summary if ID is provided
          <ConversationSummaryView id={parseInt(summaryId)} isAdmin={true} userId={userId} />
        ) : (
          // Show list of summaries for this user
          <div>
            <h1 className="text-2xl font-bold mb-6">Conversation Summaries</h1>
            <SummaryList userId={userId} isAdmin={true} />
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
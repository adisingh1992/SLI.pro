import React from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useEffect } from 'react';
import { Loader2, ArrowLeft, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AdminLayout from './layout';
import SummaryList from '@/components/conversation-summary/summary-list';

// User type for admin user details
interface UserDetails {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  headline?: string;
  bio?: string;
  location?: string;
  isAdmin: boolean;
  lastLoginAt?: string;
}

interface AdminUserSummaryParams {
  userId?: string;
}

export default function AdminUserSummaryPage() {
  const { user, isLoading: authLoading } = useAuth();
  const params = useParams<AdminUserSummaryParams>();
  const [_, navigate] = useLocation();
  const userId = params.userId ? parseInt(params.userId) : undefined;

  // Fetch user details for display
  const { data: userDetails } = useQuery<UserDetails>({
    queryKey: [`/api/admin/users/${userId}`],
    enabled: !!userId,
  });

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

        {/* User Context Header */}
        <div className="border-b pb-4 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <User className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold">
              Foundation Sessions Summary
            </h1>
          </div>
          {userDetails && (
            <p className="text-muted-foreground">
              Viewing foundation sessions for{' '}
              <span className="font-medium">
                {userDetails.firstName} {userDetails.lastName}
              </span>
              {' '}({userDetails.username})
            </p>
          )}
        </div>

        {/* Foundation Sessions Display */}
        <SummaryList userId={userId} isAdmin={true} />
      </div>
    </AdminLayout>
  );
}
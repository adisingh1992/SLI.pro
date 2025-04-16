import React from 'react';
import { useParams } from 'wouter';
import ConversationSummaryView from '@/components/conversation-summary/summary-view';
import SummaryList from '@/components/conversation-summary/summary-list';

interface SummaryPageParams {
  id?: string;
}

export default function SummaryPage() {
  const { id } = useParams<SummaryPageParams>();
  
  // If an ID is provided, show the specific summary view
  // Otherwise, show the list of all summaries
  if (id) {
    return (
      <div className="container mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <ConversationSummaryView id={parseInt(id)} />
      </div>
    );
  }
  
  // Show the list of all summaries
  return (
    <div className="container mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <SummaryList />
    </div>
  );
}
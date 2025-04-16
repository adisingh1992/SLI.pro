import React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Conversation {
  id: number;
  title: string;
  updatedAt: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: number | null;
  onSelectConversation: (id: number) => void;
  onNewConversation: () => void;
  className?: string;
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  className,
}: ConversationListProps) {
  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="p-4">
        <Button 
          onClick={onNewConversation} 
          className="w-full justify-start" 
          variant="outline"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Conversation
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.length === 0 ? (
            <div className="text-center p-4 text-muted-foreground">
              No conversations yet
            </div>
          ) : (
            conversations.map((conversation) => (
              <Button
                key={conversation.id}
                variant={activeConversationId === conversation.id ? "secondary" : "ghost"}
                className="w-full justify-start text-left font-normal overflow-hidden"
                onClick={() => onSelectConversation(conversation.id)}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                <span className="truncate">{conversation.title}</span>
              </Button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
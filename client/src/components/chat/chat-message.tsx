import React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import ReactMarkdown from 'react-markdown';

interface ChatMessageProps {
  content: string;
  role: 'user' | 'assistant';
  isStreaming?: boolean;
}

export function ChatMessage({ content, role, isStreaming = false }: ChatMessageProps) {
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex ${role === 'user' ? 'flex-row-reverse' : 'flex-row'} max-w-[80%]`}>
        <div className="flex-shrink-0 mr-3">
          {role === 'user' ? (
            <Avatar className="h-8 w-8 bg-primary text-white">
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
          ) : (
            <Avatar className="h-8 w-8 bg-secondary text-secondary-foreground">
              <AvatarFallback>AI</AvatarFallback>
            </Avatar>
          )}
        </div>
        <Card className={`p-3 ${role === 'user' ? 'bg-primary text-white' : 'bg-muted'} ${isStreaming ? 'animate-pulse' : ''}`}>
          <div className="prose dark:prose-invert prose-sm max-w-none">
            <ReactMarkdown>
              {content}
            </ReactMarkdown>
          </div>
        </Card>
      </div>
    </div>
  );
}
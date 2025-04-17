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
        <Card className={`p-3 ${role === 'user' ? 'bg-primary text-white' : 'bg-muted'} ${isStreaming ? 'border-secondary' : ''}`}>
          <div className="prose dark:prose-invert prose-sm max-w-none">
            <ReactMarkdown
              components={{
                a: ({ node, ...props }) => (
                  <a
                    {...props}
                    href={props.href || ''}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`underline ${role === 'user' ? 'text-white hover:text-blue-100' : 'text-blue-600 hover:text-blue-800'}`}
                  />
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </Card>
      </div>
    </div>
  );
}
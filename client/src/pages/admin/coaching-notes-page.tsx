import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CoachingNote } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Layout from "./layout";
import { ArrowLeft, Bold, Italic, List, Underline, Save, Trash2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow } from "date-fns";

export default function CoachingNotesPage() {
  const { user } = useAuth();
  const { userId } = useParams();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [selectedNote, setSelectedNote] = useState<CoachingNote | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Fetch user data
  const { data: userData } = useQuery({
    queryKey: [`/api/admin/users/${userId}`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}`);
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
    enabled: !!userId && !!user?.isAdmin,
  });

  // Fetch coaching notes
  const { data: notes, isLoading } = useQuery({
    queryKey: [`/api/admin/users/${userId}/coaching-notes`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}/coaching-notes`);
      if (!res.ok) throw new Error("Failed to fetch coaching notes");
      return res.json();
    },
    enabled: !!userId && !!user?.isAdmin,
  });

  // Create a new coaching note
  const createNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch("/api/admin/coaching-notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: Number(userId),
          adminId: user!.id, // Add the current admin's ID
          content,
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to create note");
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${userId}/coaching-notes`] });
      setContent("");
      toast({
        title: "Success",
        description: "Coaching note created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update an existing coaching note
  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, content }: { id: number; content: string }) => {
      const res = await fetch(`/api/admin/coaching-notes/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update note");
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${userId}/coaching-notes`] });
      setContent("");
      setSelectedNote(null);
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Coaching note updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete a coaching note
  const deleteNoteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/coaching-notes/${id}`, {
        method: "DELETE",
      });
      
      if (!res.ok) {
        throw new Error("Failed to delete note");
      }
      
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${userId}/coaching-notes`] });
      setSelectedNote(null);
      setIsEditing(false);
      setContent("");
      toast({
        title: "Success",
        description: "Coaching note deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Format text functions
  const applyFormat = (format: string) => {
    const textarea = document.getElementById('editor') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    let formattedText = '';
    let cursorPosition = 0;
    
    switch(format) {
      case 'bold':
        formattedText = `**${selectedText}**`;
        cursorPosition = 2;
        break;
      case 'italic':
        formattedText = `*${selectedText}*`;
        cursorPosition = 1;
        break;
      case 'underline':
        formattedText = `__${selectedText}__`;
        cursorPosition = 2;
        break;
      case 'list':
        // Add a bullet for each line
        formattedText = selectedText
          .split('\n')
          .map(line => `• ${line}`)
          .join('\n');
        cursorPosition = 2;
        break;
      default:
        return;
    }
    
    // Replace the selected text with the formatted text
    setContent(
      prev => 
        prev.substring(0, start) + 
        formattedText + 
        prev.substring(end)
    );
    
    // Set the focus back to the textarea
    setTimeout(() => {
      textarea.focus();
      // If no text was selected, position cursor inside the formatting
      if (start === end) {
        textarea.setSelectionRange(start + cursorPosition, start + cursorPosition);
      } else {
        // Otherwise, select the newly formatted text
        textarea.setSelectionRange(start, start + formattedText.length);
      }
    }, 0);
  };

  // Handle selecting a note for editing
  const handleSelectNote = (note: CoachingNote) => {
    setSelectedNote(note);
    setContent(note.content);
    setIsEditing(true);
  };

  // Handle saving a note
  const handleSaveNote = () => {
    if (!content.trim()) {
      toast({
        title: "Error",
        description: "Note content cannot be empty",
        variant: "destructive",
      });
      return;
    }
    
    if (isEditing && selectedNote) {
      updateNoteMutation.mutate({ id: selectedNote.id, content });
    } else {
      createNoteMutation.mutate(content);
    }
  };

  // Handle canceling edit mode
  const handleCancelEdit = () => {
    setContent("");
    setSelectedNote(null);
    setIsEditing(false);
  };

  return (
    <Layout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => navigate(`/admin/users/${userId}`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">
              Coaching Notes for {userData?.firstName} {userData?.lastName}
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Notes List */}
          <div className="md:col-span-1 space-y-4">
            <h2 className="text-xl font-semibold">Note History</h2>
            {isLoading ? (
              <p>Loading notes...</p>
            ) : notes && notes.length > 0 ? (
              <div className="space-y-3">
                {notes.map((note: CoachingNote) => (
                  <Card 
                    key={note.id} 
                    className={`cursor-pointer ${selectedNote?.id === note.id ? 'border-primary' : ''}`}
                    onClick={() => handleSelectNote(note)}
                  >
                    <CardHeader className="p-3">
                      <CardTitle className="text-sm text-muted-foreground">
                        {new Date(note.createdAt).toLocaleDateString()}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <p className="line-clamp-3 text-sm">
                        {note.content}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No coaching notes yet.</p>
            )}
          </div>

          {/* Editor */}
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>{isEditing ? "Edit Note" : "New Note"}</CardTitle>
                <CardDescription>
                  {isEditing 
                    ? `Editing note from ${new Date(selectedNote?.createdAt || "").toLocaleDateString()}`
                    : "Create a new coaching note"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => applyFormat('bold')}
                      title="Bold"
                    >
                      <Bold className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => applyFormat('italic')}
                      title="Italic"
                    >
                      <Italic className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => applyFormat('underline')}
                      title="Underline"
                    >
                      <Underline className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => applyFormat('list')}
                      title="Bullet List"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>
                  <Separator />
                  <Textarea
                    id="editor"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Enter your coaching notes here..."
                    className="min-h-[300px] font-mono"
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <div>
                  {isEditing && (
                    <Button 
                      variant="destructive" 
                      onClick={() => selectedNote && deleteNoteMutation.mutate(selectedNote.id)}
                      disabled={deleteNoteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  )}
                </div>
                <div className="flex space-x-2">
                  {isEditing && (
                    <Button variant="outline" onClick={handleCancelEdit}>
                      Cancel
                    </Button>
                  )}
                  <Button 
                    onClick={handleSaveNote}
                    disabled={createNoteMutation.isPending || updateNoteMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {isEditing ? "Update" : "Save"}
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
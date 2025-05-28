import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  Clock,
  BookOpen,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "./layout";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface HomeworkAssignment {
  id: number;
  userId: number;
  adminId: number;
  questionText: string;
  answerText: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserWithoutPassword {
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

const homeworkSchema = z.object({
  questionText: z.string().min(1, "Question is required"),
});

const editHomeworkSchema = z.object({
  questionText: z.string().min(1, "Question is required"),
});

export default function AdminHomeworkPage() {
  const { user, isLoading: authLoading } = useAuth();
  const params = useParams();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const userId = params.userId ? parseInt(params.userId) : undefined;

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingHomework, setEditingHomework] = useState<HomeworkAssignment | null>(null);

  // Fetch user details
  const {
    data: userData,
    isLoading: isUserLoading,
    error: userError,
  } = useQuery<UserWithoutPassword>({
    queryKey: [`/api/admin/users/${userId}`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!userId && !!user?.isAdmin,
  });

  // Fetch homework assignments
  const {
    data: homeworkData,
    isLoading: isHomeworkLoading,
    error: homeworkError,
  } = useQuery<HomeworkAssignment[]>({
    queryKey: [`/api/admin/users/${userId}/homework`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!userId && !!user?.isAdmin,
  });

  // Add homework form
  const addForm = useForm<z.infer<typeof homeworkSchema>>({
    resolver: zodResolver(homeworkSchema),
    defaultValues: {
      questionText: "",
    },
  });

  // Edit homework form
  const editForm = useForm<z.infer<typeof editHomeworkSchema>>({
    resolver: zodResolver(editHomeworkSchema),
    defaultValues: {
      questionText: "",
    },
  });

  // Add homework mutation
  const addHomeworkMutation = useMutation({
    mutationFn: async (data: z.infer<typeof homeworkSchema>) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/homework`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${userId}/homework`] });
      setIsAddDialogOpen(false);
      addForm.reset();
      toast({
        title: "Success",
        description: "Homework assignment created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create homework assignment",
        variant: "destructive",
      });
    },
  });

  // Edit homework mutation
  const editHomeworkMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: z.infer<typeof editHomeworkSchema> }) => {
      return await apiRequest("PATCH", `/api/admin/homework/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${userId}/homework`] });
      setEditingHomework(null);
      editForm.reset();
      toast({
        title: "Success",
        description: "Homework assignment updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update homework assignment",
        variant: "destructive",
      });
    },
  });

  // Delete homework mutation
  const deleteHomeworkMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/homework/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/users/${userId}/homework`] });
      toast({
        title: "Success",
        description: "Homework assignment deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete homework assignment",
        variant: "destructive",
      });
    },
  });

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      navigate("/admin/login");
    }
  }, [user, authLoading, navigate]);

  // Handle edit homework
  const handleEditHomework = (homework: HomeworkAssignment) => {
    setEditingHomework(homework);
    editForm.reset({
      questionText: homework.questionText,
    });
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (authLoading || isUserLoading || isHomeworkLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return null; // Will redirect in useEffect
  }

  if (userError || !userData) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="mb-6">
            <Link href="/admin/users">
              <Button variant="ghost" size="sm" className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Users
              </Button>
            </Link>
          </div>
          <div className="bg-red-50 border border-red-200 p-6 rounded-md text-center">
            <p className="text-red-600">
              Error loading user data. The user may not exist or there was a
              problem fetching the data.
            </p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="mb-4">
          <Link href={`/admin/users/${userId}`}>
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to User Profile
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Assigned Homework</h1>
              <p className="text-muted-foreground mt-1">
                Managing homework assignments for {userData.firstName} {userData.lastName}
              </p>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Question
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Add New Homework Question</DialogTitle>
                  <DialogDescription>
                    Create a new written question for the user to answer.
                  </DialogDescription>
                </DialogHeader>
                <Form {...addForm}>
                  <form onSubmit={addForm.handleSubmit((data) => addHomeworkMutation.mutate(data))}>
                    <div className="space-y-4 py-4">
                      <FormField
                        control={addForm.control}
                        name="questionText"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Question</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Enter your question here..."
                                className="min-h-[100px]"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <DialogFooter>
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setIsAddDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={addHomeworkMutation.isPending}
                      >
                        {addHomeworkMutation.isPending && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Add Question
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Homework assignments list */}
        <div className="space-y-4">
          {homeworkError ? (
            <Card>
              <CardContent className="p-6">
                <div className="text-center text-red-600">
                  Error loading homework assignments. Please try again.
                </div>
              </CardContent>
            </Card>
          ) : !homeworkData?.length ? (
            <Card>
              <CardContent className="p-8">
                <div className="text-center space-y-3">
                  <BookOpen className="h-12 w-12 text-muted-foreground mx-auto" />
                  <h3 className="text-lg font-medium">No homework assignments yet</h3>
                  <p className="text-muted-foreground">
                    Create questions for the user to answer by clicking "Add Question" above.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            homeworkData.map((homework) => (
              <Card key={homework.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">Question #{homework.id}</CardTitle>
                        <Badge variant={homework.answerText ? "default" : "secondary"}>
                          {homework.answerText ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Answered
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3 mr-1" />
                              Unanswered
                            </>
                          )}
                        </Badge>
                      </div>
                      <CardDescription>
                        Created on {formatDate(homework.createdAt)}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditHomework(homework)}
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete homework assignment?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete this homework question and any answer provided.
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteHomeworkMutation.mutate(homework.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Question</Label>
                    <div className="mt-1 p-3 bg-muted/50 rounded-md">
                      <p className="text-sm whitespace-pre-wrap">{homework.questionText}</p>
                    </div>
                  </div>
                  {homework.answerText && (
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">User's Answer</Label>
                      <div className="mt-1 p-3 bg-green-50 border border-green-200 rounded-md">
                        <p className="text-sm whitespace-pre-wrap">{homework.answerText}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Edit homework dialog */}
        <Dialog open={!!editingHomework} onOpenChange={() => setEditingHomework(null)}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Edit Homework Question</DialogTitle>
              <DialogDescription>
                Modify the question text. Note that this will not affect any existing answers.
              </DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit((data) => 
                editingHomework && editHomeworkMutation.mutate({ id: editingHomework.id, data })
              )}>
                <div className="space-y-4 py-4">
                  <FormField
                    control={editForm.control}
                    name="questionText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Question</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter your question here..."
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setEditingHomework(null)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={editHomeworkMutation.isPending}
                  >
                    {editHomeworkMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Save Changes
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
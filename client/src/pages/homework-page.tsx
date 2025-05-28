import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { HomeworkAssignment } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loader2,
  BookOpen,
  CheckCircle,
  Calendar,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import NavBar from "@/components/nav-bar";
import { scrollToTop } from "@/lib/utils";

const answerSchema = z.object({
  answerText: z.string().min(1, "Answer is required"),
});

export default function HomeworkPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const [editingHomeworkId, setEditingHomeworkId] = useState<number | null>(null);

  // Fetch user's homework assignments
  const {
    data: homeworkData,
    isLoading: isHomeworkLoading,
    error: homeworkError,
    refetch: refetchHomework,
  } = useQuery<HomeworkAssignment[]>({
    queryKey: ["/api/user/homework"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user && !user.isAdmin,
  });

  // Answer form
  const answerForm = useForm<z.infer<typeof answerSchema>>({
    resolver: zodResolver(answerSchema),
    defaultValues: {
      answerText: "",
    },
  });

  // Submit answer mutation
  const submitAnswerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: z.infer<typeof answerSchema> }) => {
      return await apiRequest("PATCH", `/api/user/homework/${id}/answer`, data);
    },
    onSuccess: () => {
      refetchHomework();
      setEditingHomeworkId(null);
      answerForm.reset();
      toast({
        title: "Success",
        description: "Your answer has been submitted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit answer",
        variant: "destructive",
      });
    },
  });

  // Redirect if admin or not authenticated
  useEffect(() => {
    if (!authLoading && (!user || user.isAdmin)) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  // Handle start answering
  const handleStartAnswering = (homework: HomeworkAssignment) => {
    setEditingHomeworkId(homework.id);
    answerForm.reset({
      answerText: homework.answerText || "",
    });
  };

  // Handle cancel answering
  const handleCancelAnswering = () => {
    setEditingHomeworkId(null);
    answerForm.reset();
  };

  // Format date
  const formatDate = (date: string | Date) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (authLoading || isHomeworkLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading your homework...</span>
        </div>
      </div>
    );
  }

  if (!user || user.isAdmin) {
    return null; // Will redirect in useEffect
  }

  if (homeworkError) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-foreground mb-2">Error Loading Homework</h2>
            <p className="text-muted-foreground">Please try refreshing the page</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavBar />
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            size="sm" 
            className="mb-4"
            onClick={() => {
              scrollToTop();
              navigate("/");
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
          <h1 className="text-3xl font-bold text-foreground">Assigned Homework</h1>
          <p className="text-muted-foreground mt-2">
            Answer the questions assigned by your SLI.pro coach to enhance your professional development.
          </p>
        </div>

        {!homeworkData || homeworkData.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Homework Assigned</h3>
              <p className="text-muted-foreground">
                Your coach hasn't assigned any homework questions yet. Check back later!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {homeworkData.map((homework) => (
              <Card key={homework.id} className="overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${
                        homework.answerText 
                          ? "bg-green-100 text-green-600" 
                          : "bg-blue-100 text-blue-600"
                      }`}>
                        {homework.answerText ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : (
                          <BookOpen className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-lg">Question #{homework.id}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Calendar className="h-4 w-4" />
                          Assigned on {formatDate(homework.createdAt)}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant={homework.answerText ? "default" : "secondary"}>
                      {homework.answerText ? "Answered" : "Unanswered"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium text-foreground mb-2">Question:</h4>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {homework.questionText}
                    </p>
                  </div>

                  {editingHomeworkId === homework.id ? (
                    // Answer form
                    <div className="border-t pt-4">
                      <Form {...answerForm}>
                        <form onSubmit={answerForm.handleSubmit((data) => 
                          submitAnswerMutation.mutate({ id: homework.id, data })
                        )}>
                          <FormField
                            control={answerForm.control}
                            name="answerText"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Your Answer</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Enter your answer here..."
                                    className="min-h-[120px]"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="flex gap-2 mt-4">
                            <Button 
                              type="submit" 
                              disabled={submitAnswerMutation.isPending}
                            >
                              {submitAnswerMutation.isPending && (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              )}
                              Submit Answer
                            </Button>
                            <Button 
                              type="button" 
                              variant="outline"
                              onClick={handleCancelAnswering}
                            >
                              Cancel
                            </Button>
                          </div>
                        </form>
                      </Form>
                    </div>
                  ) : homework.answerText ? (
                    // Show existing answer
                    <div className="border-t pt-4">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <h4 className="font-medium text-green-800 mb-2">Your Answer:</h4>
                        <p className="text-green-700 whitespace-pre-wrap mb-3">
                          {homework.answerText}
                        </p>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-green-600">
                            Last updated: {formatDate(homework.updatedAt)}
                          </p>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleStartAnswering(homework)}
                            className="border-green-300 text-green-700 hover:bg-green-50"
                          >
                            Update Answer
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Show answer button for unanswered questions
                    <div className="border-t pt-4">
                      <Button onClick={() => handleStartAnswering(homework)}>
                        Answer Now
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
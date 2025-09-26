import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import NavBar from "@/components/nav-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Play, CheckCircle, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type EnhancementModule = {
  id: number;
  userId: number;
  moduleCode: string;
  status: 'available' | 'in_progress' | 'completed';
  startedAt?: string;
  completedAt?: string;
  timerElapsed?: number;
};

export default function EnhancementModulesPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch enhancement modules
  const { data: modules, isLoading, error } = useQuery<EnhancementModule[]>({
    queryKey: ['/api/enhancement-modules'],
    enabled: !!user,
  });

  // Start module mutation
  const startModuleMutation = useMutation({
    mutationFn: async (moduleCode: string) => {
      return await apiRequest('POST', `/api/enhancement-modules/${moduleCode}/start`);
    },
    onSuccess: (data, moduleCode) => {
      queryClient.invalidateQueries({ queryKey: ['/api/enhancement-modules'] });
      toast({
        title: "Module Started",
        description: `Enhancement Module ${moduleCode} has been started.`,
      });
      // Navigate to the chat interface for this module
      navigate(`/enhancement-modules/${moduleCode}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start module",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: EnhancementModule['status']) => {
    const variants = {
      available: { variant: "default" as const, icon: Play, text: "Available" },
      in_progress: { variant: "outline" as const, icon: MessageSquare, text: "In Progress" },
      completed: { variant: "destructive" as const, icon: CheckCircle, text: "Completed" }
    };
    
    const config = variants[status];
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.text}
      </Badge>
    );
  };

  const getModuleDetails = (moduleCode: string) => {
    const details = {
      'A': {
        title: "Module A: Digital Behavior Analysis Framework: LinkedIn Presence & Content Strategy Assessment",
        subtitle: "Understanding Digital Behavior Patterns & Barriers",
        description: "Analyze your LinkedIn presence and content strategy patterns to identify opportunities and barriers for professional growth."
      },
      'B': {
        title: "Module B: Network Position Mapping Framework: Strategic Relationship & Influence Analysis", 
        subtitle: "Random Networking vs. Strategic Positioning",
        description: "Map your current network position and develop strategic relationship building approaches for enhanced professional influence."
      },
      'C': {
        title: "Module C: Career Aspiration Alignment Framework: Long-Term Goals & Positioning Refinement",
        subtitle: "Aspirational Goals vs. Current Positioning Reality", 
        description: "Align your long-term career aspirations with your current positioning to create an actionable roadmap for professional advancement."
      }
    };
    return details[moduleCode as keyof typeof details] || { title: `Module ${moduleCode}`, subtitle: "", description: "" };
  };

  const handleStartModule = (moduleCode: string) => {
    startModuleMutation.mutate(moduleCode);
  };

  const handleContinueModule = (moduleCode: string) => {
    navigate(`/enhancement-modules/${moduleCode}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-red-600">Error loading enhancement modules</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <NavBar />
      
      <div className="container mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent mb-4">
            Professional Enhancement Modules
          </h1>
          <p className="text-lg md:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
            Advance your professional growth through specialized coaching modules designed to enhance your digital presence, strategic networking, and career positioning.
          </p>
        </div>

        {/* Modules Grid */}
        <div className="grid gap-8 md:grid-cols-1 lg:grid-cols-1 max-w-4xl mx-auto">
          {modules?.map((module) => {
            const details = getModuleDetails(module.moduleCode);
            return (
              <Card key={module.id} className="relative overflow-hidden border-0 shadow-xl bg-white/80 backdrop-blur-sm hover:shadow-2xl transition-all duration-300 group hover:scale-[1.02]">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <CardTitle className="text-xl md:text-2xl font-bold text-slate-800 mb-2 leading-tight">
                        {details.title}
                      </CardTitle>
                      <CardDescription className="text-base text-blue-600 font-medium mb-3">
                        {details.subtitle}
                      </CardDescription>
                      <p className="text-slate-600 leading-relaxed">
                        {details.description}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-3 ml-4">
                      {getStatusBadge(module.status)}
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="flex items-center justify-between pt-4">
                    <div className="flex items-center gap-4">
                      {module.timerElapsed && module.timerElapsed > 0 && (
                        <div className="text-sm text-slate-500">
                          Time spent: {Math.floor(module.timerElapsed / 60)}m {module.timerElapsed % 60}s
                        </div>
                      )}
                      {module.completedAt && (
                        <div className="text-sm text-green-600 font-medium">
                          Completed: {new Date(module.completedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-3">
                      {module.status === 'available' && (
                        <Button 
                          onClick={() => handleStartModule(module.moduleCode)}
                          disabled={startModuleMutation.isPending}
                          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
                          data-testid={`button-start-module-${module.moduleCode}`}
                        >
                          {startModuleMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Starting...
                            </>
                          ) : (
                            <>
                              <Play className="mr-2 h-4 w-4" />
                              Start Module
                            </>
                          )}
                        </Button>
                      )}
                      
                      {module.status === 'in_progress' && (
                        <Button 
                          onClick={() => handleContinueModule(module.moduleCode)}
                          variant="outline"
                          className="border-2 border-blue-200 text-blue-600 hover:bg-blue-50 font-medium px-6 py-2 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
                          data-testid={`button-continue-module-${module.moduleCode}`}
                        >
                          <MessageSquare className="mr-2 h-4 w-4" />
                          Continue Module
                        </Button>
                      )}
                      
                      {module.status === 'completed' && (
                        <Button 
                          onClick={() => handleContinueModule(module.moduleCode)}
                          variant="outline"
                          className="border-2 border-green-200 text-green-600 hover:bg-green-50 font-medium px-6 py-2 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
                          data-testid={`button-view-module-${module.moduleCode}`}
                        >
                          <CheckCircle className="mr-2 h-4 w-4" />
                          View Results
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import NavBar from "@/components/nav-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Play, CheckCircle, MessageSquare, ArrowLeft } from "lucide-react";
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
      <div className="min-h-screen bg-background flex flex-col">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-destructive">Error loading enhancement modules</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-primary/10 flex flex-col">
      <NavBar />
      
      <div className="container mx-auto px-4 py-8">
        {/* Header Section with Back Button */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-8">
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
              className="gap-2 hover:bg-primary/10"
              data-testid="button-back-home"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent">
              Enhancement Modules
            </h1>
            <div className="w-32"></div> {/* Spacer for balance */}
          </div>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed text-center">
            Advance your professional growth through specialized coaching modules designed to enhance your digital presence, strategic networking, and career positioning.
          </p>
        </div>

        {/* Modules Grid */}
        <div className="grid gap-8 md:grid-cols-1 lg:grid-cols-1 max-w-4xl mx-auto">
          {modules?.map((module) => {
            const details = getModuleDetails(module.moduleCode);
            const moduleColors = {
              'A': 'from-primary/20 via-primary/10 to-transparent',
              'B': 'from-primary/15 via-primary/8 to-transparent',
              'C': 'from-primary/20 via-primary/10 to-transparent'
            };
            const gradientColor = moduleColors[module.moduleCode as keyof typeof moduleColors];
            
            return (
              <Card key={module.id} className="relative overflow-hidden bg-card border-2 hover:shadow-xl transition-all duration-300 group" style={{ borderColor: 'hsl(167, 40%, 70%)' }}>
                {/* Decorative gradient overlay */}
                <div className={`absolute inset-0 bg-gradient-to-br ${gradientColor} pointer-events-none`} />
                
                {/* Module letter badge */}
                <div className="absolute top-4 right-4 w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold text-2xl z-10 shadow-md" style={{
                  backgroundColor: 'hsl(167, 40%, 90%)',
                  borderColor: 'hsl(167, 40%, 35%)',
                  color: 'hsl(167, 40%, 35%)'
                }}>
                  {module.moduleCode}
                </div>
                
                <CardHeader className="pb-4 relative z-10">
                  <div className="flex items-start justify-between mb-4 pr-16">
                    <div className="flex-1">
                      <CardTitle className="text-xl md:text-2xl font-bold text-foreground mb-2 leading-tight">
                        {details.title}
                      </CardTitle>
                      <div className="text-base font-semibold mb-3 flex items-center gap-2" style={{ color: 'hsl(167, 40%, 35%)' }}>
                        <div className="h-1 w-8 rounded-full" style={{ backgroundColor: 'hsl(167, 40%, 35%)' }} />
                        {details.subtitle}
                      </div>
                      <p className="text-muted-foreground leading-relaxed">
                        {details.description}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-4">
                    {getStatusBadge(module.status)}
                  </div>
                </CardHeader>
                
                <CardContent className="relative z-10">
                  <div className="flex items-center justify-between pt-4 border-t border-primary/20">
                    <div className="flex items-center gap-4">
                      {module.timerElapsed && module.timerElapsed > 0 && (
                        <div className="text-sm text-foreground font-medium bg-muted px-3 py-1 rounded-full border-2 border-border">
                          ⏱️ {Math.floor(module.timerElapsed / 60)}m {module.timerElapsed % 60}s
                        </div>
                      )}
                      {module.completedAt && (
                        <div className="text-sm font-semibold px-3 py-1 rounded-full border-2" style={{ 
                          color: 'hsl(167, 40%, 35%)', 
                          backgroundColor: 'hsl(167, 40%, 90%)',
                          borderColor: 'hsl(167, 40%, 35%)'
                        }}>
                          ✓ {new Date(module.completedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-3">
                      {module.status === 'available' && (
                        <Button 
                          onClick={() => handleStartModule(module.moduleCode)}
                          disabled={startModuleMutation.isPending}
                          className="font-medium px-6 py-2 shadow-lg hover:shadow-xl transition-all text-white"
                          style={{ 
                            backgroundColor: 'hsl(167, 40%, 35%)',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(167, 40%, 30%)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(167, 40%, 35%)'}
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
                          className="font-medium px-6 py-2 border-2 bg-white hover:text-white transition-all"
                          style={{ 
                            borderColor: 'hsl(167, 40%, 35%)',
                            color: 'hsl(167, 40%, 35%)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'hsl(167, 40%, 35%)';
                            e.currentTarget.style.color = 'white';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                            e.currentTarget.style.color = 'hsl(167, 40%, 35%)';
                          }}
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
                          className="font-medium px-6 py-2 border-2 bg-white hover:text-white transition-all"
                          style={{ 
                            borderColor: 'hsl(167, 40%, 35%)',
                            color: 'hsl(167, 40%, 35%)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'hsl(167, 40%, 35%)';
                            e.currentTarget.style.color = 'white';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                            e.currentTarget.style.color = 'hsl(167, 40%, 35%)';
                          }}
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
import { useState } from "react";
import { UserProfile, InsertExperience, InsertEducation } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Edit } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Validation schema for experience
const experienceSchema = z.object({
  title: z.string().min(1, "Job title is required"),
  company: z.string().min(1, "Company name is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  description: z.string().optional(),
  current: z.boolean().default(false),
});

// Validation schema for education
const educationSchema = z.object({
  degree: z.string().min(1, "Degree is required"),
  institution: z.string().min(1, "Institution is required"),
  startYear: z.string().min(1, "Start year is required"),
  endYear: z.string().optional(),
  description: z.string().optional(),
});

type ExperienceFormValues = z.infer<typeof experienceSchema>;
type EducationFormValues = z.infer<typeof educationSchema>;

interface ProfileStep2Props {
  userProfile?: UserProfile;
  onNext: () => void;
  onBack: () => void;
}

export default function ProfileStep2({
  userProfile,
  onNext,
  onBack,
}: ProfileStep2Props) {
  const { toast } = useToast();
  const [experienceDialogOpen, setExperienceDialogOpen] = useState(false);
  const [educationDialogOpen, setEducationDialogOpen] = useState(false);
  const [isSubmittingExp, setIsSubmittingExp] = useState(false);
  const [isSubmittingEdu, setIsSubmittingEdu] = useState(false);
  const [editingExperienceId, setEditingExperienceId] = useState<number | null>(null);
  const [editingEducationId, setEditingEducationId] = useState<number | null>(null);

  // Initialize experience form
  const experienceForm = useForm<ExperienceFormValues>({
    resolver: zodResolver(experienceSchema),
    defaultValues: {
      title: "",
      company: "",
      startDate: "",
      endDate: "",
      description: "",
      current: false,
    },
  });

  // Initialize education form
  const educationForm = useForm<EducationFormValues>({
    resolver: zodResolver(educationSchema),
    defaultValues: {
      degree: "",
      institution: "",
      startYear: "",
      endYear: "",
      description: "",
    },
  });

  // Watch current status to handle end date field
  const isCurrentJob = experienceForm.watch("current");

  // Handle experience form submission
  const onSubmitExperience = async (data: ExperienceFormValues) => {
    setIsSubmittingExp(true);
    try {
      // If current job, remove end date
      if (data.current) {
        data.endDate = undefined;
      }

      if (editingExperienceId) {
        // Update existing experience
        await apiRequest("PUT", `/api/experiences/${editingExperienceId}`, data);
        toast({
          title: "Success",
          description: "Experience updated successfully",
        });
      } else {
        // Create new experience
        await apiRequest("POST", "/api/experiences", data);
        toast({
          title: "Success",
          description: "Experience added successfully",
        });
      }

      // Reset form and close dialog
      experienceForm.reset();
      setExperienceDialogOpen(false);
      setEditingExperienceId(null);
      
      // Refresh the profile data
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save experience.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingExp(false);
    }
  };

  // Handle education form submission
  const onSubmitEducation = async (data: EducationFormValues) => {
    setIsSubmittingEdu(true);
    try {
      if (editingEducationId) {
        // Update existing education
        await apiRequest("PUT", `/api/education/${editingEducationId}`, data);
        toast({
          title: "Success",
          description: "Education updated successfully",
        });
      } else {
        // Create new education
        await apiRequest("POST", "/api/education", data);
        toast({
          title: "Success",
          description: "Education added successfully",
        });
      }

      // Reset form and close dialog
      educationForm.reset();
      setEducationDialogOpen(false);
      setEditingEducationId(null);
      
      // Refresh the profile data
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save education.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingEdu(false);
    }
  };

  // Edit an existing experience
  const handleEditExperience = (experience: any) => {
    setEditingExperienceId(experience.id);
    experienceForm.reset({
      title: experience.title,
      company: experience.company,
      startDate: experience.startDate,
      endDate: experience.endDate || "",
      description: experience.description || "",
      current: !experience.endDate,
    });
    setExperienceDialogOpen(true);
  };

  // Edit an existing education
  const handleEditEducation = (education: any) => {
    setEditingEducationId(education.id);
    educationForm.reset({
      degree: education.degree,
      institution: education.institution,
      startYear: education.startYear,
      endYear: education.endYear || "",
      description: education.description || "",
    });
    setEducationDialogOpen(true);
  };

  // Delete an experience
  const handleDeleteExperience = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/experiences/${id}`);
      toast({
        title: "Success",
        description: "Experience deleted successfully",
      });
      
      // Refresh the profile data
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete experience.",
        variant: "destructive",
      });
    }
  };

  // Delete an education
  const handleDeleteEducation = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/education/${id}`);
      toast({
        title: "Success",
        description: "Education deleted successfully",
      });
      
      // Refresh the profile data
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete education.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 gap-6">
        {/* Experiences Section */}
        <div>
          <label className="block text-sm font-medium text-[#333333] mb-3">Work Experience</label>
          
          <div id="experienceEntries">
            {userProfile?.experiences && userProfile.experiences.length > 0 ? (
              userProfile.experiences.map((experience) => (
                <div key={experience.id} className="bg-gray-50 p-4 rounded-md mb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{experience.title}</h4>
                      <p className="text-sm text-gray-600">{experience.company}</p>
                      <p className="text-sm text-gray-500">
                        {experience.startDate} - {experience.endDate || "Present"}
                      </p>
                      {experience.description && <p className="mt-1 text-sm">{experience.description}</p>}
                    </div>
                    <div className="flex space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-[#bed6d1] hover:text-opacity-80"
                        onClick={() => handleEditExperience(experience)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-[#E34240] hover:text-opacity-80"
                        onClick={() => handleDeleteExperience(experience.id)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 mb-4">No work experience added yet.</p>
            )}
          </div>
          
          <Dialog open={experienceDialogOpen} onOpenChange={setExperienceDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="outline"
                className="mt-2 flex items-center text-[#bed6d1] border-[#bed6d1] hover:text-opacity-80"
              >
                <Plus className="h-5 w-5 mr-1" />
                Add Work Experience
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingExperienceId ? "Edit Work Experience" : "Add Work Experience"}
                </DialogTitle>
              </DialogHeader>
              
              <Form {...experienceForm}>
                <form onSubmit={experienceForm.handleSubmit(onSubmitExperience)} className="space-y-4 mt-4">
                  <FormField
                    control={experienceForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Job Title</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Software Engineer" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={experienceForm.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Tech Company Inc." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={experienceForm.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g. Jan 2020" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {!isCurrentJob && (
                      <FormField
                        control={experienceForm.control}
                        name="endDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Date</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g. Dec 2022" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                  
                  <FormField
                    control={experienceForm.control}
                    name="current"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="font-normal">
                          I currently work here
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={experienceForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Describe your role and responsibilities"
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        experienceForm.reset();
                        setExperienceDialogOpen(false);
                        setEditingExperienceId(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit"
                      className="bg-[#bed6d1] hover:bg-opacity-90"
                      disabled={isSubmittingExp}
                    >
                      {isSubmittingExp ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
        
        {/* Education Section */}
        <div>
          <label className="block text-sm font-medium text-[#333333] mb-3">Education</label>
          
          <div id="educationEntries">
            {userProfile?.education && userProfile.education.length > 0 ? (
              userProfile.education.map((edu) => (
                <div key={edu.id} className="bg-gray-50 p-4 rounded-md mb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{edu.degree}</h4>
                      <p className="text-sm text-gray-600">{edu.institution}</p>
                      <p className="text-sm text-gray-500">
                        {edu.startYear} - {edu.endYear || "Present"}
                      </p>
                      {edu.description && <p className="mt-1 text-sm">{edu.description}</p>}
                    </div>
                    <div className="flex space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-[#bed6d1] hover:text-opacity-80"
                        onClick={() => handleEditEducation(edu)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-[#E34240] hover:text-opacity-80"
                        onClick={() => handleDeleteEducation(edu.id)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 mb-4">No education added yet.</p>
            )}
          </div>
          
          <Dialog open={educationDialogOpen} onOpenChange={setEducationDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="outline"
                className="mt-2 flex items-center text-[#bed6d1] border-[#bed6d1] hover:text-opacity-80"
              >
                <Plus className="h-5 w-5 mr-1" />
                Add Education
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingEducationId ? "Edit Education" : "Add Education"}
                </DialogTitle>
              </DialogHeader>
              
              <Form {...educationForm}>
                <form onSubmit={educationForm.handleSubmit(onSubmitEducation)} className="space-y-4 mt-4">
                  <FormField
                    control={educationForm.control}
                    name="degree"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Degree</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Bachelor of Science in Computer Science" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={educationForm.control}
                    name="institution"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Institution</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. University of Technology" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={educationForm.control}
                      name="startYear"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Year</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g. 2016" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={educationForm.control}
                      name="endYear"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Year</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g. 2020" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={educationForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Describe your studies and achievements"
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        educationForm.reset();
                        setEducationDialogOpen(false);
                        setEditingEducationId(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit"
                      className="bg-[#bed6d1] hover:bg-opacity-90"
                      disabled={isSubmittingEdu}
                    >
                      {isSubmittingEdu ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      <div className="mt-8 flex justify-between">
        <Button 
          type="button"
          variant="outline" 
          className="px-6 py-3 border border-gray-300 rounded-md text-[#333333] hover:bg-gray-50"
          onClick={onBack}
        >
          Back
        </Button>
        <Button 
          type="button"
          className="px-6 py-3 bg-[#bed6d1] hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#bed6d1]"
          onClick={onNext}
        >
          Continue to Skills
        </Button>
      </div>
    </div>
  );
}

import { useState, KeyboardEvent } from "react";
import { UserProfile, InsertSkill, InsertLanguage } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ProfileStep3Props {
  userProfile?: UserProfile;
  onBack: () => void;
  onComplete: () => void;
}

export default function ProfileStep3({
  userProfile,
  onBack,
  onComplete,
}: ProfileStep3Props) {
  const { toast } = useToast();
  
  const [skillInput, setSkillInput] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("");
  const [selectedProficiency, setSelectedProficiency] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Add a skill to the user's profile
  const handleAddSkill = async () => {
    if (!skillInput.trim()) return;
    
    try {
      await apiRequest("POST", "/api/skills", { name: skillInput.trim() });
      
      // Clear input and refresh data
      setSkillInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      
      toast({
        title: "Success",
        description: "Skill added successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add skill",
        variant: "destructive",
      });
    }
  };
  
  // Delete a skill
  const handleDeleteSkill = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/skills/${id}`);
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      
      toast({
        title: "Success",
        description: "Skill removed successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove skill",
        variant: "destructive",
      });
    }
  };
  
  // Add a language to the user's profile
  const handleAddLanguage = async () => {
    if (!selectedLanguage || !selectedProficiency) {
      toast({
        title: "Error",
        description: "Please select both a language and proficiency level",
        variant: "destructive",
      });
      return;
    }
    
    try {
      await apiRequest("POST", "/api/languages", {
        name: selectedLanguage,
        proficiency: selectedProficiency,
      });
      
      // Clear inputs and refresh data
      setSelectedLanguage("");
      setSelectedProficiency("");
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      
      toast({
        title: "Success",
        description: "Language added successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add language",
        variant: "destructive",
      });
    }
  };
  
  // Delete a language
  const handleDeleteLanguage = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/languages/${id}`);
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      
      toast({
        title: "Success",
        description: "Language removed successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove language",
        variant: "destructive",
      });
    }
  };
  
  // Handle enter key press in skill input
  const handleSkillKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSkill();
    }
  };
  
  // Complete the profile setup
  const handleCompleteProfile = async () => {
    setIsSubmitting(true);
    try {
      await onComplete();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to complete profile",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 gap-6">
        {/* Skills Section */}
        <div>
          <label htmlFor="skills" className="block text-sm font-medium text-[#333333] mb-1">Skills</label>
          <div className="relative">
            <Input
              id="skillInput"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyPress={handleSkillKeyPress}
              className="block w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#bed6d1] focus:ring-opacity-50"
              placeholder="Add a skill (e.g. JavaScript, Project Management)"
            />
            <Button
              type="button"
              onClick={handleAddSkill}
              className="absolute inset-y-0 right-0 px-4 flex items-center bg-[#bed6d1] text-white rounded-r-md hover:bg-opacity-90 focus:outline-none"
            >
              Add
            </Button>
          </div>
          
          <div className="mt-3 flex flex-wrap gap-2" id="skillsList">
            {userProfile?.skills && userProfile.skills.length > 0 ? (
              userProfile.skills.map((skill) => (
                <div
                  key={skill.id}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-[#dcede9] bg-opacity-20 text-[#bed6d1]"
                >
                  <span>{skill.name}</span>
                  <button
                    type="button"
                    className="ml-1 text-[#bed6d1] focus:outline-none"
                    onClick={() => handleDeleteSkill(skill.id)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            ) : (
              <p className="text-gray-500">No skills added yet.</p>
            )}
          </div>
        </div>
        
        {/* Languages Section */}
        <div>
          <label htmlFor="languages" className="block text-sm font-medium text-[#333333] mb-1">Languages</label>
          <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
            <SelectTrigger className="w-full mb-2">
              <SelectValue placeholder="Select a language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="english">English</SelectItem>
              <SelectItem value="spanish">Spanish</SelectItem>
              <SelectItem value="french">French</SelectItem>
              <SelectItem value="german">German</SelectItem>
              <SelectItem value="chinese">Chinese</SelectItem>
              <SelectItem value="japanese">Japanese</SelectItem>
              <SelectItem value="arabic">Arabic</SelectItem>
              <SelectItem value="russian">Russian</SelectItem>
              <SelectItem value="portuguese">Portuguese</SelectItem>
              <SelectItem value="italian">Italian</SelectItem>
              <SelectItem value="hindi">Hindi</SelectItem>
              <SelectItem value="korean">Korean</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={selectedProficiency} onValueChange={setSelectedProficiency}>
            <SelectTrigger className="w-full mb-2">
              <SelectValue placeholder="Select proficiency level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Native or bilingual">Native or bilingual</SelectItem>
              <SelectItem value="Fluent">Fluent</SelectItem>
              <SelectItem value="Advanced">Advanced</SelectItem>
              <SelectItem value="Intermediate">Intermediate</SelectItem>
              <SelectItem value="Basic">Basic</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            type="button"
            variant="outline"
            className="mt-2 px-4 py-2 border border-[#bed6d1] text-[#bed6d1] rounded-md hover:bg-[#bed6d1] hover:bg-opacity-10 focus:outline-none"
            onClick={handleAddLanguage}
          >
            Add Language
          </Button>
          
          <div className="mt-3">
            <ul className="divide-y divide-gray-200" id="languagesList">
              {userProfile?.languages && userProfile.languages.length > 0 ? (
                userProfile.languages.map((language) => (
                  <li key={language.id} className="py-2 flex justify-between items-center">
                    <div>
                      <span className="font-medium">{language.name}</span>
                      <span className="text-sm text-gray-500 ml-2">{language.proficiency}</span>
                    </div>
                    <button
                      type="button"
                      className="text-[#E34240] hover:text-opacity-80 focus:outline-none"
                      onClick={() => handleDeleteLanguage(language.id)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </li>
                ))
              ) : (
                <li className="py-2 text-gray-500">No languages added yet.</li>
              )}
            </ul>
          </div>
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
          onClick={handleCompleteProfile}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Completing...
            </>
          ) : (
            "Complete Profile"
          )}
        </Button>
      </div>
    </div>
  );
}

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Document } from "@shared/schema";
import { Upload, File, FileText, Trash2, Eye, Image, FileType, ExternalLink } from "lucide-react";

// Document types
const DOCUMENT_TYPES = [
  { id: "resume", label: "Resume" },
  { id: "linkedin", label: "LinkedIn Profile PDF" },
  { id: "certificate", label: "Certificate" },
  { id: "cover_letter", label: "Cover Letter" },
  { id: "other", label: "Other Document" },
  { id: "assessment-pdf", label: "Assessment (PDF)" },
  { id: "assessment-image", label: "Assessment (Image)" },
  { id: "assessment-doc", label: "Assessment (Document)" }
];

const DocumentUpload = () => {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [isUploadingLinkedIn, setIsUploadingLinkedIn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const linkedInInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Query to fetch documents
  const { 
    data: documents = [], 
    isLoading: isLoadingDocuments 
  } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  // Mutation for uploading document
  const uploadDocumentMutation = useMutation({
    mutationFn: async (documentData: {
      name: string;
      type: string;
      fileName: string;
      fileData: string;
    }) => {
      const response = await apiRequest("POST", "/api/documents", documentData);
      return response.json();
    },
    onSuccess: () => {
      // Reset form
      setName("");
      setType("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      
      // Invalidate documents query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      
      toast({
        title: "Success",
        description: "Document uploaded successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to upload document: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Mutation for deleting document
  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to delete document: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form fields
    if (!name) {
      toast({
        title: "Error",
        description: "Please enter a document name",
        variant: "destructive",
      });
      return;
    }
    
    if (!type) {
      toast({
        title: "Error",
        description: "Please select a document type",
        variant: "destructive",
      });
      return;
    }
    
    const fileInput = fileInputRef.current;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      toast({
        title: "Error",
        description: "Please select a PDF file to upload",
        variant: "destructive",
      });
      return;
    }
    
    const file = fileInput.files[0];
    
    // Check if file type is supported (PDF, DOC, DOCX)
    const supportedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    
    if (!supportedTypes.includes(file.type)) {
      toast({
        title: "Error",
        description: "Only PDF, DOC, and DOCX files are supported",
        variant: "destructive",
      });
      return;
    }
    
    // Check file size (2MB limit to ensure it works with the server limit)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "File size should be less than 2MB",
        variant: "destructive",
      });
      return;
    }
    
    setIsUploading(true);
    
    try {
      // Convert file to base64
      const base64 = await fileToBase64(file);
      
      // Upload document
      await uploadDocumentMutation.mutateAsync({
        name,
        type,
        fileName: file.name,
        fileData: base64,
      });
      
      // Show success message
      toast({
        title: "Success!",
        description: "Document uploaded successfully",
        variant: "default",
      });
    } catch (error) {
      console.error("Document upload error:", error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to process file for upload. The server may have rejected the file due to size limits.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset form after upload (regardless of success/failure)
      setName("");
      setType(DOCUMENT_TYPES[0].id);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Handle specific resume upload
  const handleResumeUpload = async () => {
    const fileInput = resumeInputRef.current;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      toast({
        title: "Error",
        description: "Please select a PDF file to upload",
        variant: "destructive",
      });
      return;
    }
    
    const file = fileInput.files[0];
    
    if (file.type !== "application/pdf") {
      toast({
        title: "Error",
        description: "Only PDF files are supported",
        variant: "destructive",
      });
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "File size should be less than 2MB",
        variant: "destructive",
      });
      return;
    }
    
    setIsUploadingResume(true);
    
    try {
      const base64 = await fileToBase64(file);
      
      await uploadDocumentMutation.mutateAsync({
        name: "resume",
        type: "resume",
        fileName: file.name,
        fileData: base64,
      });
      
      if (resumeInputRef.current) {
        resumeInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Resume upload error:", error);
    } finally {
      setIsUploadingResume(false);
    }
  };

  // Handle specific LinkedIn upload
  const handleLinkedInUpload = async () => {
    const fileInput = linkedInInputRef.current;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      toast({
        title: "Error",
        description: "Please select a PDF file to upload",
        variant: "destructive",
      });
      return;
    }
    
    const file = fileInput.files[0];
    
    if (file.type !== "application/pdf") {
      toast({
        title: "Error",
        description: "Only PDF files are supported",
        variant: "destructive",
      });
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "File size should be less than 2MB",
        variant: "destructive",
      });
      return;
    }
    
    setIsUploadingLinkedIn(true);
    
    try {
      const base64 = await fileToBase64(file);
      
      await uploadDocumentMutation.mutateAsync({
        name: "linkedIn",
        type: "linkedin",
        fileName: file.name,
        fileData: base64,
      });
      
      if (linkedInInputRef.current) {
        linkedInInputRef.current.value = "";
      }
    } catch (error) {
      console.error("LinkedIn upload error:", error);
    } finally {
      setIsUploadingLinkedIn(false);
    }
  };
  
  const handleDelete = async (id: number) => {
    if (window.confirm("Are you sure you want to delete this document?")) {
      try {
        await deleteDocumentMutation.mutateAsync(id);
        
        toast({
          title: "Success",
          description: "Document deleted successfully",
          variant: "default",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete document",
          variant: "destructive",
        });
      }
    }
  };
  
  const handleViewDocument = (document: Document) => {
    try {
      // Create a blob from the base64 data
      const byteCharacters = atob(document.fileData);
      const byteNumbers = new Array(byteCharacters.length);
      
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      
      const byteArray = new Uint8Array(byteNumbers);
      
      // Determine content type based on document type
      let contentType = 'application/pdf';
      if (document.type === 'assessment-image') {
        // Use a generic image type, browsers will detect the actual format
        contentType = 'image/jpeg';
      } else if (document.type === 'assessment-doc') {
        // For doc/docx files
        contentType = 'application/msword';
      }
      
      const blob = new Blob([byteArray], { type: contentType });
      
      // Create a URL for the blob and open it in a new tab
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      
      // Clean up URL after a short delay
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error("Error viewing document:", error);
      toast({
        title: "Error",
        description: "Failed to view document",
        variant: "destructive",
      });
    }
  };

  // Helper function to convert File to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (!reader.result) {
          reject(new Error("Failed to read file"));
          return;
        }
        
        // Extract the base64 data part from the data URL
        const base64String = reader.result.toString();
        const base64Data = base64String.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Upload Your Professional Documents</CardTitle>
          <CardDescription>
            Help us understand your current positioning and strengths by sharing key documents
          </CardDescription>
        </CardHeader>
        
        {/* Required Documents Section */}
        <CardContent className="border-b">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Required Documents</h3>
            
            {/* Resume Upload Block */}
            <div className="mb-6 p-4 border rounded-lg bg-gray-50">
              <h4 className="text-md font-medium text-gray-900 mb-2">Resume (Required)</h4>
              <p className="text-sm text-gray-700 mb-3">
                <strong>Upload your most recent resume</strong> Any version is fine—current or past. This helps us understand your professional experience and how you currently present your background.
              </p>
              <p className="text-sm text-gray-600 mb-3">
                <strong>Accepted Format:</strong> PDF only
              </p>
              
              {/* Check if resume already exists */}
              {documents.some(doc => doc.type === 'resume') ? (
                <div className="flex items-center text-green-600 mb-3">
                  <FileText className="h-4 w-4 mr-2" />
                  <span className="text-sm font-medium">Resume uploaded ✓</span>
                </div>
              ) : null}
              
              <div className="flex items-center space-x-3">
                <Input
                  type="file"
                  accept="application/pdf"
                  ref={resumeInputRef}
                  className="cursor-pointer flex-1"
                />
                <Button 
                  onClick={handleResumeUpload}
                  disabled={isUploadingResume}
                  className="shrink-0"
                >
                  {isUploadingResume ? "Uploading..." : "Upload resume"}
                </Button>
              </div>
            </div>
            
            {/* LinkedIn Profile PDF Upload Block */}
            <div className="p-4 border rounded-lg bg-gray-50">
              <h4 className="text-md font-medium text-gray-900 mb-2">LinkedIn Profile PDF (Required)</h4>
              <p className="text-sm text-gray-700 mb-3">
                <strong>Download and upload your LinkedIn profile as a PDF</strong> This allows us to analyze how your online presence aligns with your career goals.
              </p>
              
              <div className="mb-3">
                <p className="text-sm font-medium text-gray-900 mb-2">How to download your LinkedIn profile:</p>
                <ul className="text-sm text-gray-700 space-y-1 ml-4 list-disc">
                  <li>Go to your LinkedIn profile page (linkedin.com/in/yourname)</li>
                  <li>Click the "More" button below your profile photo</li>
                  <li>Select "Save to PDF" from the dropdown</li>
                  <li>Save the file to your computer</li>
                  <li>Upload it below</li>
                </ul>
                <p className="text-sm mt-2">
                  <a 
                    href="https://www.linkedin.com/help/linkedin/answer/a541960" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline inline-flex items-center"
                  >
                    Need help? <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </p>
              </div>
              
              <p className="text-sm text-gray-600 mb-3">
                <strong>Accepted Format:</strong> PDF only
              </p>
              
              {/* Check if LinkedIn profile already exists */}
              {documents.some(doc => doc.type === 'linkedin') ? (
                <div className="flex items-center text-green-600 mb-3">
                  <FileText className="h-4 w-4 mr-2" />
                  <span className="text-sm font-medium">LinkedIn Profile PDF uploaded ✓</span>
                </div>
              ) : null}
              
              <div className="flex items-center space-x-3">
                <Input
                  type="file"
                  accept="application/pdf"
                  ref={linkedInInputRef}
                  className="cursor-pointer flex-1"
                />
                <Button 
                  onClick={handleLinkedInUpload}
                  disabled={isUploadingLinkedIn}
                  className="shrink-0"
                >
                  {isUploadingLinkedIn ? "Uploading..." : "Upload LinkedIn PDF"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
        
        {/* Optional Documents Section */}
        <CardContent>
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Optional Documents</h3>
            <div className="mb-4">
              <p className="text-sm text-gray-700 mb-3">
                <strong>Enhance Your Assessment (Optional)</strong><br />
                If you have completed any personality, strengths, or leadership assessments, please share them. These provide valuable insights into your natural positioning and communication style.
              </p>
              
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-900 mb-2">Common Assessment Types:</p>
                <ul className="text-sm text-gray-700 space-y-1 ml-4 list-disc">
                  <li>Myers-Briggs Type Indicator (MBTI)</li>
                  <li>Enneagram</li>
                  <li>StrengthsFinder / CliftonStrengths</li>
                  <li>VIA Character Strengths Survey</li>
                  <li>DiSC Profile</li>
                  <li>360° Leadership or Team Assessments</li>
                  <li>Any other professional assessment results</li>
                </ul>
              </div>
              
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-gray-700">
                  <strong>Why share these?</strong><br />
                  Personality and strengths assessments help us understand your natural communication style and authentic professional positioning, making your SLI more genuine and sustainable.
                </p>
              </div>
            </div>
          </div>
          
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Document Name</Label>
              <Input
                id="name"
                placeholder="e.g., MBTI Assessment Results"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="type">Document Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((docType) => (
                    <SelectItem key={docType.id} value={docType.id}>
                      {docType.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="file">Assessment File</Label>
              <Input
                id="file"
                type="file"
                accept="application/pdf,.doc,.docx"
                ref={fileInputRef}
                className="cursor-pointer"
              />
              <p className="text-xs text-gray-500">
                <strong>Accepted formats:</strong> PDF, DOC & DOCX • Max file size: 2MB
              </p>
            </div>
            
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isUploading}
            >
              {isUploading ? (
                <>Uploading...</>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Assessment
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>My Documents</CardTitle>
          <CardDescription>
            View and manage your uploaded documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingDocuments ? (
            <div className="py-4 text-center text-gray-500">Loading documents...</div>
          ) : documents.length === 0 ? (
            <div className="py-4 text-center text-gray-500">
              <FileText className="mx-auto h-12 w-12 opacity-20 mb-2" />
              <p>No documents uploaded yet</p>
            </div>
          ) : (
            <div>
              {/* Group documents by type */}
              {(() => {
                // Separate user-uploaded documents from assessment documents
                const userDocuments = documents.filter(doc => 
                  !doc.type.startsWith('assessment-')
                );
                
                const assessmentDocuments = documents.filter(doc => 
                  doc.type.startsWith('assessment-')
                );
                
                return (
                  <>
                    {/* Regular Documents Section */}
                    {userDocuments.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-md font-medium mb-3 text-gray-700">Professional Documents</h3>
                        <div className="space-y-4">
                          {userDocuments.map((document) => {
                            // Find document type label
                            const docType = DOCUMENT_TYPES.find(t => t.id === document.type)?.label || document.type;
                            
                            return (
                              <div key={document.id} className="flex items-center justify-between border p-3 rounded-md">
                                <div className="flex items-center space-x-3">
                                  {document.type === 'resume' ? (
                                    <FileText className="h-8 w-8 text-[#bed6d1]" />
                                  ) : document.type === 'linkedin' ? (
                                    <FileText className="h-8 w-8 text-[#bed6d1]" />
                                  ) : (
                                    <File className="h-8 w-8 text-[#bed6d1]" />
                                  )}
                                  <div>
                                    <h4 className="font-medium">{document.name}</h4>
                                    <p className="text-sm text-gray-500">{docType}</p>
                                  </div>
                                </div>
                                
                                <div className="flex space-x-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => handleViewDocument(document)}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="text-red-500" 
                                    onClick={() => handleDelete(document.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* Assessment Documents Section */}
                    {assessmentDocuments.length > 0 && (
                      <div>
                        <h3 className="text-md font-medium mb-3 text-gray-700">Assessment Documents</h3>
                        <div className="space-y-4">
                          {assessmentDocuments.map((document) => {
                            // Extract assessment type
                            let docType = "Assessment";
                            if (document.type === 'assessment-pdf') {
                              docType = "Assessment (PDF)";
                            } else if (document.type === 'assessment-image') {
                              docType = "Assessment (Image)";
                            } else if (document.type === 'assessment-doc') {
                              docType = "Assessment (Document)";
                            }
                            
                            return (
                              <div key={document.id} className="flex items-center justify-between border border-[#dcede9] bg-[#f5faf9] p-3 rounded-md">
                                <div className="flex items-center space-x-3">
                                  {document.type === 'assessment-pdf' ? (
                                    <FileText className="h-8 w-8 text-[#bed6d1]" />
                                  ) : document.type === 'assessment-image' ? (
                                    <Image className="h-8 w-8 text-[#bed6d1]" />
                                  ) : document.type === 'assessment-doc' ? (
                                    <FileType className="h-8 w-8 text-[#bed6d1]" />
                                  ) : (
                                    <File className="h-8 w-8 text-[#bed6d1]" />
                                  )}
                                  <div>
                                    <h4 className="font-medium">{document.name}</h4>
                                    <p className="text-sm text-gray-500">{docType}</p>
                                  </div>
                                </div>
                                
                                <div className="flex space-x-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => handleViewDocument(document)}
                                  >
                                    {document.type === 'assessment-image' ? (
                                      <Image className="h-4 w-4" />
                                    ) : (
                                      <Eye className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="text-red-500" 
                                    onClick={() => handleDelete(document.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Page Footer */}
      <div className="mt-8 p-6 bg-gray-50 rounded-lg border">
        <div className="space-y-3 text-sm text-gray-600">
          <p>
            <strong>Having trouble with uploads?</strong> Contact support at{" "}
            <a 
              href="mailto:support@slipro.com" 
              className="text-blue-600 hover:text-blue-800 underline"
            >
              support@slipro.com
            </a>{" "}
            or use the chat feature for assistance.
          </p>
          <p>
            <strong>Privacy Note:</strong> All documents are securely stored and only used to develop your personalized SLI strategy. Documents are not shared with third parties.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DocumentUpload;
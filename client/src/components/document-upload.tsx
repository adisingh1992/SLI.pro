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
import { Upload, File, FileText, Trash2, Eye, Image, FileType } from "lucide-react";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    
    // Check if file is a PDF
    if (file.type !== "application/pdf") {
      toast({
        title: "Error",
        description: "Only PDF files are supported",
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
          <CardTitle>Upload Document</CardTitle>
          <CardDescription>
            Upload your resume, LinkedIn profile, or other professional documents (PDF format only)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Document Name</Label>
              <Input
                id="name"
                placeholder="e.g., My Professional Resume"
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
              <Label htmlFor="file">PDF File</Label>
              <Input
                id="file"
                type="file"
                accept="application/pdf"
                ref={fileInputRef}
                className="cursor-pointer"
              />
              <p className="text-xs text-gray-500">Max file size: 2MB</p>
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
                  Upload Document
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
                                    <FileText className="h-8 w-8 text-blue-500" />
                                  ) : document.type === 'linkedin' ? (
                                    <FileText className="h-8 w-8 text-blue-500" />
                                  ) : (
                                    <File className="h-8 w-8 text-blue-500" />
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
                              <div key={document.id} className="flex items-center justify-between border border-blue-100 bg-blue-50 p-3 rounded-md">
                                <div className="flex items-center space-x-3">
                                  {document.type === 'assessment-pdf' ? (
                                    <FileText className="h-8 w-8 text-blue-500" />
                                  ) : document.type === 'assessment-image' ? (
                                    <Image className="h-8 w-8 text-blue-500" />
                                  ) : document.type === 'assessment-doc' ? (
                                    <FileType className="h-8 w-8 text-blue-500" />
                                  ) : (
                                    <File className="h-8 w-8 text-blue-500" />
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
    </div>
  );
};

export default DocumentUpload;
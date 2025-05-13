import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Eye, Loader2, Search, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { getQueryFn } from "@/lib/queryClient";
import AdminLayout from "./layout";
import { User } from "@shared/schema";

type UserWithoutPassword = Omit<User, "password">;
// Extended user type with status field
type UserWithStatus = UserWithoutPassword & { status?: string };

export default function UsersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [_, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Fetch all users
  const {
    data: usersData,
    isLoading: isUsersLoading,
    error: usersError,
  } = useQuery<UserWithoutPassword[]>({
    queryKey: ["/api/admin/users"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user?.isAdmin,
  });

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      navigate("/admin/login");
    }
  }, [user, authLoading, navigate]);

  // Filter users based on search query
  const filteredUsers = usersData?.filter(
    (user) =>
      user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.lastName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Paginate users
  const paginatedUsers = filteredUsers?.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Calculate total pages
  const totalPages = filteredUsers
    ? Math.ceil(filteredUsers.length / pageSize)
    : 0;

  // Handle page change
  const handlePageChange = (page: number) => {
    if (page > 0 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return null; // Will redirect in useEffect
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold">Users</h1>
            <p className="text-sm text-gray-500 mt-1">Showing all non-admin users</p>
          </div>
          <div className="w-full sm:w-auto flex items-center gap-2 sm:min-w-[300px]">
            <Search className="h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="flex-1"
            />
          </div>
        </div>

        {isUsersLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : usersError ? (
          <div className="text-center p-8 text-red-500">
            Error loading users. Please try again.
          </div>
        ) : !paginatedUsers?.length ? (
          <div className="text-center p-8 text-gray-500">
            <UserCircle className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            {searchQuery ? "No users match your search." : "No users found."}
          </div>
        ) : (
          <>
            <div className="bg-white border rounded-md shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.id}</TableCell>
                      <TableCell>{user.username}</TableCell>
                      <TableCell>
                        {user.firstName} {user.lastName}
                      </TableCell>
                      <TableCell>{user.phoneNumber}</TableCell>
                      <TableCell>
                        {user.status || "Registered"}
                      </TableCell>
                      <TableCell>
                        {user.lastLoginAt 
                          ? new Date(user.lastLoginAt).toLocaleDateString('en-US', {
                              month: '2-digit',
                              day: '2-digit',
                              year: 'numeric'
                            })
                          : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/admin/users/${user.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination className="justify-center mt-6">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => handlePageChange(currentPage - 1)}
                      className={
                        currentPage === 1 ? "pointer-events-none opacity-50" : ""
                      }
                    />
                  </PaginationItem>
                  {[...Array(totalPages)].map((_, i) => (
                    <PaginationItem key={i + 1}>
                      <PaginationLink
                        onClick={() => handlePageChange(i + 1)}
                        isActive={currentPage === i + 1}
                      >
                        {i + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => handlePageChange(currentPage + 1)}
                      className={
                        currentPage === totalPages
                          ? "pointer-events-none opacity-50"
                          : ""
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
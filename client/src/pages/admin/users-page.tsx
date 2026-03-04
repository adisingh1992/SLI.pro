import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Loader2, Search, UserCircle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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
type UserWithStatus = UserWithoutPassword & {
  status?: string;
  school?: string | null;
  academicProgram?: string | null;
};

type SortColumn =
  | "name"
  | "email"
  | "status"
  | "careerStatus"
  | "school"
  | "academicProgram"
  | "registeredAt"
  | "lastLoginAt";
type SortDirection = "asc" | "desc";

const CAREER_STATUS_LABELS: Record<string, string> = {
  undergraduate_or_recent_grad: "Undergrad / Recent Grad",
  early_career: "Early Career",
  mid_career_or_senior: "Mid-Career / Senior",
  career_break_or_transition: "Career Break / Transition",
};

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function SortIcon({ column, sortColumn, sortDirection }: { column: SortColumn; sortColumn: SortColumn | null; sortDirection: SortDirection }) {
  if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-40" />;
  return sortDirection === "asc"
    ? <ArrowUp className="ml-1 h-3 w-3 inline text-primary" />
    : <ArrowDown className="ml-1 h-3 w-3 inline text-primary" />;
}

export default function UsersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [_, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const pageSize = 10;

  const {
    data: usersData,
    isLoading: isUsersLoading,
    error: usersError,
  } = useQuery<UserWithStatus[]>({
    queryKey: ["/api/admin/users"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user?.isAdmin,
  });

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      navigate("/admin/login");
    }
  }, [user, authLoading, navigate]);

  const filteredUsers = usersData?.filter(
    (u) =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.lastName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedUsers = (() => {
    if (!filteredUsers || !sortColumn) return filteredUsers;
    return [...filteredUsers].sort((a, b) => {
      let valA: string | number | null = null;
      let valB: string | number | null = null;

      switch (sortColumn) {
        case "name":
          valA = `${a.firstName} ${a.lastName}`.toLowerCase();
          valB = `${b.firstName} ${b.lastName}`.toLowerCase();
          break;
        case "email":
          valA = a.username.toLowerCase();
          valB = b.username.toLowerCase();
          break;
        case "status":
          valA = (a.status ?? "Registered").toLowerCase();
          valB = (b.status ?? "Registered").toLowerCase();
          break;
        case "careerStatus":
          valA = (CAREER_STATUS_LABELS[a.professionalStatus ?? ""] ?? "").toLowerCase();
          valB = (CAREER_STATUS_LABELS[b.professionalStatus ?? ""] ?? "").toLowerCase();
          break;
        case "school":
          valA = (a.school ?? "").toLowerCase();
          valB = (b.school ?? "").toLowerCase();
          break;
        case "academicProgram":
          valA = (a.academicProgram ?? "").toLowerCase();
          valB = (b.academicProgram ?? "").toLowerCase();
          break;
        case "registeredAt":
          valA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          valB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
        case "lastLoginAt":
          valA = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
          valB = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
          break;
      }

      if (valA === null || valA === "") return 1;
      if (valB === null || valB === "") return -1;
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  })();

  const paginatedUsers = sortedUsers?.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const totalPages = sortedUsers ? Math.ceil(sortedUsers.length / pageSize) : 0;

  const handlePageChange = (page: number) => {
    if (page > 0 && page <= totalPages) setCurrentPage(page);
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const thProps = (column: SortColumn) => ({
    className: "cursor-pointer select-none whitespace-nowrap text-xs py-2 px-2",
    onClick: () => handleSort(column),
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.isAdmin) return null;

  return (
    <AdminLayout>
      <div className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Users</h1>
            <p className="text-xs text-gray-500 mt-0.5">Showing all non-admin users</p>
          </div>
          <div className="w-full sm:w-auto flex items-center gap-2 sm:min-w-[280px]">
            <Search className="h-4 w-4 text-gray-400 shrink-0" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="flex-1 h-8 text-sm"
            />
          </div>
        </div>

        {isUsersLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : usersError ? (
          <div className="text-center p-8 text-red-500 text-sm">
            Error loading users. Please try again.
          </div>
        ) : !paginatedUsers?.length ? (
          <div className="text-center p-8 text-gray-500">
            <UserCircle className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p className="text-sm">{searchQuery ? "No users match your search." : "No users found."}</p>
          </div>
        ) : (
          <>
            <div className="bg-white border rounded-md shadow-sm overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead {...thProps("name")}>
                      Name <SortIcon column="name" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </TableHead>
                    <TableHead {...thProps("email")}>
                      Email <SortIcon column="email" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </TableHead>
                    <TableHead className="text-xs py-2 px-2 whitespace-nowrap">Phone</TableHead>
                    <TableHead {...thProps("status")}>
                      Status <SortIcon column="status" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </TableHead>
                    <TableHead {...thProps("careerStatus")}>
                      Career Status <SortIcon column="careerStatus" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </TableHead>
                    <TableHead {...thProps("school")}>
                      School <SortIcon column="school" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </TableHead>
                    <TableHead {...thProps("academicProgram")}>
                      Program <SortIcon column="academicProgram" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </TableHead>
                    <TableHead {...thProps("registeredAt")}>
                      Registered <SortIcon column="registeredAt" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </TableHead>
                    <TableHead {...thProps("lastLoginAt")}>
                      Last Login <SortIcon column="lastLoginAt" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((u: UserWithStatus) => (
                    <TableRow key={u.id} className="text-xs cursor-pointer hover:bg-muted/60" onClick={() => navigate(`/admin/users/${u.id}`)}>
                      <TableCell className="py-2 px-2 font-medium whitespace-nowrap">
                        {u.firstName} {u.lastName}
                      </TableCell>
                      <TableCell className="py-2 px-2 max-w-[160px] truncate" title={u.username}>
                        {u.username}
                      </TableCell>
                      <TableCell className="py-2 px-2 whitespace-nowrap">
                        {u.phoneNumber ?? "—"}
                      </TableCell>
                      <TableCell className="py-2 px-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.status === "LinkedIn Optimization Done"
                            ? "bg-green-100 text-green-800"
                            : u.status === "SLI Generated"
                            ? "bg-blue-100 text-blue-800"
                            : u.status === "Freshness Report Generated"
                            ? "bg-purple-100 text-purple-800"
                            : u.status === "Chat Session Done"
                            ? "bg-indigo-100 text-indigo-800"
                            : u.status === "Documents Uploaded"
                            ? "bg-yellow-100 text-yellow-800"
                            : u.status === "Questionnaire Completed"
                            ? "bg-orange-100 text-orange-800"
                            : "bg-gray-100 text-gray-800"
                        }`}>
                          {u.status ?? "Registered"}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 px-2 whitespace-nowrap">
                        {u.professionalStatus
                          ? CAREER_STATUS_LABELS[u.professionalStatus] ?? u.professionalStatus
                          : "—"}
                      </TableCell>
                      <TableCell className="py-2 px-2 max-w-[140px] truncate" title={u.school ?? ""}>
                        {u.school ?? "—"}
                      </TableCell>
                      <TableCell className="py-2 px-2 max-w-[120px] truncate" title={u.academicProgram ?? ""}>
                        {u.academicProgram ?? "—"}
                      </TableCell>
                      <TableCell className="py-2 px-2 whitespace-nowrap">
                        {formatDate(u.createdAt)}
                      </TableCell>
                      <TableCell className="py-2 px-2 whitespace-nowrap">
                        {u.lastLoginAt ? formatDate(u.lastLoginAt) : "Never"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <Pagination className="justify-center mt-4">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => handlePageChange(currentPage - 1)}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
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
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
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

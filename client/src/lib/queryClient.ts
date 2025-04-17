import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = res.statusText;
    
    try {
      // Try to parse the response as JSON
      const errorData = await res.json();
      
      // If there's a message property, use it
      if (errorData && errorData.message) {
        errorMessage = errorData.message;
      }
    } catch (e) {
      // If JSON parsing fails, try to get the text
      try {
        const text = await res.text();
        if (text) errorMessage = text;
      } catch (e) {
        // If all fails, use the status text
        errorMessage = res.statusText;
      }
    }
    
    throw new Error(errorMessage);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Build the URL - if queryKey has multiple items, handle the path params
    let url = queryKey[0] as string;
    if (queryKey.length > 1 && queryKey[1] !== null && queryKey[1] !== undefined) {
      // Assuming the second item is the ID parameter
      url = `${url}/${queryKey[1]}`;
    }

    console.log('Making API request to:', url);
    
    const res = await fetch(url, {
      credentials: "include",
    });

    console.log('API response status:', res.status);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    const data = await res.json();
    console.log('API response data:', data);
    return data;
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

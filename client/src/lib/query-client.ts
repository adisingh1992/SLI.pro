import { QueryClient } from "@tanstack/react-query";

interface ApiRequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: any;
  headers?: Record<string, string>;
}

interface ApiRequestConfig {
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}

export async function apiRequest<T>({
  url,
  method = "GET",
  body,
  headers = {},
}: ApiRequestOptions): Promise<T> {
  const config: ApiRequestConfig = {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    method,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(
      errorData.error || `API request failed with status ${response.status}`
    );
    throw Object.assign(error, { status: response.status, data: errorData });
  }

  // Handle empty responses (like for 204 No Content)
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// Set up Query Client with default fetcher
const defaultQueryFn = async ({ queryKey }: { queryKey: string[] }) => {
  const [url] = queryKey;
  return apiRequest({ url });
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});
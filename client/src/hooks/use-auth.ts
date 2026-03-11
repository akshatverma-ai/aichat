import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type User } from "@shared/schema";

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/me"],
    queryFn: async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const res = await fetch("/api/me", { 
          signal: controller.signal,
          credentials: "include"
        });
        clearTimeout(timeoutId);
        
        if (res.status === 401) return null;
        if (!res.ok) throw new Error("Failed to fetch user");
        return res.json();
      } catch (err: any) {
        if (err.name === "AbortError") {
          console.warn("Auth check timeout");
          return null;
        }
        throw err;
      }
    },
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const login = useMutation({
    mutationFn: async (credentials: Record<string, string>) => {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Login failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      localStorage.setItem("userLoggedIn", "true");
      localStorage.setItem("userId", String(data.id || ""));
      queryClient.setQueryData(["/api/me"], data);
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
    },
  });

  const register = useMutation({
    mutationFn: async (userData: Record<string, string>) => {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Registration failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      localStorage.setItem("userLoggedIn", "true");
      localStorage.setItem("userId", String(data.id || ""));
      queryClient.setQueryData(["/api/me"], data);
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
    },
  });

  const logout = useMutation({
    mutationFn: async () => {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
    },
    onSuccess: () => {
      localStorage.removeItem("userLoggedIn");
      localStorage.removeItem("userId");
      queryClient.setQueryData(["/api/me"], null);
      queryClient.clear();
    },
  });

  const updateProfile = useMutation({
    mutationFn: async (updates: Partial<User>) => {
      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update profile");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/me"] }),
  });

  return {
    user,
    isLoading,
    login,
    register,
    logout,
    updateProfile,
  };
}

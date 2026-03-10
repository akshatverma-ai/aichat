import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type Conversation, type Message } from "@shared/schema";

export function useActiveConversation() {
  const queryClient = useQueryClient();

  // Fetch all conversations
  const { data: conversations, isLoading: isLoadingList } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    queryFn: async () => {
      const res = await fetch("/api/conversations");
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
  });

  // Create one if it doesn't exist
  const createConversation = useMutation({
    mutationFn: async (title: string) => {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Failed to create conversation");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/conversations"] }),
  });

  const activeConversation = conversations?.[0];

  return {
    conversations,
    activeConversation,
    isLoadingList,
    createConversation,
  };
}

export function useConversationDetails(id?: number) {
  return useQuery<Conversation & { messages: Message[] }>({
    queryKey: [`/api/conversations/${id}`],
    queryFn: async () => {
      if (!id) throw new Error("No ID");
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) throw new Error("Failed to fetch conversation details");
      return res.json();
    },
    enabled: !!id,
  });
}

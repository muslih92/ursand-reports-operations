import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { handlePossibleSessionExpiry } from "./lib/session-expiry";

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => void handlePossibleSessionExpiry(error),
    }),
    mutationCache: new MutationCache({
      onError: (error) => void handlePossibleSessionExpiry(error),
    }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

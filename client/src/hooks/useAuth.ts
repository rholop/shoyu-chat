import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { login as apiLogin, logout as apiLogout, getMe } from '../api/auth';

export function useAuth() {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const loginMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      apiLogin(username, password),
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: apiLogout,
    onSuccess: () => {
      queryClient.clear();
    },
  });

  return {
    user: meQuery.data ?? null,
    isLoading: meQuery.isPending,
    login: loginMutation.mutateAsync,
    loginError: loginMutation.error?.message,
    isLoggingIn: loginMutation.isPending,
    logout: logoutMutation.mutate,
  };
}

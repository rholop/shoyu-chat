import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { login as apiLogin, logout as apiLogout, getMe } from '../api/auth';
import { useAuthStore } from '../store/authStore';

export function useAuth() {
  const { user, setUser } = useAuthStore();
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (meQuery.data) setUser(meQuery.data);
    else if (meQuery.isError) setUser(null);
  }, [meQuery.data, meQuery.isError, setUser]);

  const loginMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      apiLogin(username, password),
    onSuccess: (data) => {
      setUser(data);
      queryClient.setQueryData(['me'], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: apiLogout,
    onSuccess: () => {
      setUser(null);
      queryClient.clear();
    },
  });

  return {
    user,
    isLoading: meQuery.isLoading,
    login: loginMutation.mutateAsync,
    loginError: loginMutation.error?.message,
    isLoggingIn: loginMutation.isPending,
    logout: logoutMutation.mutate,
  };
}

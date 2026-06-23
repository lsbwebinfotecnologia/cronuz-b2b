import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuthStore } from '../store/auth.store';
import { Colors, Typography, Spacing } from '../constants/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 2, // 2 minutos de cache
    },
  },
});

/**
 * Tela exibida quando o seller tem conta válida mas o app não está
 * habilitado pelo Master para esta empresa.
 */
function AppDisabledScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <View style={styles.disabledContainer}>
      <Text style={styles.disabledIcon}>🔒</Text>
      <Text style={styles.disabledTitle}>App não disponível</Text>
      <Text style={styles.disabledMsg}>
        O acesso ao aplicativo ainda não foi liberado para sua empresa.{'\n'}
        Entre em contato com o administrador.
      </Text>
      <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
        <Text style={styles.logoutBtnText}>Sair</Text>
      </TouchableOpacity>
    </View>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, hydrate, modules, signOut } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    hydrate();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // Seller autenticado mas app não habilitado pelo Master
  if (isAuthenticated && !modules.app_enabled) {
    return <AppDisabledScreen onLogout={signOut} />;
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <AuthGuard>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </AuthGuard>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledContainer: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  disabledIcon: {
    fontSize: 60,
  },
  disabledTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    textAlign: 'center',
  },
  disabledMsg: {
    color: Colors.textMuted,
    fontSize: Typography.size.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  logoutBtn: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.border,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 10,
  },
  logoutBtnText: {
    color: Colors.textSecondary,
    fontWeight: Typography.weight.semibold,
    fontSize: Typography.size.md,
  },
});

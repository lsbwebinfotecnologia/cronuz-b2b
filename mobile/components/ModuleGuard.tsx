import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { MobileModules } from '../services/auth.service';
import { useAuthStore } from '../store/auth.store';
import { Colors, Typography, Spacing } from '../constants/theme';

interface ModuleGuardProps {
  module: keyof MobileModules;
  children: React.ReactNode;
}

/**
 * Envolva qualquer tela de módulo com este guard.
 * Se o módulo não estiver ativo para o seller, exibe tela de acesso negado.
 *
 * Uso:
 *   export default function PDVScreen() {
 *     return (
 *       <ModuleGuard module="pdv">
 *         <PDVContent />
 *       </ModuleGuard>
 *     );
 *   }
 */
export function ModuleGuard({ module, children }: ModuleGuardProps) {
  const { hasModule } = useAuthStore();

  if (!hasModule(module)) {
    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>🔒</Text>
        <Text style={styles.title}>Módulo não disponível</Text>
        <Text style={styles.description}>
          Este módulo não está habilitado para sua conta.{'\n'}
          Entre em contato com seu administrador.
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.buttonText}>Voltar ao Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emoji: {
    fontSize: 56,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    textAlign: 'center',
  },
  description: {
    color: Colors.textMuted,
    fontSize: Typography.size.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: Typography.weight.semibold,
    fontSize: Typography.size.md,
  },
});

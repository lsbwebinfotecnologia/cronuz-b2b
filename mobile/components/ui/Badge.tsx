import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../../constants/theme';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const variantColors: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: Colors.bgCardHover, text: Colors.textSecondary },
  primary: { bg: `${Colors.primary}22`, text: Colors.primaryLight },
  success: { bg: `${Colors.success}22`, text: Colors.success },
  warning: { bg: `${Colors.warning}22`, text: Colors.warning },
  error: { bg: `${Colors.error}22`, text: Colors.error },
  info: { bg: `${Colors.info}22`, text: Colors.info },
};

export function Badge({ label, variant = 'default' }: BadgeProps) {
  const colors = variantColors[variant];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

/** Mapeia status do pedido para a variante correta */
export function orderStatusVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    pending: 'warning',
    approved: 'success',
    processing: 'info',
    shipped: 'primary',
    delivered: 'success',
    cancelled: 'error',
    rejected: 'error',
  };
  return map[status?.toLowerCase()] ?? 'default';
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius, Shadow, Spacing } from '../../constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  glow?: boolean;
  padding?: number;
}

export function Card({ children, style, glow = false, padding = Spacing.base }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        glow && styles.glow,
        { padding },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  glow: {
    borderColor: Colors.primary,
    ...Shadow.lg,
  },
});

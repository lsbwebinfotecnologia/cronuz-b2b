import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../../constants/theme';
import { useAuthStore } from '../../store/auth.store';
import { MobileModules } from '../../services/auth.service';
import { registerSessionExpiredCallback } from '../../services/api';

// ─── Tab Icon Component ──────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({
  focused,
  icon,
  iconFocused,
}: {
  focused: boolean;
  icon: IoniconName;
  iconFocused: IoniconName;
}) {
  return (
    <View style={[styles.tabItem, focused && styles.tabItemActive]}>
      <Ionicons
        name={focused ? iconFocused : icon}
        size={28}
        color={focused ? Colors.primary : Colors.textMuted}
      />
    </View>
  );
}

// ─── Definição dos módulos ──────────────────────────────────────────────────

interface TabConfig {
  name: string;
  label: string;
  icon: IoniconName;
  iconFocused: IoniconName;
  module: keyof MobileModules | null;
}

const TAB_CONFIG: TabConfig[] = [
  {
    name: 'index',
    label: 'Dashboard',
    icon: 'stats-chart-outline',
    iconFocused: 'stats-chart',
    module: null,
  },
  {
    name: 'pdv',
    label: 'PDV',
    icon: 'storefront-outline',
    iconFocused: 'storefront',
    module: 'pdv',
  },
  {
    name: 'orders',
    label: 'Pedidos',
    icon: 'receipt-outline',
    iconFocused: 'receipt',
    module: 'pedidos',
  },
  {
    name: 'conferencia',
    label: 'Conferência',
    icon: 'scan-outline',
    iconFocused: 'scan',
    module: 'conferencia',
  },
];

// ─── Layout Principal ────────────────────────────────────────────────────────

export default function TabsLayout() {
  const { hasModule, signOut } = useAuthStore();

  // Registra callback: qualquer request com 401 aciona logout automático
  useEffect(() => {
    registerSessionExpiredCallback(() => {
      signOut();
    });
  }, [signOut]);

  const tabHref = (module: keyof MobileModules | null) => {
    if (module === null) return undefined;
    return hasModule(module) ? undefined : null;
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      {TAB_CONFIG.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            href: tabHref(tab.module),
            tabBarIcon: ({ focused }) => (
              <TabIcon
                focused={focused}
                icon={tab.icon}
                iconFocused={tab.iconFocused}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.bgCard,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 72,
    paddingBottom: 8,
    paddingTop: 8,
    paddingHorizontal: Spacing.sm,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 44,
    borderRadius: 22,
  },
  tabItemActive: {
    backgroundColor: `${Colors.primary}20`,
  },
});

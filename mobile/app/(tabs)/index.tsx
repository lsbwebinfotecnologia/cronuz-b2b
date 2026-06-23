import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { getDashboard, RecentOrder } from '../../services/dashboard.service';
import { useAuthStore } from '../../store/auth.store';
import { Card } from '../../components/ui/Card';
import { Badge, orderStatusVariant } from '../../components/ui/Badge';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatCurrency, formatRelativeDate, formatOrderStatus } from '../../utils/formatters';
import { APP_VERSION_FOOTER } from '../../constants/version';

function KpiCard({
  label,
  value,
  sub,
  color = Colors.primary,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card style={[styles.kpiCard, { borderColor: `${color}44` }]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      {sub && <Text style={styles.kpiSub}>{sub}</Text>}
    </Card>
  );
}

function OrderRow({ order }: { order: RecentOrder }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.orderRow}
      onPress={() => router.push(`/(tabs)/orders/${order.id}` as any)}
      activeOpacity={0.7}
    >
      <View style={styles.orderInfo}>
        <Text style={styles.orderCustomer} numberOfLines={1}>
          {order.customer_name}
        </Text>
        <Text style={styles.orderDate}>{formatRelativeDate(order.created_at)}</Text>
      </View>
      <View style={styles.orderRight}>
        <Text style={styles.orderTotal}>{formatCurrency(order.total)}</Text>
        <Badge
          label={formatOrderStatus(order.status)}
          variant={orderStatusVariant(order.status)}
        />
      </View>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const { user, signOut } = useAuthStore();
  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    staleTime: 1000 * 60, // 1 min
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Erro ao carregar dashboard.</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const kpis = data?.kpis;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={Colors.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Olá, {user?.name?.split(' ')[0] ?? 'Vendedor'} 👋</Text>
          <Text style={styles.companyName}>{user?.company_name ?? 'Cronuz B2B'}</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.logoutBtn} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </View>

      {/* KPIs */}
      <Text style={styles.sectionTitle}>Hoje</Text>
      <View style={styles.kpiRow}>
        <KpiCard
          label="Pedidos hoje"
          value={String(kpis?.orders_today ?? 0)}
          color={Colors.primary}
        />
        <KpiCard
          label="Faturamento hoje"
          value={formatCurrency(kpis?.revenue_today ?? 0)}
          color={Colors.accent}
        />
      </View>

      <Text style={styles.sectionTitle}>Este mês</Text>
      <View style={styles.kpiRow}>
        <KpiCard
          label="Pedidos no mês"
          value={String(kpis?.orders_month ?? 0)}
          color={Colors.success}
        />
        <KpiCard
          label="Faturamento mês"
          value={formatCurrency(kpis?.revenue_month ?? 0)}
          color={Colors.warning}
        />
      </View>

      <View style={styles.kpiRow}>
        <KpiCard
          label="Pendentes"
          value={String(kpis?.pending_orders ?? 0)}
          color={Colors.warning}
        />
        <KpiCard
          label="Clientes"
          value={String(kpis?.total_customers ?? 0)}
          color={Colors.info}
        />
      </View>

      {/* Pedidos Recentes */}
      {(data?.recent_orders?.length ?? 0) > 0 && (
        <>
          <Text style={styles.sectionTitle}>Pedidos Recentes</Text>
          <Card>
            {data!.recent_orders.map((order, idx) => (
              <View key={order.id}>
                <OrderRow order={order} />
                {idx < data!.recent_orders.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </Card>
        </>
      )}

      {/* Rodapé de versão */}
      <View style={styles.versionFooter}>
        <Text style={styles.versionText}>{APP_VERSION_FOOTER}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.base, paddingBottom: Spacing['4xl'] },
  center: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.base,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: Spacing['2xl'],
    marginBottom: Spacing.xl,
  },
  greeting: {
    color: Colors.textPrimary,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
  },
  companyName: {
    color: Colors.textSecondary,
    fontSize: Typography.size.sm,
    marginTop: 2,
  },
  logoutBtn: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  logoutText: {
    color: Colors.textSecondary,
    fontSize: Typography.size.sm,
  },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginTop: Spacing.base,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  kpiCard: {
    flex: 1,
    gap: Spacing.xs,
  },
  kpiLabel: {
    color: Colors.textSecondary,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  kpiValue: {
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.extrabold,
  },
  kpiSub: {
    color: Colors.textMuted,
    fontSize: Typography.size.xs,
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  orderInfo: { flex: 1 },
  orderCustomer: {
    color: Colors.textPrimary,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
  },
  orderDate: {
    color: Colors.textMuted,
    fontSize: Typography.size.xs,
    marginTop: 2,
  },
  orderRight: { alignItems: 'flex-end', gap: 4 },
  orderTotal: {
    color: Colors.textPrimary,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: -Spacing.base,
  },
  errorText: { color: Colors.error, fontSize: Typography.size.base },
  retryBtn: {
    backgroundColor: Colors.bgCard,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  retryText: { color: Colors.primary, fontWeight: Typography.weight.semibold },
  versionFooter: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  versionText: {
    color: Colors.textMuted,
    fontSize: Typography.size.xs,
    letterSpacing: 0.5,
  },
});

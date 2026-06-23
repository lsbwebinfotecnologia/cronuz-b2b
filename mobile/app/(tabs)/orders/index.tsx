import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { getOrders, Order } from '../../../services/orders.service';
import { Badge, orderStatusVariant } from '../../../components/ui/Badge';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { formatCurrency, formatRelativeDate, formatOrderStatus } from '../../../utils/formatters';

const STATUS_FILTERS = [
  { key: '', label: 'Todos' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'approved', label: 'Aprovados' },
  { key: 'shipped', label: 'Enviados' },
];

function OrderCard({ order }: { order: Order }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => router.push(`/(tabs)/orders/${order.id}` as any)}
      activeOpacity={0.7}
    >
      <View style={styles.orderHeader}>
        <Text style={styles.orderCustomer} numberOfLines={1}>
          {order.customer_name}
        </Text>
        <Badge
          label={formatOrderStatus(order.status)}
          variant={orderStatusVariant(order.status)}
        />
      </View>
      <View style={styles.orderFooter}>
        <Text style={styles.orderDate}>{formatRelativeDate(order.created_at)}</Text>
        <Text style={styles.orderTotal}>{formatCurrency(order.total)}</Text>
      </View>
      {order.order_number && (
        <Text style={styles.orderNumber}>#{order.order_number}</Text>
      )}
    </TouchableOpacity>
  );
}

export default function OrdersScreen() {
  const [activeFilter, setActiveFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['orders', activeFilter, debouncedSearch],
    queryFn: () =>
      getOrders({ status: activeFilter || undefined, search: debouncedSearch, limit: 30 }),
  });

  const orders = data?.items ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pedidos</Text>

      {/* Search */}
      <View style={styles.searchWrapper}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar cliente ou pedido..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Status Filters */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, activeFilter === f.key && styles.filterBtnActive]}
            onPress={() => setActiveFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterText,
                activeFilter === f.key && styles.filterTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Nenhum pedido encontrado.</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <OrderCard order={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          onRefresh={refetch}
          refreshing={isRefetching}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  title: {
    color: Colors.textPrimary,
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing['3xl'],
    marginBottom: Spacing.base,
  },
  searchWrapper: { paddingHorizontal: Spacing.base, marginBottom: Spacing.sm },
  searchInput: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
    fontSize: Typography.size.base,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.base,
  },
  filterBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterBtnActive: {
    backgroundColor: `${Colors.primary}22`,
    borderColor: Colors.primary,
  },
  filterText: {
    color: Colors.textSecondary,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
  },
  filterTextActive: { color: Colors.primary, fontWeight: Typography.weight.semibold },
  list: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing['4xl'],
  },
  orderCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    gap: Spacing.xs,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  orderCustomer: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderDate: { color: Colors.textMuted, fontSize: Typography.size.xs },
  orderTotal: {
    color: Colors.primary,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
  },
  orderNumber: {
    color: Colors.textMuted,
    fontSize: Typography.size.xs,
    fontFamily: 'monospace',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: Colors.textSecondary, fontSize: Typography.size.base },
});

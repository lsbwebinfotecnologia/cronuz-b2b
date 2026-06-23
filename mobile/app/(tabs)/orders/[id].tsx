import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getOrderById } from '../../../services/orders.service';
import { Card } from '../../../components/ui/Card';
import { Badge, orderStatusVariant } from '../../../components/ui/Badge';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { formatCurrency, formatDate, formatOrderStatus } from '../../../utils/formatters';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrderById(Number(id)),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (isError || !order) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Pedido não encontrado.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backText}>← Pedidos</Text>
        </TouchableOpacity>
      </View>

      {/* Info principal */}
      <View style={styles.topRow}>
        <View>
          <Text style={styles.customerName}>{order.customer_name}</Text>
          {order.order_number && (
            <Text style={styles.orderNumber}>#{order.order_number}</Text>
          )}
          <Text style={styles.date}>{formatDate(order.created_at)}</Text>
        </View>
        <Badge
          label={formatOrderStatus(order.status)}
          variant={orderStatusVariant(order.status)}
        />
      </View>

      {/* Itens */}
      <Text style={styles.sectionTitle}>Itens do Pedido</Text>
      <Card>
        {order.items?.map((item, idx) => (
          <View key={item.id}>
            <View style={styles.itemRow}>
              <View style={styles.itemQtyBadge}>
                <Text style={styles.itemQtyText}>{item.quantity}x</Text>
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={2}>{item.product_name}</Text>
                {item.sku && <Text style={styles.itemSku}>SKU: {item.sku}</Text>}
              </View>
              <View style={styles.itemPrices}>
                <Text style={styles.itemTotal}>{formatCurrency(item.total_price)}</Text>
                <Text style={styles.itemUnit}>{formatCurrency(item.unit_price)}/un</Text>
              </View>
            </View>
            {idx < (order.items?.length ?? 0) - 1 && (
              <View style={styles.divider} />
            )}
          </View>
        ))}
      </Card>

      {/* Total */}
      <Card style={styles.totalCard} glow>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total do Pedido</Text>
          <Text style={styles.totalValue}>{formatCurrency(order.total)}</Text>
        </View>
        {order.payment_condition && (
          <Text style={styles.paymentCondition}>
            💳 {order.payment_condition}
          </Text>
        )}
      </Card>

      {/* Observações */}
      {order.notes && (
        <>
          <Text style={styles.sectionTitle}>Observações</Text>
          <Card>
            <Text style={styles.notesText}>{order.notes}</Text>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.base, paddingBottom: Spacing['4xl'], gap: Spacing.sm },
  center: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.base,
  },
  header: { marginTop: Spacing['2xl'] },
  backText: { color: Colors.primary, fontSize: Typography.size.base },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: Spacing.base,
    gap: Spacing.sm,
  },
  customerName: {
    color: Colors.textPrimary,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    flex: 1,
  },
  orderNumber: {
    color: Colors.textMuted,
    fontSize: Typography.size.sm,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  date: { color: Colors.textSecondary, fontSize: Typography.size.xs, marginTop: 4 },
  sectionTitle: {
    color: Colors.textSecondary,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: Spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  itemQtyBadge: {
    backgroundColor: `${Colors.primary}22`,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    minWidth: 36,
    alignItems: 'center',
  },
  itemQtyText: {
    color: Colors.primary,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },
  itemInfo: { flex: 1 },
  itemName: {
    color: Colors.textPrimary,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
  },
  itemSku: { color: Colors.textMuted, fontSize: Typography.size.xs, marginTop: 2 },
  itemPrices: { alignItems: 'flex-end' },
  itemTotal: {
    color: Colors.textPrimary,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
  },
  itemUnit: { color: Colors.textMuted, fontSize: Typography.size.xs },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: -Spacing.base },
  totalCard: { gap: Spacing.sm },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    color: Colors.textSecondary,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
  },
  totalValue: {
    color: Colors.primary,
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.extrabold,
  },
  paymentCondition: { color: Colors.textSecondary, fontSize: Typography.size.sm },
  notesText: {
    color: Colors.textPrimary,
    fontSize: Typography.size.base,
    lineHeight: 22,
  },
  errorText: { color: Colors.error, fontSize: Typography.size.base },
  backBtn: {
    backgroundColor: Colors.bgCard,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  backBtnText: { color: Colors.primary, fontWeight: Typography.weight.semibold },
});

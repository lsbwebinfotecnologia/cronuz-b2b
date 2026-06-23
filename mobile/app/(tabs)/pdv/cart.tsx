import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePDVStore } from '../../../store/pdv.store';
import {
  getPaymentTerms,
  createPDVOrder,
  PaymentTerm,
  OrderType,
  ORDER_TYPE_LABELS,
} from '../../../services/pdv.service';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { formatCurrency } from '../../../utils/formatters';

// ─── Error Detail Modal ───────────────────────────────────────────────────────

interface ErrorDetail {
  friendly: string;
  technical: string;
}

function ErrorDetailModal({
  error,
  onClose,
}: {
  error: ErrorDetail | null;
  onClose: () => void;
}) {
  if (!error) return null;
  return (
    <Modal visible={!!error} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={errModal.container}>
        <View style={errModal.header}>
          <Text style={errModal.icon}>⚠️</Text>
          <Text style={errModal.title}>Erro ao criar pedido</Text>
        </View>

        <ScrollView style={errModal.body} contentContainerStyle={{ gap: Spacing.md }}>
          {/* Mensagem amigável */}
          <View style={errModal.friendlyBox}>
            <Text style={errModal.friendlyText}>{error.friendly}</Text>
          </View>

          {/* Detalhes técnicos */}
          <Text style={errModal.sectionLabel}>DETALHES TÉCNICOS</Text>
          <View style={errModal.techBox}>
            <Text style={errModal.techText} selectable>{error.technical}</Text>
          </View>

          <Text style={errModal.hint}>
            Copie os detalhes acima e envie ao suporte para diagnóstico rápido.
          </Text>
        </ScrollView>

        <View style={errModal.footer}>
          <TouchableOpacity
            style={errModal.copyBtn}
            onPress={() => {
              try { Clipboard.setString(error.technical); } catch {}
              Alert.alert('Copiado', 'Detalhes do erro copiados para a área de transferência.');
            }}
          >
            <Text style={errModal.copyBtnText}>📋 Copiar detalhes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={errModal.closeBtn} onPress={onClose}>
            <Text style={errModal.closeBtnText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** Extrai informações de erro de qualquer tipo de exceção */
function parseError(e: any): ErrorDetail {
  // Tenta extrair da resposta HTTP (axios/fetch)
  const status = e?.response?.status;
  const detail = e?.response?.data?.detail
    ?? e?.response?.data?.message
    ?? e?.response?.data;
  const networkErr = e?.code === 'ERR_NETWORK' || e?.message?.includes('Network');

  // Mensagem amigável
  let friendly = 'Erro desconhecido. Verifique sua conexão e tente novamente.';
  if (networkErr) {
    friendly = 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
  } else if (status === 401 || status === 403) {
    friendly = 'Sessão expirada ou sem permissão. Faça login novamente.';
  } else if (status === 404) {
    friendly = 'Recurso não encontrado no servidor.';
  } else if (status === 422) {
    friendly = 'Dados do pedido inválidos. Verifique os itens e tente novamente.';
  } else if (status >= 500) {
    friendly = 'Erro interno no servidor. Tente novamente em alguns instantes.';
  } else if (typeof detail === 'string') {
    friendly = detail;
  }

  // Detalhes técnicos completos
  const technical = JSON.stringify({
    status: status ?? 'N/A',
    url: e?.config?.url ?? e?.request?.url ?? 'N/A',
    method: e?.config?.method?.toUpperCase() ?? 'N/A',
    response: detail ?? e?.response?.data ?? null,
    message: e?.message ?? String(e),
    code: e?.code ?? null,
    stack: e?.stack ? e.stack.split('\n').slice(0, 6).join('\n') : null,
  }, null, 2);

  return { friendly, technical };
}

// ─── Cart Item Row ─────────────────────────────────────────────────────────────

function CartItemRow({
  item,
  index,
  onRemove,
  onChangeQty,
}: {
  item: ReturnType<typeof usePDVStore.getState>['items'][0];
  index: number;
  onRemove: (i: number) => void;
  onChangeQty: (i: number, qty: number) => void;
}) {
  const [qty, setQty] = useState(String(item.quantity));

  // ✔ Sincroniza estado local sempre que o store atualizar a quantidade
  useEffect(() => {
    setQty(String(item.quantity));
  }, [item.quantity]);

  // Estoque máximo disponível para este item
  const maxQty = Math.max(
    item.product.stock ?? 0,
    item.product.consigned_balance ?? 0,
    item.quantity, // nunca bloquear o que já está no carrinho
  );
  const atMax = item.quantity >= maxQty && maxQty > 0;
  const atMin = item.quantity <= 1;

  const handleDecrease = useCallback(() => {
    if (atMin) {
      // Ao chegar em 1, pressionar − remove o item
      onRemove(index);
    } else {
      onChangeQty(index, item.quantity - 1);
    }
  }, [atMin, index, item.quantity, onChangeQty, onRemove]);

  const handleIncrease = useCallback(() => {
    if (atMax) return; // limite de estoque
    onChangeQty(index, item.quantity + 1);
  }, [atMax, index, item.quantity, onChangeQty]);

  function commitQty() {
    const n = parseInt(qty, 10);
    if (!isNaN(n) && n > 0) {
      const clamped = maxQty > 0 ? Math.min(n, maxQty) : n;
      onChangeQty(index, clamped);
    } else {
      setQty(String(item.quantity));
    }
  }

  return (
    <View style={row.container}>
      {/* Info do produto */}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={row.name} numberOfLines={2}>{item.product.name}</Text>
        {item.product.sku && (
          <Text style={row.sku}>SKU: {item.product.sku}</Text>
        )}
        <Text style={row.unitPrice}>
          {formatCurrency(item.unit_price)} / unidade
        </Text>
        {maxQty > 0 && (
          <Text style={[row.stockHint, atMax && row.stockHintRed]}>
            {atMax ? `Máx: ${maxQty} un` : `Disp: ${maxQty} un`}
          </Text>
        )}
      </View>

      {/* Controles de quantidade */}
      <View style={row.controls}>
        {/* Botão − (vira lixeira quando qty = 1) */}
        <TouchableOpacity
          style={[row.qtyBtn, atMin && row.qtyBtnDanger]}
          onPress={handleDecrease}
          activeOpacity={0.7}
        >
          {atMin ? (
            <Ionicons name="trash-outline" size={16} color={Colors.error} />
          ) : (
            <Text style={row.qtyBtnText}>−</Text>
          )}
        </TouchableOpacity>

        {/* Input de quantidade */}
        <TextInput
          style={row.qtyInput}
          value={qty}
          onChangeText={setQty}
          onBlur={commitQty}
          keyboardType="number-pad"
          selectTextOnFocus
        />

        {/* Botão + (desabilitado no limite) */}
        <TouchableOpacity
          style={[row.qtyBtn, atMax && row.qtyBtnDisabled]}
          onPress={handleIncrease}
          activeOpacity={atMax ? 1 : 0.7}
        >
          <Text style={[row.qtyBtnText, atMax && row.qtyBtnTextDisabled]}>+</Text>
        </TouchableOpacity>

        <Text style={row.itemTotal}>{formatCurrency(item.total)}</Text>

        {/* Botão remover (lixeira dedicada) */}
        <TouchableOpacity
          onPress={() => onRemove(index)}
          style={row.removeBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function CartScreen() {
  const router = useRouter();
  const {
    customer,
    items,
    paymentTerm,
    notes,
    subtotal,
    total,
    itemCount,
    removeItem,
    updateQuantity,
    setPaymentTerm,
    setNotes,
    clearCart,
  } = usePDVStore();

  const [terms, setTerms] = useState<PaymentTerm[]>([]);
  const [loadingTerms, setLoadingTerms] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [externalOrderNumber, setExternalOrderNumber] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('V');
  const [showOrderTypePicker, setShowOrderTypePicker] = useState(false);
  const [errorDetail, setErrorDetail] = useState<ErrorDetail | null>(null);

  useEffect(() => {
    getPaymentTerms()
      .then(setTerms)
      .catch(() => setTerms([]))
      .finally(() => setLoadingTerms(false));
  }, []);


  async function handleSubmit() {
    if (!customer) {
      Alert.alert('Atenção', 'Selecione um cliente antes de finalizar o pedido.');
      return;
    }
    if (items.length === 0) {
      Alert.alert('Atenção', 'Adicione pelo menos um produto ao carrinho.');
      return;
    }

    Alert.alert(
      'Confirmar Pedido',
      `Cliente: ${customer.name}\nItens: ${itemCount}\nTotal: ${formatCurrency(total)}\nTipo: ${ORDER_TYPE_LABELS[orderType]}${externalOrderNumber ? `\nMeu Pedido: ${externalOrderNumber}` : ''}\n\nDeseja criar o pedido?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          style: 'default',
          onPress: async () => {
            setSubmitting(true);
            try {
              const result = await createPDVOrder(
                customer,
                items,
                paymentTerm,
                total,
                {
                  externalOrderNumber: externalOrderNumber.trim() || undefined,
                  orderType,
                  notes: notes || undefined,
                }
              );

              clearCart();
              setExternalOrderNumber('');
              setOrderType('V');

              Alert.alert(
                '✅ Pedido Criado!',
                `Pedido #${result.order_id} criado!\n\nTotal: ${formatCurrency(total)}${result.horus_id ? `\nHorus: ${result.horus_id}` : ''}`,
                [
                  { text: 'Ver Pedidos', onPress: () => router.replace('/(tabs)/orders') },
                  { text: 'Novo Pedido',  onPress: () => router.replace('/(tabs)/pdv') },
                ]
              );
            } catch (e: any) {
              // Mostra modal com erro detalhado em vez de fechar o app
              setErrorDetail(parseError(e));
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  }


  if (itemCount === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🛒</Text>
        <Text style={styles.emptyTitle}>Carrinho vazio</Text>
        <Text style={styles.emptySubtitle}>Adicione produtos no PDV</Text>
        <TouchableOpacity
          style={styles.goBackBtn}
          onPress={() => router.back()}
        >
          <Text style={styles.goBackText}>← Voltar ao PDV</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Carrinho ({itemCount})</Text>
        <TouchableOpacity
          onPress={() =>
            Alert.alert('Limpar carrinho', 'Remover todos os itens?', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Limpar', style: 'destructive', onPress: clearCart },
            ])
          }
        >
          <Text style={styles.clearText}>Limpar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>
        {/* Cliente */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CLIENTE</Text>
          <View style={styles.customerCard}>
            <Text style={styles.customerIcon}>👤</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{customer?.name ?? '—'}</Text>
              {customer?.document && (
                <Text style={styles.customerDoc}>{customer.document}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Itens */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ITENS DO PEDIDO</Text>
          {items.map((item, index) => (
            <CartItemRow
              key={index}
              item={item}
              index={index}
              onRemove={removeItem}
              onChangeQty={updateQuantity}
            />
          ))}
        </View>

        {/* Condição de pagamento */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CONDIÇÃO DE PAGAMENTO</Text>
          {loadingTerms ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <View style={styles.termsGrid}>
              {terms.map((term) => (
                <TouchableOpacity
                  key={String(term.id)}
                  style={[
                    styles.termChip,
                    paymentTerm?.id === term.id && styles.termChipActive,
                  ]}
                  onPress={() => setPaymentTerm(term)}
                >
                  <Text
                    style={[
                      styles.termChipText,
                      paymentTerm?.id === term.id && styles.termChipTextActive,
                    ]}
                  >
                    {term.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Meu Pedido (Opcional) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MEU PEDIDO (OPCIONAL)</Text>
          <TextInput
            style={styles.notesInput}
            value={externalOrderNumber}
            onChangeText={setExternalOrderNumber}
            placeholder="Número do seu pedido interno..."
            placeholderTextColor={Colors.textMuted}
            returnKeyType="done"
          />
          <Text style={styles.fieldHint}>
            Será usado como referência principal no envio e consultas.
          </Text>
        </View>

        {/* Tipo de Operação — igual ao portal seller: Venda Direta e Consignação, sempre visíveis */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TIPO DE OPERAÇÃO</Text>
          <TouchableOpacity
            style={styles.pickerBtn}
            onPress={() => setShowOrderTypePicker(!showOrderTypePicker)}
          >
            <Text style={styles.pickerBtnText}>{ORDER_TYPE_LABELS[orderType]}</Text>
            <Text style={styles.pickerArrow}>{showOrderTypePicker ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showOrderTypePicker && (
            <View style={styles.pickerDropdown}>
              {(Object.entries(ORDER_TYPE_LABELS) as [OrderType, string][]).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.pickerOption, orderType === key && styles.pickerOptionActive]}
                  onPress={() => { setOrderType(key); setShowOrderTypePicker(false); }}
                >
                  <Text style={[styles.pickerOptionText, orderType === key && styles.pickerOptionTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Observação */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>OBSERVAÇÃO</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Observação do pedido (opcional)..."
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Totais */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={[styles.totalRow, styles.totalRowFinal]}>
            <Text style={styles.totalFinalLabel}>TOTAL GERAL</Text>
            <Text style={styles.totalFinalValue}>{formatCurrency(total)}</Text>
          </View>
          <Text style={styles.policyHint}>
            Preços já incluem a política comercial aplicada.
          </Text>
        </View>
      </ScrollView>


      {/* Confirm Button */}
      <View style={styles.confirmContainer}>
        <TouchableOpacity
          style={[styles.confirmBtn, submitting && styles.confirmBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.confirmBtnText}>
              Criar Pedido — {formatCurrency(total)}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Modal de erro detalhado */}
      <ErrorDetailModal
        error={errorDetail}
        onClose={() => setErrorDetail(null)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  emptyContainer: {
    flex: 1, backgroundColor: Colors.bg,
    justifyContent: 'center', alignItems: 'center', gap: Spacing.base,
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: {
    color: Colors.textPrimary, fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
  },
  emptySubtitle: { color: Colors.textMuted, fontSize: Typography.size.base },
  goBackBtn: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, marginTop: Spacing.base,
  },
  goBackText: { color: Colors.primary, fontWeight: Typography.weight.semibold },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing.base,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  backText: { color: Colors.primary, fontSize: 28 },
  title: {
    color: Colors.textPrimary, fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
  },
  clearText: { color: Colors.error, fontSize: Typography.size.sm },
  section: { padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sectionLabel: {
    color: Colors.textMuted, fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold, letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  customerCard: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.sm,
  },
  customerIcon: { fontSize: 24 },
  customerName: {
    color: Colors.textPrimary, fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
  },
  customerDoc: { color: Colors.textMuted, fontSize: Typography.size.xs },
  termsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  termChip: {
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    backgroundColor: Colors.bgCard,
  },
  termChipActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}15` },
  termChipText: { color: Colors.textSecondary, fontSize: Typography.size.sm },
  termChipTextActive: { color: Colors.primary, fontWeight: Typography.weight.semibold },
  notesInput: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
    color: Colors.textPrimary, fontSize: Typography.size.sm,
    minHeight: 80, textAlignVertical: 'top',
  },
  totalsSection: {
    padding: Spacing.base, gap: Spacing.sm,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalRowFinal: {
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingTop: Spacing.sm, marginTop: Spacing.xs,
  },
  totalLabel: { color: Colors.textSecondary, fontSize: Typography.size.base },
  totalValue: { color: Colors.textPrimary, fontSize: Typography.size.base },
  totalFinalLabel: {
    color: Colors.textPrimary, fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
  },
  totalFinalValue: {
    color: Colors.primary, fontSize: Typography.size.xl,
    fontWeight: Typography.weight.extrabold,
  },
  policyHint: {
    color: Colors.textMuted, fontSize: Typography.size.xs,
    textAlign: 'center', marginTop: Spacing.xs, fontStyle: 'italic',
  },
  fieldHint: {
    color: Colors.textMuted, fontSize: Typography.size.xs, marginTop: 4,
  },
  pickerBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
  },
  pickerBtnText: {
    color: Colors.textPrimary, fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
  },
  pickerArrow: { color: Colors.textMuted, fontSize: Typography.size.sm },
  pickerDropdown: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    marginTop: Spacing.xs, overflow: 'hidden',
  },
  pickerOption: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  pickerOptionActive: { backgroundColor: `${Colors.primary}15` },
  pickerOptionText: { color: Colors.textSecondary, fontSize: Typography.size.base },
  pickerOptionTextActive: { color: Colors.primary, fontWeight: Typography.weight.semibold },
  confirmContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: Spacing.base,
    backgroundColor: Colors.bg,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnText: {
    color: Colors.white,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
  },
});

const row = StyleSheet.create({
  container: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, marginBottom: Spacing.sm, gap: Spacing.sm,
  },
  name: {
    color: Colors.textPrimary, fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
  },
  sku: { color: Colors.textMuted, fontSize: Typography.size.xs },
  unitPrice: { color: Colors.textSecondary, fontSize: Typography.size.xs },
  stockHint: { color: Colors.textMuted, fontSize: 10 },
  stockHintRed: { color: Colors.error },
  controls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.bg,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  qtyBtnDanger: {
    borderColor: Colors.error,
    backgroundColor: `${Colors.error}15`,
  },
  qtyBtnDisabled: {
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
    opacity: 0.4,
  },
  qtyBtnText: { color: Colors.textPrimary, fontSize: 18, lineHeight: 22 },
  qtyBtnTextDisabled: { color: Colors.textMuted },
  qtyInput: {
    width: 40, textAlign: 'center',
    color: Colors.textPrimary, fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingVertical: 2,
  },
  itemTotal: {
    flex: 1, textAlign: 'right',
    color: Colors.primary, fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },
  removeBtn: { padding: 6 },
});

const errModal = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.base,
    paddingTop: Spacing['3xl'],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  icon: { fontSize: 24 },
  title: {
    color: Colors.textPrimary,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
  },
  body: {
    flex: 1,
    padding: Spacing.base,
  },
  friendlyBox: {
    backgroundColor: `${Colors.error}15`,
    borderRadius: Radius.lg,
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
    padding: Spacing.base,
  },
  friendlyText: {
    color: Colors.textPrimary,
    fontSize: Typography.size.base,
    lineHeight: 22,
  },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    letterSpacing: 0.8,
    marginTop: Spacing.sm,
  },
  techBox: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  techText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'monospace' as any,
    lineHeight: 18,
  },
  hint: {
    color: Colors.textMuted,
    fontSize: Typography.size.xs,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  copyBtn: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
  },
  copyBtnText: {
    color: Colors.textSecondary,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
  },
  closeBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    alignItems: 'center',
  },
  closeBtnText: {
    color: Colors.white,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },
});

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { formatCurrency } from '../../utils/formatters';
import { CartItem, PDVCustomer } from '../../store/pdv.store';
import {
  LocalPOSSale,
  LocalPOSSaleItem,
  saveLocalSale,
  markLocalSalesAsSynced,
} from '../../services/pdv.storage';
import { MobilePOSSession, syncPOSSalesBatch } from '../../services/pdv.service';

interface Props {
  visible: boolean;
  companyId?: number;
  customer: PDVCustomer | null;
  items: CartItem[];
  total: number;
  activeSession: MobilePOSSession | null;
  onClose: () => void;
  onSuccess: (saleUuid: string) => void;
}

export function POSCheckoutModal({
  visible,
  companyId,
  customer,
  items,
  total,
  activeSession,
  onClose,
  onSuccess,
}: Props) {
  const insets = useSafeAreaInsets();
  const [paymentMethod, setPaymentMethod] = useState<'DINHEIRO' | 'PIX' | 'DEBITO' | 'CREDITO' | 'MISTO'>('DINHEIRO');
  const [discountStr, setDiscountStr] = useState('');
  const [amountReceivedStr, setAmountReceivedStr] = useState('');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Modal de Recibo Concluído
  const [completedSale, setCompletedSale] = useState<LocalPOSSale | null>(null);
  const [changeAmount, setChangeAmount] = useState<number>(0);

  const discount = Math.max(0, parseFloat(discountStr.replace(',', '.')) || 0);
  const finalTotal = Math.max(0, total - discount);
  const amountReceived = parseFloat(amountReceivedStr.replace(',', '.')) || 0;
  const change = paymentMethod === 'DINHEIRO' ? Math.max(0, amountReceived - finalTotal) : 0;

  useEffect(() => {
    if (visible) {
      setPaymentMethod('DINHEIRO');
      setDiscountStr('');
      setAmountReceivedStr('');
      setNotes('');
      setCompletedSale(null);
      setChangeAmount(0);
      setIsProcessing(false);
    }
  }, [visible]);

  const quickBills = [5, 10, 20, 50, 100, 200];

  async function handleFinalizeSale() {
    if (items.length === 0) {
      Alert.alert('Atenção', 'Nenhum item no carrinho.');
      return;
    }

    if (paymentMethod === 'DINHEIRO' && amountReceived > 0 && amountReceived < finalTotal) {
      Alert.alert('Valor Insuficiente', 'O valor recebido em dinheiro é inferior ao total.');
      return;
    }

    setIsProcessing(true);

    try {
      const now = new Date();
      const saleUuid = `mob-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const saleNumber = `VND-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const saleItems: LocalPOSSaleItem[] = items.map((it) => ({
        barcode: it.product.barcode || it.product.sku || 'SEM-COD',
        sku: it.product.sku,
        title: it.product.name,
        publisher: it.product.brand,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.total,
        horus_item_code: undefined,
        product_id: it.product.id,
      }));

      const newSale: LocalPOSSale = {
        client_sale_uuid: saleUuid,
        sale_number: saleNumber,
        session_id: activeSession?.id ?? null,
        customer_name: customer?.name || 'Consumidor Final',
        customer_document: customer?.document || null,
        customer_id: customer?.id ?? null,
        payment_method: paymentMethod,
        payment_details: paymentMethod === 'DINHEIRO' && amountReceived > 0 ? `Recebido: R$ ${amountReceived.toFixed(2)} | Troco: R$ ${change.toFixed(2)}` : null,
        subtotal: total,
        discount: discount,
        total_amount: finalTotal,
        items_count: items.reduce((acc, cur) => acc + cur.quantity, 0),
        sold_at: now.toISOString(),
        status: 'pending',
        notes: notes.trim() || null,
        items: saleItems,
      };

      // 1. Salva de forma transacional e atômica no SQLite local
      await saveLocalSale(newSale);
      setCompletedSale(newSale);
      setChangeAmount(change);

      // 2. Tenta sincronizar silenciosamente com o backend em nuvem
      if (companyId) {
        try {
          const syncPayload = {
            session_id: activeSession?.id ?? null,
            sales: [
              {
                client_sale_uuid: newSale.client_sale_uuid,
                sale_number: newSale.sale_number,
                session_id: newSale.session_id,
                customer_name: newSale.customer_name,
                customer_document: newSale.customer_document,
                customer_id: newSale.customer_id,
                payment_method: newSale.payment_method,
                payment_details: newSale.payment_details,
                subtotal: newSale.subtotal,
                discount: newSale.discount,
                total_amount: newSale.total_amount,
                items_count: newSale.items_count,
                sold_at: newSale.sold_at,
                origin: 'pdv_mobile_offline',
                notes: newSale.notes,
                items: newSale.items.map((i) => ({
                  barcode: i.barcode,
                  sku: i.sku,
                  title: i.title,
                  publisher: i.publisher,
                  quantity: i.quantity,
                  unit_price: i.unit_price,
                  total_price: i.total_price,
                  product_id: i.product_id,
                })),
              },
            ],
          };

          const syncRes = await syncPOSSalesBatch(companyId, syncPayload);
          if (syncRes && syncRes.success_count > 0) {
            await markLocalSalesAsSynced([newSale.client_sale_uuid]);
          }
        } catch (syncErr) {
          console.warn('[POSCheckoutModal] Venda salva localmente (offline). Sincronização pendente.');
        }
      }

      onSuccess(saleUuid);
    } catch (err: any) {
      Alert.alert('Erro ao Salvar Venda', err?.message || 'Falha ao registrar venda no banco de dados local.');
    } finally {
      setIsProcessing(false);
    }
  }

  function handleShareReceiptWhatsApp() {
    if (!completedSale) return;
    const itemsList = completedSale.items
      .map((it) => `• ${it.quantity}x ${it.title} - R$ ${it.total_price.toFixed(2)}`)
      .join('\n');

    const msg =
      `*COMPROVANTE DE VENDA - CRONUZ B2B*\n` +
      `--------------------------------\n` +
      `*Cupom:* ${completedSale.sale_number}\n` +
      `*Data:* ${new Date(completedSale.sold_at).toLocaleString('pt-BR')}\n` +
      `*Cliente:* ${completedSale.customer_name}\n` +
      (activeSession ? `*Sessão:* ${activeSession.title}\n` : '') +
      `--------------------------------\n` +
      `*ITENS:*\n${itemsList}\n` +
      `--------------------------------\n` +
      `*Subtotal:* R$ ${completedSale.subtotal.toFixed(2)}\n` +
      (completedSale.discount > 0 ? `*Desconto:* -R$ ${completedSale.discount.toFixed(2)}\n` : '') +
      `*TOTAL:* R$ ${completedSale.total_amount.toFixed(2)}\n` +
      `*Pagamento:* ${completedSale.payment_method}\n` +
      (changeAmount > 0 ? `*Troco:* R$ ${changeAmount.toFixed(2)}\n` : '') +
      `\nObrigado pela preferência!`;

    const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert('Aviso', 'WhatsApp não está instalado neste dispositivo.');
        }
      })
      .catch(() => {
        Alert.alert('Aviso', 'Não foi possível abrir o WhatsApp.');
      });
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Recibo da venda concluída */}
        {completedSale ? (
          <View style={[styles.receiptContainer, { paddingTop: Math.max(insets.top + 10, 20) }]}>
            <View style={styles.receiptHeader}>
              <View style={styles.successBadge}>
                <Ionicons name="checkmark-circle" size={54} color={Colors.success} />
              </View>
              <Text style={styles.receiptTitle}>Venda Concluída!</Text>
              <Text style={styles.receiptSubtitle}>Registrada com sucesso no armazenamento local</Text>
            </View>

            <View style={styles.receiptCard}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Comprovante:</Text>
                <Text style={styles.receiptValBold}>{completedSale.sale_number}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Cliente:</Text>
                <Text style={styles.receiptVal}>{completedSale.customer_name}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Total:</Text>
                <Text style={[styles.receiptValBold, { color: Colors.success, fontSize: Typography.size.lg }]}>
                  {formatCurrency(completedSale.total_amount)}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Forma:</Text>
                <Text style={styles.receiptVal}>{completedSale.payment_method}</Text>
              </View>
              {changeAmount > 0 && (
                <View style={[styles.receiptRow, { backgroundColor: 'rgba(245, 158, 11, 0.12)', padding: 6, borderRadius: Radius.sm }]}>
                  <Text style={[styles.receiptLabel, { color: Colors.warning }]}>Troco:</Text>
                  <Text style={[styles.receiptValBold, { color: Colors.warning, fontSize: Typography.size.md }]}>
                    {formatCurrency(changeAmount)}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.receiptActions}>
              <TouchableOpacity style={styles.whatsAppBtn} onPress={handleShareReceiptWhatsApp}>
                <Ionicons name="logo-whatsapp" size={20} color={Colors.white} />
                <Text style={styles.whatsAppBtnText}>Enviar Comprovante WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.finishBtn} onPress={onClose}>
                <Text style={styles.finishBtnText}>Concluir / Nova Venda</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* Header Pagamento */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 20) }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>Fechar Venda</Text>
                <Text style={styles.headerSubtitle}>
                  {customer ? `Cliente: ${customer.name}` : 'Consumidor Final'} • {items.length} itens
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
              {/* Box de Totais */}
              <View style={styles.totalBox}>
                <Text style={styles.totalBoxLabel}>VALOR A RECEBER</Text>
                <Text style={styles.totalBoxAmount}>{formatCurrency(finalTotal)}</Text>
                {discount > 0 && (
                  <Text style={styles.totalBoxSub}>
                    Subtotal: {formatCurrency(total)} • Desconto: -{formatCurrency(discount)}
                  </Text>
                )}
              </View>

              {/* Formas de Pagamento */}
              <Text style={styles.sectionTitle}>FORMA DE PAGAMENTO</Text>
              <View style={styles.methodGrid}>
                {[
                  { key: 'DINHEIRO', label: 'Dinheiro', icon: 'cash-outline' },
                  { key: 'PIX', label: 'PIX', icon: 'qr-code-outline' },
                  { key: 'DEBITO', label: 'Débito', icon: 'card-outline' },
                  { key: 'CREDITO', label: 'Crédito', icon: 'card' },
                  { key: 'MISTO', label: 'Misto / Outro', icon: 'swap-horizontal-outline' },
                ].map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={[
                      styles.methodCard,
                      paymentMethod === m.key && styles.methodCardActive,
                    ]}
                    onPress={() => setPaymentMethod(m.key as any)}
                  >
                    <Ionicons
                      name={m.icon as any}
                      size={20}
                      color={paymentMethod === m.key ? Colors.primary : Colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.methodText,
                        paymentMethod === m.key && styles.methodTextActive,
                      ]}
                    >
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Calculador de Troco para Dinheiro */}
              {paymentMethod === 'DINHEIRO' && (
                <View style={styles.cashBox}>
                  <Text style={styles.inputLabel}>Valor Recebido em Dinheiro (R$):</Text>
                  <TextInput
                    style={styles.cashInput}
                    placeholder="0,00"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numeric"
                    value={amountReceivedStr}
                    onChangeText={setAmountReceivedStr}
                  />

                  {/* Atalhos de Cédulas */}
                  <View style={styles.quickBillsRow}>
                    {quickBills.map((bill) => (
                      <TouchableOpacity
                        key={bill}
                        style={styles.quickBillBtn}
                        onPress={() => setAmountReceivedStr(String(bill))}
                      >
                        <Text style={styles.quickBillText}>R$ {bill}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.quickBillBtn, { backgroundColor: `${Colors.primary}20` }]}
                      onPress={() => setAmountReceivedStr(finalTotal.toFixed(2))}
                    >
                      <Text style={[styles.quickBillText, { color: Colors.primary }]}>Exato</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Exibição do Troco */}
                  <View style={styles.changeDisplay}>
                    <Text style={styles.changeLabel}>TROCO A DEVOLVER:</Text>
                    <Text style={[styles.changeValue, change > 0 && { color: Colors.warning }]}>
                      {formatCurrency(change)}
                    </Text>
                  </View>
                </View>
              )}

              {/* Desconto */}
              <View style={styles.fieldBox}>
                <Text style={styles.inputLabel}>Desconto em Reais (R$):</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0,00"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  value={discountStr}
                  onChangeText={setDiscountStr}
                />
              </View>

              {/* Observações */}
              <View style={styles.fieldBox}>
                <Text style={styles.inputLabel}>Observações da Venda (Opcional):</Text>
                <TextInput
                  style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                  placeholder="Anotações internas..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  value={notes}
                  onChangeText={setNotes}
                />
              </View>
            </ScrollView>

            {/* Footer Botão Confirmar */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.finalizeBtn, isProcessing && styles.finalizeBtnDisabled]}
                onPress={handleFinalizeSale}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={20} color={Colors.white} />
                    <Text style={styles.finalizeBtnText}>
                      Confirmar Venda • {formatCurrency(finalTotal)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  headerTitle: {
    fontSize: Typography.size.base,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
  },
  closeBtn: {
    padding: 6,
  },
  scrollBody: {
    padding: Spacing.base,
    paddingBottom: 100,
  },
  totalBox: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.base,
  },
  totalBoxLabel: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  totalBoxAmount: {
    fontSize: Typography.size['3xl'],
    fontFamily: Typography.fontFamily.bold,
    color: Colors.success,
    marginVertical: 4,
  },
  totalBoxSub: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  sectionTitle: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.base,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  methodCardActive: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}18`,
  },
  methodText: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  methodTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.bold,
  },
  cashBox: {
    backgroundColor: Colors.bgCard,
    padding: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.base,
  },
  inputLabel: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  cashInput: {
    height: 48,
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: Typography.size.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  quickBillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: Spacing.sm,
  },
  quickBillBtn: {
    backgroundColor: Colors.bgCardHover,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  quickBillText: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  changeDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  changeLabel: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textMuted,
  },
  changeValue: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  fieldBox: {
    marginBottom: Spacing.base,
  },
  input: {
    height: 44,
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.base,
    backgroundColor: Colors.bg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  finalizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 14,
  },
  finalizeBtnDisabled: {
    opacity: 0.6,
  },
  finalizeBtnText: {
    fontSize: Typography.size.base,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
  },
  receiptContainer: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  receiptHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  successBadge: {
    marginBottom: Spacing.sm,
  },
  receiptTitle: {
    fontSize: Typography.size.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  receiptSubtitle: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  receiptCard: {
    width: '100%',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
    marginBottom: Spacing.xl,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
  },
  receiptVal: {
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  receiptValBold: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  receiptActions: {
    width: '100%',
    gap: 12,
  },
  whatsAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#25D366',
    borderRadius: Radius.lg,
    paddingVertical: 14,
  },
  whatsAppBtnText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
  },
  finishBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingVertical: 14,
  },
  finishBtnText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
});

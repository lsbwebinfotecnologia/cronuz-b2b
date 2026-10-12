import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../../../constants/theme';
import { useAuthStore } from '../../../store/auth.store';
import api from '../../../services/api';

interface TableItem {
  id: number;
  number: string;
  area: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'BILL_REQUESTED' | 'BLOCKED';
  active_tab_id?: number;
  active_tab_number?: string;
  active_tab_total?: number;
}

interface OrderItem {
  id: number;
  title: string;
  quantity: number;
  unit_price: number;
  modifiers_price: number;
  total_price: number;
  notes?: string;
  prep_status: string;
}

interface TabDetail {
  id: number;
  tab_number: string;
  table_number?: string;
  customer_name?: string;
  status: string;
  total_amount: number;
  items: OrderItem[];
}

export default function MobileCafeteriaScreen() {
  const { user } = useAuthStore();
  const companyId = user?.company_id;

  const [tables, setTables] = useState<TableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Comanda Selecionada
  const [selectedTab, setSelectedTab] = useState<TabDetail | null>(null);
  const [loadingTab, setLoadingTab] = useState(false);

  // Modal Abrir Comanda
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableItem | null>(null);
  const [tabNumberInput, setTabNumberInput] = useState('');
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [submittingOpen, setSubmittingOpen] = useState(false);

  // Modal Adicionar Produto
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [itemNotes, setItemNotes] = useState('');

  const fetchTables = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data } = await api.get(`/companies/${companyId}/cafeteria/tables`);
      setTables(data);
    } catch {
      // Ignora erro de rede
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const loadTabDetails = async (tabId: number) => {
    if (!companyId) return;
    setLoadingTab(!selectedTab);
    try {
      const { data } = await api.get(`/companies/${companyId}/cafeteria/tabs/${tabId}`);
      setSelectedTab(data);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar os detalhes da comanda.');
    } finally {
      setLoadingTab(false);
    }
  };

  const handleTablePress = (table: TableItem) => {
    if (table.active_tab_id) {
      loadTabDetails(table.active_tab_id);
    } else {
      setSelectedTable(table);
      setTabNumberInput(`MESA-${table.number}`);
      setCustomerNameInput('');
      setShowOpenModal(true);
    }
  };

  const handleOpenTab = async () => {
    if (!companyId || !tabNumberInput.trim()) return;
    setSubmittingOpen(true);
    try {
      const { data } = await api.post(`/companies/${companyId}/cafeteria/tabs`, {
        table_id: selectedTable?.id,
        tab_number: tabNumberInput.trim(),
        customer_name: customerNameInput.trim() || undefined,
      });
      setShowOpenModal(false);
      await fetchTables();
      loadTabDetails(data.id);
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.detail || 'Erro ao abrir comanda');
    } finally {
      setSubmittingOpen(false);
    }
  };

  const searchProducts = async (term: string) => {
    setProductQuery(term);
    if (!companyId) return;
    setSearchingProducts(true);
    try {
      const { data } = await api.get(
        `/companies/${companyId}/cafeteria/products/search?q=${encodeURIComponent(term)}`
      );
      setProducts(data);
    } catch {
      // ignore
    } finally {
      setSearchingProducts(false);
    }
  };

  const handleAddItemToTab = async (prod: any) => {
    if (!companyId || !selectedTab) return;
    try {
      await api.post(`/companies/${companyId}/cafeteria/tabs/${selectedTab.id}/items`, {
        product_id: prod.id,
        barcode: prod.barcode,
        sku: prod.sku,
        title: prod.title,
        quantity: 1,
        unit_price: prod.price,
        source: prod.source,
        notes: itemNotes.trim() || undefined,
        requires_preparation: prod.requires_preparation ?? true,
      });
      Alert.alert('Sucesso', 'Item adicionado e transmitido ao Barista!');
      setShowAddProductModal(false);
      setItemNotes('');
      loadTabDetails(selectedTab.id);
      fetchTables();
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.detail || 'Falha ao lançar item');
    }
  };

  const handleRequestBill = async () => {
    if (!companyId || !selectedTab) return;
    try {
      await api.patch(
        `/companies/${companyId}/cafeteria/tabs/${selectedTab.id}/status?status=BILL_REQUESTED`
      );
      Alert.alert('Conta Solicitada', 'Mesa sinalizada e comanda enviada ao Caixa PDV!');
      setSelectedTab(null);
      fetchTables();
    } catch {
      Alert.alert('Erro', 'Não foi possível solicitar a conta');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="cafe" size={24} color={Colors.primary} />
          <Text style={styles.headerTitle}>Cafeteria & Mesas</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => {
            setRefreshing(true);
            fetchTables();
          }}
        >
          <Ionicons name="refresh" size={20} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* Grid de Mesas */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Carregando salão...</Text>
        </View>
      ) : (
        <FlatList
          data={tables}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          contentContainerStyle={styles.tableList}
          refreshing={refreshing}
          onRefresh={fetchTables}
          renderItem={({ item }) => {
            const isOccupied = item.status === 'OCCUPIED';
            const isBillReq = item.status === 'BILL_REQUESTED';
            return (
              <TouchableOpacity
                style={[
                  styles.tableCard,
                  item.status === 'AVAILABLE' && styles.tableAvailable,
                  isOccupied && styles.tableOccupied,
                  isBillReq && styles.tableBillRequested,
                ]}
                onPress={() => handleTablePress(item)}
              >
                <View style={styles.tableCardHeader}>
                  <Text style={styles.tableArea}>{item.area}</Text>
                  <View
                    style={[
                      styles.statusDot,
                      item.status === 'AVAILABLE' && styles.dotAvailable,
                      isOccupied && styles.dotOccupied,
                      isBillReq && styles.dotBillReq,
                    ]}
                  />
                </View>

                <Text style={styles.tableNumber}>Mesa {item.number}</Text>

                <View style={styles.tableCardFooter}>
                  <Text style={styles.tableCapacity}>
                    <Ionicons name="people-outline" size={12} color={Colors.textMuted} /> {item.capacity}p
                  </Text>
                  {isOccupied && item.active_tab_total !== undefined && (
                    <Text style={styles.tableTotal}>
                      R$ {Number(item.active_tab_total).toFixed(2)}
                    </Text>
                  )}
                  {item.status === 'AVAILABLE' && (
                    <Text style={styles.tableFreeText}>Livre</Text>
                  )}
                  {isBillReq && (
                    <Text style={styles.tableBillReqText}>Conta Pedida</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* MODAL DETALHES DA COMANDA */}
      {selectedTab && (
        <Modal visible={true} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.tabModalContent}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Comanda #{selectedTab.tab_number}</Text>
                  <Text style={styles.modalSubtitle}>
                    {selectedTab.table_number ? `Mesa ${selectedTab.table_number}` : 'Balcão'}
                    {selectedTab.customer_name ? ` • ${selectedTab.customer_name}` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedTab(null)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.tabItemsList}>
                {selectedTab.items.map((it) => (
                  <View key={it.id} style={styles.tabItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tabItemTitle}>
                        {it.quantity}x {it.title}
                      </Text>
                      {it.notes && (
                        <Text style={styles.tabItemNotes}>Obs: {it.notes}</Text>
                      )}
                      <Text style={styles.tabItemStatus}>
                        {it.prep_status === 'READY'
                          ? '✔ Pronto'
                          : it.prep_status === 'PREPARING'
                          ? '⏳ Em Preparo'
                          : 'Fila Barista'}
                      </Text>
                    </View>
                    <Text style={styles.tabItemPrice}>
                      R$ {Number(it.total_price).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              {/* Total & Ações */}
              <View style={styles.tabModalFooter}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total Consumido:</Text>
                  <Text style={styles.totalAmount}>
                    R$ {Number(selectedTab.total_amount).toFixed(2)}
                  </Text>
                </View>

                <View style={styles.footerActionRow}>
                  <TouchableOpacity
                    style={styles.addItemButton}
                    onPress={() => {
                      setShowAddProductModal(true);
                      searchProducts('');
                    }}
                  >
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.addItemButtonText}>Lançar Item</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.billButton}
                    onPress={handleRequestBill}
                  >
                    <Ionicons name="card-outline" size={18} color="#fff" />
                    <Text style={styles.billButtonText}>Pedir Conta</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* MODAL ABRIR COMANDA */}
      <Modal visible={showOpenModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.dialogContent}>
            <Text style={styles.dialogTitle}>
              Abrir Comanda {selectedTable ? `(Mesa ${selectedTable.number})` : ''}
            </Text>

            <TextInput
              style={styles.dialogInput}
              placeholder="Número ou Identificador da Comanda"
              placeholderTextColor={Colors.textMuted}
              value={tabNumberInput}
              onChangeText={setTabNumberInput}
            />

            <TextInput
              style={styles.dialogInput}
              placeholder="Nome do Cliente (Opcional)"
              placeholderTextColor={Colors.textMuted}
              value={customerNameInput}
              onChangeText={setCustomerNameInput}
            />

            <View style={styles.dialogActions}>
              <TouchableOpacity
                style={styles.dialogCancel}
                onPress={() => setShowOpenModal(false)}
              >
                <Text style={styles.dialogCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dialogConfirm}
                onPress={handleOpenTab}
                disabled={submittingOpen}
              >
                {submittingOpen ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.dialogConfirmText}>Abrir</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL ADICIONAR ITEM */}
      <Modal visible={showAddProductModal} animationType="slide">
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Cardápio & Produtos</Text>
            <TouchableOpacity onPress={() => setShowAddProductModal(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <View style={{ padding: Spacing.md }}>
            <TextInput
              style={styles.dialogInput}
              placeholder="Buscar café, lanche, livro..."
              placeholderTextColor={Colors.textMuted}
              value={productQuery}
              onChangeText={searchProducts}
            />
            <TextInput
              style={[styles.dialogInput, { marginTop: 8 }]}
              placeholder="Observação (ex: com canela, sem açúcar)"
              placeholderTextColor={Colors.textMuted}
              value={itemNotes}
              onChangeText={setItemNotes}
            />
          </View>

          {searchingProducts ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={products}
              keyExtractor={(_, idx) => idx.toString()}
              contentContainerStyle={{ padding: Spacing.md }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.productSearchItem}
                  onPress={() => handleAddItemToTab(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productTitle}>{item.title}</Text>
                    <Text style={styles.productSource}>Origem: {item.source}</Text>
                  </View>
                  <Text style={styles.productPrice}>
                    R$ {Number(item.price).toFixed(2)}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: 'bold',
    color: Colors.text,
  },
  refreshButton: {
    padding: Spacing.xs,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.xs,
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  tableList: {
    padding: Spacing.sm,
  },
  tableCard: {
    flex: 1,
    margin: Spacing.xs,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    minHeight: 120,
    justifyContent: 'space-between',
  },
  tableAvailable: {
    backgroundColor: '#fff',
    borderColor: '#e2e8f0',
  },
  tableOccupied: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  tableBillRequested: {
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
  },
  tableCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableArea: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotAvailable: {
    backgroundColor: '#10b981',
  },
  dotOccupied: {
    backgroundColor: '#f59e0b',
  },
  dotBillReq: {
    backgroundColor: '#0284c7',
  },
  tableNumber: {
    fontSize: FontSize.md,
    fontWeight: 'bold',
    color: Colors.text,
    marginVertical: Spacing.xs,
  },
  tableCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableCapacity: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  tableTotal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#d97706',
  },
  tableFreeText: {
    fontSize: 11,
    color: '#10b981',
    fontWeight: '600',
  },
  tableBillReqText: {
    fontSize: 10,
    color: '#0284c7',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  tabModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '80%',
    padding: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: FontSize.md,
    fontWeight: 'bold',
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  tabItemsList: {
    maxHeight: 280,
    marginVertical: Spacing.sm,
  },
  tabItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  tabItemTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.text,
  },
  tabItemNotes: {
    fontSize: 11,
    color: '#64748b',
    fontStyle: 'italic',
  },
  tabItemStatus: {
    fontSize: 10,
    color: '#0284c7',
    fontWeight: '600',
  },
  tabItemPrice: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.text,
  },
  tabModalFooter: {
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  totalLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  totalAmount: {
    fontSize: FontSize.lg,
    fontWeight: 'bold',
    color: '#d97706',
  },
  footerActionRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  addItemButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#d97706',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  addItemButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  billButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#0284c7',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  billButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  dialogContent: {
    backgroundColor: '#fff',
    margin: Spacing.lg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  dialogTitle: {
    fontSize: FontSize.md,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  dialogInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    fontSize: FontSize.sm,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  dialogCancel: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  dialogCancelText: {
    color: Colors.textMuted,
    fontWeight: '600',
  },
  dialogConfirm: {
    backgroundColor: '#d97706',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  dialogConfirmText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  productSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  productTitle: {
    fontSize: FontSize.sm,
    fontWeight: 'bold',
    color: Colors.text,
  },
  productSource: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  productPrice: {
    fontSize: FontSize.sm,
    fontWeight: 'bold',
    color: '#d97706',
  },
});

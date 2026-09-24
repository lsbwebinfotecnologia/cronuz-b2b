import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  Image,
  Vibration,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePDVStore, PDVCustomer, PDVProduct } from '../../../store/pdv.store';
import { useAuthStore } from '../../../store/auth.store';
import {
  searchCustomers,
  MobilePOSSession,
  fetchPOSConfig,
  syncPOSSalesBatch,
  fetchPOSSessionProducts,
  syncSessionProductsProgressive,
} from '../../../services/pdv.service';
import {
  LocalPOSProduct,
  getPdvDatabase,
  getLocalCatalogCount,
  getSampleLocalProducts,
  searchLocalProducts,
  getLocalProductByBarcode,
  saveSessionProductsLocally,
  getPendingLocalSalesCount,
  getPendingLocalSales,
  markLocalSalesAsSynced,
  setPdvLocalSetting,
  getPdvLocalSetting,
} from '../../../services/pdv.storage';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { formatCurrency } from '../../../utils/formatters';
import { BarcodeScannerModal } from '../../../components/BarcodeScannerModal';
import { POSSessionPickerModal } from '../../../components/pdv/POSSessionPickerModal';
import { POSCatalogSyncModal } from '../../../components/pdv/POSCatalogSyncModal';
import { POSCheckoutModal } from '../../../components/pdv/POSCheckoutModal';

// ─── Customer Modal ───────────────────────────────────────────────────────────

// ─── Customer Modal ───────────────────────────────────────────────────────────

interface CustomerModalProps {
  visible: boolean;
  currentCustomer: PDVCustomer | null;
  isPinned: boolean;
  onClose: () => void;
  onSelect: (c: PDVCustomer | null, pin?: boolean) => void;
}

type CustomerTabMode = 'final' | 'manual' | 'registered';

function CustomerModal({
  visible,
  currentCustomer,
  isPinned,
  onClose,
  onSelect,
}: CustomerModalProps) {
  const insets = useSafeAreaInsets();

  // Modo de seleção: Consumidor Final, Avulso (Nome/CPF) ou Cadastrado
  const [tabMode, setTabMode] = useState<CustomerTabMode>('final');

  // Modo Manual (Avulso)
  const [manualName, setManualName] = useState('');
  const [manualDoc, setManualDoc] = useState('');

  // Modo Cadastrado (Busca online)
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PDVCustomer[]>([]);
  const [loading, setLoading] = useState(false);

  // Fixar cliente
  const [pinOnSelect, setPinOnSelect] = useState(isPinned);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPinOnSelect(isPinned);
    if (visible) {
      if (currentCustomer) {
        if (currentCustomer.id && currentCustomer.id > 0) {
          setTabMode('registered');
          setQuery(currentCustomer.name || '');
        } else {
          setTabMode('manual');
          setManualName(currentCustomer.name || '');
          setManualDoc(currentCustomer.document || '');
        }
      } else {
        setTabMode('final');
        setManualName('');
        setManualDoc('');
        setQuery('');
      }
    } else {
      setQuery('');
      setResults([]);
    }
  }, [visible, currentCustomer, isPinned]);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const clean = text.trim();
      if (clean.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const data = await searchCustomers(clean);
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, []);

  const handleConfirmManual = () => {
    const trimmedName = manualName.trim();
    if (!trimmedName) {
      Alert.alert('Nome Obrigatório', 'Informe o nome do cliente para a venda avulsa.');
      return;
    }
    const trimmedDoc = manualDoc.trim().replace(/[^\d]/g, '');
    onSelect(
      {
        id: 0,
        name: trimmedName,
        document: trimmedDoc.length > 0 ? manualDoc.trim() : undefined,
      },
      pinOnSelect
    );
    onClose();
  };

  const handleSelectFinalConsumer = () => {
    onSelect(null, false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modal.container}>
        {/* Header com Safe Area Inset no topo */}
        <View style={[modal.header, { paddingTop: Math.max(insets.top + 10, 20) }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Ionicons name="person-circle" size={26} color={Colors.primary} />
            <Text style={modal.title}>Cliente da Venda</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={modal.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Abas Superiores Mobile First (Consumidor | Avulso | Cadastrado) */}
        <View style={modal.tabsContainer}>
          <TouchableOpacity
            style={[modal.tabItem, tabMode === 'final' && modal.tabItemActive]}
            onPress={() => setTabMode('final')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="people-outline"
              size={16}
              color={tabMode === 'final' ? Colors.primary : Colors.textMuted}
            />
            <Text style={[modal.tabItemText, tabMode === 'final' && modal.tabItemTextActive]}>
              Consumidor
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[modal.tabItem, tabMode === 'manual' && modal.tabItemActive]}
            onPress={() => setTabMode('manual')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="create-outline"
              size={16}
              color={tabMode === 'manual' ? Colors.primary : Colors.textMuted}
            />
            <Text style={[modal.tabItemText, tabMode === 'manual' && modal.tabItemTextActive]}>
              Avulso (Nome/CPF)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[modal.tabItem, tabMode === 'registered' && modal.tabItemActive]}
            onPress={() => setTabMode('registered')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="search-outline"
              size={16}
              color={tabMode === 'registered' ? Colors.primary : Colors.textMuted}
            />
            <Text style={[modal.tabItemText, tabMode === 'registered' && modal.tabItemTextActive]}>
              Cadastrado
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─── MODO 1: CONSUMIDOR FINAL ─── */}
        {tabMode === 'final' && (
          <View style={modal.tabBody}>
            <View style={modal.consumerCard}>
              <View style={modal.consumerIconBox}>
                <Ionicons name="cart-outline" size={32} color={Colors.primary} />
              </View>
              <Text style={modal.consumerTitle}>Consumidor Final</Text>
              <Text style={modal.consumerDesc}>
                Venda rápida de balcão sem identificação fiscal do cliente. Ideal para atendimento ágil.
              </Text>

              <TouchableOpacity
                style={modal.primaryActionBtn}
                onPress={handleSelectFinalConsumer}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
                <Text style={modal.primaryActionBtnText}>Usar Consumidor Final</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─── MODO 2: AVULSO COM NOME E CPF ─── */}
        {tabMode === 'manual' && (
          <ScrollView
            style={modal.tabBody}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            <Text style={modal.sectionTitle}>Identificação Rápida na Hora</Text>
            <Text style={modal.sectionSubtitle}>
              Preencha os dados do cliente para emitir ou registrar a venda com o nome e CPF/CNPJ:
            </Text>

            {/* Campo Nome */}
            <View style={modal.inputGroup}>
              <Text style={modal.inputLabel}>Nome do Cliente *</Text>
              <View style={modal.inputWrapper}>
                <Ionicons name="person-outline" size={18} color={Colors.textMuted} />
                <TextInput
                  style={modal.textInput}
                  placeholder="Ex: João da Silva"
                  placeholderTextColor={Colors.textMuted}
                  value={manualName}
                  onChangeText={setManualName}
                  autoFocus
                />
              </View>
            </View>

            {/* Campo CPF / CNPJ */}
            <View style={modal.inputGroup}>
              <Text style={modal.inputLabel}>CPF ou CNPJ (Opcional)</Text>
              <View style={modal.inputWrapper}>
                <Ionicons name="card-outline" size={18} color={Colors.textMuted} />
                <TextInput
                  style={modal.textInput}
                  placeholder="Ex: 000.000.000-00"
                  placeholderTextColor={Colors.textMuted}
                  value={manualDoc}
                  onChangeText={setManualDoc}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Opção de Fixar nas próximas vendas 📌 */}
            <TouchableOpacity
              style={[modal.pinToggleRow, pinOnSelect && modal.pinToggleRowActive]}
              onPress={() => setPinOnSelect(!pinOnSelect)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={pinOnSelect ? 'pin' : 'pin-outline'}
                size={20}
                color={pinOnSelect ? Colors.primary : Colors.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={[modal.pinToggleText, pinOnSelect && modal.pinToggleTextActive]}>
                  Fixar este cliente para as próximas vendas 📌
                </Text>
                <Text style={modal.pinToggleSub}>
                  Mantém este cliente selecionado após finalizar cada venda
                </Text>
              </View>
            </TouchableOpacity>

            {/* Botão de Confirmação */}
            <TouchableOpacity
              style={[modal.primaryActionBtn, !manualName.trim() && { opacity: 0.6 }]}
              onPress={handleConfirmManual}
              disabled={!manualName.trim()}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-done" size={20} color={Colors.white} />
              <Text style={modal.primaryActionBtnText}>Confirmar e Usar na Venda</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ─── MODO 3: CADASTRADO NO SISTEMA ─── */}
        {tabMode === 'registered' && (
          <View style={modal.tabBody}>
            {/* Campo de Busca */}
            <View style={modal.searchBox}>
              <Ionicons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                style={modal.searchInput}
                placeholder="Buscar cliente por nome, CPF ou CNPJ..."
                placeholderTextColor={Colors.textMuted}
                value={query}
                onChangeText={handleSearch}
                autoFocus
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => handleSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Opção de Fixar ao selecionar */}
            <TouchableOpacity
              style={[modal.pinToggleRow, pinOnSelect && modal.pinToggleRowActive, { marginTop: 10, marginHorizontal: 0 }]}
              onPress={() => setPinOnSelect(!pinOnSelect)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={pinOnSelect ? 'pin' : 'pin-outline'}
                size={18}
                color={pinOnSelect ? Colors.primary : Colors.textMuted}
              />
              <Text style={[modal.pinToggleText, pinOnSelect && modal.pinToggleTextActive]}>
                Fixar cliente selecionado nas próximas vendas 📌
              </Text>
            </TouchableOpacity>

            {loading && <ActivityIndicator color={Colors.primary} style={{ margin: Spacing.base }} />}

            {/* Resultados */}
            <FlatList
              data={results}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={modal.customerRow}
                  onPress={() => {
                    onSelect(item, pinOnSelect);
                    onClose();
                  }}
                >
                  <View style={modal.avatar}>
                    <Text style={modal.avatarText}>{(item.name || 'C').charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={modal.customerName}>{item.name}</Text>
                    {item.document && (
                      <Text style={modal.customerDoc}>{item.document}</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                query.trim().length >= 2 && !loading ? (
                  <View style={{ padding: Spacing.base, alignItems: 'center' }}>
                    <Text style={modal.empty}>Nenhum cliente cadastrado encontrado.</Text>
                    <TouchableOpacity
                      style={{ marginTop: 12, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: `${Colors.primary}15`, borderRadius: Radius.md }}
                      onPress={() => {
                        setTabMode('manual');
                        setManualName(query.trim());
                      }}
                    >
                      <Text style={{ color: Colors.primary, fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm }}>
                        + Cadastrar avulso com "{query.trim()}"
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null
              }
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onAdd,
  onDirectSale,
}: {
  product: LocalPOSProduct;
  onAdd: (p: LocalPOSProduct) => void;
  onDirectSale: (p: LocalPOSProduct) => void;
}) {
  return (
    <View style={card.container}>
      <View style={card.imagePlaceholder}>
        <Text style={card.imagePlaceholderText}>📖</Text>
      </View>
      <View style={card.info}>
        <Text style={card.name} numberOfLines={2}>{product.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {product.barcode ? <Text style={card.barcode}>ISBN: {product.barcode}</Text> : null}
          {product.publisher ? <Text style={card.brand}>{product.publisher}</Text> : null}
        </View>

        <View style={card.priceRow}>
          <Text style={card.price}>{formatCurrency(product.price)}</Text>
          <View style={card.sourceBadge}>
            <Text style={card.sourceBadgeText}>{product.source || 'LOCAL'}</Text>
          </View>
        </View>

        <View style={card.actionsRow}>
          <TouchableOpacity
            style={card.addBtn}
            onPress={() => onAdd(product)}
            activeOpacity={0.7}
          >
            <Ionicons name="cart-outline" size={14} color={Colors.white} />
            <Text style={card.addBtnText}>+ Carrinho</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={card.directBtn}
            onPress={() => onDirectSale(product)}
            activeOpacity={0.7}
          >
            <Ionicons name="flash-outline" size={14} color={Colors.success} />
            <Text style={card.directBtnText}>Vender</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function PDVScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { customer, setCustomer, addItem, items, total, itemCount, clearCart } = usePDVStore();

  // Estados Offline e Sessão
  const [activeSession, setActiveSession] = useState<MobilePOSSession | null>(null);
  const [isCustomerPinned, setIsCustomerPinned] = useState(false);
  const [localCatalogCount, setLocalCatalogCount] = useState<number>(0);
  const [pendingSalesCount, setPendingSalesCount] = useState<number>(0);
  const [syncingSales, setSyncingSales] = useState(false);

  // Omnibar & Produtos
  const [omnibarText, setOmnibarText] = useState('');
  const [products, setProducts] = useState<LocalPOSProduct[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(false);

  // Estado de Sincronização Progressiva em Segundo Plano (Background Sync)
  const [syncState, setSyncState] = useState<{
    isRunning: boolean;
    current: number;
    total: number;
    percent: number;
    statusMsg: string;
    hasError: boolean;
    errorMsg?: string;
  }>({
    isRunning: false,
    current: 0,
    total: 0,
    percent: 0,
    statusMsg: '',
    hasError: false,
  });

  // Modais
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  // Inicialização do SQLite
  useEffect(() => {
    async function init() {
      try {
        await getPdvDatabase();
        const count = await getLocalCatalogCount();
        setLocalCatalogCount(count);

        const pending = await getPendingLocalSalesCount();
        setPendingSalesCount(pending);

        const cachedSession = await getPdvLocalSetting<MobilePOSSession>('active_session');
        if (cachedSession) setActiveSession(cachedSession);

        const pinned = await getPdvLocalSetting<boolean>('customer_pinned');
        if (pinned) setIsCustomerPinned(true);

        const cachedCust = await getPdvLocalSetting<PDVCustomer>('pinned_customer');
        if (cachedCust && pinned) setCustomer(cachedCust);

        // Amostra inicial
        const samples = await getSampleLocalProducts(30);
        setProducts(samples);
      } catch (err) {
        console.error('[PDVScreen] Erro ao inicializar SQLite:', err);
      }
    }
    init();
  }, []);

  // Recarregar catálogo ao mudar sessão ou contagem
  const refreshLocalProducts = useCallback(async () => {
    try {
      const count = await getLocalCatalogCount();
      setLocalCatalogCount(count);
      const pending = await getPendingLocalSalesCount();
      setPendingSalesCount(pending);

      if (omnibarText.trim().length >= 2) {
        const found = await searchLocalProducts(omnibarText.trim(), 40);
        setProducts(found);
      } else {
        const samples = await getSampleLocalProducts(30);
        setProducts(samples);
      }
    } catch (e) {
      console.error(e);
    }
  }, [omnibarText]);

  // Busca no SQLite com debounce
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleOmnibarChange = (text: string) => {
    setOmnibarText(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      const clean = text.trim();
      if (!clean) {
        const samples = await getSampleLocalProducts(30);
        setProducts(samples);
        return;
      }
      setLoadingLocal(true);
      try {
        const results = await searchLocalProducts(clean, 40);
        setProducts(results);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingLocal(false);
      }
    }, 250);
  };

  // Submissão do Omnibar (Enter / Leitor Físico / Teclado)
  const handleOmnibarSubmit = async () => {
    const rawCode = omnibarText.trim();
    if (!rawCode) return;

    // Busca exata pelo código de barras/ISBN
    const exact = await getLocalProductByBarcode(rawCode);
    if (exact) {
      handleAddItem(exact);
      try { Vibration.vibrate(80); } catch {}
      setOmnibarText('');
      const samples = await getSampleLocalProducts(30);
      setProducts(samples);
      return;
    }

    // Se não encontrou exato por barcode, mantém os resultados de busca
    if (products.length === 1) {
      handleAddItem(products[0]);
      try { Vibration.vibrate(80); } catch {}
      setOmnibarText('');
      const samples = await getSampleLocalProducts(30);
      setProducts(samples);
    } else if (products.length === 0) {
      Alert.alert('Não Encontrado', `Nenhum produto local encontrado com "${rawCode}".`);
    }
  };

  // Leitura da Câmera
  const handleBarcodeScanned = async (barcode: string) => {
    setShowScanner(false);
    const clean = barcode.trim();
    if (!clean) return;

    const exact = await getLocalProductByBarcode(clean);
    if (exact) {
      handleAddItem(exact);
      try { Vibration.vibrate(100); } catch {}
      Alert.alert('Item Adicionado', `+1 ${exact.title}`);
    } else {
      setOmnibarText(clean);
      const results = await searchLocalProducts(clean, 20);
      setProducts(results);
      Alert.alert('Código Lido', `Código "${clean}" não cadastrado nesta sessão. Buscando...`);
    }
  };

  // Adicionar ao carrinho
  const handleAddItem = (prod: LocalPOSProduct) => {
    const pdvProd: PDVProduct = {
      id: prod.product_id ?? undefined,
      name: prod.title,
      sku: prod.sku,
      barcode: prod.barcode,
      price: prod.price,
      base_price: prod.price,
      stock: prod.stock,
      brand: prod.publisher,
    };
    addItem(pdvProd);
  };

  // Venda direta instantânea de 1 item
  const handleDirectSale = (prod: LocalPOSProduct) => {
    handleAddItem(prod);
    setShowCheckoutModal(true);
  };

  // Executar sincronização progressiva em segundo plano (Background Sync)
  const runBackgroundSync = async (sessionToSync?: MobilePOSSession | null) => {
    const target = sessionToSync !== undefined ? sessionToSync : activeSession;
    if (!target || !user?.company_id) {
      setShowCatalogModal(true);
      return;
    }

    if (syncState.isRunning) {
      Alert.alert(
        'Sincronização em Andamento',
        'Os produtos já estão sendo importados em segundo plano. Você pode continuar vendendo normalmente!'
      );
      return;
    }

    setSyncState({
      isRunning: true,
      current: 0,
      total: 0,
      percent: 0,
      statusMsg: 'Conectando à sessão...',
      hasError: false,
    });

    try {
      const { totalSaved, totalCount } = await syncSessionProductsProgressive(
        user.company_id,
        target.id,
        target.catalog_source || 'SPREADSHEET',
        (curr, tot, pct, msg) => {
          setSyncState({
            isRunning: true,
            current: curr,
            total: tot,
            percent: pct,
            statusMsg: msg,
            hasError: false,
          });
          // Atualiza a contagem local de tempos em tempos
          setLocalCatalogCount(curr);
        }
      );

      setSyncState({
        isRunning: false,
        current: totalSaved,
        total: totalCount,
        percent: 100,
        statusMsg: `✓ ${totalSaved.toLocaleString('pt-BR')} produtos prontos para uso offline!`,
        hasError: false,
      });

      await refreshLocalProducts();
    } catch (e: any) {
      console.log('[BackgroundSync] Falha na sincronização:', e.message);
      setSyncState((prev) => ({
        ...prev,
        isRunning: false,
        hasError: true,
        errorMsg: e.message || 'Falha de conexão com o servidor.',
      }));
      await refreshLocalProducts();
    }
  };

  // Selecionar sessão e disparar importação em segundo plano sem travar o usuário
  const handleSelectSession = async (session: MobilePOSSession | null) => {
    setActiveSession(session);
    await setPdvLocalSetting('active_session', session);

    if (session && user?.company_id) {
      // Dispara em background
      runBackgroundSync(session);
    }
    await refreshLocalProducts();
  };

  // Recarregar / Sincronizar produtos sob demanda
  const handleSyncActiveSessionProducts = () => {
    runBackgroundSync();
  };

  // Pinagem do Cliente
  const handleTogglePinCustomer = async () => {
    const next = !isCustomerPinned;
    setIsCustomerPinned(next);
    await setPdvLocalSetting('customer_pinned', next);
    if (next && customer) {
      await setPdvLocalSetting('pinned_customer', customer);
    } else if (!next) {
      await setPdvLocalSetting('pinned_customer', null);
    }
  };

  const handleSelectCustomer = async (c: PDVCustomer | null, pin?: boolean) => {
    setCustomer(c);
    const shouldPin = pin !== undefined ? pin : isCustomerPinned;
    setIsCustomerPinned(shouldPin);
    await setPdvLocalSetting('customer_pinned', shouldPin);
    if (shouldPin && c) {
      await setPdvLocalSetting('pinned_customer', c);
    } else if (!shouldPin || !c) {
      await setPdvLocalSetting('pinned_customer', null);
    }
  };

  // Sincronização em Nuvem de Vendas Pendentes
  const handleSyncPendingSales = async () => {
    if (!user?.company_id) {
      Alert.alert('Aviso', 'Empresa não identificada.');
      return;
    }
    setSyncingSales(true);
    try {
      const pendings = await getPendingLocalSales();
      if (pendings.length === 0) {
        Alert.alert('Sincronização', 'Todas as vendas já estão sincronizadas com o portal web!');
        setPendingSalesCount(0);
        return;
      }

      const payload = {
        session_id: activeSession?.id ?? null,
        sales: pendings.map((s) => ({
          client_sale_uuid: s.client_sale_uuid,
          sale_number: s.sale_number,
          session_id: s.session_id,
          customer_name: s.customer_name,
          customer_document: s.customer_document,
          customer_id: (s.customer_id && Number(s.customer_id) > 0) ? Number(s.customer_id) : null,
          payment_method: s.payment_method,
          payment_details: s.payment_details,
          subtotal: s.subtotal,
          discount: s.discount,
          total_amount: s.total_amount,
          items_count: s.items_count,
          sold_at: s.sold_at,
          origin: 'pdv_mobile_offline',
          notes: s.notes,
          items: s.items.map((i) => ({
            barcode: i.barcode,
            sku: i.sku,
            title: i.title,
            publisher: i.publisher,
            quantity: i.quantity,
            unit_price: i.unit_price,
            total_price: i.total_price,
            product_id: i.product_id,
          })),
        })),
      };

      const res = await syncPOSSalesBatch(user.company_id, payload);
      const syncedUuids = pendings.map((p) => p.client_sale_uuid);
      await markLocalSalesAsSynced(syncedUuids);

      const pending = await getPendingLocalSalesCount();
      setPendingSalesCount(pending);

      Alert.alert(
        'Sincronização Concluída',
        `✓ ${res.success_count || pendings.length} vendas enviadas com sucesso ao portal web Cronuz!`
      );
    } catch (err: any) {
      Alert.alert('Erro ao Sincronizar', err?.message || 'Falha ao sincronizar vendas. Verifique sua internet.');
    } finally {
      setSyncingSales(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ── Top Bar de Status / Sessão ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={[styles.sessionBadge, activeSession && styles.sessionBadgeActive]}
          onPress={() => setShowSessionModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons
            name="calendar"
            size={14}
            color={activeSession ? Colors.primary : Colors.textMuted}
          />
          <Text
            style={[styles.sessionBadgeText, activeSession && styles.sessionBadgeTextActive]}
            numberOfLines={1}
          >
            {activeSession ? activeSession.title : 'Sessão: Geral (Balcão)'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.topRightActions}>
          {/* Botão Carga Offline */}
          <TouchableOpacity
            style={styles.catalogLoadBtn}
            onPress={() => setShowCatalogModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="cloud-download-outline" size={16} color={Colors.accent} />
            <Text style={styles.catalogLoadText}>
              {localCatalogCount > 0 ? `${localCatalogCount} un` : 'Carregar'}
            </Text>
          </TouchableOpacity>

          {/* Botão Sync Vendas */}
          {pendingSalesCount > 0 && (
            <TouchableOpacity
              style={styles.syncPendingBtn}
              onPress={handleSyncPendingSales}
              disabled={syncingSales}
              activeOpacity={0.7}
            >
              {syncingSales ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={14} color={Colors.white} />
                  <Text style={styles.syncPendingText}>{pendingSalesCount}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Customer Bar com Fixação (📌 Pin) & Informar Nome ── */}
      <View style={styles.customerBar}>
        <TouchableOpacity
          style={[styles.customerSelector, customer && styles.customerSelectorActive]}
          onPress={() => setShowCustomerModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons
            name="person-circle"
            size={22}
            color={customer ? Colors.primary : Colors.textMuted}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.customerName} numberOfLines={1}>
              {customer ? customer.name : 'Consumidor Final (Toque p/ alterar)'}
            </Text>
            {customer?.document ? (
              <Text style={styles.customerDoc}>{customer.document}</Text>
            ) : (
              <Text style={styles.customerDoc}>
                {isCustomerPinned ? '📌 Cliente fixo para as próximas vendas' : 'Venda avulsa de balcão'}
              </Text>
            )}
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        {/* Botão Limpar Cliente (se houver cliente selecionado) */}
        {customer && (
          <TouchableOpacity
            style={styles.clearCustBtn}
            onPress={() => handleSelectCustomer(null, false)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Botão de Fixação (📌 Pin) - Sempre visível */}
        <TouchableOpacity
          style={[styles.pinBtn, isCustomerPinned && styles.pinBtnActive]}
          onPress={handleTogglePinCustomer}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isCustomerPinned ? 'pin' : 'pin-outline'}
            size={18}
            color={isCustomerPinned ? Colors.white : Colors.textMuted}
          />
        </TouchableOpacity>
      </View>

      {/* ── Banner de Status da Sessão & Estoque Offline ── */}
      <View style={styles.sessionStatusCard}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: localCatalogCount > 0 ? Colors.success : Colors.warning },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.sessionStatusTitle} numberOfLines={1}>
              {activeSession ? activeSession.title : 'Sessão Geral (Balcão)'}
            </Text>
            <Text style={styles.sessionStatusSub} numberOfLines={1}>
              {localCatalogCount > 0
                ? `${localCatalogCount.toLocaleString('pt-BR')} produtos salvos • Pronto Offline`
                : 'Nenhum produto salvo no celular. Toque ao lado para sincronizar.'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.syncSessionActionBtn}
          onPress={handleSyncActiveSessionProducts}
          disabled={syncState.isRunning}
          activeOpacity={0.7}
        >
          {syncState.isRunning ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="sync-outline" size={18} color={Colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {/* ── Barra de Progresso de Importação em Segundo Plano ── */}
      {syncState.isRunning && (
        <View style={styles.syncProgressContainer}>
          <View style={styles.syncProgressHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.syncProgressTitle} numberOfLines={1}>
                Importando catálogo em 2º plano...
              </Text>
            </View>
            <View style={styles.percentBadge}>
              <Text style={styles.syncProgressPercent}>
                {syncState.percent}%
              </Text>
            </View>
          </View>

          {/* Barra Linear de Progresso */}
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${Math.max(2, syncState.percent)}%` }]} />
          </View>

          <View style={styles.syncProgressFooter}>
            <Text style={styles.syncProgressDetail}>
              {syncState.total > 0
                ? `${syncState.current.toLocaleString('pt-BR')} de ${syncState.total.toLocaleString('pt-BR')} produtos`
                : `${syncState.current.toLocaleString('pt-BR')} produtos importados...`}
            </Text>
            <Text style={styles.syncProgressHint}>
              Você já pode pesquisar e vender!
            </Text>
          </View>
        </View>
      )}

      {/* ── Aviso de Falha de Conexão com Botão de Retomar ── */}
      {syncState.hasError && (
        <View style={styles.syncErrorContainer}>
          <Ionicons name="alert-circle-outline" size={22} color={Colors.error} />
          <View style={{ flex: 1 }}>
            <Text style={styles.syncErrorTitle}>Oscilação na conexão</Text>
            <Text style={styles.syncErrorMsg} numberOfLines={2}>
              {syncState.current > 0
                ? `${syncState.current.toLocaleString('pt-BR')} produtos foram salvos. Toque para continuar baixando o restante.`
                : 'Não foi possível baixar os produtos. Toque para tentar novamente.'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={handleSyncActiveSessionProducts}
            activeOpacity={0.7}
          >
            <Text style={styles.retryBtnText}>Retomar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Omnibar de Alta Performance (Código de Barras / Nome) ── */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="barcode-outline" size={20} color={Colors.primary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Passe o leitor ou digite ISBN / nome..."
            placeholderTextColor={Colors.textMuted}
            value={omnibarText}
            onChangeText={handleOmnibarChange}
            onSubmitEditing={handleOmnibarSubmit}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {omnibarText.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setOmnibarText('');
                refreshLocalProducts();
              }}
              style={{ padding: 6 }}
            >
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Câmera Leitora */}
        <TouchableOpacity
          style={[styles.scanBtn, showScanner && styles.scanBtnActive]}
          onPress={() => setShowScanner(true)}
          activeOpacity={0.75}
        >
          <Ionicons
            name="camera-outline"
            size={22}
            color={Colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* ── Lista de Produtos do Banco Local (SQLite) ── */}
      <FlatList
        data={products}
        keyExtractor={(item) => item.barcode || item.sku || `${item.product_id}-${item.title}`}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            onAdd={handleAddItem}
            onDirectSale={handleDirectSale}
          />
        )}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 110 }}
        ListHeaderComponent={
          loadingLocal ? (
            <ActivityIndicator color={Colors.primary} style={{ margin: Spacing.md }} />
          ) : null
        }
        ListEmptyComponent={
          !loadingLocal ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>
                {localCatalogCount === 0
                  ? 'Nenhum produto carregado no aparelho'
                  : 'Nenhum produto encontrado com este termo'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {localCatalogCount === 0
                  ? 'Toque em "Carregar" no topo para baixar os itens de um contrato ou catálogo geral para venda offline.'
                  : 'Tente outro ISBN, código de barras ou título.'}
              </Text>
              {localCatalogCount === 0 && (
                <TouchableOpacity
                  style={styles.emptyActionBtn}
                  onPress={() => setShowCatalogModal(true)}
                >
                  <Text style={styles.emptyActionBtnText}>Carregar Produtos Offline</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
      />

      {/* ── Floating Cart Bar ── */}
      {itemCount > 0 && (
        <View style={styles.floatingCartContainer}>
          <TouchableOpacity
            style={styles.floatingCart}
            onPress={() => router.push('/(tabs)/pdv/cart')}
            activeOpacity={0.85}
          >
            <View style={styles.cartInfoRow}>
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{itemCount}</Text>
              </View>
              <Text style={styles.floatingCartText}>
                Carrinho • {formatCurrency(total)}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.quickPayBtn}
              onPress={() => setShowCheckoutModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="flash" size={16} color={Colors.white} />
              <Text style={styles.quickPayText}>Fechar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      )}

      {/* Modais Integrados */}
      <BarcodeScannerModal
        visible={showScanner}
        onScanned={handleBarcodeScanned}
        onClose={() => setShowScanner(false)}
      />

      <POSSessionPickerModal
        visible={showSessionModal}
        companyId={user?.company_id}
        activeSession={activeSession}
        onSelectSession={handleSelectSession}
        onClose={() => setShowSessionModal(false)}
      />

      <POSCatalogSyncModal
        visible={showCatalogModal}
        companyId={user?.company_id}
        activeSession={activeSession}
        onCatalogUpdated={refreshLocalProducts}
        onClose={() => setShowCatalogModal(false)}
      />

      <POSCheckoutModal
        visible={showCheckoutModal}
        companyId={user?.company_id}
        customer={customer}
        items={items}
        total={total}
        activeSession={activeSession}
        onClose={() => {
          setShowCheckoutModal(false);
          refreshLocalProducts();
        }}
        onSuccess={() => {
          clearCart();
          if (!isCustomerPinned) setCustomer(null);
          refreshLocalProducts();
        }}
      />

      <CustomerModal
        visible={showCustomerModal}
        currentCustomer={customer}
        isPinned={isCustomerPinned}
        onClose={() => setShowCustomerModal(false)}
        onSelect={handleSelectCustomer}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing.xs,
    gap: 8,
  },
  sessionBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sessionBadgeActive: {
    borderColor: `${Colors.primary}80`,
    backgroundColor: `${Colors.primary}12`,
  },
  sessionBadgeText: {
    flex: 1,
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  sessionBadgeTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.bold,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  catalogLoadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: `${Colors.accent}50`,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  catalogLoadText: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.accent,
  },
  syncPendingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.warning,
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  syncPendingText: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
  },
  customerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.base,
    marginTop: 6,
    marginBottom: Spacing.sm,
    gap: 6,
  },
  customerSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  customerSelectorActive: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}10`,
  },
  customerName: {
    color: Colors.textPrimary,
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.bold,
  },
  customerDoc: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  chevron: {
    color: Colors.textMuted,
    fontSize: 18,
  },
  pinBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
    height: 48,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.medium,
  },
  scanBtn: {
    width: 48,
    height: 48,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}15`,
  },
  clearCustBtn: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgCard,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sessionStatusTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
  },
  sessionStatusSub: {
    color: Colors.textMuted,
    fontSize: 10,
    marginTop: 1,
  },
  syncSessionActionBtn: {
    padding: 6,
    borderRadius: Radius.sm,
    backgroundColor: `${Colors.primary}15`,
    marginLeft: 8,
  },
  syncProgressContainer: {
    backgroundColor: `${Colors.primary}12`,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: `${Colors.primary}40`,
  },
  syncProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  syncProgressTitle: {
    color: Colors.primary,
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
  },
  percentBadge: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  syncProgressPercent: {
    color: Colors.white,
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: `${Colors.primary}25`,
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: 4,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  syncProgressFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  syncProgressDetail: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
  },
  syncProgressHint: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  syncErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: `${Colors.error}12`,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: `${Colors.error}40`,
  },
  syncErrorTitle: {
    color: Colors.error,
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
  },
  syncErrorMsg: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  retryBtn: {
    backgroundColor: Colors.error,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.md,
  },
  retryBtnText: {
    color: Colors.white,
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.size.base,
    fontFamily: Typography.fontFamily.bold,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: Colors.textMuted,
    fontSize: Typography.size.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyActionBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderRadius: Radius.lg,
  },
  emptyActionBtnText: {
    color: Colors.white,
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.bold,
  },
  floatingCartContainer: {
    position: 'absolute',
    bottom: 16,
    left: Spacing.base,
    right: Spacing.base,
  },
  floatingCart: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  cartInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cartBadge: {
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  cartBadgeText: {
    color: Colors.primary,
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
  },
  floatingCartText: {
    color: Colors.white,
    fontSize: Typography.size.base,
    fontFamily: Typography.fontFamily.bold,
  },
  quickPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success,
    borderRadius: Radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickPayText: {
    color: Colors.white,
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
  },
});

const card = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  imagePlaceholder: {
    width: 68,
    backgroundColor: Colors.bgCardHover,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderText: {
    fontSize: 26,
  },
  info: {
    flex: 1,
    padding: Spacing.sm,
    gap: 4,
  },
  name: {
    color: Colors.textPrimary,
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.medium,
    lineHeight: 18,
  },
  barcode: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: Typography.fontFamily.regular,
  },
  brand: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontFamily: Typography.fontFamily.medium,
    textTransform: 'uppercase',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 2,
  },
  price: {
    color: Colors.success,
    fontSize: Typography.size.base,
    fontFamily: Typography.fontFamily.bold,
  },
  sourceBadge: {
    backgroundColor: `${Colors.primary}20`,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  sourceBadgeText: {
    color: Colors.primaryLight,
    fontSize: 9,
    fontFamily: Typography.fontFamily.bold,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 7,
  },
  addBtnText: {
    color: Colors.white,
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
  },
  directBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: `${Colors.success}18`,
    borderWidth: 1,
    borderColor: `${Colors.success}50`,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  directBtnText: {
    color: Colors.success,
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
  },
});

const modal = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingTop: Spacing['3xl'],
  },
  title: {
    color: Colors.textPrimary,
    fontSize: Typography.size.xl,
    fontFamily: Typography.fontFamily.bold,
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  closeText: {
    color: Colors.primary,
    fontSize: Typography.size.base,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
    height: 44,
  },
  searchIcon: { fontSize: 16 },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.size.sm,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: `${Colors.primary}25`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.primary,
    fontSize: Typography.size.base,
    fontFamily: Typography.fontFamily.bold,
  },
  customerName: {
    color: Colors.textPrimary,
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.medium,
  },
  customerDoc: {
    color: Colors.textMuted,
    fontSize: Typography.size.xs,
  },
  chevron: {
    color: Colors.textMuted,
    fontSize: 20,
  },
  empty: {
    color: Colors.textMuted,
    textAlign: 'center',
    padding: Spacing.md,
    fontSize: Typography.size.sm,
  },
  emptySub: {
    color: Colors.textMuted,
    textAlign: 'center',
    fontSize: Typography.size.xs,
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    padding: 4,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  tabItemActive: {
    backgroundColor: `${Colors.primary}20`,
    borderWidth: 1,
    borderColor: `${Colors.primary}60`,
  },
  tabItemText: {
    color: Colors.textMuted,
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.medium,
  },
  tabItemTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.bold,
  },
  tabBody: {
    flex: 1,
    paddingHorizontal: Spacing.base,
  },
  consumerCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.md,
  },
  consumerIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${Colors.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  consumerTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.size.lg,
    fontFamily: Typography.fontFamily.bold,
    marginBottom: 6,
  },
  consumerDesc: {
    color: Colors.textSecondary,
    fontSize: Typography.size.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.size.base,
    fontFamily: Typography.fontFamily.bold,
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: Colors.textSecondary,
    fontSize: Typography.size.xs,
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    height: 48,
    gap: 10,
  },
  textInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.medium,
  },
  pinToggleSub: {
    color: Colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  primaryActionBtnText: {
    color: Colors.white,
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.bold,
  },
  pinToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pinToggleRowActive: {
    borderColor: `${Colors.primary}80`,
    backgroundColor: `${Colors.primary}12`,
  },
  pinToggleText: {
    color: Colors.textSecondary,
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.medium,
  },
  pinToggleTextActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.bold,
  },
  customNameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: `${Colors.success}15`,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: `${Colors.success}60`,
  },
  customNameIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customNameTitle: {
    color: Colors.textSecondary,
    fontSize: Typography.size.xs,
  },
  customNameValue: {
    color: Colors.success,
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.bold,
  },
  finalConsumerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  finalConsumerText: {
    color: Colors.textPrimary,
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.medium,
  },
  finalConsumerSub: {
    color: Colors.textMuted,
    fontSize: Typography.size.xs,
  },
});


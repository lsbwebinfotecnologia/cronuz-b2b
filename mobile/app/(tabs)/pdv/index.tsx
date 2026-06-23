import React, { useState, useCallback, useRef } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePDVStore, PDVCustomer, PDVProduct } from '../../../store/pdv.store';
import { searchCustomers, searchProducts } from '../../../services/pdv.service';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';
import { formatCurrency } from '../../../utils/formatters';
import { BarcodeScannerModal } from '../../../components/BarcodeScannerModal';

// ─── Customer Modal ───────────────────────────────────────────────────────────

function CustomerModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (c: PDVCustomer) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PDVCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (text.length < 2) { setResults([]); return; }
      setLoading(true);
      try {
        const data = await searchCustomers(text);
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  }, []);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={modal.container}>
        <View style={modal.header}>
          <Text style={modal.title}>Selecionar Cliente</Text>
          <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
            <Text style={modal.closeText}>Fechar</Text>
          </TouchableOpacity>
        </View>
        <View style={modal.searchRow}>
          <View style={modal.searchBox}>
            <Text style={modal.searchIcon}>🔍</Text>
            <TextInput
              style={modal.searchInput}
              placeholder="Buscar por nome, CPF ou CNPJ..."
              placeholderTextColor={Colors.textMuted}
              value={query}
              onChangeText={handleSearch}
              autoFocus
            />
          </View>
        </View>
        {loading && <ActivityIndicator color={Colors.primary} style={{ margin: Spacing.base }} />}
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={modal.customerRow}
              onPress={() => { onSelect(item); onClose(); }}
            >
              <View style={modal.avatar}>
                <Text style={modal.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={modal.customerName}>{item.name}</Text>
                {item.document && (
                  <Text style={modal.customerDoc}>{item.document}</Text>
                )}
              </View>
              <Text style={modal.chevron}>›</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            query.length >= 2 && !loading ? (
              <Text style={modal.empty}>Nenhum cliente encontrado</Text>
            ) : null
          }
        />
      </View>
    </Modal>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onAdd,
}: {
  product: PDVProduct;
  onAdd: (p: PDVProduct) => void;
}) {
  const hasDiscount = product.promotional_price != null && product.promotional_price < (product.base_price ?? product.price);
  const displayPrice = product.promotional_price ?? product.price;
  const basePrice = product.base_price ?? product.price;

  // Calcula percentual de desconto para exibir no badge
  const discountPct = product.discount_percent ??
    (hasDiscount && basePrice > 0 ? Math.round((1 - displayPrice / basePrice) * 100) : 0);

  const outOfStock = (product.stock ?? 0) <= 0;

  return (
    <View style={card.container}>
      {product.image_url ? (
        <Image source={{ uri: product.image_url }} style={card.image} />
      ) : (
        <View style={card.imagePlaceholder}>
          <Text style={card.imagePlaceholderText}>📦</Text>
        </View>
      )}
      <View style={card.info}>
        {/* Nome e editora/marca */}
        <Text style={card.name} numberOfLines={2}>{product.name}</Text>
        {product.brand && <Text style={card.brand}>{product.brand}</Text>}

        {/* Preços */}
        <View style={card.priceRow}>
          {hasDiscount && (
            <Text style={card.basePrice}>{formatCurrency(basePrice)}</Text>
          )}
          <Text style={card.price}>{formatCurrency(displayPrice)}</Text>
          {discountPct > 0 && (
            <View style={card.discountBadge}>
              <Text style={card.discountBadgeText}>-{discountPct}%</Text>
            </View>
          )}
        </View>

        {/* Estoque e consignado */}
        <View style={card.stockRow}>
          {product.stock !== undefined && (
            <Text style={[card.stock, outOfStock && card.stockOut]}>
              {outOfStock ? '⚠ Sem estoque' : `Est. livre: ${product.stock}`}
            </Text>
          )}
          {(product.consigned_balance ?? 0) > 0 && (
            <Text style={card.consigned}>
              Consig: {product.consigned_balance}
            </Text>
          )}
        </View>

        {/* Botão */}
        <TouchableOpacity
          style={[card.addBtn, outOfStock && card.addBtnDisabled]}
          onPress={() => onAdd(product)}
          disabled={outOfStock}
        >
          <Text style={card.addBtnText}>+ Adicionar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}


// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function PDVScreen() {
  const router = useRouter();
  const { customer, setCustomer, addItem, items, total, itemCount } = usePDVStore();

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<PDVProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProducts = useCallback(async (q: string, pg = 1) => {
    setLoadingProducts(true);
    try {
      const res = await searchProducts({
        q,
        customer_id: customer?.id,
        page: pg,
        limit: 20,
      });
      const newItems = res.items ?? [];
      setProducts(pg === 1 ? newItems : (prev) => [...prev, ...newItems]);
      setHasMore(newItems.length === 20);
    } catch (e: any) {
      Alert.alert('Erro', e?.response?.data?.detail ?? 'Erro ao buscar produtos');
    } finally {
      setLoadingProducts(false);
    }
  }, [customer?.id]);

  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchProducts(text, 1), 800);
  }, [fetchProducts]);

  /** Chamado quando o scanner lê um código — busca imediata sem debounce */
  const handleBarcodeScanned = useCallback((barcode: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchQuery(barcode);
    setPage(1);
    fetchProducts(barcode, 1);
  }, [fetchProducts]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingProducts) return;
    const next = page + 1;
    setPage(next);
    fetchProducts(searchQuery, next);
  }, [hasMore, loadingProducts, page, searchQuery, fetchProducts]);

  const handleAddItem = useCallback((product: PDVProduct) => {
    addItem(product);
  }, [addItem]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>PDV</Text>
        {itemCount > 0 && (
          <TouchableOpacity
            style={styles.cartBtn}
            onPress={() => router.push('/(tabs)/pdv/cart')}
          >
            <Text style={styles.cartBtnText}>🛒 {itemCount} · {formatCurrency(total)}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Customer Selector */}
      <TouchableOpacity
        style={[styles.customerSelector, customer && styles.customerSelectorActive]}
        onPress={() => setShowCustomerModal(true)}
      >
        <Text style={styles.customerSelectorIcon}>👤</Text>
        <View style={{ flex: 1 }}>
          {customer ? (
            <>
              <Text style={styles.customerName}>{customer.name}</Text>
              {customer.document && (
                <Text style={styles.customerDoc}>{customer.document}</Text>
              )}
            </>
          ) : (
            <Text style={styles.customerPlaceholder}>Selecionar cliente...</Text>
          )}
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      {/* Product Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={{ marginLeft: 10 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar produto por nome, SKU ou código..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => { setSearchQuery(''); setProducts([]); }}
              style={{ padding: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Botão de código de barras */}
        <TouchableOpacity
          style={[
            styles.scanBtn,
            showScanner && styles.scanBtnActive,
          ]}
          onPress={() => setShowScanner(true)}
          activeOpacity={0.75}
        >
          <Ionicons
            name="barcode-outline"
            size={24}
            color={showScanner ? Colors.primary : Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Modal do scanner */}
      <BarcodeScannerModal
        visible={showScanner}
        onScanned={handleBarcodeScanned}
        onClose={() => setShowScanner(false)}
      />

      {/* Products List */}
      <FlatList
        data={products}
        keyExtractor={(item, i) => `${item.id ?? item.sku ?? i}`}
        renderItem={({ item }) => (
          <ProductCard product={item} onAdd={handleAddItem} />
        )}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 100 }}
        ListHeaderComponent={
          loadingProducts && page === 1 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.primary} size="large" />
              <Text style={styles.loadingText}>Buscando no catálogo Horus...</Text>
              <Text style={styles.loadingHint}>A API pode levar alguns segundos</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loadingProducts && page > 1 ? (
            <ActivityIndicator color={Colors.primary} style={{ margin: Spacing.base }} />
          ) : null
        }
        ListEmptyComponent={
          !loadingProducts ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🛍️</Text>
              <Text style={styles.emptyTitle}>
                {searchQuery ? 'Nenhum produto encontrado' : 'Busque um produto acima'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? 'Tente outros termos de busca'
                  : 'Digite o nome, SKU ou código de barras'}
              </Text>
            </View>
          ) : null
        }
      />

      {/* Floating Cart Button */}
      {itemCount > 0 && (
        <TouchableOpacity
          style={styles.floatingCart}
          onPress={() => router.push('/(tabs)/pdv/cart')}
        >
          <Text style={styles.floatingCartText}>
            Ver carrinho ({itemCount}) — {formatCurrency(total)}
          </Text>
          <Text style={styles.floatingCartArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* Customer Modal */}
      <CustomerModal
        visible={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        onSelect={setCustomer}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing.base,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
  },
  cartBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
  },
  cartBtnText: {
    color: Colors.white,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
  },
  customerSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  customerSelectorActive: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}10`,
  },
  customerSelectorIcon: { fontSize: 20 },
  customerName: {
    color: Colors.textPrimary,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
  },
  customerDoc: {
    color: Colors.textSecondary,
    fontSize: Typography.size.xs,
  },
  customerPlaceholder: {
    color: Colors.textMuted,
    fontSize: Typography.size.base,
  },
  chevron: {
    color: Colors.textMuted,
    fontSize: 22,
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
  searchIcon: { fontSize: 16 },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.size.base,
    paddingVertical: Spacing.md,
  },
  clearSearch: {
    color: Colors.textMuted,
    fontSize: 16,
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['4xl'],
    gap: Spacing.sm,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
  },
  emptySubtitle: {
    color: Colors.textMuted,
    fontSize: Typography.size.sm,
    textAlign: 'center',
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    gap: Spacing.sm,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    marginTop: Spacing.sm,
  },
  loadingHint: {
    color: Colors.textMuted,
    fontSize: Typography.size.xs,
  },

  floatingCart: {
    position: 'absolute',
    bottom: 20,
    left: Spacing.base,
    right: Spacing.base,
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  floatingCartText: {
    color: Colors.white,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
  },
  floatingCartArrow: {
    color: Colors.white,
    fontSize: 22,
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
    fontWeight: Typography.weight.bold,
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
  },
  searchIcon: { fontSize: 16 },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.size.base,
    paddingVertical: Spacing.md,
  },
  scanBtn: {
    width: 48, height: 48,
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
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Colors.primary}25`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.primary,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
  },
  customerName: {
    color: Colors.textPrimary,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
  },
  customerDoc: {
    color: Colors.textMuted,
    fontSize: Typography.size.xs,
  },
  chevron: {
    color: Colors.textMuted,
    fontSize: 22,
  },
  empty: {
    color: Colors.textMuted,
    textAlign: 'center',
    padding: Spacing.xl,
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
  image: { width: 80, height: 'auto' as any },
  imagePlaceholder: {
    width: 72,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.sm,
  },
  imagePlaceholderText: { fontSize: 28 },
  info: {
    flex: 1,
    padding: Spacing.sm,
    gap: 4,
  },
  name: {
    color: Colors.textPrimary,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
    lineHeight: 18,
  },
  brand: {
    color: Colors.textMuted,
    fontSize: Typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  basePrice: {
    color: Colors.textMuted,
    fontSize: Typography.size.xs,
    textDecorationLine: 'line-through',
  },
  price: {
    color: Colors.primary,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
  },
  discountBadge: {
    backgroundColor: `${Colors.success}20`,
    borderRadius: Radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  discountBadgeText: {
    color: Colors.success,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
  },
  stockRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  stock: {
    color: Colors.success,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
  },
  stockOut: { color: Colors.error },
  consigned: {
    color: Colors.primary,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
  },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  addBtnDisabled: { backgroundColor: Colors.border },
  addBtnText: {
    color: Colors.white,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
  },
});


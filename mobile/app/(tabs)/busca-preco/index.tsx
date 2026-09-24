/**
 * mobile/app/(tabs)/busca-preco/index.tsx
 * Módulo de Busca Preço e Consulta de Estoques no App Mobile Cronuz B2B.
 *
 * Funcionalidades:
 * - Busca de produto por ISBN / Código de Barras, Nome ou Código Horus.
 * - Leitor de código de barras nativo via câmera com lock-in de 3 leituras consecutivas (BarcodeScannerModal).
 * - Carrossel horizontal de seleção rápida quando há múltiplos produtos.
 * - Card completo do produto (capa, título, editora, gênero, código Horus, ISBN, situação, valor de capa).
 * - Consulta imediata de estoque por Loja/Filial (ERP Horus) de forma não-bloqueante.
 * - Tratamento de falhas e status offline/instável do Horus com botão de retry.
 * - Estoque em tempo real em Distribuidores Parceiros (Catavento, Disal, etc.) com toggle de busca automática
 *   persistido no AsyncStorage e botão de consulta sob demanda / atualizar.
 * - Botão direto de integração para adicionar item ao carrinho PDV.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Switch,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

import { Colors, Typography, Spacing, Radius, Shadow } from '../../../constants/theme';
import { formatCurrency } from '../../../utils/formatters';
import { BarcodeScannerModal } from '../../../components/BarcodeScannerModal';
import { usePDVStore } from '../../../store/pdv.store';
import {
  searchProduct,
  getProductStock,
  getDistributorStock,
  HorusProduct,
  BranchStock,
  DistributorResult,
  SearchOptionType,
} from '../../../services/product-search.service';

const AUTO_DIST_STORAGE_KEY = '@cronuz_auto_dist_search';

interface SearchOptionItem {
  value: SearchOptionType;
  label: string;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const SEARCH_OPTIONS: SearchOptionItem[] = [
  { value: 'BARRAS_ISBN', label: 'ISBN / Barras', placeholder: 'Ex: 9788543112596', icon: 'barcode-outline' },
  { value: 'NOME',        label: 'Nome',          placeholder: 'Ex: O Alquimista',   icon: 'book-outline' },
  { value: 'COD_ITEM',    label: 'Cód. Horus',    placeholder: 'Ex: 12345',           icon: 'pricetag-outline' },
];

function situacaoBadge(sit?: string) {
  switch (sit) {
    case 'N': return { label: 'Item Normal',      bg: '#D1FAE5', text: '#065F46' };
    case 'F': return { label: 'Em Falta',          bg: '#FEF3C7', text: '#92400E' };
    case 'E': return { label: 'Em falta (Editora)',bg: '#FEF3C7', text: '#92400E' };
    case 'A': return { label: 'Aguard. Lançamento',bg: '#DBEAFE', text: '#1E40AF' };
    case 'D': return { label: 'Descontinuado',     bg: '#FEE2E2', text: '#991B1B' };
    case 'C': return { label: 'Cancelado',         bg: '#F1F5F9', text: '#475569' };
    default:  return { label: sit || '—',          bg: '#F1F5F9', text: '#64748B' };
  }
}

export default function BuscaPrecoScreen() {
  const router = useRouter();
  const addItemToPDV = usePDVStore((s) => s.addItem);

  // Estados de busca
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOption, setSelectedOption] = useState<SearchOptionType>('BARRAS_ISBN');
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Produtos
  const [products, setProducts] = useState<HorusProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<HorusProduct | null>(null);

  // Estoque Horus
  const [stockBranches, setStockBranches] = useState<BranchStock[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockStatus, setStockStatus] = useState<'ok' | 'partial_error' | 'offline' | null>(null);
  const [stockErrorMessage, setStockErrorMessage] = useState<string | null>(null);

  // Distribuidores Parceiros
  const [distData, setDistData] = useState<DistributorResult[]>([]);
  const [distLoading, setDistLoading] = useState(false);
  const [distLoaded, setDistLoaded] = useState(false);
  const [autoFetchDistributors, setAutoFetchDistributors] = useState(false);

  // Câmera scanner
  const [scannerVisible, setScannerVisible] = useState(false);

  // Feedback do PDV
  const [addedToCartToast, setAddedToCartToast] = useState(false);

  // Carregar preferência salva de busca automática em fornecedores
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(AUTO_DIST_STORAGE_KEY);
        if (saved !== null) {
          setAutoFetchDistributors(saved === 'true');
        }
      } catch (e) {
        console.warn('Erro ao carregar preferência de distribuidores:', e);
      }
    })();
  }, []);

  const handleToggleAutoDist = async (value: boolean) => {
    setAutoFetchDistributors(value);
    try {
      await AsyncStorage.setItem(AUTO_DIST_STORAGE_KEY, String(value));
    } catch {}
    if (value && selectedProduct && !distLoaded && !distLoading) {
      const isbn = selectedProduct.COD_BARRA_ITEM || selectedProduct.COD_ISBN_ITEM;
      if (isbn) fetchDistributors(isbn);
    }
  };

  // Consulta fornecedores sob demanda
  const fetchDistributors = useCallback(async (isbnOverride?: string) => {
    const isbn = isbnOverride || selectedProduct?.COD_BARRA_ITEM || selectedProduct?.COD_ISBN_ITEM;
    if (!isbn) {
      Alert.alert('Aviso', 'Este produto não possui código de barras ou ISBN cadastrado para consulta em distribuidores.');
      return;
    }
    setDistLoading(true);
    try {
      const res = await getDistributorStock(isbn);
      setDistData(res.distributors || []);
      setDistLoaded(true);
    } catch (err: any) {
      Alert.alert('Erro', 'Não foi possível consultar os fornecedores parceiros.');
    } finally {
      setDistLoading(false);
    }
  }, [selectedProduct]);

  // Seleciona produto e busca estoque
  const handleSelectProduct = useCallback(async (prod: HorusProduct) => {
    setSelectedProduct(prod);
    setStockBranches([]);
    setStockStatus(null);
    setStockErrorMessage(null);
    setDistData([]);
    setDistLoaded(false);

    const codItem = prod.COD_ITEM;
    const isbn = prod.COD_BARRA_ITEM || prod.COD_ISBN_ITEM;

    // 1. Busca estoque Horus de forma assíncrona imediata
    setStockLoading(true);
    getProductStock(codItem)
      .then((res) => {
        setStockBranches(res.branches || []);
        setStockStatus(res.status || 'ok');
        setStockErrorMessage(res.error_message || null);
      })
      .catch((err) => {
        setStockStatus('offline');
        setStockErrorMessage('Não foi possível comunicar com o servidor do ERP Horus.');
      })
      .finally(() => {
        setStockLoading(false);
      });

    // 2. Se autoFetchDistributors estiver ligado, busca nos parceiros
    if (autoFetchDistributors && isbn) {
      setDistLoading(true);
      getDistributorStock(isbn)
        .then((res) => {
          setDistData(res.distributors || []);
          setDistLoaded(true);
        })
        .catch(() => {})
        .finally(() => {
          setDistLoading(false);
        });
    }
  }, [autoFetchDistributors]);

  // Executa busca
  const handleSearch = useCallback(async (
    overrideTerm?: string,
    overrideOption?: SearchOptionType,
    overrideSource: 'app' | 'physical_scanner' = 'app'
  ) => {
    const term = (overrideTerm !== undefined ? overrideTerm : searchTerm).trim();
    const opt = overrideOption || selectedOption;

    if (!term) {
      Alert.alert('Atenção', 'Informe um termo para pesquisar.');
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setSelectedProduct(null);
    setProducts([]);
    setStockBranches([]);
    setStockStatus(null);
    setStockErrorMessage(null);
    setDistData([]);
    setDistLoaded(false);

    try {
      const items = await searchProduct(term, opt, overrideSource, 0, 10);
      if (items.length === 0) {
        Alert.alert('Busca Preço', 'Nenhum produto encontrado para este termo.');
      } else {
        setProducts(items);
        await handleSelectProduct(items[0]);
      }
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.detail || err.message || 'Falha ao buscar produtos.');
    } finally {
      setIsSearching(false);
    }
  }, [searchTerm, selectedOption, handleSelectProduct]);

  // Callback ao bipar câmera
  const handleBarcodeScanned = (barcode: string) => {
    setScannerVisible(false);
    const clean = barcode.trim();
    if (!clean) return;
    setSearchTerm(clean);
    setSelectedOption('BARRAS_ISBN');
    handleSearch(clean, 'BARRAS_ISBN');
  };

  // Adicionar ao carrinho PDV
  const handleAddToCart = () => {
    if (!selectedProduct) return;
    const priceNum = selectedProduct.VLR_CAPA
      ? parseFloat(String(selectedProduct.VLR_CAPA).replace(',', '.'))
      : 0;

    addItemToPDV(
      {
        id: selectedProduct.COD_ITEM,
        name: selectedProduct.NOM_ITEM,
        sku: String(selectedProduct.COD_ITEM),
        barcode: selectedProduct.COD_BARRA_ITEM || selectedProduct.COD_ISBN_ITEM || '',
        base_price: priceNum,
        price: priceNum,
        brand: selectedProduct.NOM_EDITORA,
        image_url: selectedProduct.COVER_URL || undefined,
      },
      1
    );

    setAddedToCartToast(true);
    setTimeout(() => setAddedToCartToast(false), 2500);
  };

  const activePlaceholder = SEARCH_OPTIONS.find((o) => o.value === selectedOption)?.placeholder;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerIconContainer}>
            <Ionicons name="search" size={20} color="#00b4b4" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Busca Preço</Text>
            <Text style={styles.headerSubtitle}>Consulta em tempo real de produtos e estoques</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── BARRA DE SELEÇÃO DE TIPO DE BUSCA ─────────────────────────── */}
        <View style={styles.optionsRow}>
          {SEARCH_OPTIONS.map((opt) => {
            const isActive = selectedOption === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.optionTab, isActive && styles.optionTabActive]}
                onPress={() => setSelectedOption(opt.value)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={opt.icon}
                  size={14}
                  color={isActive ? '#FFFFFF' : Colors.textMuted}
                />
                <Text style={[styles.optionTabText, isActive && styles.optionTabTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── INPUT E BOTÕES DE AÇÃO ───────────────────────────────────── */}
        <View style={styles.searchBarRow}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder={activePlaceholder}
              placeholderTextColor={Colors.textMuted}
              returnKeyType="search"
              onSubmitEditing={() => handleSearch()}
              keyboardType={selectedOption === 'COD_ITEM' ? 'number-pad' : 'default'}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchTerm.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchTerm('')}
                style={styles.clearBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setScannerVisible(true)}
              style={styles.cameraBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="camera-outline" size={22} color="#00b4b4" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.searchBtn, isSearching && { opacity: 0.7 }]}
            onPress={() => handleSearch()}
            disabled={isSearching}
            activeOpacity={0.8}
          >
            {isSearching ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="search" size={20} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>

        {/* ── MÚLTIPLOS RESULTADOS: CARROSSEL HORIZONTAL ──────────────── */}
        {products.length > 1 && (
          <View style={styles.carouselContainer}>
            <View style={styles.carouselHeader}>
              <Text style={styles.carouselTitle}>
                {products.length} produtos encontrados:
              </Text>
              <Text style={styles.carouselSubtitle}>Toque para alternar</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carouselScroll}>
              {products.map((p) => {
                const isSelected = selectedProduct?.COD_ITEM === p.COD_ITEM;
                return (
                  <TouchableOpacity
                    key={p.COD_ITEM}
                    style={[styles.carouselCard, isSelected && styles.carouselCardActive]}
                    onPress={() => handleSelectProduct(p)}
                    activeOpacity={0.8}
                  >
                    {p.COVER_URL ? (
                      <Image source={{ uri: p.COVER_URL }} style={styles.carouselImg} resizeMode="contain" />
                    ) : (
                      <View style={styles.carouselImgPlaceholder}>
                        <Ionicons name="book-outline" size={16} color={Colors.textMuted} />
                      </View>
                    )}
                    <View style={styles.carouselCardInfo}>
                      <Text style={styles.carouselCardTitle} numberOfLines={2}>
                        {p.NOM_ITEM}
                      </Text>
                      <Text style={styles.carouselCardMeta}>
                        {p.COD_BARRA_ITEM ? `ISBN: ${p.COD_BARRA_ITEM}` : `Cód: ${p.COD_ITEM}`}
                      </Text>
                      {isSelected && (
                        <Text style={styles.carouselActiveBadge}>● Visualizando</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── DETALHES DO PRODUTO SELECIONADO ─────────────────────────── */}
        {selectedProduct && (
          <View style={styles.productCard}>
            {/* Imagem de Capa */}
            <View style={styles.coverSection}>
              {selectedProduct.COVER_URL ? (
                <Image
                  source={{ uri: selectedProduct.COVER_URL }}
                  style={styles.coverImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.coverPlaceholder}>
                  <Ionicons name="book-outline" size={48} color={Colors.textMuted} />
                  <Text style={styles.coverPlaceholderText}>Sem Imagem</Text>
                </View>
              )}
            </View>

            {/* Informações Principais */}
            <View style={styles.productInfo}>
              {/* Badges de Situação e Tipo */}
              <View style={styles.badgeRow}>
                {selectedProduct.SITUACAO_ITEM && (
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: situacaoBadge(selectedProduct.SITUACAO_ITEM).bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: situacaoBadge(selectedProduct.SITUACAO_ITEM).text },
                      ]}
                    >
                      {situacaoBadge(selectedProduct.SITUACAO_ITEM).label}
                    </Text>
                  </View>
                )}
                {selectedProduct.TIPO && (
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>{selectedProduct.TIPO}</Text>
                  </View>
                )}
                <Text style={styles.horusCodeText}>#{selectedProduct.COD_ITEM}</Text>
              </View>

              {/* Título do Livro / Produto */}
              <Text style={styles.productTitle}>{selectedProduct.NOM_ITEM}</Text>

              {/* Preço de Capa */}
              <View style={styles.priceRow}>
                <View>
                  <Text style={styles.priceLabel}>Preço de Capa</Text>
                  <Text style={styles.priceValue}>
                    {selectedProduct.VLR_CAPA
                      ? formatCurrency(parseFloat(String(selectedProduct.VLR_CAPA).replace(',', '.')))
                      : 'Preço não informado'}
                  </Text>
                </View>

                {/* Botão Adicionar ao PDV */}
                <TouchableOpacity
                  style={styles.addToPdvBtn}
                  onPress={handleAddToCart}
                  activeOpacity={0.8}
                >
                  <Ionicons name="cart-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.addToPdvText}>+ Carrinho</Text>
                </TouchableOpacity>
              </View>

              {addedToCartToast && (
                <View style={styles.toastCart}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                  <Text style={styles.toastCartText}>Item adicionado ao PDV!</Text>
                  <TouchableOpacity onPress={() => router.push('/(tabs)/pdv')}>
                    <Text style={styles.toastCartLink}>Ver PDV →</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Saldo Geral Horus */}
              {selectedProduct.SALDO_DISPONIVEL !== undefined && (
                <View style={styles.saldoGeralRow}>
                  <Ionicons name="cube-outline" size={16} color="#00b4b4" />
                  <Text style={styles.saldoGeralLabel}>Saldo Geral Horus:</Text>
                  <Text style={styles.saldoGeralValue}>
                    {selectedProduct.SALDO_DISPONIVEL} un.
                  </Text>
                </View>
              )}

              {/* Metadados adicionais */}
              <View style={styles.metaDivider} />
              <View style={styles.metaList}>
                {selectedProduct.COD_BARRA_ITEM && (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>ISBN / Barras:</Text>
                    <Text style={styles.metaValueMono}>{selectedProduct.COD_BARRA_ITEM}</Text>
                  </View>
                )}
                {selectedProduct.NOM_EDITORA && (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Editora:</Text>
                    <Text style={styles.metaValue}>{selectedProduct.NOM_EDITORA}</Text>
                  </View>
                )}
                {selectedProduct.SELO && (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Selo:</Text>
                    <Text style={styles.metaValue}>{selectedProduct.SELO}</Text>
                  </View>
                )}
                {(selectedProduct.GENERO_NIVEL_1 || selectedProduct.GENERO_NIVEL_2) && (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Gênero:</Text>
                    <Text style={styles.metaValue}>
                      {[selectedProduct.GENERO_NIVEL_1, selectedProduct.GENERO_NIVEL_2]
                        .filter(Boolean)
                        .join(' › ')}
                    </Text>
                  </View>
                )}
              </View>

              {/* Sinopse retrátil / prévia */}
              {selectedProduct.DESC_SINOPSE && (
                <View style={styles.synopsisContainer}>
                  <Text style={styles.synopsisLabel}>Sinopse</Text>
                  <Text style={styles.synopsisText} numberOfLines={4}>
                    {selectedProduct.DESC_SINOPSE}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── SEÇÃO 1: ESTOQUE POR LOJA / FILIAL (HORUS) ──────────────── */}
        {selectedProduct && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionIconBadge}>
                  <Ionicons name="business-outline" size={16} color="#00b4b4" />
                </View>
                <View>
                  <Text style={styles.sectionTitle}>Estoque por Loja / Filial</Text>
                  <Text style={styles.sectionSubtitle}>Locais de estoque configurados no Horus</Text>
                </View>
              </View>
              {!stockLoading && (
                <TouchableOpacity
                  onPress={() => handleSelectProduct(selectedProduct)}
                  style={styles.refreshIconBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="refresh-outline" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Aviso de Servidor Offline */}
            {stockStatus === 'offline' && !stockLoading && (
              <View style={styles.warningBox}>
                <Ionicons name="alert-circle-outline" size={20} color="#F59E0B" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.warningTitle}>ERP Horus Indisponível</Text>
                  <Text style={styles.warningText}>
                    {stockErrorMessage || 'Não foi possível comunicar com o servidor do ERP Horus.'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => handleSelectProduct(selectedProduct)}
                >
                  <Text style={styles.retryBtnText}>Tentar</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Aviso de Erro Parcial */}
            {stockStatus === 'partial_error' && !stockLoading && (
              <View style={styles.warningBoxSmall}>
                <Ionicons name="warning-outline" size={16} color="#F59E0B" />
                <Text style={styles.warningSmallText}>
                  {stockErrorMessage || 'Algumas filiais apresentaram instabilidade de resposta.'}
                </Text>
              </View>
            )}

            {/* Loading do Horus */}
            {stockLoading && (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="#00b4b4" />
                <Text style={styles.loadingBoxText}>Consultando filiais no Horus...</Text>
              </View>
            )}

            {/* Lista de Filiais */}
            {!stockLoading && stockBranches.length > 0 && (
              <View style={styles.branchList}>
                {stockBranches.map((b, idx) => {
                  const sit = situacaoBadge(b.situacao_item);
                  const hasError = Boolean(b.erro);
                  return (
                    <View key={idx} style={styles.branchItem}>
                      <View style={styles.branchInfo}>
                        <Text style={styles.branchName}>{b.filial_nome}</Text>
                        <Text style={styles.branchCodes}>
                          Emp {b.cod_empresa || '—'} · Fil {b.cod_filial || '—'}
                        </Text>
                        {hasError ? (
                          <Text style={styles.branchErrorText}>{b.erro}</Text>
                        ) : b.situacao_item ? (
                          <View
                            style={[
                              styles.branchSitBadge,
                              { backgroundColor: sit.bg },
                            ]}
                          >
                            <Text style={[styles.branchSitText, { color: sit.text }]}>
                              {sit.label}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.branchStockCol}>
                        {hasError ? (
                          <Text style={styles.branchStockUnavailable}>—</Text>
                        ) : (
                          <View
                            style={[
                              styles.branchStockBadge,
                              b.saldo > 0
                                ? styles.branchStockBadgePos
                                : styles.branchStockBadgeZero,
                            ]}
                          >
                            <Text
                              style={[
                                styles.branchStockText,
                                b.saldo > 0
                                  ? styles.branchStockTextPos
                                  : styles.branchStockTextZero,
                              ]}
                            >
                              {b.saldo} un
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {!stockLoading && stockBranches.length === 0 && stockStatus !== 'offline' && (
              <View style={styles.emptyBox}>
                <Ionicons name="location-outline" size={32} color={Colors.textMuted} />
                <Text style={styles.emptyBoxText}>Nenhuma filial com dados de estoque.</Text>
              </View>
            )}
          </View>
        )}

        {/* ── SEÇÃO 2: ESTOQUE EM FORNECEDORES PARCEIROS (CATAVENTO, DISAL) ── */}
        {selectedProduct && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionIconBadge, { backgroundColor: '#10B98120' }]}>
                  <Ionicons name="airplane-outline" size={16} color="#10B981" />
                </View>
                <View>
                  <Text style={styles.sectionTitle}>Fornecedores Parceiros</Text>
                  <Text style={styles.sectionSubtitle}>Catavento, Disal e outros integrados</Text>
                </View>
              </View>

              {/* Controles: Atualizar se carregado, ou spinner */}
              {distLoading ? (
                <ActivityIndicator size="small" color="#10B981" />
              ) : distLoaded ? (
                <TouchableOpacity
                  onPress={() => fetchDistributors()}
                  style={styles.refreshIconBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="refresh-outline" size={18} color="#10B981" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Toggle de busca automática */}
            <View style={styles.autoSearchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.autoSearchTitle}>Buscar automaticamente</Text>
                <Text style={styles.autoSearchSubtitle}>
                  Consultar parceiros ao selecionar o produto
                </Text>
              </View>
              <Switch
                value={autoFetchDistributors}
                onValueChange={handleToggleAutoDist}
                trackColor={{ false: Colors.border, true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Conteúdo dos Parceiros */}
            {distLoading && distData.length === 0 ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="#10B981" />
                <Text style={styles.loadingBoxText}>Consultando distribuidores parceiros...</Text>
              </View>
            ) : !distLoaded && distData.length === 0 ? (
              <View style={styles.demandBox}>
                <Ionicons name="cube-outline" size={32} color="#10B981" />
                <Text style={styles.demandTitle}>Consulta sob demanda</Text>
                <Text style={styles.demandSubtitle}>
                  O estoque local do Horus já está exibido acima. Toque abaixo para verificar a disponibilidade imediata nos fornecedores.
                </Text>
                <TouchableOpacity
                  style={styles.demandBtn}
                  onPress={() => fetchDistributors()}
                  activeOpacity={0.8}
                >
                  <Ionicons name="search" size={16} color="#FFFFFF" />
                  <Text style={styles.demandBtnText}>Consultar Fornecedores</Text>
                </TouchableOpacity>
              </View>
            ) : distLoaded && distData.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyBoxText}>
                  Nenhum fornecedor parceiro com saldo para este produto.
                </Text>
              </View>
            ) : (
              <View style={styles.distGrid}>
                {distData.map((d, idx) => {
                  const isCatavento = d.slug === 'catavento';
                  const isDisal = d.slug === 'disal';
                  const cardBorderColor = d.error
                    ? '#F59E0B'
                    : isCatavento
                    ? '#16a34a'
                    : isDisal
                    ? '#2563eb'
                    : '#00b4b4';
                  const hasError = Boolean(d.error);

                  return (
                    <View
                      key={idx}
                      style={[
                        styles.distCard,
                        { borderLeftColor: cardBorderColor, borderLeftWidth: 4 },
                      ]}
                    >
                      <View style={styles.distHeaderRow}>
                        <View>
                          <Text style={styles.distName}>{d.name}</Text>
                          <Text style={styles.distType}>Distribuidor</Text>
                        </View>
                        {hasError ? (
                          <View style={styles.distErrorBadge}>
                            <Text style={styles.distErrorBadgeText}>Indisponível</Text>
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.distStockBadge,
                              {
                                backgroundColor: d.saldo > 0 ? '#D1FAE5' : '#F1F5F9',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.distStockText,
                                { color: d.saldo > 0 ? '#065F46' : Colors.textMuted },
                              ]}
                            >
                              {d.saldo} un
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.distFooterRow}>
                        {hasError ? (
                          <View style={styles.distErrorRow}>
                            <Ionicons name="alert-circle-outline" size={14} color="#F59E0B" />
                            <Text style={styles.distErrorMsg} numberOfLines={2}>
                              {d.error}
                            </Text>
                          </View>
                        ) : !d.found ? (
                          <Text style={styles.distNotFoundText}>Não localizado no catálogo</Text>
                        ) : (
                          <>
                            <View style={styles.distAvailableRow}>
                              <View style={styles.greenDot} />
                              <Text style={styles.distAvailableText}>Disponível</Text>
                            </View>
                            {d.preco && (
                              <Text style={styles.distPriceText}>
                                {formatCurrency(d.preco)}
                              </Text>
                            )}
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ── ESTADO INICIAL VAZIO ─────────────────────────────────────── */}
        {!hasSearched && (
          <View style={styles.initialEmptyBox}>
            <View style={styles.initialEmptyIcon}>
              <Ionicons name="barcode-outline" size={44} color="#00b4b4" />
            </View>
            <Text style={styles.initialEmptyTitle}>Busca Preço Rápida</Text>
            <Text style={styles.initialEmptyDesc}>
              Consulte preço de capa, saldos por filial no Horus e estoque ao vivo em fornecedores parceiros através do ISBN, nome ou código do item.
            </Text>
            <TouchableOpacity
              style={styles.initialCameraBtn}
              onPress={() => setScannerVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
              <Text style={styles.initialCameraBtnText}>Ler Código de Barras</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ── MODAL DO SCANNER DE CÂMERA ───────────────────────────────── */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onScanned={handleBarcodeScanned}
        onClose={() => setScannerVisible(false)}
      />
    </SafeAreaView>
  );
}

// ─── ESTILOS ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerIconContainer: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: '#00b4b420',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.base,
    paddingBottom: Spacing['4xl'],
    gap: Spacing.base,
  },

  // Seletores de Tipo de Busca
  optionsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.md,
    gap: 4,
  },
  optionTabActive: {
    backgroundColor: '#00b4b4',
  },
  optionTabText: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    fontWeight: Typography.weight.medium,
  },
  optionTabTextActive: {
    color: '#FFFFFF',
    fontWeight: Typography.weight.bold,
  },

  // Input Row
  searchBarRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  input: {
    flex: 1,
    height: 48,
    color: Colors.textPrimary,
    fontSize: Typography.size.base,
  },
  clearBtn: {
    padding: Spacing.xs,
  },
  cameraBtn: {
    padding: Spacing.xs,
    marginLeft: 4,
  },
  searchBtn: {
    width: 48,
    height: 48,
    borderRadius: Radius.xl,
    backgroundColor: '#00b4b4',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },

  // Carrossel
  carouselContainer: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  carouselHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  carouselTitle: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: '#00b4b4',
    textTransform: 'uppercase',
  },
  carouselSubtitle: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
  },
  carouselScroll: {
    flexDirection: 'row',
  },
  carouselCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 220,
    backgroundColor: Colors.bg,
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  carouselCardActive: {
    borderColor: '#00b4b4',
    backgroundColor: '#00b4b415',
  },
  carouselImg: {
    width: 36,
    height: 50,
    borderRadius: Radius.sm,
    backgroundColor: '#FFFFFF',
  },
  carouselImgPlaceholder: {
    width: 36,
    height: 50,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselCardInfo: {
    flex: 1,
  },
  carouselCardTitle: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.textPrimary,
  },
  carouselCardMeta: {
    fontSize: Typography.size.xs - 2,
    color: Colors.textMuted,
    marginTop: 2,
  },
  carouselActiveBadge: {
    fontSize: Typography.size.xs - 2,
    fontWeight: Typography.weight.bold,
    color: '#00b4b4',
    marginTop: 2,
  },

  // Card do Produto
  productCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  coverSection: {
    backgroundColor: Colors.bg,
    padding: Spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  coverImage: {
    width: 140,
    height: 190,
    borderRadius: Radius.md,
  },
  coverPlaceholder: {
    width: 140,
    height: 190,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  coverPlaceholderText: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
  },
  productInfo: {
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  statusBadgeText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
  },
  typeBadge: {
    backgroundColor: Colors.bg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeBadgeText: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    fontWeight: Typography.weight.medium,
  },
  horusCodeText: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginLeft: 'auto',
  },
  productTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: Spacing.xs,
  },
  priceLabel: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  priceValue: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.extrabold,
    color: '#00b4b4',
  },
  addToPdvBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    gap: 4,
  },
  addToPdvText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: '#FFFFFF',
  },
  toastCart: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B98120',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: '#10B98140',
  },
  toastCartText: {
    fontSize: Typography.size.xs,
    color: Colors.success,
    fontWeight: Typography.weight.medium,
    flex: 1,
  },
  toastCartLink: {
    fontSize: Typography.size.xs,
    color: Colors.primaryLight,
    fontWeight: Typography.weight.bold,
  },
  saldoGeralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saldoGeralLabel: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  saldoGeralValue: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: '#00b4b4',
  },
  metaDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  metaList: {
    gap: 4,
  },
  metaItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
  },
  metaValue: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    fontWeight: Typography.weight.medium,
  },
  metaValueMono: {
    fontSize: Typography.size.xs,
    color: Colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: Typography.weight.semibold,
  },
  synopsisContainer: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  synopsisLabel: {
    fontSize: Typography.size.xs - 1,
    fontWeight: Typography.weight.bold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  synopsisText: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  // Seções (Filiais / Distribuidores)
  sectionCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    backgroundColor: '#00b4b420',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: Typography.size.xs - 1,
    color: Colors.textMuted,
  },
  refreshIconBtn: {
    padding: Spacing.xs,
  },

  // Alertas Horus
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B15',
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#F59E0B40',
    gap: Spacing.sm,
  },
  warningTitle: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: '#F59E0B',
  },
  warningText: {
    fontSize: Typography.size.xs - 1,
    color: Colors.textSecondary,
  },
  retryBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.md,
  },
  retryBtnText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: '#000000',
  },
  warningBoxSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B15',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    gap: Spacing.xs,
  },
  warningSmallText: {
    fontSize: Typography.size.xs,
    color: '#F59E0B',
    flex: 1,
  },

  // Loading
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  loadingBoxText: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
  },

  // Lista de Filiais
  branchList: {
    gap: Spacing.sm,
  },
  branchItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bg,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  branchInfo: {
    flex: 1,
    gap: 2,
  },
  branchName: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.textPrimary,
  },
  branchCodes: {
    fontSize: Typography.size.xs - 1,
    color: Colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  branchErrorText: {
    fontSize: Typography.size.xs - 1,
    color: '#F59E0B',
    marginTop: 2,
  },
  branchSitBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
    marginTop: 2,
  },
  branchSitText: {
    fontSize: Typography.size.xs - 2,
    fontWeight: Typography.weight.bold,
  },
  branchStockCol: {
    alignItems: 'flex-end',
    marginLeft: Spacing.sm,
  },
  branchStockUnavailable: {
    fontSize: Typography.size.base,
    color: Colors.textMuted,
    fontWeight: Typography.weight.bold,
  },
  branchStockBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  branchStockBadgePos: {
    backgroundColor: '#D1FAE5',
  },
  branchStockBadgeZero: {
    backgroundColor: Colors.border,
  },
  branchStockText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },
  branchStockTextPos: {
    color: '#065F46',
  },
  branchStockTextZero: {
    color: Colors.textMuted,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.xs,
  },
  emptyBoxText: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
  },

  // Toggle de Busca Automática
  autoSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bg,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  autoSearchTitle: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.textPrimary,
  },
  autoSearchSubtitle: {
    fontSize: Typography.size.xs - 2,
    color: Colors.textMuted,
  },

  // Demanda dos Parceiros
  demandBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  demandTitle: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },
  demandSubtitle: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: Spacing.base,
  },
  demandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    ...Shadow.sm,
  },
  demandBtnText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: '#FFFFFF',
  },

  // Cards de Distribuidores
  distGrid: {
    gap: Spacing.sm,
  },
  distCard: {
    backgroundColor: Colors.bg,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  distHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  distName: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },
  distType: {
    fontSize: Typography.size.xs - 2,
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  distErrorBadge: {
    backgroundColor: '#F59E0B20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  distErrorBadgeText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: '#F59E0B',
  },
  distStockBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  distStockText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },
  distFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  distErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  distErrorMsg: {
    fontSize: Typography.size.xs - 1,
    color: '#F59E0B',
    flex: 1,
  },
  distNotFoundText: {
    fontSize: Typography.size.xs - 1,
    color: Colors.textMuted,
  },
  distAvailableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  distAvailableText: {
    fontSize: Typography.size.xs,
    color: '#10B981',
    fontWeight: Typography.weight.medium,
  },
  distPriceText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },

  // Estado Inicial
  initialEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['3xl'],
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  initialEmptyIcon: {
    width: 80,
    height: 80,
    borderRadius: Radius.full,
    backgroundColor: '#00b4b415',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  initialEmptyTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },
  initialEmptyDesc: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  initialCameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00b4b4',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    gap: Spacing.xs,
    marginTop: Spacing.md,
    ...Shadow.md,
  },
  initialCameraBtnText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: '#FFFFFF',
  },
});

/**
 * conferencia/[id].tsx
 * Sessão de Conferência de Expedição — tela principal do operador.
 *
 * Fluxo de bipe:
 *   1. Operador aperta "Bipe" → abre câmera (BarcodeScannerModal)
 *   2. Camera lê código → fecha câmera → abre Modal de Confirmação
 *   3. Modal mostra: item encontrado, qtd pedida vs conferida, input de qtd
 *   4. Operador confirma → submitItem → lista atualizada
 *
 * Segurança: NUNCA fecha o app. Todos os erros são capturados e
 * exibidos em um modal elegante de erro.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
  Vibration,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BarcodeScannerModal } from '../../../components/BarcodeScannerModal';
import {
  searchOrderForConference,
  openVolume,
  submitItem,
  closeVolume,
  finalizeConference,
  cancelVolume,
  HorusItem,
  ConferenceVolume,
  ConferenceSession,
} from '../../../services/conference.service';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocalItem extends HorusItem {
  checked: number;
  status: 'ok' | 'partial' | 'pending' | 'excess';
}

interface ScanResult {
  barcode: string;
  item: LocalItem | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcStatus(checked: number, pedida: number): LocalItem['status'] {
  if (checked === 0) return 'pending';
  if (checked >= pedida) return checked > pedida ? 'excess' : 'ok';
  return 'partial';
}

function getItemIsbn(i: HorusItem): string {
  return i.ISBN ?? i.BARRAS_ISBN ?? i.COD_BARRA_ITEM ?? '';
}

const STATUS_COLORS: Record<LocalItem['status'], string> = {
  ok: Colors.success,
  partial: Colors.warning,
  pending: Colors.textMuted,
  excess: Colors.error,
};

const STATUS_ICONS: Record<LocalItem['status'], string> = {
  ok: 'checkmark-circle',
  partial: 'time-outline',
  pending: 'ellipse-outline',
  excess: 'warning-outline',
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={kpi.card}>
      <Text style={[kpi.value, color ? { color } : {}]}>{value}</Text>
      <Text style={kpi.label}>{label}</Text>
    </View>
  );
}

// ─── Error Modal ──────────────────────────────────────────────────────────────

function ErrorModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <Modal visible={!!message} transparent animationType="fade" onRequestClose={onClose}>
      <View style={err.backdrop}>
        <View style={err.box}>
          <View style={err.iconWrap}>
            <Ionicons name="alert-circle" size={40} color={Colors.error} />
          </View>
          <Text style={err.title}>Atenção</Text>
          <Text style={err.body}>{message}</Text>
          <TouchableOpacity style={err.btn} onPress={onClose} activeOpacity={0.8}>
            <Text style={err.btnText}>Entendi</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Scan Confirm Modal ────────────────────────────────────────────────────────

interface ScanConfirmModalProps {
  result: ScanResult | null;
  onConfirm: (qty: number) => void;
  onCancel: () => void;
  submitting: boolean;
}

function ScanConfirmModal({ result, onConfirm, onCancel, submitting }: ScanConfirmModalProps) {
  const [qty, setQty] = useState('1');

  // Reset qty each time modal opens
  useEffect(() => {
    if (result) setQty('1');
  }, [result]);

  if (!result) return null;

  const { barcode, item } = result;
  const pedida = item ? Number(item.QTD_PEDIDA ?? 0) : 0;
  const checked = item ? item.checked : 0;
  const remaining = Math.max(0, pedida - checked);
  const parsedQty = parseInt(qty, 10);
  const isValid = !isNaN(parsedQty) && parsedQty >= 0 && (checked + parsedQty <= pedida);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={sc.backdrop}>
        <View style={sc.box}>
          {/* Header */}
          <View style={sc.header}>
            <Ionicons name="barcode-outline" size={22} color={Colors.primary} />
            <Text style={sc.headerTitle}>Código Lido</Text>
          </View>

          {/* Barcode */}
          <View style={sc.codeRow}>
            <Text style={sc.codeText}>{barcode}</Text>
          </View>

          {/* Item info */}
          {item ? (
            <View style={sc.itemCard}>
              <Text style={sc.itemName} numberOfLines={2}>{item.DESCRICAO ?? barcode}</Text>
              <View style={sc.itemStats}>
                <View style={sc.stat}>
                  <Text style={sc.statVal}>{pedida}</Text>
                  <Text style={sc.statLbl}>Pedido</Text>
                </View>
                <View style={sc.statDiv} />
                <View style={sc.stat}>
                  <Text style={[sc.statVal, { color: Colors.success }]}>{checked}</Text>
                  <Text style={sc.statLbl}>Conferido</Text>
                </View>
                <View style={sc.statDiv} />
                <View style={sc.stat}>
                  <Text style={[sc.statVal, { color: remaining > 0 ? Colors.warning : Colors.textMuted }]}>
                    {remaining}
                  </Text>
                  <Text style={sc.statLbl}>Restante</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={sc.notFoundCard}>
              <Ionicons name="warning-outline" size={20} color={Colors.warning} />
              <Text style={sc.notFoundText}>
                Produto não encontrado neste pedido.
              </Text>
            </View>
          )}

          {/* Qty input */}
          {item && (
            <View style={sc.qtyRow}>
              <Text style={sc.qtyLabel}>Quantidade a conferir:</Text>
              <View style={sc.qtyControls}>
                <TouchableOpacity
                  style={sc.qtyBtn}
                  onPress={() => setQty(String(Math.max(0, (parsedQty || 0) - 1)))}
                >
                  <Ionicons name="remove" size={20} color={Colors.textPrimary} />
                </TouchableOpacity>
                <TextInput
                  style={sc.qtyInput}
                  value={qty}
                  onChangeText={(v) => setQty(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <TouchableOpacity
                  style={sc.qtyBtn}
                  onPress={() => setQty(String(Math.min(remaining, (parsedQty || 0) + 1)))}
                >
                  <Ionicons name="add" size={20} color={Colors.textPrimary} />
                </TouchableOpacity>
              </View>
              {checked + parsedQty > pedida && (
                <Text style={{ color: Colors.error, fontSize: 12, marginTop: 6, textAlign: 'center', fontWeight: 'bold' }}>
                  Excede a quantidade pedida ({pedida} max).
                </Text>
              )}
            </View>
          )}

          {/* Actions */}
          <View style={sc.actions}>
            <TouchableOpacity style={sc.cancelBtn} onPress={onCancel} disabled={submitting}>
              <Text style={sc.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sc.confirmBtn, (!isValid || submitting) && sc.confirmBtnDisabled]}
              onPress={() => isValid && onConfirm(parsedQty)}
              disabled={!isValid || submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={sc.confirmText}>Confirmar Bipe</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ConferenciaSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    branch_id: string;
    cod_cli: string;
    cod_pedido_origem: string;
    cod_ped_venda: string;
    nom_cli: string;
    total_horus_items: string;
  }>();

  const conferenceId = Number(params.id);
  const branchId = Number(params.branch_id);
  const codCli = params.cod_cli ?? '';
  const codPedidoOrigem = params.cod_pedido_origem ?? '';
  const codPedVenda = params.cod_ped_venda ?? '';
  const nomCli = params.nom_cli ?? codCli;

  // ─── State ──────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<LocalItem[]>([]);
  const [volumes, setVolumes] = useState<ConferenceVolume[]>([]);
  const [session, setSession] = useState<ConferenceSession | null>(null);
  const [activeVolume, setActiveVolume] = useState<ConferenceVolume | null>(null);
  const [loading, setLoading] = useState(true);
  // cod_ped_venda vem da sessão (persistido no backend) — não depende mais do param de navegação
  const [resolvedCodPedVenda, setResolvedCodPedVenda] = useState(codPedVenda);

  // Scanner
  const [scanning, setScanning] = useState(false);

  // Scan confirm modal
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Close volume modal
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [closingVolume, setClosingVolume] = useState(false);

  // Finalizar
  const [finalizing, setFinalizing] = useState(false);

  // Error modal (instead of crash)
  const [errorMsg, setErrorMsg] = useState('');

  // Busca e Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [hideCompleted, setHideCompleted] = useState(false);

  // Detalhes do Volume / Cancelamento
  const [viewingVolume, setViewingVolume] = useState<ConferenceVolume | null>(null);
  const [cancellingVolume, setCancellingVolume] = useState(false);

  // ─── Safe error handler ───────────────────────────────────────────────────
  function showError(e: any, fallback = 'Ocorreu um erro inesperado.') {
    const msg: string =
      e?.response?.data?.detail ??
      e?.response?.data?.message ??
      e?.message ??
      fallback;
    setErrorMsg(msg);
  }

  // ─── Load conference data ────────────────────────────────────────────────────
  const loadConference = useCallback(async () => {
    try {
      const result = await searchOrderForConference(branchId, codCli, codPedidoOrigem);
      const sess = result.session;
      setSession(sess);
      setVolumes(sess.volumes ?? []);

      // Resolve cod_ped_venda: prefer session (persisted in DB), fallback to nav param or horus_order
      const pedVenda =
        (sess as any).cod_ped_venda ||
        result.horus_order?.COD_PED_VENDA ||
        codPedVenda;
      if (pedVenda) setResolvedCodPedVenda(String(pedVenda));

      const openVol = sess.volumes?.find((v) => v.status !== 'CANCELLED' && v.weight === null) ?? null;
      setActiveVolume(openVol);

      const allCheckedByIsbn: Record<string, number> = {};
      for (const vol of sess.volumes ?? []) {
        if (vol.status === 'CANCELLED') continue;
        for (const vi of vol.items ?? []) {
          allCheckedByIsbn[vi.isbn] = (allCheckedByIsbn[vi.isbn] ?? 0) + vi.quantity;
        }
      }

      const mapped: LocalItem[] = (result.horus_items ?? []).map((hi) => {
        const isbn = getItemIsbn(hi);
        const checked = allCheckedByIsbn[isbn] ?? 0;
        const pedida = Number(hi.QTD_PEDIDA ?? 0);
        return { ...hi, checked, status: calcStatus(checked, pedida) };
      });
      setItems(mapped);
    } catch (e: any) {
      showError(e, 'Erro ao carregar conferência.');
    } finally {
      setLoading(false);
    }
  }, [branchId, codCli, codPedidoOrigem]);

  useEffect(() => { loadConference(); }, [loadConference]);

  // ─── Open volume ────────────────────────────────────────────────────────────
  async function handleOpenVolume() {
    if (activeVolume) {
      setErrorMsg(`A CAIXA #${activeVolume.volume_number} já está aberta. Feche-a antes de abrir outra.`);
      return;
    }
    try {
      const vol = await openVolume(branchId, codCli, codPedidoOrigem);
      setActiveVolume(vol);
      setVolumes((prev) => [...prev, vol]);
    } catch (e: any) {
      showError(e, 'Erro ao abrir caixa.');
    }
  }

  // ─── Barcode scanned → open confirm modal ────────────────────────────────────
  const handleBarcodeScanned = useCallback((data: string) => {
    try {
      const found = items.find((i) => i && getItemIsbn(i) === data) ?? null;
      if (!found) {
        try { Vibration.vibrate([80, 80, 80]); } catch {}
        setErrorMsg(`Produto com ISBN/EAN ${data} não pertence ao pedido.`);
        return;
      }
      try { Vibration.vibrate(60); } catch {}
      setScanResult({ barcode: data, item: found });
    } catch (e: any) {
      showError(e, 'Erro ao processar código lido.');
    }
  }, [items]);

  // ─── Confirm bipe (submit to Horus) ─────────────────────────────────────────
  async function handleConfirmScan(qty: number) {
    if (!activeVolume || !scanResult) return;
    setSubmitting(true);
    try {
      const { barcode, item } = scanResult;
      const isbn = item ? getItemIsbn(item) : barcode;

      if (item) {
        const pedida = Number(item.QTD_PEDIDA ?? 0);
        if (item.checked + qty > pedida) {
          setErrorMsg(`A quantidade informada (${qty}) excede a quantidade restante para este item.`);
          return;
        }
      }

      await submitItem(activeVolume.id, {
        isbn,
        name: item?.DESCRICAO ?? isbn,
        quantity: qty,
        cod_item: item?.COD_ITEM ?? '',
        cod_ped_venda: resolvedCodPedVenda,
      });

      // Update local items list
      if (item) {
        setItems((prev) =>
          prev.map((i) => {
            if (!i) return i;
            if (getItemIsbn(i) !== isbn) return i;
            const newChecked = i.checked + qty;
            return { ...i, checked: newChecked, status: calcStatus(newChecked, Number(i.QTD_PEDIDA ?? 0)) };
          })
        );
      }

      setScanResult(null);
      // Recarrega conferência para atualizar volumes e itens de forma segura
      await loadConference();
    } catch (e: any) {
      showError(e, 'Falha ao registrar bipe. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Close volume ────────────────────────────────────────────────────────────
  async function handleCloseVolume() {
    const w = parseFloat(weightInput.replace(',', '.'));
    if (isNaN(w) || w <= 0) {
      setErrorMsg('Informe um peso maior que zero.');
      return;
    }
    if (!activeVolume) return;
    setClosingVolume(true);
    try {
      await closeVolume(activeVolume.id, w);
      setVolumes((prev) => prev.map((v) => v.id === activeVolume.id ? { ...v, weight: w } : v));
      setActiveVolume(null);
      setShowWeightModal(false);
      setWeightInput('');
      await loadConference();
    } catch (e: any) {
      showError(e, 'Erro ao fechar caixa.');
    } finally {
      setClosingVolume(false);
    }
  }

  // ─── Cancel volume (excluir caixa) ───────────────────────────────────────────
  async function handleCancelVolume(volId: number) {
    setCancellingVolume(true);
    try {
      await cancelVolume(volId);
      setViewingVolume(null);
      await loadConference();
    } catch (e: any) {
      showError(e, 'Erro ao cancelar caixa.');
    } finally {
      setCancellingVolume(false);
    }
  }

  function confirmCancelVolume(vol: ConferenceVolume) {
    Alert.alert(
      'Cancelar Caixa',
      `Tem certeza que deseja cancelar a CAIXA #${vol.volume_number}? Todos os itens desta caixa serão subtraídos do total conferido.`,
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Sim, Cancelar',
          style: 'destructive',
          onPress: () => handleCancelVolume(vol.id),
        },
      ],
      { cancelable: true }
    );
  }

  // ─── Finalize ────────────────────────────────────────────────────────────────
  async function handleFinalize() {
    const openVols = volumes.filter((v) => v.status !== 'CANCELLED' && v.weight === null);
    if (openVols.length > 0) {
      setErrorMsg('Feche todas as caixas antes de finalizar.');
      return;
    }
    const closed = volumes.filter((v) => v.status !== 'CANCELLED');
    if (closed.length === 0) {
      setErrorMsg('É necessário pelo menos uma caixa para finalizar.');
      return;
    }

    setFinalizing(true);
    try {
      await finalizeConference(conferenceId, codPedVenda);
      router.back();
    } catch (e: any) {
      showError(e, 'Erro ao finalizar conferência.');
    } finally {
      setFinalizing(false);
    }
  }

  // ─── Filter items ────────────────────────────────────────────────────────────
  const filteredItems = items.filter((item) => {
    const isbn = getItemIsbn(item);
    const matchesSearch =
      (item.DESCRICAO ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      isbn.includes(searchQuery);
    
    if (hideCompleted && item.status === 'ok') {
      return false;
    }
    return matchesSearch;
  });

  // ─── KPIs ────────────────────────────────────────────────────────────────────
  const totalPedidos = items.reduce((s, i) => s + Number(i.QTD_PEDIDA ?? 0), 0);
  const totalConferidos = items.reduce((s, i) => s + i.checked, 0);
  const totalPendentes = Math.max(0, totalPedidos - totalConferidos);
  const progress = totalPedidos > 0 ? Math.round((totalConferidos / totalPedidos) * 100) : 0;
  const activeVols = volumes.filter((v) => v.status !== 'CANCELLED');

  // ─── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.loadingCenter}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={s.loadingText}>Carregando pedido do Horus...</Text>
      </View>
    );
  }

  const isCompleted = session?.status === 'COMPLETED';

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>Pedido #{codPedidoOrigem}</Text>
          <Text style={s.headerSub} numberOfLines={1}>{nomCli}</Text>
        </View>
        {isCompleted && (
          <View style={s.completedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
            <Text style={s.completedText}>Concluído</Text>
          </View>
        )}
      </View>

      {/* Progress bar */}
      <View style={s.progressBar}>
        <View style={[s.progressFill, { width: `${progress}%` as any }]} />
      </View>
      <Text style={s.progressLabel}>{progress}% conferido</Text>

      {/* KPIs */}
      <View style={kpi.row}>
        <KpiCard label="Pedidos" value={totalPedidos} />
        <KpiCard label="Conferidos" value={totalConferidos} color={Colors.success} />
        <KpiCard label="Pendentes" value={totalPendentes} color={totalPendentes > 0 ? Colors.warning : Colors.textMuted} />
        <KpiCard label="Caixas" value={activeVols.length} color={Colors.primary} />
      </View>

      {/* Action buttons */}
      {!isCompleted && (
        <View style={s.actionRow}>
          {/* Abrir caixa */}
          <TouchableOpacity
            style={[s.actionBtn, s.actionBtnPrimary, activeVolume && s.actionBtnDisabled]}
            onPress={handleOpenVolume}
            disabled={!!activeVolume}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={s.actionBtnText}>
              {activeVolume ? `Caixa #${activeVolume.volume_number}` : 'Abrir Caixa'}
            </Text>
          </TouchableOpacity>

          {/* Bipe */}
          <TouchableOpacity
            style={[s.actionBtn, s.actionBtnScan, !activeVolume && s.actionBtnDisabled]}
            onPress={() => {
              if (!activeVolume) {
                setErrorMsg('Abra uma caixa antes de biper.');
                return;
              }
              setScanning(true);
            }}
            disabled={!activeVolume}
            activeOpacity={0.8}
          >
            <Ionicons name="barcode-outline" size={20} color="#fff" />
            <Text style={s.actionBtnText}>Bipe</Text>
          </TouchableOpacity>

          {/* Fechar caixa */}
          {activeVolume && (
            <TouchableOpacity
              style={[s.actionBtn, s.actionBtnClose]}
              onPress={() => setShowWeightModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="lock-closed-outline" size={20} color="#fff" />
              <Text style={s.actionBtnText}>Fechar</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Volumes / Caixas */}
      {activeVols.length > 0 && (
        <View style={s.volumeSection}>
          <Text style={s.sectionTitle}>Volumes / Caixas ({activeVols.length}) - Clique para detalhes</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: Spacing.sm, paddingHorizontal: Spacing.base }}
          >
            {activeVols.map((vol) => (
              <TouchableOpacity
                key={vol.id}
                style={[s.volumeChip, vol.weight === null && s.volumeChipOpen]}
                onPress={() => setViewingVolume(vol)}
                activeOpacity={0.7}
              >
                <Text style={s.volumeChipNum}>CAIXA #{vol.volume_number}</Text>
                <Text style={s.volumeChipItems}>{vol.items?.length ?? 0} bipes</Text>
                <Text style={s.volumeChipWeight}>
                  {vol.weight != null ? `${vol.weight} kg` : '⚡ Aberta'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Search & Filter Bar */}
      <View style={s.searchFilterContainer}>
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={s.searchIcon} />
          <TextInput
            style={s.searchInput}
            placeholder="Buscar por nome ou ISBN..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={s.searchClear}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[s.filterBtn, hideCompleted && s.filterBtnActive]}
          onPress={() => setHideCompleted(prev => !prev)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={hideCompleted ? 'funnel' : 'funnel-outline'}
            size={16}
            color={hideCompleted ? '#fff' : Colors.primary}
          />
          <Text style={[s.filterBtnText, hideCompleted && s.filterBtnTextActive]}>
            {hideCompleted ? 'Pendentes' : 'Todos'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Items list */}
      <FlatList
        data={filteredItems}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 120 }}
        ListHeaderComponent={
          <Text style={s.sectionTitle}>Itens do Pedido ({filteredItems.length})</Text>
        }
        renderItem={({ item }) => {
          const isbn = getItemIsbn(item);
          const qtd = Number(item.QTD_PEDIDA ?? 0);
          return (
            <TouchableOpacity
              style={s.itemRow}
              onPress={() => {
                if (isCompleted) return;
                if (!activeVolume) {
                  setErrorMsg('Abra uma caixa antes de conferir o item.');
                  return;
                }
                setScanResult({
                  barcode: isbn,
                  item: item,
                });
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={STATUS_ICONS[item.status] as any}
                size={20}
                color={STATUS_COLORS[item.status]}
                style={{ marginTop: 2 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.itemName} numberOfLines={2}>{item.DESCRICAO ?? isbn}</Text>
                <Text style={s.itemIsbn}>ISBN: {isbn}</Text>
              </View>
              <View style={s.itemQty}>
                <Text style={[s.itemChecked, { color: STATUS_COLORS[item.status] }]}>
                  {item.checked}
                </Text>
                <Text style={s.itemSlash}> / {qtd}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: Colors.border }} />}
      />

      {/* Botão finalizar */}
      {!isCompleted && (
        <View style={s.finalizeBar}>
          <TouchableOpacity
            style={[s.finalizeBtn, finalizing && s.finalizeBtnDisabled]}
            onPress={handleFinalize}
            disabled={finalizing}
            activeOpacity={0.85}
          >
            {finalizing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-done-outline" size={22} color="#fff" />
                <Text style={s.finalizeBtnText}>Finalizar Conferência</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Modal: Fechar Caixa (peso) ─── */}
      <Modal
        visible={showWeightModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWeightModal(false)}
      >
        <View style={wm.backdrop}>
          <View style={wm.box}>
            <Text style={wm.title}>Fechar Caixa #{activeVolume?.volume_number}</Text>
            <Text style={wm.subtitle}>Informe o peso da caixa (kg)</Text>
            <View style={wm.inputRow}>
              <Ionicons name="scale-outline" size={18} color={Colors.textMuted} />
              <TextInput
                style={wm.input}
                placeholder="Ex: 12.5"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                value={weightInput}
                onChangeText={setWeightInput}
                autoFocus
              />
              <Text style={wm.unit}>kg</Text>
            </View>
            <View style={wm.actions}>
              <TouchableOpacity
                style={wm.cancelBtn}
                onPress={() => { setShowWeightModal(false); setWeightInput(''); }}
              >
                <Text style={wm.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[wm.confirmBtn, closingVolume && { opacity: 0.6 }]}
                onPress={handleCloseVolume}
                disabled={closingVolume}
              >
                {closingVolume
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={wm.confirmText}>Fechar Caixa</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Modal: Detalhes do Volume/Caixa ─── */}
      <Modal
        visible={!!viewingVolume}
        transparent
        animationType="slide"
        onRequestClose={() => setViewingVolume(null)}
      >
        <View style={sc.backdrop}>
          <View style={[sc.box, { maxHeight: '80%' }]}>
            {/* Header */}
            <View style={sc.header}>
              <Ionicons name="cube-outline" size={22} color={Colors.primary} />
              <Text style={sc.headerTitle}>Detalhes da Caixa #{viewingVolume?.volume_number}</Text>
            </View>

            {/* Volume Stats */}
            <View style={sc.itemCard}>
              <Text style={[sc.qtyLabel, { marginBottom: 4 }]}>Informações do Volume:</Text>
              <Text style={{ color: Colors.textPrimary, fontSize: 13, marginBottom: 2 }}>
                Código de Barras: <Text style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{viewingVolume?.barcode}</Text>
              </Text>
              <Text style={{ color: Colors.textPrimary, fontSize: 13, marginBottom: 2 }}>
                Peso: <Text style={{ fontWeight: 'bold' }}>{viewingVolume?.weight != null ? `${viewingVolume.weight} kg` : '⚡ Aberta'}</Text>
              </Text>
              <Text style={{ color: Colors.textPrimary, fontSize: 13 }}>
                Status: <Text style={{ fontWeight: 'bold', color: viewingVolume?.status === 'CANCELLED' ? Colors.error : Colors.success }}>
                  {viewingVolume?.status === 'CANCELLED' ? 'Cancelado' : viewingVolume?.weight != null ? 'Fechada' : 'Aberta'}
                </Text>
              </Text>
            </View>

            {/* Items inside Volume */}
            <Text style={s.sectionTitle}>Itens nesta Caixa ({viewingVolume?.items?.length ?? 0})</Text>
            <FlatList
              data={viewingVolume?.items ?? []}
              keyExtractor={(item) => String(item.id)}
              style={{ maxHeight: 200, marginBottom: Spacing.base }}
              renderItem={({ item }) => (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs }}>
                  <Text style={{ color: Colors.textPrimary, fontSize: 13, flex: 1, marginRight: Spacing.sm }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 13, marginRight: Spacing.md }}>
                    {item.isbn}
                  </Text>
                  <Text style={{ color: Colors.primary, fontWeight: 'bold', fontSize: 13 }}>
                    {item.quantity}x
                  </Text>
                </View>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: Colors.border }} />}
              ListEmptyComponent={
                <Text style={{ color: Colors.textMuted, fontSize: 13, textAlign: 'center', padding: Spacing.md }}>
                  Nenhum item registrado nesta caixa.
                </Text>
              }
            />

            {/* Actions */}
            <View style={sc.actions}>
              <TouchableOpacity
                style={sc.cancelBtn}
                onPress={() => setViewingVolume(null)}
                disabled={cancellingVolume}
              >
                <Text style={sc.cancelText}>Voltar</Text>
              </TouchableOpacity>
              
              {!isCompleted && viewingVolume?.status !== 'CANCELLED' && (
                <TouchableOpacity
                  style={[sc.confirmBtn, { backgroundColor: Colors.error }]}
                  onPress={() => confirmCancelVolume(viewingVolume!)}
                  disabled={cancellingVolume}
                  activeOpacity={0.85}
                >
                  {cancellingVolume ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={18} color="#fff" />
                      <Text style={sc.confirmText}>Cancelar Caixa</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Scanner Modal ─── */}
      <BarcodeScannerModal
        visible={scanning}
        onScanned={(data) => {
          setScanning(false);
          handleBarcodeScanned(data);
        }}
        onClose={() => setScanning(false)}
      />

      {/* ─── Scan Confirm Modal ─── */}
      <ScanConfirmModal
        result={scanResult}
        onConfirm={handleConfirmScan}
        onCancel={() => setScanResult(null)}
        submitting={submitting}
      />

      {/* ─── Error Modal (app nunca fecha) ─── */}
      <ErrorModal message={errorMsg} onClose={() => setErrorMsg('')} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const kpi = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: Spacing.base, gap: Spacing.sm, marginBottom: Spacing.sm },
  card: {
    flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, alignItems: 'center',
  },
  value: { color: Colors.textPrimary, fontSize: Typography.size.xl, fontWeight: Typography.weight.bold },
  label: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bg },
  loadingText: { color: Colors.textSecondary, fontSize: Typography.size.sm },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingTop: 52, paddingBottom: Spacing.sm,
    backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: Colors.textPrimary, fontSize: Typography.size.base, fontWeight: Typography.weight.bold },
  headerSub: { color: Colors.textMuted, fontSize: Typography.size.xs },
  completedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${Colors.success}20`, borderRadius: Radius.xl,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
  },
  completedText: { color: Colors.success, fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold },

  progressBar: { height: 4, backgroundColor: Colors.border, marginHorizontal: Spacing.base, marginTop: Spacing.sm, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: Colors.primary, borderRadius: 2 },
  progressLabel: { color: Colors.textMuted, fontSize: Typography.size.xs, textAlign: 'right', paddingHorizontal: Spacing.base, marginBottom: Spacing.sm },

  actionRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.base, marginBottom: Spacing.sm },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: Radius.lg, paddingVertical: 12 },
  actionBtnPrimary: { backgroundColor: Colors.primary },
  actionBtnScan: { backgroundColor: Colors.accent },
  actionBtnClose: { backgroundColor: Colors.warning, flex: 0, paddingHorizontal: Spacing.md },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { color: '#fff', fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold },

  volumeSection: { marginBottom: Spacing.sm },
  sectionTitle: { color: Colors.textSecondary, fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, letterSpacing: 0.6, paddingHorizontal: Spacing.base, marginBottom: Spacing.xs },
  volumeChip: { backgroundColor: Colors.bgCard, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm, minWidth: 110 },
  volumeChipOpen: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}10` },
  volumeChipNum: { color: Colors.textPrimary, fontSize: Typography.size.sm, fontWeight: Typography.weight.bold },
  volumeChipItems: { color: Colors.textMuted, fontSize: Typography.size.xs },
  volumeChipWeight: { color: Colors.primary, fontSize: Typography.size.xs, marginTop: 2 },

  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm },
  itemName: { color: Colors.textPrimary, fontSize: Typography.size.sm, fontWeight: Typography.weight.medium },
  itemIsbn: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
  itemQty: { flexDirection: 'row', alignItems: 'baseline' },
  itemChecked: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold },
  itemSlash: { color: Colors.textMuted, fontSize: Typography.size.sm },

  finalizeBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.base, paddingBottom: 30 },
  finalizeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.success, borderRadius: Radius.xl, paddingVertical: 16 },
  finalizeBtnDisabled: { opacity: 0.6 },
  finalizeBtnText: { color: '#fff', fontSize: Typography.size.base, fontWeight: Typography.weight.bold },

  searchFilterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    height: 40,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.size.sm,
    padding: 0,
  },
  searchClear: {
    padding: 2,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    height: 40,
    backgroundColor: 'transparent',
  },
  filterBtnActive: {
    backgroundColor: Colors.primary,
  },
  filterBtnText: {
    color: Colors.primary,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
  },
  filterBtnTextActive: {
    color: '#fff',
  },
});

// Weight modal styles
const wm = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  box: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, width: '100%' },
  title: { color: Colors.textPrimary, fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, marginBottom: 4 },
  subtitle: { color: Colors.textSecondary, fontSize: Typography.size.sm, marginBottom: Spacing.base },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, marginBottom: Spacing.base },
  input: { flex: 1, color: Colors.textPrimary, fontSize: Typography.size.xl, fontWeight: Typography.weight.semibold, paddingVertical: Spacing.md },
  unit: { color: Colors.textMuted, fontSize: Typography.size.base },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  cancelBtn: { flex: 1, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: Colors.textSecondary, fontWeight: Typography.weight.medium },
  confirmBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 12, alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: Typography.weight.bold },
});

// Scan confirm modal styles
const sc = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  box: {
    backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.xl, paddingBottom: 40,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.base },
  headerTitle: { color: Colors.textPrimary, fontSize: Typography.size.lg, fontWeight: Typography.weight.bold },

  codeRow: {
    backgroundColor: Colors.bg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginBottom: Spacing.base, alignItems: 'center',
  },
  codeText: { color: Colors.primary, fontSize: Typography.size.base, fontFamily: 'monospace', letterSpacing: 1, fontWeight: Typography.weight.bold },

  itemCard: {
    backgroundColor: Colors.bg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.base, marginBottom: Spacing.base,
  },
  itemName: { color: Colors.textPrimary, fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, marginBottom: Spacing.sm },
  itemStats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center' },
  statVal: { color: Colors.textPrimary, fontSize: Typography.size.xl, fontWeight: Typography.weight.bold },
  statLbl: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
  statDiv: { width: 1, height: 32, backgroundColor: Colors.border },

  notFoundCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: `${Colors.warning}15`, borderRadius: Radius.lg, borderWidth: 1, borderColor: `${Colors.warning}40`,
    padding: Spacing.base, marginBottom: Spacing.base,
  },
  notFoundText: { flex: 1, color: Colors.warning, fontSize: Typography.size.sm },

  qtyRow: { marginBottom: Spacing.base },
  qtyLabel: { color: Colors.textSecondary, fontSize: Typography.size.sm, marginBottom: Spacing.sm },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  qtyBtn: {
    width: 44, height: 44, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg,
  },
  qtyInput: {
    flex: 1, height: 44, backgroundColor: Colors.bg, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.primary, textAlign: 'center', color: Colors.textPrimary,
    fontSize: Typography.size.xl, fontWeight: Typography.weight.bold,
  },

  actions: { flexDirection: 'row', gap: Spacing.sm },
  cancelBtn: {
    flex: 1, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 14, alignItems: 'center',
  },
  cancelText: { color: Colors.textSecondary, fontWeight: Typography.weight.medium },
  confirmBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.success, borderRadius: Radius.lg, paddingVertical: 14,
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmText: { color: '#fff', fontWeight: Typography.weight.bold, fontSize: Typography.size.base },
});

// Error modal styles
const err = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  box: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, width: '100%',
    alignItems: 'center',
  },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: `${Colors.error}15`,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.base,
  },
  title: { color: Colors.textPrimary, fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, marginBottom: Spacing.sm },
  body: { color: Colors.textSecondary, fontSize: Typography.size.sm, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.lg },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.xl,
    paddingHorizontal: Spacing['2xl'], paddingVertical: Spacing.md, width: '100%', alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: Typography.weight.bold, fontSize: Typography.size.base },
});

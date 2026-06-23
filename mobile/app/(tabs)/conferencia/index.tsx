/**
 * conferencia/index.tsx
 * Tela principal de Conferência de Expedição (Horus).
 *
 * Layout:
 *   - Lista de conferências (em andamento e concluídas) com filtros
 *   - Botão "+" → abre modal de busca de novo pedido
 *   - Swipe/botão de excluir em conferências EM ANDAMENTO
 *   - Toque → retoma a sessão de conferência
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  getConferences,
  getBranches,
  searchOrderForConference,
  deleteConference,
  ConferenceSummary,
  Branch,
} from '../../../services/conference.service';
import { Colors, Typography, Spacing, Radius } from '../../../constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

const STATUS_CONFIG = {
  IN_PROGRESS: { label: 'Em andamento', color: Colors.warning, icon: 'time-outline' },
  COMPLETED: { label: 'Concluída', color: Colors.success, icon: 'checkmark-circle-outline' },
} as const;

// ─── Conference Card ──────────────────────────────────────────────────────────

function ConferenceCard({
  item,
  onPress,
  onDelete,
}: {
  item: ConferenceSummary;
  onPress: () => void;
  onDelete: () => void;
}) {
  const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.IN_PROGRESS;

  return (
    <TouchableOpacity style={card.container} onPress={onPress} activeOpacity={0.75}>
      {/* Ícone */}
      <View style={[card.icon, { backgroundColor: `${cfg.color}18` }]}>
        <Ionicons name={cfg.icon as any} size={22} color={cfg.color} />
      </View>

      {/* Info */}
      <View style={{ flex: 1, gap: 3 }}>
        <View style={card.topRow}>
          <Text style={card.pedido}>Pedido #{item.cod_pedido_origem}</Text>
          <View style={[card.badge, { backgroundColor: `${cfg.color}20` }]}>
            <Text style={[card.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        <Text style={card.cli} numberOfLines={1}>
          Cliente: <Text style={{ color: Colors.textPrimary }}>{item.cod_cli}</Text>
        </Text>
        <Text style={card.branch} numberOfLines={1}>{item.branch_name}</Text>
        <View style={card.statsRow}>
          <View style={card.stat}>
            <Ionicons name="cube-outline" size={12} color={Colors.textMuted} />
            <Text style={card.statText}>{item.total_volumes} caixas</Text>
          </View>
          <View style={card.stat}>
            <Ionicons name="list-outline" size={12} color={Colors.textMuted} />
            <Text style={card.statText}>{item.total_items} itens</Text>
          </View>
          <Text style={card.time}>{relativeDate(item.updated_at)}</Text>
        </View>
      </View>

      {/* Ações */}
      <View style={card.actions}>
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        {item.status === 'IN_PROGRESS' && (
          <TouchableOpacity
            style={card.deleteBtn}
            onPress={onDelete}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── New Conference Modal ─────────────────────────────────────────────────────

function NewConferenceModal({
  visible,
  onClose,
  onFound,
}: {
  visible: boolean;
  onClose: () => void;
  onFound: (params: Record<string, string>) => void;
}) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [codCli, setCodCli] = useState('');
  const [numPedido, setNumPedido] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!visible) return;
    getBranches()
      .then((d) => {
        setBranches(d);
        if (d.length === 1) setSelectedBranch(d[0]);
      })
      .catch(() => Alert.alert('Erro', 'Não foi possível carregar as filiais.'))
      .finally(() => setLoadingBranches(false));
  }, [visible]);

  async function handleSearch() {
    if (!selectedBranch) return Alert.alert('Atenção', 'Selecione uma filial.');
    if (!codCli.trim()) return Alert.alert('Atenção', 'Informe o código do cliente.');
    if (!numPedido.trim()) return Alert.alert('Atenção', 'Informe o número do pedido.');
    setSearching(true);
    try {
      const result = await searchOrderForConference(
        selectedBranch.id,
        codCli.trim(),
        numPedido.trim()
      );
      if (!result?.session) throw new Error('Sessão não retornada.');
      onFound({
        id: String(result.session.id),
        branch_id: String(selectedBranch.id),
        cod_cli: result.session.cod_cli,
        cod_pedido_origem: result.session.cod_pedido_origem,
        cod_ped_venda: result.horus_order?.COD_PED_VENDA ?? '',
        nom_cli: result.horus_order?.NOM_CLI ?? result.horus_order?.COD_CLI ?? codCli,
      });
      // Reset
      setCodCli('');
      setNumPedido('');
      setSelectedBranch(null);
      onClose();
    } catch (e: any) {
      Alert.alert('Pedido não encontrado', e?.response?.data?.detail ?? e?.message ?? 'Erro.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={nm.container}>
        {/* Header do modal */}
        <View style={nm.header}>
          <Text style={nm.title}>Novo Pedido</Text>
          <TouchableOpacity onPress={onClose} style={nm.closeBtn}>
            <Ionicons name="close" size={26} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={nm.content} keyboardShouldPersistTaps="handled">
          <Text style={nm.label}>FILIAL</Text>
          {loadingBranches ? (
            <ActivityIndicator color={Colors.primary} style={{ margin: Spacing.base }} />
          ) : (
            <TouchableOpacity style={nm.selector} onPress={() => setShowPicker(!showPicker)}>
              <Ionicons name="business-outline" size={18} color={Colors.textMuted} />
              <Text style={[nm.selectorText, !selectedBranch && nm.placeholder]}>
                {selectedBranch ? `${selectedBranch.nome} (${selectedBranch.cod_filial})` : 'Selecionar filial...'}
              </Text>
              <Ionicons name={showPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}

          {showPicker && (
            <View style={nm.dropdown}>
              {branches.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[nm.dropItem, selectedBranch?.id === b.id && nm.dropItemSel]}
                  onPress={() => { setSelectedBranch(b); setShowPicker(false); }}
                >
                  <Text style={[nm.dropText, selectedBranch?.id === b.id && { color: Colors.primary, fontWeight: Typography.weight.semibold }]}>
                    {b.nome}
                  </Text>
                  <Text style={nm.dropSub}>{b.cod_empresa}/{b.cod_filial}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={[nm.label, { marginTop: Spacing.base }]}>CÓD. CLIENTE</Text>
          <View style={nm.inputRow}>
            <Ionicons name="person-outline" size={18} color={Colors.textMuted} style={{ marginLeft: Spacing.md }} />
            <TextInput
              style={nm.input} placeholder="Ex: 1001"
              placeholderTextColor={Colors.textMuted} value={codCli}
              onChangeText={setCodCli} keyboardType="default" autoCapitalize="none" returnKeyType="next"
            />
          </View>

          <Text style={[nm.label, { marginTop: Spacing.base }]}>Nº PEDIDO ORIGEM</Text>
          <View style={nm.inputRow}>
            <Ionicons name="receipt-outline" size={18} color={Colors.textMuted} style={{ marginLeft: Spacing.md }} />
            <TextInput
              style={nm.input} placeholder="Ex: 13895"
              placeholderTextColor={Colors.textMuted} value={numPedido}
              onChangeText={setNumPedido} keyboardType="default" autoCapitalize="none"
              returnKeyType="search" onSubmitEditing={handleSearch}
            />
          </View>

          <TouchableOpacity
            style={[nm.btn, (searching || !selectedBranch) && nm.btnDisabled]}
            onPress={handleSearch} disabled={searching} activeOpacity={0.8}
          >
            {searching ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Ionicons name="search-outline" size={20} color="#fff" />
                <Text style={nm.btnText}>Buscar Pedido</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={nm.hint}>
            <Ionicons name="information-circle-outline" size={15} color={Colors.textMuted} />
            <Text style={nm.hintText}>
              Apenas pedidos com status{' '}
              <Text style={{ color: Colors.warning, fontWeight: Typography.weight.semibold }}>LEX</Text>
              {' '}(Liberado para Expedição) são aceitos.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ConferenciaIndexScreen() {
  const router = useRouter();
  const [conferences, setConferences] = useState<ConferenceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_PROGRESS' | 'COMPLETED'>('IN_PROGRESS');
  const [searchText, setSearchText] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  const loadList = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getConferences();
      setConferences(data);
    } catch {
      // silencioso em refresh
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  function handleRefresh() {
    setRefreshing(true);
    loadList(true);
  }

  async function handleDelete(item: ConferenceSummary) {
    Alert.alert(
      'Excluir conferência?',
      `Pedido #${item.cod_pedido_origem} — ${item.cod_cli}\n\nEsta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteConference(item.id);
              setConferences((prev) => prev.filter((c) => c.id !== item.id));
            } catch (e: any) {
              Alert.alert('Erro', e?.response?.data?.detail ?? 'Não foi possível excluir.');
            }
          },
        },
      ]
    );
  }

  function handleCardPress(item: ConferenceSummary) {
    // Retoma a sessão usando os dados que já temos localmente (permitindo consulta de concluídas)
    router.push({
      pathname: '/(tabs)/conferencia/[id]' as any,
      params: {
        id: String(item.id),
        branch_id: String(item.branch_id),
        cod_cli: item.cod_cli,
        cod_pedido_origem: item.cod_pedido_origem,
        cod_ped_venda: '', // será recarregado do Horus na tela da sessão
        nom_cli: item.cod_cli,
      },
    });
  }

  function handleNewConferenceFound(params: Record<string, string>) {
    router.push({
      pathname: '/(tabs)/conferencia/[id]' as any,
      params,
    });
  }

  // Filtragem local — busca por numero do pedido e codigo do cliente
  const filtered = conferences.filter((c) => {
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
    if (searchText) {
      const s = searchText.trim().toLowerCase();
      return (
        c.cod_pedido_origem.toLowerCase().includes(s) ||
        c.cod_cli.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const inProgress = conferences.filter((c) => c.status === 'IN_PROGRESS').length;
  const completed = conferences.filter((c) => c.status === 'COMPLETED').length;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Conferência de Expedição</Text>
          <Text style={s.subtitle}>Horus ERP · {conferences.length} registros</Text>
        </View>
        <TouchableOpacity style={s.newBtn} onPress={() => setShowNewModal(true)} activeOpacity={0.8}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={s.newBtnText}>Novo</Text>
        </TouchableOpacity>
      </View>

      {/* KPIs rápidos */}
      <View style={s.kpiRow}>
        <View style={s.kpiCard}>
          <Text style={[s.kpiVal, { color: Colors.warning }]}>{inProgress}</Text>
          <Text style={s.kpiLabel}>Em andamento</Text>
        </View>
        <View style={[s.kpiCard, { borderColor: Colors.success }]}>
          <Text style={[s.kpiVal, { color: Colors.success }]}>{completed}</Text>
          <Text style={s.kpiLabel}>Concluídas</Text>
        </View>
      </View>

      {/* Busca */}
      <View style={s.searchRow}>
        <Ionicons name="search-outline" size={16} color={Colors.textMuted} style={{ marginLeft: Spacing.md }} />
        <TextInput
          style={s.searchInput}
          placeholder="Buscar por nº pedido ou cód. cliente..."
          placeholderTextColor={Colors.textMuted}
          value={searchText}
          onChangeText={setSearchText}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')} style={{ padding: Spacing.sm }}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filtros por status */}
      <View style={s.filterRow}>
        {(['ALL', 'IN_PROGRESS', 'COMPLETED'] as const).map((f) => {
          const labels = { ALL: 'Todos', IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluídas' };
          const active = statusFilter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[s.filterChip, active && s.filterChipActive]}
              onPress={() => setStatusFilter(f)}
            >
              <Text style={[s.filterText, active && s.filterTextActive]}>{labels[f]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Lista */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={s.loadingText}>Carregando conferências...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ConferenceCard
              item={item}
              onPress={() => handleCardPress(item)}
              onDelete={() => handleDelete(item)}
            />
          )}
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: 100, gap: Spacing.sm }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Ionicons name="cube-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>
                {searchText || statusFilter !== 'ALL' ? 'Nenhum resultado' : 'Nenhuma conferência'}
              </Text>
              <Text style={s.emptySubtitle}>
                {searchText || statusFilter !== 'ALL'
                  ? 'Tente outros filtros.'
                  : 'Toque em "+ Novo" para iniciar uma conferência.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Modal nova conferência */}
      <NewConferenceModal
        visible={showNewModal}
        onClose={() => setShowNewModal(false)}
        onFound={handleNewConferenceFound}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingTop: Spacing['3xl'], paddingBottom: Spacing.sm,
  },
  title: { color: Colors.textPrimary, fontSize: Typography.size.xl, fontWeight: Typography.weight.bold },
  subtitle: { color: Colors.textMuted, fontSize: Typography.size.xs, marginTop: 2 },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.primary, borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  newBtnText: { color: '#fff', fontWeight: Typography.weight.bold, fontSize: Typography.size.sm },

  kpiRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.base, marginBottom: Spacing.sm },
  kpiCard: {
    flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, alignItems: 'center',
  },
  kpiVal: { fontSize: Typography.size['2xl'], fontWeight: Typography.weight.bold },
  kpiLabel: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.base, marginBottom: Spacing.xs,
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1, color: Colors.textPrimary,
    fontSize: Typography.size.sm, paddingVertical: Spacing.md,
  },

  filterRow: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, marginBottom: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { color: Colors.textSecondary, fontSize: Typography.size.xs, fontWeight: Typography.weight.medium },
  filterTextActive: { color: '#fff', fontWeight: Typography.weight.bold },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  loadingText: { color: Colors.textSecondary, fontSize: Typography.size.sm },

  emptyBox: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing['3xl'] },
  emptyTitle: { color: Colors.textPrimary, fontSize: Typography.size.lg, fontWeight: Typography.weight.semibold },
  emptySubtitle: { color: Colors.textMuted, fontSize: Typography.size.sm, textAlign: 'center', paddingHorizontal: Spacing.xl },
});

const card = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
  },
  icon: { width: 42, height: 42, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  pedido: { color: Colors.textPrimary, fontSize: Typography.size.base, fontWeight: Typography.weight.bold },
  badge: { borderRadius: Radius.xl, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: Typography.weight.semibold },
  cli: { color: Colors.textMuted, fontSize: Typography.size.xs },
  branch: { color: Colors.textMuted, fontSize: Typography.size.xs },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 2 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { color: Colors.textMuted, fontSize: 10 },
  time: { marginLeft: 'auto', color: Colors.textMuted, fontSize: 10 },
  actions: { alignItems: 'center', gap: Spacing.sm },
  deleteBtn: { padding: 4 },
});

const nm = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingTop: Spacing.xl, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { color: Colors.textPrimary, fontSize: Typography.size.xl, fontWeight: Typography.weight.bold },
  closeBtn: { padding: 4 },
  content: { padding: Spacing.base, paddingBottom: 60 },
  label: { color: Colors.textMuted, fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, letterSpacing: 0.8, marginBottom: Spacing.xs },
  selector: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    marginBottom: Spacing.xs,
  },
  selectorText: { flex: 1, color: Colors.textPrimary, fontSize: Typography.size.base },
  placeholder: { color: Colors.textMuted },
  dropdown: {
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm, overflow: 'hidden',
  },
  dropItem: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dropItemSel: { backgroundColor: `${Colors.primary}15` },
  dropText: { color: Colors.textPrimary, fontSize: Typography.size.base },
  dropSub: { color: Colors.textMuted, fontSize: Typography.size.xs, marginTop: 2 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.xs,
  },
  input: { flex: 1, color: Colors.textPrimary, fontSize: Typography.size.base, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.primary, borderRadius: Radius.xl,
    paddingVertical: 16, marginTop: Spacing.xl,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: Typography.size.base, fontWeight: Typography.weight.bold },
  hint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    padding: Spacing.base, marginTop: Spacing.xl,
    borderWidth: 1, borderColor: Colors.border,
  },
  hintText: { flex: 1, color: Colors.textMuted, fontSize: Typography.size.xs, lineHeight: 18 },
});

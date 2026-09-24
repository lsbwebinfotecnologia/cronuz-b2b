import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import {
  MobilePOSSession,
  fetchPOSSessions,
  createPOSSession,
  closePOSSession,
} from '../../services/pdv.service';

interface Props {
  visible: boolean;
  companyId?: number;
  activeSession: MobilePOSSession | null;
  onSelectSession: (session: MobilePOSSession | null) => void;
  onClose: () => void;
}

export function POSSessionPickerModal({
  visible,
  companyId,
  activeSession,
  onSelectSession,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<MobilePOSSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSource, setNewSource] = useState<'GENERAL' | 'SPREADSHEET' | 'CONSIGNMENT'>('GENERAL');
  const [newRef, setNewRef] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (visible && companyId) {
      loadSessions();
    }
  }, [visible, companyId]);

  async function loadSessions() {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await fetchPOSSessions(companyId);
      setSessions(data);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao carregar sessões de venda.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!companyId || !newTitle.trim()) {
      Alert.alert('Atenção', 'Informe o nome do evento / sessão.');
      return;
    }
    setCreating(true);
    try {
      const created = await createPOSSession(companyId, newTitle.trim(), newSource, newRef.trim());
      Alert.alert('Sucesso', `Sessão "${created.title}" iniciada!`);
      setNewTitle('');
      setNewRef('');
      setShowCreate(false);
      onSelectSession(created);
      onClose();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao abrir sessão de PDV.');
    } finally {
      setCreating(false);
    }
  }

  async function handleCloseSession(s: MobilePOSSession) {
    if (!companyId) return;
    Alert.alert(
      'Encerrar Sessão',
      `Deseja realmente fechar a sessão "${s.title}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Encerrar',
          style: 'destructive',
          onPress: async () => {
            try {
              await closePOSSession(companyId, s.id);
              if (activeSession?.id === s.id) {
                onSelectSession(null);
              }
              loadSessions();
            } catch {
              Alert.alert('Erro', 'Não foi possível fechar a sessão.');
            }
          },
        },
      ]
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 20) }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <View style={styles.iconBox}>
              <Ionicons name="storefront" size={20} color={Colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Sessões & Eventos de Venda</Text>
              <Text style={styles.headerSubtitle}>Organize as vendas por feira ou caixa</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={sessions}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={{ marginBottom: Spacing.base }}>
              {/* Sessão Ativa Atual */}
              {activeSession ? (
                <View style={styles.activeCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activeTag}>SESSÃO ATIVA NESTE APARELHO</Text>
                    <Text style={styles.activeTitle}>{activeSession.title}</Text>
                    <Text style={styles.activeCode}>
                      {activeSession.code} • {activeSession.products_count ?? 0} produtos vinculados
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.unbindBtn}
                    onPress={() => onSelectSession(null)}
                  >
                    <Text style={styles.unbindText}>Desvincular</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.noActiveCard}>
                  <Text style={styles.noActiveText}>
                    Nenhuma sessão vinculada. Vendas gerais de balcão.
                  </Text>
                </View>
              )}

              {/* Botão / Form de Criação */}
              {!showCreate ? (
                <TouchableOpacity
                  style={styles.openCreateBtn}
                  onPress={() => setShowCreate(true)}
                >
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                  <Text style={styles.openCreateText}>Abrir Nova Sessão / Evento</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.createCard}>
                  <Text style={styles.createCardTitle}>NOVA SESSÃO / EVENTO</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: Bienal do Livro 2026 - Estande 02"
                    placeholderTextColor={Colors.textMuted}
                    value={newTitle}
                    onChangeText={setNewTitle}
                  />

                  <Text style={styles.label}>Origem dos Produtos:</Text>
                  <View style={styles.sourceRow}>
                    {[
                      { key: 'GENERAL', label: 'Geral' },
                      { key: 'SPREADSHEET', label: 'Planilha' },
                      { key: 'CONSIGNMENT', label: 'Contrato' },
                    ].map((src) => (
                      <TouchableOpacity
                        key={src.key}
                        style={[
                          styles.sourceBtn,
                          newSource === src.key && styles.sourceBtnActive,
                        ]}
                        onPress={() => setNewSource(src.key as any)}
                      >
                        <Text
                          style={[
                            styles.sourceText,
                            newSource === src.key && styles.sourceTextActive,
                          ]}
                        >
                          {src.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {newSource === 'CONSIGNMENT' && (
                    <TextInput
                      style={[styles.input, { marginTop: 8 }]}
                      placeholder="Número / Ref do Contrato (opcional)"
                      placeholderTextColor={Colors.textMuted}
                      value={newRef}
                      onChangeText={setNewRef}
                    />
                  )}

                  <View style={styles.createActions}>
                    <TouchableOpacity
                      onPress={() => setShowCreate(false)}
                      style={styles.cancelBtn}
                    >
                      <Text style={styles.cancelText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleCreate}
                      disabled={creating}
                      style={styles.confirmCreateBtn}
                    >
                      {creating ? (
                        <ActivityIndicator color={Colors.white} size="small" />
                      ) : (
                        <Text style={styles.confirmCreateText}>Confirmar e Abrir</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <Text style={styles.sectionTitle}>HISTÓRICO DE SESSÕES</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isActive = activeSession?.id === item.id;
            const isClosed = item.status === 'CLOSED';
            const srcLabel =
              item.catalog_source === 'SPREADSHEET'
                ? 'Planilha'
                : item.catalog_source === 'CONSIGNMENT'
                ? 'Contrato'
                : 'Geral';

            return (
              <View style={[styles.sessionCard, isActive && styles.sessionCardActive]}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.sessionTitle}>{item.title}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: isClosed
                            ? Colors.bgCardHover
                            : Colors.successLight,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          {
                            color: isClosed
                              ? Colors.textSecondary
                              : Colors.success,
                          },
                        ]}
                      >
                        {isClosed ? 'Fechada' : 'Aberta'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.sessionMeta}>
                    {item.code} • {srcLabel} • {item.products_count ?? 0} produtos
                  </Text>
                  <Text style={styles.sessionSales}>
                    {item.total_sales_count} vendas (R$ {Number(item.total_sales_amount || 0).toFixed(2)})
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {!isClosed && !isActive && (
                    <TouchableOpacity
                      style={styles.activateBtn}
                      onPress={() => {
                        onSelectSession(item);
                        onClose();
                      }}
                    >
                      <Text style={styles.activateText}>Ativar</Text>
                    </TouchableOpacity>
                  )}
                  {!isClosed && (
                    <TouchableOpacity
                      style={styles.closeSessionBtn}
                      onPress={() => handleCloseSession(item)}
                    >
                      <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
            ) : (
              <Text style={styles.emptyText}>Nenhuma sessão registrada.</Text>
            )
          }
        />
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
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
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
  listContent: {
    padding: Spacing.base,
  },
  activeCard: {
    padding: Spacing.base,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: Colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.base,
  },
  activeTag: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.success,
    letterSpacing: 0.5,
  },
  activeTitle: {
    fontSize: Typography.size.base,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  activeCode: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  unbindBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  unbindText: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
  },
  noActiveCard: {
    padding: Spacing.base,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.base,
  },
  noActiveText: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  openCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.borderLight,
    backgroundColor: Colors.bgCard,
  },
  openCreateText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  createCard: {
    padding: Spacing.base,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  createCardTitle: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  label: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    marginTop: 10,
    marginBottom: 6,
    fontFamily: Typography.fontFamily.medium,
  },
  sourceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sourceBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  sourceBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryLight,
  },
  sourceText: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.medium,
  },
  sourceTextActive: {
    color: Colors.white,
    fontFamily: Typography.fontFamily.bold,
  },
  createActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
  },
  confirmCreateBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.success,
  },
  confirmCreateText: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
  },
  sectionTitle: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textMuted,
    letterSpacing: 0.5,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sessionCard: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sessionCardActive: {
    borderColor: Colors.success,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  sessionTitle: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  statusText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
  },
  sessionMeta: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  sessionSales: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  activateBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
  },
  activateText: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
  },
  closeSessionBtn: {
    padding: 6,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: Typography.size.sm,
    marginTop: 30,
  },
});

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import {
  MobilePOSSession,
  loadPOSCatalogToSession,
  fetchPOSSessionProducts,
  syncSessionProductsProgressive,
} from '../../services/pdv.service';
import {
  saveSessionProductsLocally,
  SaveProductsResult,
  LocalPOSProduct,
} from '../../services/pdv.storage';

interface Props {
  visible: boolean;
  companyId?: number;
  activeSession: MobilePOSSession | null;
  onCatalogUpdated: (count: number) => void;
  onClose: () => void;
}

export function POSCatalogSyncModal({
  visible,
  companyId,
  activeSession,
  onCatalogUpdated,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'CONSIGNMENT' | 'GENERAL' | 'SPREADSHEET'>('CONSIGNMENT');
  const [contractNumber, setContractNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [syncReport, setSyncReport] = useState<SaveProductsResult | null>(null);

  async function handleLoadCatalog() {
    if (!companyId) return;

    if (activeTab === 'CONSIGNMENT' && !contractNumber.trim()) {
      Alert.alert('Atenção', 'Informe o número do contrato de consignação Horus.');
      return;
    }

    setLoading(true);
    setProgressText('Conectando ao servidor...');
    setSyncReport(null);
    try {
      if (activeTab === 'SPREADSHEET') {
        if (!activeSession?.id) {
          Alert.alert(
            'Sessão Necessária',
            'Selecione uma sessão de venda ativa no topo para sincronizar os produtos importados via planilha.'
          );
          return;
        }

        const { totalSaved, totalCount } = await syncSessionProductsProgressive(
          companyId,
          activeSession.id,
          'SPREADSHEET',
          (curr, tot, pct, msg) => setProgressText(msg)
        );

        if (totalCount === 0) {
          Alert.alert(
            'Aviso',
            `A sessão "${activeSession.title}" ainda não possui produtos vinculados no portal.\n\n` +
              'Dica: No portal web você pode importar uma planilha Excel (.xlsx) para esta sessão, e então sincronizar aqui no celular.'
          );
          return;
        }

        onCatalogUpdated(totalSaved);
        Alert.alert(
          'Carga Concluída',
          `✓ ${totalSaved} produtos da planilha carregados offline no aparelho com total sucesso!`
        );
        return;
      }

      let rawItems: any[] = [];
      const data = await loadPOSCatalogToSession(
        companyId,
        activeSession?.id,
        activeTab,
        contractNumber.trim() || undefined
      );
      rawItems = data.items || [];

      const items: LocalPOSProduct[] = rawItems.map((p: any) => ({
        barcode: String(p.barcode || '').trim().replace(/\.0$/, ''),
        sku: String(p.sku || ''),
        title: String(p.title || 'Sem título'),
        publisher: String(p.publisher || ''),
        price: Number(p.price) || 0,
        stock: Number(p.stock) || 100,
        horus_item_code: String(p.horus_item_code || ''),
        product_id: p.product_id,
        source: activeTab,
      }));

      if (items.length === 0) {
        Alert.alert('Aviso', 'Nenhum produto foi retornado para os critérios informados.');
        return;
      }

      // Gravação atômica em lotes no SQLite nativo do celular
      const result = await saveSessionProductsLocally(items, true);
      setSyncReport(result);
      onCatalogUpdated(result.savedCount);

      Alert.alert(
        'Carga Concluída',
        `✓ ${result.savedCount} produtos carregados offline neste aparelho!\n` +
          (result.duplicateCount > 0 ? `• ${result.duplicateCount} duplicados ignorados\n` : '') +
          (result.zeroPriceCount > 0 ? `• ${result.zeroPriceCount} com preço zerado rejeitados` : '')
      );
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao carregar produtos.');
    } finally {
      setLoading(false);
      setProgressText(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header com Safe Area Inset no Topo para não colidir com o status bar */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 20) }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <View style={styles.iconBox}>
              <Ionicons name="cloud-download" size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Carga de Produtos Offline</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {activeSession ? `Sessão: ${activeSession.title}` : 'Armazenamento interno do aparelho'}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Tabs de Seleção */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'CONSIGNMENT' && styles.tabBtnActive]}
              onPress={() => setActiveTab('CONSIGNMENT')}
            >
              <Ionicons
                name="document-text-outline"
                size={14}
                color={activeTab === 'CONSIGNMENT' ? Colors.white : Colors.textMuted}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'CONSIGNMENT' && styles.tabTextActive,
                ]}
              >
                Contrato
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'SPREADSHEET' && styles.tabBtnActive]}
              onPress={() => setActiveTab('SPREADSHEET')}
            >
              <Ionicons
                name="document-attach-outline"
                size={14}
                color={activeTab === 'SPREADSHEET' ? Colors.white : Colors.textMuted}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'SPREADSHEET' && styles.tabTextActive,
                ]}
              >
                Planilha
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'GENERAL' && styles.tabBtnActive]}
              onPress={() => setActiveTab('GENERAL')}
            >
              <Ionicons
                name="library-outline"
                size={14}
                color={activeTab === 'GENERAL' ? Colors.white : Colors.textMuted}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'GENERAL' && styles.tabTextActive,
                ]}
              >
                Geral
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form Contrato */}
          {activeTab === 'CONSIGNMENT' && (
            <View style={styles.formBox}>
              <Text style={styles.inputLabel}>Número do Contrato de Consignação:</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 10245 ou CTR-2026-0042"
                placeholderTextColor={Colors.textMuted}
                value={contractNumber}
                onChangeText={setContractNumber}
              />
              <Text style={styles.helpText}>
                Busca os itens consignados deste contrato no ERP Horus, vincula à sessão e salva no celular para venda offline.
              </Text>
            </View>
          )}

          {/* Form Planilha */}
          {activeTab === 'SPREADSHEET' && (
            <View style={styles.formBox}>
              <Text style={styles.infoTitle}>Carregar Planilha Vinculada à Sessão</Text>
              <Text style={styles.helpText}>
                {activeSession
                  ? `Baixa todos os produtos importados por planilha na sessão ativa "${activeSession.title}" para o celular.`
                  : 'Nenhuma sessão ativa. Selecione uma sessão no topo da tela para puxar os produtos da planilha.'}
              </Text>
            </View>
          )}

          {/* Form Geral */}
          {activeTab === 'GENERAL' && (
            <View style={styles.formBox}>
              <Text style={styles.infoTitle}>Carregar Catálogo Cadastrado</Text>
              <Text style={styles.helpText}>
                Baixa os produtos ativos cadastrados na empresa e grava no armazenamento local do aparelho para consulta rápida.
              </Text>
            </View>
          )}

          {/* Regras de Proteção */}
          <View style={styles.rulesBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Ionicons name="shield-checkmark" size={16} color={Colors.success} />
              <Text style={styles.rulesTitle}>Regras de Segurança Integradas:</Text>
            </View>
            <Text style={styles.ruleItem}>• Deduplicação automática: mantém apenas 1 registro por ISBN.</Text>
            <Text style={styles.ruleItem}>• Proteção contra preço zerado: bloqueia itens sem valor comercial.</Text>
            <Text style={styles.ruleItem}>• Venda 100% offline após a carga dos itens no aparelho.</Text>
          </View>

          {/* Relatório de Carga */}
          {syncReport && (
            <View style={styles.reportBox}>
              <Text style={styles.reportTitle}>Relatório da Carga:</Text>
              <Text style={styles.reportSuccess}>
                ✓ {syncReport.savedCount} produtos prontos para uso offline.
              </Text>
              {syncReport.duplicateCount > 0 && (
                <Text style={styles.reportWarning}>
                  • {syncReport.duplicateCount} registros duplicados ignorados.
                </Text>
              )}
              {syncReport.zeroPriceCount > 0 && (
                <Text style={styles.reportError}>
                  • {syncReport.zeroPriceCount} itens com preço zero rejeitados.
                </Text>
              )}
            </View>
          )}

          <TouchableOpacity
            style={styles.loadActionBtn}
            onPress={handleLoadCatalog}
            disabled={loading}
          >
            {loading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color={Colors.white} size="small" />
                <Text style={styles.loadActionText}>
                  {progressText || 'Carregando em lotes...'}
                </Text>
              </View>
            ) : (
              <>
                <Ionicons name="download-outline" size={18} color={Colors.white} />
                <Text style={styles.loadActionText}>Iniciar Carga Offline</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
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
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
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
  content: {
    padding: Spacing.base,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.base,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.medium,
  },
  tabTextActive: {
    color: Colors.white,
    fontFamily: Typography.fontFamily.bold,
  },
  formBox: {
    padding: Spacing.base,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.base,
  },
  inputLabel: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.medium,
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
  helpText: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    marginTop: 8,
    lineHeight: 18,
  },
  infoTitle: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  rulesBox: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    marginBottom: Spacing.base,
  },
  rulesTitle: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.success,
  },
  ruleItem: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  reportBox: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.base,
  },
  reportTitle: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  reportSuccess: {
    fontSize: Typography.size.xs,
    color: Colors.success,
    fontFamily: Typography.fontFamily.bold,
  },
  reportWarning: {
    fontSize: Typography.size.xs,
    color: Colors.warning,
    marginTop: 2,
  },
  reportError: {
    fontSize: Typography.size.xs,
    color: Colors.error,
    marginTop: 2,
  },
  loadActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.success,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    marginTop: Spacing.sm,
  },
  loadActionText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.white,
  },
});

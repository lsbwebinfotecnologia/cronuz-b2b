/**
 * BarcodeScannerModal.tsx
 * Modal de leitura de código de barras (ISBN/EAN) via câmera.
 *
 * LOCK-IN: exige 3 leituras consecutivas do MESMO código para confirmar.
 * Isso evita leituras falsas de codes parciais ou do ambiente.
 * Uma barra de progresso visual indica o nível de estabilidade da leitura.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Vibration,
  TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

interface Props {
  visible: boolean;
  onScanned: (barcode: string) => void;
  onClose: () => void;
}

// Quantas leituras consecutivas do mesmo código para confirmar
const REQUIRED_STABLE_READS = 3;

export function BarcodeScannerModal({ visible, onScanned, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [confirmed, setConfirmed] = useState(false);

  // Lock-in state
  const [candidate, setCandidate] = useState<string | null>(null);
  const [stableCount, setStableCount] = useState(0);
  const stableCountRef = useRef(0);
  const candidateRef = useRef<string | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Campo de teste manual (emulador / sem câmera física)
  const [manualCode, setManualCode] = useState('');

  function handleManualSubmit() {
    const code = manualCode.trim();
    if (!code) return;
    setManualCode('');
    try { Vibration.vibrate(60); } catch {}
    try {
      onScanned(code);
    } catch (e) {
      console.warn('[BarcodeScannerModal] onScanned (manual) threw:', e);
    }
  }

  // Reset completo ao abrir/fechar
  useEffect(() => {
    if (visible) {
      resetState();
    }
    return () => {
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
    };
  }, [visible]);

  function resetState() {
    setConfirmed(false);
    setCandidate(null);
    setStableCount(0);
    candidateRef.current = null;
    stableCountRef.current = 0;
  }

  function handleBarcode({ data }: BarcodeScanningResult) {
    try {
      if (confirmed) return;

      // Código diferente do candidato atual → reinicia contagem
      if (data !== candidateRef.current) {
        candidateRef.current = data;
        stableCountRef.current = 1;
        setCandidate(data);
        setStableCount(1);
        return;
      }

      // Mesmo código → incrementa estabilidade
      const next = stableCountRef.current + 1;
      stableCountRef.current = next;
      setStableCount(next);

      if (next >= REQUIRED_STABLE_READS) {
        // ✅ LOCK-IN confirmado!
        setConfirmed(true);
        try { Vibration.vibrate(100); } catch {}
        cooldownRef.current = setTimeout(() => {
          try {
            onScanned(data); // chama primeiro — parent trata o resultado
          } catch (e) {
            console.warn('[BarcodeScannerModal] onScanned threw:', e);
          }
          // onClose é chamado PELO PARENT após processar onScanned
        }, 350);
      }
    } catch (e) {
      console.warn('[BarcodeScannerModal] handleBarcode error:', e);
    }
  }

  if (!visible) return null;

  // Sem permissão
  if (!permission) {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <View style={s.center}>
          <Ionicons name="camera-outline" size={48} color={Colors.textMuted} />
          <Text style={s.permTitle}>Verificando câmera...</Text>
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <View style={s.center}>
          <Ionicons name="camera-outline" size={48} color={Colors.textMuted} />
          <Text style={s.permTitle}>Câmera bloqueada</Text>
          <Text style={s.permSubtitle}>
            Precisamos de acesso à câmera para ler o código de barras.
          </Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
            <Text style={s.permBtnText}>Conceder permissão</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.closeTextBtn} onPress={onClose}>
            <Text style={s.closeTextBtnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  const lockColor = confirmed
    ? Colors.success
    : stableCount > 0
    ? Colors.warning
    : Colors.primary;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={s.container}>
        {/* Câmera */}
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: [
              'ean13', 'ean8', 'upc_a', 'upc_e',
              'code128', 'code39', 'itf14',
            ],
          }}
          onBarcodeScanned={confirmed ? undefined : handleBarcode}
        />

        {/* Overlay */}
        <View style={s.overlay} pointerEvents="none">
          <View style={s.overlayTop} />
          <View style={s.overlayMiddle}>
            <View style={s.overlaySide} />
            {/* Janela de mira */}
            <View style={[s.window, { borderColor: lockColor }]}>
              {/* Cantos */}
              <View style={[s.corner, s.cTL, { borderColor: lockColor }]} />
              <View style={[s.corner, s.cTR, { borderColor: lockColor }]} />
              <View style={[s.corner, s.cBL, { borderColor: lockColor }]} />
              <View style={[s.corner, s.cBR, { borderColor: lockColor }]} />

              {/* Barra de lock-in — sem Animated para evitar crash no Android */}
              <View style={s.stabBarBg}>
                <View
                  style={[
                    s.stabBarFill,
                    {
                      width: `${Math.round((stableCount / REQUIRED_STABLE_READS) * 100)}%` as any,
                      backgroundColor: lockColor,
                    },
                  ]}
                />
              </View>
            </View>
            <View style={s.overlaySide} />
          </View>
          <View style={s.overlayBottom} />
        </View>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={s.title}>Ler código de barras</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Footer com status */}
        <View style={s.footer}>
          {confirmed ? (
            <View style={[s.statusBadge, { backgroundColor: `${Colors.success}30` }]}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <Text style={[s.statusText, { color: Colors.success }]}>
                Código confirmado!
              </Text>
            </View>
          ) : candidate ? (
            <View style={s.candidateBox}>
              <Text style={s.candidateCode}>{candidate}</Text>
              <Text style={s.candidateHint}>
                Estabilizando... {stableCount}/{REQUIRED_STABLE_READS}
              </Text>
              <Text style={s.candidateHintSub}>
                Mantenha a câmera parada sobre o código
              </Text>
            </View>
          ) : (
            <Text style={s.hint}>
              Aponte a câmera para o ISBN / EAN do produto e mantenha parada
            </Text>
          )}

          {/* ── Campo de teste manual (visível no emulador) ── */}
          <View style={s.manualRow}>
            <TextInput
              style={s.manualInput}
              placeholder="Digitar ISBN / EAN para testar..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={manualCode}
              onChangeText={setManualCode}
              onSubmitEditing={handleManualSubmit}
              returnKeyType="done"
              keyboardType="number-pad"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[s.manualBtn, !manualCode.trim() && { opacity: 0.4 }]}
              onPress={handleManualSubmit}
              disabled={!manualCode.trim()}
            >
              <Text style={s.manualBtnText}>Bipe</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Dimensões da mira ────────────────────────────────────────────────────────
const W = 270;
const H = 150;
const C = 26;
const CT = 3;
const OC = 'rgba(0,0,0,0.65)';

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1, backgroundColor: Colors.bg,
    justifyContent: 'center', alignItems: 'center',
    gap: Spacing.base, padding: Spacing['2xl'],
  },

  // Header
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: Spacing.base, paddingBottom: Spacing.base,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  closeBtn: { padding: 8 },
  title: { color: '#fff', fontSize: Typography.size.base, fontWeight: Typography.weight.semibold },

  // Overlay
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: OC },
  overlayMiddle: { flexDirection: 'row', height: H },
  overlaySide: { flex: 1, backgroundColor: OC },
  overlayBottom: { flex: 1, backgroundColor: OC },

  // Janela
  window: { width: W, height: H, backgroundColor: 'transparent' },

  // Cantos da mira
  corner: { position: 'absolute', width: C, height: C },
  cTL: { top: 0, left: 0, borderTopWidth: CT, borderLeftWidth: CT, borderTopLeftRadius: 4 },
  cTR: { top: 0, right: 0, borderTopWidth: CT, borderRightWidth: CT, borderTopRightRadius: 4 },
  cBL: { bottom: 0, left: 0, borderBottomWidth: CT, borderLeftWidth: CT, borderBottomLeftRadius: 4 },
  cBR: { bottom: 0, right: 0, borderBottomWidth: CT, borderRightWidth: CT, borderBottomRightRadius: 4 },

  // Barra de estabilidade (dentro da mira)
  stabBarBg: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 4, backgroundColor: 'rgba(255,255,255,0.2)',
  },
  stabBarFill: { height: 4, borderRadius: 2 },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    alignItems: 'center', paddingBottom: 64,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.base,
    backgroundColor: 'rgba(0,0,0,0.55)',
    gap: Spacing.xs,
  },
  hint: { color: 'rgba(255,255,255,0.8)', fontSize: Typography.size.sm, textAlign: 'center' },

  // Candidato em processo de lock
  candidateBox: { alignItems: 'center', gap: 4 },
  candidateCode: {
    color: '#fff', fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold, fontFamily: 'monospace', letterSpacing: 1,
  },
  candidateHint: { color: Colors.warning, fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold },
  candidateHintSub: { color: 'rgba(255,255,255,0.6)', fontSize: Typography.size.xs },

  // Confirmado
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderRadius: Radius.xl, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
  },
  statusText: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold },

  // Permissão
  permTitle: { color: Colors.textPrimary, fontSize: Typography.size.xl, fontWeight: Typography.weight.bold, textAlign: 'center' },
  permSubtitle: { color: Colors.textSecondary, fontSize: Typography.size.sm, textAlign: 'center' },
  permBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.xl,
    paddingHorizontal: Spacing['2xl'], paddingVertical: Spacing.md, marginTop: Spacing.sm,
  },
  permBtnText: { color: '#fff', fontWeight: Typography.weight.bold },
  closeTextBtn: { marginTop: Spacing.sm },
  closeTextBtnText: { color: Colors.textMuted, fontSize: Typography.size.sm },

  // Campo de teste manual (emulador)
  manualRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginTop: Spacing.base, width: '100%',
  },
  manualInput: {
    flex: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: Radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: Spacing.md, color: '#fff',
    fontSize: Typography.size.sm, fontFamily: 'monospace',
  },
  manualBtn: {
    height: 44, paddingHorizontal: Spacing.md, borderRadius: Radius.lg,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  manualBtnText: { color: '#fff', fontWeight: Typography.weight.bold, fontSize: Typography.size.sm },
});

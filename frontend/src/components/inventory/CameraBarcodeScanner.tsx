'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, CameraOff, Flashlight, RefreshCw, X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface CameraBarcodeScannerProps {
  isActive: boolean;
  onScan: (barcode: string) => void;
  onClose: () => void;
  cooldownMs?: number;
}

export default function CameraBarcodeScanner({
  isActive,
  onScan,
  onClose,
  cooldownMs = 1200
}: CameraBarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerIdRef = useRef(`camera-viewport-${Math.random().toString(36).substring(2, 9)}`);
  const containerId = containerIdRef.current;
  
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraIndex, setCameraIndex] = useState<number>(0);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [justScanned, setJustScanned] = useState(false);

  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  // 1. Inicializar ou Parar Scanner conforme `isActive`, `cameraIndex` ou `retryCount`
  useEffect(() => {
    if (!isActive) {
      stopScanner();
      return;
    }

    let isCancelled = false;

    async function startScanner() {
      setIsInitializing(true);
      setPermissionError(null);

      // Aguarda 80ms para certificar que o container DOM já está renderizado no navegador
      await new Promise(r => setTimeout(r, 80));
      if (isCancelled) return;

      try {
        // Para qualquer track residual antes de abrir uma nova sessão da câmera
        await stopScanner();
        if (isCancelled) return;

        // Obter lista de câmeras disponíveis para suporte a alternância
        let availableDevices: MediaDeviceInfo[] = [];
        try {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            availableDevices = devices.map(d => ({
              deviceId: d.id,
              label: d.label || `Câmera ${d.id.substring(0, 5)}`,
              groupId: '',
              kind: 'videoinput' as MediaDeviceKind,
              toJSON: () => ({})
            }));
            setCameras(availableDevices);
          }
        } catch (e) {
          console.warn('[CameraScanner] Não foi possível enumerar câmeras antes do start:', e);
        }

        // Criar instância do Html5Qrcode
        const scanner = new Html5Qrcode(containerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.QR_CODE
          ],
          verbose: false
        });
        scannerRef.current = scanner;

        const scanConfig = {
          fps: 12,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const qrboxWidth = Math.floor(minEdge * 0.85);
            const qrboxHeight = Math.floor(qrboxWidth * 0.55);
            return { width: Math.max(qrboxWidth, 220), height: Math.max(qrboxHeight, 120) };
          },
        };

        // Estratégia de Inicialização Resiliente:
        // Se o usuário alternou para uma câmera específica, usa o deviceId escolhido.
        // No início padrão (cameraIndex === 0), usa { facingMode: "environment" } (traseira nativa do SO).
        // Isso evita "Could not start video source" causado por tentar abrir sensores secundários/macro no Android.
        let started = false;

        if (cameraIndex > 0 && availableDevices[cameraIndex]) {
          try {
            await scanner.start(
              availableDevices[cameraIndex].deviceId,
              scanConfig,
              (decodedText) => handleCodeDetected(decodedText),
              () => {}
            );
            started = true;
          } catch (devErr) {
            console.warn('[CameraScanner] Falha na câmera selecionada, tentando modo padrão...', devErr);
          }
        }

        if (!started) {
          try {
            // Tenta câmera traseira pelo padrão WebRTC (ideal para celulares Android e iPhone)
            await scanner.start(
              { facingMode: 'environment' },
              scanConfig,
              (decodedText) => handleCodeDetected(decodedText),
              () => {}
            );
            started = true;
          } catch (envErr: any) {
            console.warn('[CameraScanner] Falha com facingMode: environment. Tentando fallback...', envErr);
            
            // Fallback 1: Primeira câmera da lista de dispositivos
            if (availableDevices.length > 0) {
              try {
                await scanner.start(
                  availableDevices[0].deviceId,
                  scanConfig,
                  (decodedText) => handleCodeDetected(decodedText),
                  () => {}
                );
                started = true;
              } catch (firstDevErr) {
                console.warn('[CameraScanner] Falha com primeira câmera disponível:', firstDevErr);
              }
            }

            // Fallback 2: Câmera frontal / padrão (notebooks / tablets)
            if (!started) {
              await scanner.start(
                { facingMode: 'user' },
                scanConfig,
                (decodedText) => handleCodeDetected(decodedText),
                () => {}
              );
              started = true;
            }
          }
        }

        // Checar suporte a lanterna
        try {
          const track = scanner.getRunningTrackCameraCapabilities();
          if (track && (track as any).torchFeature && (track as any).torchFeature().isSupported()) {
            setHasTorch(true);
          }
        } catch {
          setHasTorch(false);
        }

      } catch (err: any) {
        console.error('[CameraScanner] Erro ao iniciar câmera:', err);
        const msg = err?.message || String(err || '');
        if (msg.includes('NotAllowedError') || msg.includes('Permission denied') || msg.includes('PermissionDeniedError')) {
          setPermissionError('Permissão da câmera negada. No topo da página (ao lado da barra de endereço), toque no ícone de configurações/cadeado do site e altere a Câmera para "Permitir".');
        } else if (msg.includes('Could not start video source') || msg.includes('NotReadableError') || msg.includes('TrackStartError')) {
          setPermissionError('A câmera do celular não pôde ser iniciada (pode estar em uso por outro aplicativo ou bloqueada pelo sistema). Feche outros apps com câmera aberta e toque em "Tentar Novamente".');
        } else if (msg.includes('OverconstrainedError')) {
          setPermissionError('As resoluções de câmera solicitadas não são suportadas por este aparelho.');
        } else {
          setPermissionError(msg || 'Não foi possível iniciar a câmera neste aparelho.');
        }
      } finally {
        if (!isCancelled) {
          setIsInitializing(false);
        }
      }
    }

    startScanner();

    return () => {
      isCancelled = true;
      stopScanner();
    };
  }, [isActive, cameraIndex, retryCount]);

  // Função para parar com segurança e liberar tracks do hardware
  async function stopScanner() {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.warn('[CameraScanner] Erro ao parar scanner:', err);
      }
      scannerRef.current = null;
    }

    // Libera explicitamente qualquer stream/track de vídeo no DOM
    try {
      const el = document.getElementById(containerId);
      if (el) {
        const videos = el.querySelectorAll('video');
        videos.forEach(v => {
          if (v.srcObject) {
            const stream = v.srcObject as MediaStream;
            stream.getTracks().forEach(t => {
              try { t.stop(); } catch {}
            });
            v.srcObject = null;
          }
        });
      }
    } catch {}

    setIsTorchOn(false);
  }

  // Tratamento de código detectado com debounce inteligente
  function handleCodeDetected(decodedText: string) {
    const raw = decodedText.trim();
    if (!raw) return;

    const now = Date.now();
    const last = lastScanRef.current;

    // Se for o mesmo código dentro do cooldown, ignora para não bipar em rajada
    if (last.code === raw && (now - last.time) < cooldownMs) {
      return;
    }

    // Se for um código diferente, permite com intervalo mínimo de 400ms
    if (last.code !== raw && (now - last.time) < 400) {
      return;
    }

    lastScanRef.current = { code: raw, time: now };

    // Feedback háptico (vibração no celular)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(80);
      } catch {}
    }

    // Feedback visual momentâneo
    setJustScanned(true);
    setTimeout(() => setJustScanned(false), 600);

    // Notificar componente pai
    onScan(raw);
  }

  // Alternar Câmera
  async function handleSwitchCamera() {
    if (cameras.length <= 1) {
      toast.info('Apenas uma câmera detectada neste dispositivo.');
      return;
    }

    const nextIndex = (cameraIndex + 1) % cameras.length;
    await stopScanner();
    setCameraIndex(nextIndex);
  }

  // Alternar Lanterna
  async function handleToggleTorch() {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextState = !isTorchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState }] as any
      });
      setIsTorchOn(nextState);
    } catch (err) {
      toast.error('Não foi possível ativar a lanterna.');
    }
  }

  if (!isActive) return null;

  return (
    <div className="relative rounded-3xl overflow-hidden border-2 border-teal-500/40 bg-slate-950 shadow-xl mb-3">
      {/* Barra de Controles Superiores */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-[11px] font-bold text-teal-400">
            <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
            Câmera Ativa
          </span>

          {cameras.length > 1 && (
            <button
              type="button"
              onClick={handleSwitchCamera}
              className="p-2 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-slate-200 hover:text-white transition-colors cursor-pointer"
              title="Alternar Câmera"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}

          {hasTorch && (
            <button
              type="button"
              onClick={handleToggleTorch}
              className={`p-2 rounded-full backdrop-blur-md border transition-colors cursor-pointer ${
                isTorchOn 
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold' 
                  : 'bg-slate-900/80 text-slate-200 border-slate-700/60 hover:text-white'
              }`}
              title="Lanterna / Flash"
            >
              <Flashlight className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full bg-rose-600/80 hover:bg-rose-600 backdrop-blur-md text-white transition-colors shadow-md cursor-pointer"
          title="Fechar Câmera"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Viewport da Câmera */}
      <div className="relative w-full aspect-[4/3] sm:aspect-[16/9] max-h-[340px] bg-black flex items-center justify-center overflow-hidden">
        <div id={containerId} className="camera-viewport-container w-full h-full object-cover" />

        {/* Mira Visual e Linha Laser Animada */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
          <div 
            className={`relative w-[80%] max-w-[280px] h-[130px] rounded-2xl border-2 transition-all duration-300 ${
              justScanned 
                ? 'border-emerald-400 bg-emerald-500/20 shadow-[0_0_25px_rgba(52,211,153,0.6)] scale-105' 
                : 'border-teal-400/80 shadow-[0_0_15px_rgba(45,212,191,0.25)]'
            }`}
          >
            {/* Cantoneiras */}
            <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-teal-300 rounded-tl-lg" />
            <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-teal-300 rounded-tr-lg" />
            <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-teal-300 rounded-bl-lg" />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-teal-300 rounded-br-lg" />

            {/* Linha Vermelha de Escaneamento Laser */}
            <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_rgba(239,68,68,0.9)] animate-[scan_2s_ease-in-out_infinite]" />
          </div>

          <span className="text-[11px] font-semibold text-slate-300/90 mt-3 drop-shadow bg-black/40 px-3 py-1 rounded-full backdrop-blur-xs">
            Enquadre o código de barras (EAN-13 / ISBN)
          </span>
        </div>

        {/* Loading ou Erro */}
        {isInitializing && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center gap-2.5 z-10 text-slate-300">
            <RefreshCw className="h-7 w-7 animate-spin text-teal-400" />
            <p className="text-xs font-semibold">Iniciando câmera do celular...</p>
          </div>
        )}

        {permissionError && (
          <div className="absolute inset-0 bg-slate-950/95 p-5 flex flex-col items-center justify-center text-center gap-3 z-30">
            <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-500">
              <AlertCircle className="h-7 w-7" />
            </div>
            <h4 className="text-sm font-bold text-white">Acesso à Câmera Bloqueado</h4>
            <p className="text-xs text-slate-400 max-w-xs">{permissionError}</p>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setPermissionError(null);
                  setRetryCount(c => c + 1);
                }}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-xs font-bold text-white transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Tentar Novamente
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors cursor-pointer"
              >
                Usar Modo Leitor Físico
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes scan {
          0%, 100% {
            top: 10%;
          }
          50% {
            top: 85%;
          }
        }
        .camera-viewport-container video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          border-radius: 1.5rem;
        }
      `}</style>
    </div>
  );
}


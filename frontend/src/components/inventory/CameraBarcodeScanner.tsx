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
  const containerId = 'inventory-camera-viewport';
  
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraId, setCurrentCameraId] = useState<string | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [justScanned, setJustScanned] = useState(false);

  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  // 1. Inicializar ou Parar Scanner conforme `isActive`
  useEffect(() => {
    if (!isActive) {
      stopScanner();
      return;
    }

    let isCancelled = false;

    async function startScanner() {
      setIsInitializing(true);
      setPermissionError(null);

      try {
        // Obter câmeras disponíveis
        const devices = await Html5Qrcode.getCameras();
        if (isCancelled) return;

        if (!devices || devices.length === 0) {
          throw new Error('Nenhuma câmera encontrada neste dispositivo.');
        }

        const videoDevices = devices.map(d => ({
          deviceId: d.id,
          label: d.label,
          groupId: '',
          kind: 'videoinput' as MediaDeviceKind,
          toJSON: () => ({})
        }));
        setCameras(videoDevices);

        // Preferir câmera traseira (environment)
        const backCamera = devices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('traseira') ||
          d.label.toLowerCase().includes('environment')
        ) || devices[devices.length - 1]; // Geralmente a última é traseira em mobile

        const chosenId = currentCameraId || backCamera.id;
        setCurrentCameraId(chosenId);

        // Criar instância do Html5Qrcode
        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode(containerId, {
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
        }

        const scanner = scannerRef.current;

        await scanner.start(
          chosenId,
          {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              // Caixa retangular otimizada para código de barras (ISBN/EAN)
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const qrboxWidth = Math.floor(minEdge * 0.85);
              const qrboxHeight = Math.floor(qrboxWidth * 0.55);
              return { width: Math.max(qrboxWidth, 220), height: Math.max(qrboxHeight, 130) };
            },
            aspectRatio: 1.0
          },
          (decodedText) => {
            handleCodeDetected(decodedText);
          },
          () => {
            // Callback contínuo de frame não decodificado (ignorar)
          }
        );

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
        const msg = err?.message || 'Falha ao acessar a câmera.';
        if (msg.includes('NotAllowedError') || msg.includes('Permission denied')) {
          setPermissionError('Permissão da câmera negada. Habilite o acesso nas permissões do navegador.');
        } else {
          setPermissionError(msg);
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
  }, [isActive, currentCameraId]);

  // Função para parar com segurança
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

    const currentIndex = cameras.findIndex(c => c.deviceId === currentCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamera = cameras[nextIndex];

    await stopScanner();
    setCurrentCameraId(nextCamera.deviceId);
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
              className="p-2 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-slate-200 hover:text-white transition-colors"
              title="Alternar Câmera"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}

          {hasTorch && (
            <button
              type="button"
              onClick={handleToggleTorch}
              className={`p-2 rounded-full backdrop-blur-md border transition-colors ${
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
          className="p-2 rounded-full bg-rose-600/80 hover:bg-rose-600 backdrop-blur-md text-white transition-colors shadow-md"
          title="Desligar Câmera"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Viewport da Câmera */}
      <div className="relative w-full aspect-[4/3] sm:aspect-[16/9] max-h-[340px] bg-black flex items-center justify-center overflow-hidden">
        <div id={containerId} className="w-full h-full object-cover" />

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
            <button
              type="button"
              onClick={onClose}
              className="mt-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-colors"
            >
              Usar Modo Leitor Físico
            </button>
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
        #inventory-camera-viewport video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          border-radius: 1.5rem;
        }
      `}</style>
    </div>
  );
}

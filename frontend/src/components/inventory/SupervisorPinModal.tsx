'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, KeyRound, Loader2, X, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface SupervisorPinModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  onConfirm: (pin: string) => Promise<void>;
}

export default function SupervisorPinModal({
  isOpen,
  title = "Senha do Supervisor Necessária",
  description = "Informe a senha do supervisor do inventário para autorizar a manutenção deste registro.",
  onClose,
  onConfirm
}: SupervisorPinModalProps) {
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pinClean = pinInput.trim();
    if (!pinClean) {
      toast.error('Informe a senha do supervisor.');
      return;
    }

    setLoading(true);
    try {
      await onConfirm(pinClean);
      setPinInput('');
    } catch (err: any) {
      toast.error(err.message || 'Senha do Supervisor incorreta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl max-w-sm w-full p-6 space-y-5"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div className="relative">
            <KeyRound className="h-5 w-5 absolute left-3.5 top-3.5 text-amber-500" />
            <input
              type={showPin ? "text" : "password"}
              name="supervisor_pin_no_save"
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore="true"
              autoFocus
              required
              placeholder="Digite a senha (PIN)..."
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full pl-11 pr-11 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono font-bold text-base tracking-widest focus:outline-none focus:border-amber-500"
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title={showPin ? "Ocultar senha" : "Ver senha"}
            >
              {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Autorizar Manutenção
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

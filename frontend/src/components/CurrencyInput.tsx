'use client';

import React, { useState, useEffect, useRef } from 'react';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChangeValue: (value: number) => void;
  prefixStr?: string;
  suffixStr?: string;
  maxDecimals?: number;
}

function toBR(n: number, dec = 2): string {
  return (n ?? 0).toLocaleString('pt-BR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fromBR(s: string): number {
  const clean = s.replace(/[^\d,.]/g, '');
  if (!clean) return 0;
  let norm = clean.includes(',')
    ? clean.replace(/\./g, '').replace(',', '.')
    : clean.replace(/\./g, '');
  const n = parseFloat(norm);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

export function CurrencyInput({
  value,
  onChangeValue,
  prefixStr = '',
  suffixStr = '',
  maxDecimals = 2,
  className,
  disabled,
  ...props
}: CurrencyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // lastExternal: último valor que veio de fora (props). Usado para detectar
  // atualização externa real (ex: fetchDetails após save) vs mudança local.
  const lastExternal = useRef<number>(value ?? 0);
  const [text, setText] = useState(() => `${prefixStr}${toBR(value ?? 0, maxDecimals)}${suffixStr}`);

  // Sincroniza SOMENTE quando o valor externo muda de fora
  // (ex: após fetchDetails, após save bem-sucedido).
  // Não roda enquanto o usuário está editando, porque lastExternal
  // é atualizado no onBlur ANTES que o re-render do pai chegue.
  useEffect(() => {
    if (value !== lastExternal.current) {
      lastExternal.current = value;
      setText(`${prefixStr}${toBR(value ?? 0, maxDecimals)}${suffixStr}`);
    }
  }, [value, prefixStr, suffixStr, maxDecimals]);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      className={className}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => requestAnimationFrame(() => inputRef.current?.select())}
      onBlur={() => {
        const parsed = fromBR(text);
        const formatted = `${prefixStr}${toBR(parsed, maxDecimals)}${suffixStr}`;
        setText(formatted);
        // Atualiza lastExternal para que o useEffect não sobrescreva com
        // o valor antigo quando o re-render do pai chegar com o novo valor
        lastExternal.current = parsed;
        onChangeValue(parsed);
      }}
      {...props}
    />
  );
}

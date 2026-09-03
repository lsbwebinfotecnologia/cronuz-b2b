'use client';

import React, { useState, useEffect, useRef } from 'react';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChangeValue: (value: number) => void;
  prefixStr?: string;
  suffixStr?: string;
  maxDecimals?: number;
}

// Fora do componente — sem re-criação a cada render
function formatBR(n: number, decimals = 2): string {
  return (n ?? 0).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function parseBR(s: string, prefixStr = '', suffixStr = ''): number {
  // Remove prefix/suffix e espaços
  let clean = s;
  if (prefixStr) clean = clean.replace(prefixStr, '');
  if (suffixStr) clean = clean.replace(suffixStr, '');
  clean = clean.trim();

  // Remove tudo exceto dígitos, vírgula e ponto
  clean = clean.replace(/[^\d,.]/g, '');
  if (!clean) return 0;

  let normalized: string;
  if (clean.includes(',')) {
    // vírgula = separador decimal; pontos = milhar → "1.234,56" → "1234.56"
    normalized = clean.replace(/\./g, '').replace(',', '.');
  } else if ((clean.match(/\./g) || []).length === 1) {
    // único ponto = decimal → "950.50"
    normalized = clean;
  } else {
    // múltiplos pontos sem vírgula = milhar → "1.350" → "1350"
    normalized = clean.replace(/\./g, '');
  }

  const result = parseFloat(normalized);
  return isNaN(result) ? 0 : Math.round(result * 100) / 100;
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
  const isFocused = useRef(false);

  const display = (n: number) =>
    `${prefixStr}${formatBR(n, maxDecimals)}${suffixStr}`;

  const [text, setText] = useState(() => display(value ?? 0));

  // Sincroniza com valor externo SOMENTE quando o campo não está focado
  useEffect(() => {
    if (!isFocused.current) {
      setText(display(value ?? 0));
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
      onChange={(e) => {
        // Apenas atualiza o display — parse ocorre somente no onBlur
        setText(e.target.value);
      }}
      onFocus={() => {
        isFocused.current = true;
        requestAnimationFrame(() => inputRef.current?.select());
      }}
      onBlur={() => {
        isFocused.current = false;
        const parsed = parseBR(text, prefixStr, suffixStr);
        setText(display(parsed));
        onChangeValue(parsed);
      }}
      {...props}
    />
  );
}

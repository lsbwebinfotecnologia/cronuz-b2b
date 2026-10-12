'use client';

import React, { useState, useEffect, useRef } from 'react';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChangeValue: (value: number) => void;
  prefixStr?: string;
  suffixStr?: string;
  maxDecimals?: number;
  allowEmpty?: boolean;
  max?: number;
}

function formatBR(n: number, dec = 2): string {
  return (n ?? 0).toLocaleString('pt-BR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

export function CurrencyInput({
  value,
  onChangeValue,
  prefixStr = '',
  suffixStr = '',
  maxDecimals = 2,
  allowEmpty = false,
  max,
  className,
  disabled,
  ...props
}: CurrencyInputProps) {

  const isFocused = useRef(false);
  // Rastreia o último valor numérico vindo de fora (props).
  // Atualizado tanto pelo useEffect (valor externo real) quanto
  // pelo onChange (digitação), para evitar o ciclo de reset.
  const lastExternal = useRef<number>(value ?? 0);

  const fmt = (n: number) => {
    if (allowEmpty && (n === 0 || n === undefined || n === null)) {
      return '';
    }
    return `${prefixStr}${formatBR(n, maxDecimals)}${suffixStr}`;
  };

  const [text, setText] = useState(() => fmt(value ?? 0));

  // Sincroniza quando o valor externo muda de verdade
  useEffect(() => {
    if (!isFocused.current && value !== lastExternal.current) {
      lastExternal.current = value;
      setText(fmt(value ?? 0));
    }
  }, [value, prefixStr, suffixStr, maxDecimals, allowEmpty]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Remove não-dígitos e divide por 10^decimais
    const raw = e.target.value.replace(/\D/g, '');

    if (raw === '') {
      setText('');
      lastExternal.current = 0;
      onChangeValue(0);
      return;
    }

    const divisor = Math.pow(10, maxDecimals);
    let num = Number(raw) / divisor;
    if (max !== undefined && num > max) {
      num = max;
    }

    lastExternal.current = num; // previne useEffect de sobrescrever
    setText(fmt(num));
    onChangeValue(num);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      disabled={disabled}
      className={className}
      onFocus={() => { isFocused.current = true; }}
      onBlur={() => {
        isFocused.current = false;
        if (!text.trim()) {
          if (!allowEmpty) {
            setText(fmt(0));
          }
          lastExternal.current = 0;
          onChangeValue(0);
        }
      }}
      onChange={handleChange}
      {...props}
    />
  );
}

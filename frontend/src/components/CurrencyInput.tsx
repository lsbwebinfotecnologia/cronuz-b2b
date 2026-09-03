'use client';

import React, { useState, useEffect, useRef } from 'react';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChangeValue: (value: number) => void;
  prefixStr?: string;
  suffixStr?: string;
  maxDecimals?: number;
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
  className,
  disabled,
  ...props
}: CurrencyInputProps) {
  const isFocused = useRef(false);
  // Rastreia o último valor numérico vindo de fora (props).
  // Atualizado tanto pelo useEffect (valor externo real) quanto
  // pelo onChange (digitação), para evitar o ciclo de reset.
  const lastExternal = useRef<number>(value ?? 0);

  const fmt = (n: number) => `${prefixStr}${formatBR(n, maxDecimals)}${suffixStr}`;

  const [text, setText] = useState(() => fmt(value ?? 0));

  // Sincroniza quando o valor externo muda de verdade
  // (ex: fetchDetails, save bem-sucedido).
  // Se o valor que chegou é o que acabamos de enviar (lastExternal),
  // não sobrescreve — evita o ciclo stale.
  useEffect(() => {
    if (!isFocused.current && value !== lastExternal.current) {
      lastExternal.current = value;
      setText(fmt(value ?? 0));
    }
  }, [value, prefixStr, suffixStr, maxDecimals]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Máscara automática estilo "caixa registradora":
    // remove não-dígitos e divide por 10^decimais.
    // Ex: digitar "1", "3", "5", "0", "0", "0" → "1.350,00"
    const raw = e.target.value.replace(/\D/g, '');

    if (raw === '') {
      setText('');
      lastExternal.current = 0;
      onChangeValue(0);
      return;
    }

    const divisor = Math.pow(10, maxDecimals);
    const num = Number(raw) / divisor;
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
        // Se o campo ficou vazio (usuário apagou tudo sem digitar nada),
        // exibe "0,00" ao sair
        if (!text.trim()) {
          setText(fmt(0));
          lastExternal.current = 0;
          onChangeValue(0);
        }
      }}
      onChange={handleChange}
      {...props}
    />
  );
}

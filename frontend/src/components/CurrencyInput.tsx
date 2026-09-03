'use client';

import React, { useState, useEffect, useRef, ChangeEvent } from 'react';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChangeValue: (value: number) => void;
  prefixStr?: string;
  suffixStr?: string;
  maxDecimals?: number;
}

export function CurrencyInput({
  value,
  onChangeValue,
  prefixStr = '',
  suffixStr = '',
  maxDecimals = 2,
  className,
  ...props
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState('');
  const isFocused = useRef(false);

  const formatNumber = (num: number) =>
    new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: maxDecimals,
      maximumFractionDigits: maxDecimals,
    }).format(num);

  // Sincroniza com o valor externo SOMENTE quando o campo NÃO está focado.
  // Evita sobrescrever o que o usuário está digitando.
  useEffect(() => {
    if (isFocused.current) return;

    if (value !== undefined && value !== null && typeof value === 'number') {
      setDisplayValue(`${prefixStr}${formatNumber(value)}${suffixStr}`);
    } else {
      setDisplayValue('');
    }
  }, [value, prefixStr, suffixStr, maxDecimals]);

  const handleFocus = () => {
    isFocused.current = true;
  };

  const handleBlur = () => {
    isFocused.current = false;
    // Ao sair do campo, formata o valor final corretamente
    if (value !== undefined && value !== null && typeof value === 'number') {
      setDisplayValue(`${prefixStr}${formatNumber(value)}${suffixStr}`);
    } else {
      setDisplayValue('');
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    let rawValue = e.target.value;

    // Remove tudo que não for número
    rawValue = rawValue.replace(/\D/g, '');

    // Campo apagado → zera o valor mas mantém display vazio para o usuário digitar
    if (rawValue === '') {
      onChangeValue(0);
      setDisplayValue('');
      return;
    }

    // Campo formatado: divide por 10^decimais
    // ex: digitou "95000" → 950,00
    const divisor = Math.pow(10, maxDecimals);
    const numValue = Number(rawValue) / divisor;

    setDisplayValue(`${prefixStr}${formatNumber(numValue)}${suffixStr}`);
    onChangeValue(numValue);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
      {...props}
    />
  );
}

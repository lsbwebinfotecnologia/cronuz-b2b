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
  // Guarda o valor numérico atual DENTRO do componente para não depender
  // do ciclo de re-render do pai no handleBlur
  const internalValue = useRef<number>(value ?? 0);

  const formatNumber = (num: number) =>
    new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: maxDecimals,
      maximumFractionDigits: maxDecimals,
    }).format(num);

  // Sincroniza com o valor externo SOMENTE quando o campo NÃO está focado.
  useEffect(() => {
    if (isFocused.current) return;
    internalValue.current = value ?? 0;
    setDisplayValue(
      value !== undefined && value !== null
        ? `${prefixStr}${formatNumber(value)}${suffixStr}`
        : ''
    );
  }, [value, prefixStr, suffixStr, maxDecimals]);

  const handleFocus = () => {
    isFocused.current = true;
  };

  const handleBlur = () => {
    isFocused.current = false;
    // Usa internalValue.current (atualizado a cada digitação) — nunca stale
    setDisplayValue(`${prefixStr}${formatNumber(internalValue.current)}${suffixStr}`);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, '');

    if (rawValue === '') {
      internalValue.current = 0;
      onChangeValue(0);
      setDisplayValue('');
      return;
    }

    const divisor = Math.pow(10, maxDecimals);
    const numValue = Number(rawValue) / divisor;

    internalValue.current = numValue;
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

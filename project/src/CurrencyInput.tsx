import { formatMoneyInput } from '@/lib/format';
import type { FocusEvent } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  min?: number;
  max?: number;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  'aria-label'?: string;
};

export default function CurrencyInput({ value, onChange, className = '', placeholder, required, min, max, onBlur, 'aria-label': ariaLabel }: Props) {
  return <input
    type="text"
    inputMode="decimal"
    value={value}
    onChange={(event) => onChange(formatMoneyInput(event.target.value))}
    placeholder={placeholder}
    required={required}
    onBlur={onBlur}
    aria-label={ariaLabel}
    className={className}
    data-min={min}
    data-max={max}
  />;
}

import { createElement, useSyncExternalStore } from 'react';
import { Eye, EyeOff } from 'lucide-react';

let privacyEnabled = true;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return privacyEnabled;
}

export function setFinancialPrivacy(enabled: boolean) {
  if (privacyEnabled === enabled) return;
  privacyEnabled = enabled;
  listeners.forEach((listener) => listener());
}

export function useFinancialPrivacy() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function maskFinancialValue(value: string) {
  return privacyEnabled ? '••••••' : value;
}

export function FinancialPrivacyToggle() {
  const enabled = useFinancialPrivacy();
  const Icon = enabled ? Eye : EyeOff;
  const label = enabled ? 'Reveal financial values' : 'Hide financial values';

  return createElement('button', {
    type: 'button',
    onClick: () => setFinancialPrivacy(!enabled),
    'aria-label': label,
    'aria-pressed': !enabled,
    title: label,
    className: 'flex h-9 w-9 items-center justify-center rounded-md border border-[#c9c5bd] text-slate-600 transition-colors hover:bg-white hover:text-[#087f88]',
  }, createElement(Icon, { size: 17, 'aria-hidden': true }));
}
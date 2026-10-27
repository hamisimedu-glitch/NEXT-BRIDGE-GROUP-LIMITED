import { AlertTriangle, CircleHelp, LockKeyhole, RefreshCw, type LucideIcon } from 'lucide-react';
import './workspace-states.css';

type NbgLoaderProps = {
  message?: string;
  compact?: boolean;
};

type FeatureStateProps = {
  kind: 'error' | 'restricted' | 'unavailable';
  eyebrow?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

const stateIcons: Record<FeatureStateProps['kind'], LucideIcon> = {
  error: AlertTriangle,
  restricted: LockKeyhole,
  unavailable: CircleHelp,
};

export function NbgLoader({ message = 'Preparing your workspace', compact = false }: NbgLoaderProps) {
  return <div className={`nbg-loader${compact ? ' nbg-loader-compact' : ''}`} role="status" aria-live="polite" aria-busy="true">
    <span className="nbg-loader-mark" aria-hidden="true">
      <span className="nbg-loader-orbit" />
      <img src="/NBG_LOGO-removebg-preview.png" alt="" />
    </span>
    <span className="nbg-loader-copy">
      <strong>Next Bridge</strong>
      <span>{message}</span>
      <span className="nbg-loader-track" aria-hidden="true"><span /></span>
    </span>
  </div>;
}

export function FeatureState({ kind, eyebrow, title, description, actionLabel, onAction, secondaryActionLabel, onSecondaryAction }: FeatureStateProps) {
  const Icon = stateIcons[kind];
  return <section className={`nbg-feature-state nbg-feature-${kind}`} role={kind === 'error' ? 'alert' : 'status'} aria-live={kind === 'error' ? 'assertive' : 'polite'}>
    <span className="nbg-feature-icon" aria-hidden="true"><Icon size={20} /></span>
    <div className="nbg-feature-copy">
      {eyebrow && <p className="nbg-feature-eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>
      <p>{description}</p>
      {(actionLabel && onAction || secondaryActionLabel && onSecondaryAction) && <div className="nbg-feature-actions">
        {actionLabel && onAction && <button type="button" onClick={onAction} className="nbg-feature-action">{kind === 'error' ? <RefreshCw size={14} /> : <LockKeyhole size={14} />}{actionLabel}</button>}
        {secondaryActionLabel && onSecondaryAction && <button type="button" onClick={onSecondaryAction} className="nbg-feature-secondary">{secondaryActionLabel}</button>}
      </div>}
    </div>
  </section>;
}
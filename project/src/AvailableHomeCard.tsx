import { useState } from 'react';
import { ArrowRight, BedDouble, Heart, MapPin, Ruler } from 'lucide-react';

type AvailableHomeCardProps = {
  unitNumber: string;
  projectName?: string | null;
  location?: string | null;
  type?: string | null;
  status: string;
  availabilityNote?: string | null;
  price?: string | null;
  bedrooms?: number | null;
  size?: string | null;
  imageUrl?: string | null;
  allowUnavailable?: boolean;
  onSelect: () => void;
};

export default function AvailableHomeCard({ unitNumber, projectName, location, type, status, availabilityNote, price, bedrooms, size, imageUrl, allowUnavailable = false, onSelect }: AvailableHomeCardProps) {
  const [saved, setSaved] = useState(false);
  const isAvailable = status === 'AVAILABLE';
  const statusLabel = availabilityNote || (status === 'SOLD' ? 'Sold Out' : status === 'RESERVED' ? 'Reserved' : 'Available');
  const canSelect = isAvailable || allowUnavailable;

  return <article className="homes-card">
    <div className="homes-card-image">
      <img src={imageUrl || '/NBG HERO.png'} alt={`${projectName || type || 'Home'}, Unit ${unitNumber}`} />
      <span className={`homes-status homes-status-${status.toLowerCase()}`}>{statusLabel}</span>
      <button type="button" className={`homes-favorite ${saved ? 'is-favorite' : ''}`} aria-label={saved ? 'Remove from saved homes' : 'Save home'} aria-pressed={saved} onClick={() => setSaved((current) => !current)}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /></button>
    </div>
    <div className="homes-card-body">
      <p className="homes-location"><MapPin size={12} /> {location || 'Coastal Kenya'}</p>
      <h3>{projectName || type || 'Residence'}</h3>
      <div className="homes-card-price"><span>From <strong>{price || 'Price on request'}</strong></span><span>{type || 'Residence'}</span></div>
      <div className="homes-card-details"><span><BedDouble size={13} /> {bedrooms ?? '—'} Bedrooms</span><span><Ruler size={13} /> {size || 'Size on request'}</span></div>
      <p className="homes-unit-number">Unit {unitNumber}</p>
      <button type="button" onClick={onSelect} disabled={!canSelect} className="homes-details-button">{canSelect ? <>View details <ArrowRight size={14} /></> : statusLabel}</button>
    </div>
  </article>;
}
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'VIEWING_BOOKED' | 'NEGOTIATING' | 'CONVERTED' | 'LOST';
export type UnitStatus = 'AVAILABLE' | 'RESERVED' | 'SOLD';
export type SaleStatus = 'RESERVED' | 'DEPOSIT_PAID' | 'COMPLETED' | 'CANCELLED';
export type ProjectStatus = 'COMING SOON' | 'UNDER CONSTRUCTION' | 'COMPLETED' | 'PLANNING';
export type RealtorStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';
export type CommissionStatus = 'PENDING' | 'APPROVED' | 'PAID';
export type InvestmentStatus = 'INQUIRY' | 'SOFT_COMMIT' | 'COMMITTED' | 'WITHDRAWN';
export type AuditLog = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  category: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
};

export type Lead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  project: string | null;
  unit: string | null;
  apartment_type: string | null;
  source: string | null;
  message: string | null;
  status: string;
  assigned_consultant: string | null;
  notes: string | null;
  priority: string;
  next_action: string | null;
  next_action_at: string | null;
  last_contacted_at: string | null;
  created_at: string;
};

export type Project = {
  id: string;
  name: string;
  location: string | null;
  status: string;
  description: string | null;
  image_url: string | null;
  is_published: boolean;
  created_at: string;
};

export type ProjectUnit = {
  id: string;
  project_id: string | null;
  unit_number: string;
  type: string | null;
  bedrooms: number | null;
  size: string | null;
  floor: string | null;
  parking: string | null;
  view: string | null;
  price: string | null;
  status: string;
  image_url: string | null;
  is_published: boolean;
  created_at: string;
};

export type Sale = {
  id: string;
  unit_number: string;
  buyer_name: string;
  buyer_phone: string | null;
  buyer_email: string | null;
  sale_price: number | null;
  status: string;
  sale_date: string | null;
  notes: string | null;
  deposit_amount: number;
  installment_count: number;
  installment_frequency: string;
  created_at: string;
};

export type BuyerInstallment = {
  id: string;
  sale_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  status: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
};

export type ConstructionUpdate = {
  id: string;
  project_id: string | null;
  title: string;
  body: string | null;
  progress_pct: number;
  image_url: string | null;
  posted_at: string;
  created_at: string;
};

export type Realtor = {
  id: string;
  user_id?: string | null;
  name: string;
  email: string;
  phone: string | null;
  id_number: string | null;
  status: string;
  commission_rate: number;
  total_earned: number;
  joined_at: string;
  notes: string | null;
  created_at: string;
};

export type Commission = {
  id: string;
  sale_id: string | null;
  realtor_id: string | null;
  amount: number;
  rate: number;
  status: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
};

export type Investment = {
  id: string;
  investor_name: string;
  investor_email: string | null;
  investor_phone: string | null;
  project_id: string | null;
  amount_interested: number | null;
  currency: string;
  status: string;
  notes: string | null;
  created_at: string;
};

export const LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING_BOOKED', 'NEGOTIATING', 'CONVERTED', 'LOST'];
export const UNIT_STATUSES: UnitStatus[] = ['AVAILABLE', 'RESERVED', 'SOLD'];
export const SALE_STATUSES: SaleStatus[] = ['RESERVED', 'DEPOSIT_PAID', 'COMPLETED', 'CANCELLED'];
export const PROJECT_STATUSES: ProjectStatus[] = ['COMING SOON', 'UNDER CONSTRUCTION', 'COMPLETED', 'PLANNING'];
export const REALTOR_STATUSES: RealtorStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED'];
export const COMMISSION_STATUSES: CommissionStatus[] = ['PENDING', 'APPROVED', 'PAID'];
export const INVESTMENT_STATUSES: InvestmentStatus[] = ['INQUIRY', 'SOFT_COMMIT', 'COMMITTED', 'WITHDRAWN'];

export const LEAD_STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-[#dceeea] text-[#3a6f69]',
  CONTACTED: 'bg-[#e6e2da] text-[#5a564d]',
  QUALIFIED: 'bg-[#f2e7c9] text-[#856b2e]',
  VIEWING_BOOKED: 'bg-[#d4e8f5] text-[#2e5f7a]',
  NEGOTIATING: 'bg-[#f5e0d4] text-[#7a4e2e]',
  CONVERTED: 'bg-[#d4f0dc] text-[#2e6b3e]',
  LOST: 'bg-[#f5d4d4] text-[#7a2e2e]',
};

export const SALE_STATUS_COLORS: Record<string, string> = {
  RESERVED: 'bg-[#f2e7c9] text-[#856b2e]',
  DEPOSIT_PAID: 'bg-[#d4e8f5] text-[#2e5f7a]',
  COMPLETED: 'bg-[#d4f0dc] text-[#2e6b3e]',
  CANCELLED: 'bg-[#f5d4d4] text-[#7a2e2e]',
};

export const REALTOR_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-[#f2e7c9] text-[#856b2e]',
  ACTIVE: 'bg-[#d4f0dc] text-[#2e6b3e]',
  SUSPENDED: 'bg-[#f5d4d4] text-[#7a2e2e]',
};

export const COMMISSION_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-[#f2e7c9] text-[#856b2e]',
  APPROVED: 'bg-[#d4e8f5] text-[#2e5f7a]',
  PAID: 'bg-[#d4f0dc] text-[#2e6b3e]',
};

export const INVESTMENT_STATUS_COLORS: Record<string, string> = {
  INQUIRY: 'bg-[#e6e2da] text-[#5a564d]',
  SOFT_COMMIT: 'bg-[#f2e7c9] text-[#856b2e]',
  COMMITTED: 'bg-[#d4f0dc] text-[#2e6b3e]',
  WITHDRAWN: 'bg-[#f5d4d4] text-[#7a2e2e]',
};

export function fmtKes(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `KSh ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

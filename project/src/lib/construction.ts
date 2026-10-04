export type ConstructionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export type ConstructionLevel = {
  number: number;
  label: string;
  status: ConstructionStatus;
};

export type ConstructionMilestone = {
  id: string;
  title: string;
  weight: number;
  status: ConstructionStatus;
};

export type ConstructionMedia = {
  url: string;
  type: 'image' | 'video';
  caption: string;
};

export type InvestmentInformation = {
  developmentStage: string;
  unitSummary: string;
  minimumInvestment: string;
  investmentTimeline: string;
  useOfFunds: string;
  projectBudget: string;
  developmentCosts: string;
  fundingRequirements: string;
  participationStructure: string;
  risks: string;
  fees: string;
  distributions: string;
  legalInformation: string;
  requiredDocuments: string;
};

export type ConstructionPlanData = {
  totalFloors: number;
  floorWeight: number;
  floors: ConstructionLevel[];
  milestones: ConstructionMilestone[];
  currentPhase: string;
  progressNote: string;
  media: ConstructionMedia[];
  timeline: string;
  investment: InvestmentInformation;
};

export type PublishedConstructionProgress = {
  project_id: string;
  total_floors: number;
  data: ConstructionPlanData;
  published_at: string;
  updated_at: string;
};

export const DEFAULT_MILESTONES: Omit<ConstructionMilestone, 'status'>[] = [
  { id: 'site-preparation', title: 'Site preparation', weight: 3 },
  { id: 'foundation', title: 'Foundation', weight: 10 },
  { id: 'ground-works', title: 'Ground works', weight: 5 },
  { id: 'structural-framework', title: 'Structural framework', weight: 20 },
  { id: 'floor-slabs', title: 'Floor slab completion', weight: 12 },
  { id: 'walls', title: 'Wall construction', weight: 8 },
  { id: 'roofing', title: 'Roofing', weight: 6 },
  { id: 'plumbing', title: 'Plumbing', weight: 5 },
  { id: 'electrical', title: 'Electrical installation', weight: 5 },
  { id: 'windows-doors', title: 'Windows and doors', weight: 4 },
  { id: 'internal-plastering', title: 'Internal plastering', weight: 4 },
  { id: 'external-finishing', title: 'External finishing', weight: 4 },
  { id: 'flooring', title: 'Flooring', weight: 3 },
  { id: 'painting', title: 'Painting', weight: 3 },
  { id: 'kitchen', title: 'Kitchen installation', weight: 2 },
  { id: 'bathroom', title: 'Bathroom installation', weight: 2 },
  { id: 'furnishing', title: 'Furnishing', weight: 1 },
  { id: 'landscaping', title: 'Landscaping', weight: 1 },
  { id: 'final-inspection', title: 'Final inspection', weight: 1 },
  { id: 'handover', title: 'Handover / completion', weight: 1 },
];

export const EMPTY_INVESTMENT_INFORMATION: InvestmentInformation = {
  developmentStage: '',
  unitSummary: '',
  minimumInvestment: '',
  investmentTimeline: '',
  useOfFunds: '',
  projectBudget: '',
  developmentCosts: '',
  fundingRequirements: '',
  participationStructure: '',
  risks: '',
  fees: '',
  distributions: '',
  legalInformation: '',
  requiredDocuments: '',
};

export function floorLabel(number: number) {
  if (number === 0) return 'Ground Floor';
  const remainder = number % 100;
  const suffix = remainder >= 11 && remainder <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[number % 10] || 'th';
  return `${number}${suffix} Floor`;
}

export function createConstructionPlan(totalFloors: number): ConstructionPlanData {
  const floorCount = Math.max(1, Math.min(250, Math.floor(totalFloors)));
  return {
    totalFloors: floorCount,
    floorWeight: 20,
    floors: Array.from({ length: floorCount }, (_, number) => ({ number, label: floorLabel(number), status: 'PENDING' })),
    milestones: DEFAULT_MILESTONES.map((milestone) => ({ ...milestone, status: 'PENDING' })),
    currentPhase: '',
    progressNote: '',
    media: [],
    timeline: '',
    investment: { ...EMPTY_INVESTMENT_INFORMATION },
  };
}

export function resizeConstructionPlan(plan: ConstructionPlanData, totalFloors: number): ConstructionPlanData {
  const floorCount = Math.max(1, Math.min(250, Math.floor(totalFloors)));
  const existingFloors = new Map(plan.floors.map((floor) => [floor.number, floor]));
  return {
    ...plan,
    totalFloors: floorCount,
    floors: Array.from({ length: floorCount }, (_, number) => ({
      ...(existingFloors.get(number) ?? { number, status: 'PENDING' as const }),
      number,
      label: floorLabel(number),
    })),
  };
}

export function calculateConstructionProgress(plan: ConstructionPlanData) {
  const milestoneWeight = plan.milestones.reduce((total, milestone) => total + Math.max(0, milestone.weight), 0);
  const floorWeight = Math.max(0, plan.floorWeight);
  const totalWeight = milestoneWeight + floorWeight;
  if (!totalWeight) return 0;

  const statusValue = (status: ConstructionStatus) => status === 'COMPLETED' ? 1 : status === 'IN_PROGRESS' ? 0.5 : 0;
  const milestoneProgress = plan.milestones.reduce((total, milestone) => total + Math.max(0, milestone.weight) * statusValue(milestone.status), 0);
  const floorProgress = plan.floors.reduce((total, floor) => total + statusValue(floor.status), 0) / Math.max(1, plan.floors.length) * floorWeight;
  return Math.min(100, Math.max(0, Math.round((milestoneProgress + floorProgress) / totalWeight * 100)));
}

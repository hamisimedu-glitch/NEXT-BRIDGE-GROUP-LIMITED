export type DocumentType =
  | 'AGREEMENT'
  | 'RECEIPT'
  | 'QUOTATION'
  | 'PURCHASE_ORDER'
  | 'SUPPLIER_INVOICE'
  | 'PAYMENT_VOUCHER'
  | 'DELIVERY_NOTE'
  | 'CONSTRUCTION_CONTRACT'
  | 'BROCHURE'
  | 'FLOOR_PLAN';

export type DocumentWorkflow = readonly string[];
export type DocumentFieldType = 'text' | 'date' | 'number' | 'textarea' | 'select' | 'boolean' | 'items';
export type DocumentFieldSource = 'SYSTEM_FETCHED' | 'SELECT' | 'AUTO_PREFILLED' | 'MANUAL' | 'HARDCODED' | 'CONDITIONAL';
export type DocumentField = { key: string; label: string; type: string; sourceType?: DocumentFieldSource; required?: boolean; options?: readonly string[]; help?: string };

export type DocumentTemplate = {
  type: DocumentType;
  label: string;
  prefix: string;
  purpose: string;
  workflow: DocumentWorkflow;
  roles: readonly string[];
  fields: readonly DocumentField[];
  relationships: readonly string[];
  validate: (data: Record<string, unknown>) => string[];
};

const required = (data: Record<string, unknown>, keys: string[]): string[] => keys.filter((key) => !String(data[key] ?? '').trim()).map((key) => `${key} is required.`);
const positive = (data: Record<string, unknown>, keys: string[]): string[] => keys.filter((key) => data[key] != null && Number(data[key]) < 0).map((key) => `${key} cannot be negative.`);
const items = (data: Record<string, unknown>, key: string): string[] => Array.isArray(data[key]) && data[key].length > 0 ? [] : [`At least one ${key} line is required.`];
const scheduleTotal = (data: Record<string, unknown>): string => {
  const price = Number(data.total_purchase_price || 0);
  const schedule = Array.isArray(data.payment_schedule) ? data.payment_schedule.reduce((sum, item) => sum + Number((item as { amount?: number }).amount || 0), 0) : 0;
  return price > 0 && Math.abs(price - schedule) > 0.01 ? 'Payment schedule total must equal the total agreement price.' : '';
};

const commonPropertyFields: DocumentField[] = [
  { key: 'project_id', label: 'Project', type: 'select', sourceType: 'SELECT', required: true },
  { key: 'property_reference', label: 'Property reference', type: 'text', sourceType: 'SYSTEM_FETCHED', required: true },
  { key: 'county', label: 'County', type: 'text', sourceType: 'AUTO_PREFILLED' },
  { key: 'sub_county', label: 'Sub-county', type: 'text', sourceType: 'AUTO_PREFILLED' },
  { key: 'town', label: 'Town', type: 'text', sourceType: 'AUTO_PREFILLED' },
  { key: 'locality', label: 'Locality', type: 'text', sourceType: 'AUTO_PREFILLED' },
  { key: 'estate_area', label: 'Estate / area', type: 'text', sourceType: 'AUTO_PREFILLED' },
  { key: 'plot_lr_number', label: 'Plot / LR number', type: 'text', sourceType: 'SYSTEM_FETCHED' },
];

export function fieldSourceType(field: DocumentField): DocumentFieldSource {
  if (field.sourceType) return field.sourceType;
  if (field.type === 'select') return 'SELECT';
  if (field.type === 'boolean') return 'HARDCODED';
  return 'MANUAL';
}

export const DOCUMENT_TEMPLATES: Record<DocumentType, DocumentTemplate> = {
  AGREEMENT: {
    type: 'AGREEMENT', label: 'Agreement for Sale', prefix: 'NBG-AFS', purpose: 'Legally structured sale agreement between NBG and the buyer.',
    workflow: ['DRAFT', 'LEGAL_REVIEW', 'APPROVED', 'SENT_FOR_SIGNATURE', 'SIGNED', 'COMPLETED'], roles: ['owner', 'admin', 'legal_officer', 'sales_manager'], relationships: ['RECEIPT', 'FLOOR_PLAN'],
    fields: [...commonPropertyFields, { key: 'buyer_legal_name', label: 'Buyer legal name', type: 'text', required: true }, { key: 'buyer_id_passport', label: 'Buyer ID / passport', type: 'text', required: true }, { key: 'buyer_phone', label: 'Buyer telephone', type: 'text', required: true }, { key: 'buyer_email', label: 'Buyer email', type: 'text' }, { key: 'unit_number', label: 'Unit number', type: 'text', required: true }, { key: 'property_type', label: 'Property type', type: 'text', required: true }, { key: 'total_purchase_price', label: 'Total purchase price', type: 'number', required: true }, { key: 'currency', label: 'Currency', type: 'select', required: true, options: ['KES', 'USD', 'EUR', 'GBP'] }, { key: 'payment_schedule', label: 'Payment schedule', type: 'items', required: true }, { key: 'completion_date', label: 'Completion date', type: 'date' }, { key: 'fixtures_schedule', label: 'Fixtures and fittings schedule', type: 'items' }, { key: 'title_legal_information', label: 'Title and legal information', type: 'textarea', required: true }, { key: 'specifications', label: 'Property specifications', type: 'textarea', required: true }, { key: 'taxes_and_costs', label: 'Taxes and costs responsibility', type: 'textarea', required: true }, { key: 'default_termination', label: 'Default and termination terms', type: 'textarea', required: true }, { key: 'dispute_resolution', label: 'Dispute resolution', type: 'textarea', required: true }], validate: (data) => [...required(data, ['buyer_legal_name', 'buyer_id_passport', 'unit_number', 'property_type', 'total_purchase_price', 'currency', 'title_legal_information', 'specifications', 'taxes_and_costs', 'default_termination', 'dispute_resolution']), ...positive(data, ['total_purchase_price']), ...items(data, 'payment_schedule'), scheduleTotal(data)],
  },
  RECEIPT: {
    type: 'RECEIPT', label: 'Payment Receipt', prefix: 'NBG-RCP', purpose: 'Evidence of an actual verified payment received by NBG.', workflow: ['DRAFT', 'ISSUED', 'CANCELLED'], roles: ['owner', 'admin', 'finance_officer', 'accountant'], relationships: ['AGREEMENT', 'PAYMENT_VOUCHER'],
    fields: [{ key: 'payment_id', label: 'Recorded payment', type: 'select', required: true }, { key: 'customer_name', label: 'Customer name', type: 'text', required: true }, { key: 'agreement_number', label: 'Sale / agreement number', type: 'text' }, { key: 'amount_received', label: 'Amount received', type: 'number', required: true }, { key: 'currency', label: 'Currency', type: 'select', required: true, options: ['KES', 'USD', 'EUR', 'GBP'] }, { key: 'payment_method', label: 'Payment method', type: 'select', required: true, options: ['BANK_TRANSFER', 'MPESA', 'CASH', 'CARD', 'CHEQUE'] }, { key: 'transaction_reference', label: 'Transaction reference', type: 'text', required: true }, { key: 'payment_allocation', label: 'Payment allocation', type: 'select', required: true, options: ['RESERVATION', 'DEPOSIT', 'INSTALLMENT', 'PURCHASE_PRICE', 'SERVICE_CHARGE', 'OTHER'] }], validate: (data) => [...required(data, ['payment_id', 'customer_name', 'amount_received', 'currency', 'payment_method', 'transaction_reference', 'payment_allocation']), ...positive(data, ['amount_received'])],
  },
  QUOTATION: {
    type: 'QUOTATION', label: 'Construction Quotation', prefix: 'NBG-QTN', purpose: 'Itemized offer for proposed construction works.', workflow: ['DRAFT', 'REVIEW', 'APPROVED', 'SENT', 'ACCEPTED'], roles: ['owner', 'admin', 'sales_manager', 'project_manager'], relationships: ['CONSTRUCTION_CONTRACT', 'PURCHASE_ORDER'],
    fields: [{ key: 'client_name', label: 'Client name', type: 'text', required: true }, { key: 'site_location', label: 'Site location', type: 'text', required: true }, { key: 'valid_until', label: 'Valid until', type: 'date', required: true }, { key: 'scope_items', label: 'Scope of work items', type: 'items', required: true }, { key: 'subtotal', label: 'Subtotal', type: 'number', required: true }, { key: 'discount', label: 'Discount', type: 'number' }, { key: 'tax_amount', label: 'Tax', type: 'number' }, { key: 'grand_total', label: 'Grand total', type: 'number', required: true }, { key: 'payment_terms', label: 'Payment terms', type: 'textarea', required: true }, { key: 'exclusions_assumptions', label: 'Exclusions and assumptions', type: 'textarea', required: true }, { key: 'variation_procedure', label: 'Variation procedure', type: 'textarea', required: true }], validate: (data) => [...required(data, ['client_name', 'site_location', 'valid_until', 'subtotal', 'grand_total', 'payment_terms', 'exclusions_assumptions', 'variation_procedure']), ...items(data, 'scope_items'), ...positive(data, ['subtotal', 'discount', 'tax_amount', 'grand_total'])],
  },
  PURCHASE_ORDER: {
    type: 'PURCHASE_ORDER', label: 'Purchase Order', prefix: 'NBG-PO', purpose: 'Authorized order issued by NBG to a supplier.', workflow: ['DRAFT', 'REVIEW', 'APPROVAL', 'ISSUED', 'PARTIALLY_RECEIVED', 'COMPLETED'], roles: ['owner', 'admin', 'procurement_officer', 'project_manager'], relationships: ['QUOTATION', 'DELIVERY_NOTE', 'SUPPLIER_INVOICE'],
    fields: [{ key: 'supplier_name', label: 'Supplier name', type: 'text', required: true }, { key: 'supplier_tax_number', label: 'Supplier KRA PIN', type: 'text' }, { key: 'required_delivery_date', label: 'Required delivery date', type: 'date', required: true }, { key: 'delivery_location', label: 'Delivery location', type: 'text', required: true }, { key: 'ordered_items', label: 'Ordered items', type: 'items', required: true }, { key: 'subtotal', label: 'Subtotal', type: 'number', required: true }, { key: 'tax_amount', label: 'Tax', type: 'number' }, { key: 'delivery_charges', label: 'Delivery charges', type: 'number' }, { key: 'grand_total', label: 'Grand total', type: 'number', required: true }, { key: 'payment_terms', label: 'Payment terms', type: 'textarea', required: true }, { key: 'quality_requirements', label: 'Quality requirements', type: 'textarea', required: true }, { key: 'approval_authority', label: 'Approval authority', type: 'text', required: true }], validate: (data) => [...required(data, ['supplier_name', 'required_delivery_date', 'delivery_location', 'subtotal', 'grand_total', 'payment_terms', 'quality_requirements', 'approval_authority']), ...items(data, 'ordered_items'), ...positive(data, ['subtotal', 'tax_amount', 'delivery_charges', 'grand_total'])],
  },
  SUPPLIER_INVOICE: {
    type: 'SUPPLIER_INVOICE', label: 'Supplier Invoice', prefix: 'NBG-INV', purpose: 'Supplier claim for goods or services supplied to NBG.', workflow: ['RECEIVED', 'VERIFICATION', 'APPROVAL', 'PAYMENT', 'PAID'], roles: ['owner', 'admin', 'finance_officer', 'accountant'], relationships: ['PURCHASE_ORDER', 'DELIVERY_NOTE', 'PAYMENT_VOUCHER'],
    fields: [{ key: 'invoice_number', label: 'Supplier invoice number', type: 'text', required: true }, { key: 'supplier_name', label: 'Supplier name', type: 'text', required: true }, { key: 'invoice_date', label: 'Invoice date', type: 'date', required: true }, { key: 'due_date', label: 'Due date', type: 'date', required: true }, { key: 'invoice_items', label: 'Invoice items', type: 'items', required: true }, { key: 'subtotal', label: 'Subtotal', type: 'number', required: true }, { key: 'tax_amount', label: 'Tax', type: 'number' }, { key: 'grand_total', label: 'Grand total', type: 'number', required: true }, { key: 'purchase_order_number', label: 'Purchase order number', type: 'text', required: true }, { key: 'delivery_note_number', label: 'Delivery note number', type: 'text', required: true }, { key: 'verification_result', label: 'Verification result', type: 'textarea', required: true }], validate: (data) => [...required(data, ['invoice_number', 'supplier_name', 'invoice_date', 'due_date', 'subtotal', 'grand_total', 'purchase_order_number', 'delivery_note_number', 'verification_result']), ...items(data, 'invoice_items'), ...positive(data, ['subtotal', 'tax_amount', 'grand_total'])],
  },
  PAYMENT_VOUCHER: {
    type: 'PAYMENT_VOUCHER', label: 'Payment Voucher', prefix: 'NBG-PV', purpose: 'Internal authorization and accounting record for a payment.', workflow: ['DRAFT', 'FINANCE_REVIEW', 'APPROVAL', 'PROCESSING', 'PAID'], roles: ['owner', 'admin', 'finance_officer', 'accountant'], relationships: ['SUPPLIER_INVOICE', 'RECEIPT'],
    fields: [{ key: 'payee_name', label: 'Payee name', type: 'text', required: true }, { key: 'payment_reason', label: 'Payment reason', type: 'textarea', required: true }, { key: 'supporting_document', label: 'Supporting document', type: 'text', required: true }, { key: 'amount', label: 'Amount', type: 'number', required: true }, { key: 'currency', label: 'Currency', type: 'select', required: true, options: ['KES', 'USD', 'EUR', 'GBP'] }, { key: 'account_code', label: 'Account code', type: 'text', required: true }, { key: 'cost_centre', label: 'Cost centre', type: 'text', required: true }, { key: 'withholding_tax', label: 'Withholding tax', type: 'number' }, { key: 'payment_status', label: 'Payment status', type: 'select', required: true, options: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED', 'CANCELLED'] }, { key: 'authorized_by', label: 'Authorized by', type: 'text', required: true }], validate: (data) => [...required(data, ['payee_name', 'payment_reason', 'supporting_document', 'amount', 'currency', 'account_code', 'cost_centre', 'payment_status', 'authorized_by']), ...positive(data, ['amount', 'withholding_tax'])],
  },
  DELIVERY_NOTE: {
    type: 'DELIVERY_NOTE', label: 'Material Delivery Note', prefix: 'NBG-MDN', purpose: 'Site receipt, inspection, and custody record for delivered materials.', workflow: ['PREPARED', 'DELIVERED', 'VERIFIED', 'ACCEPTED'], roles: ['owner', 'admin', 'site_engineer', 'storekeeper', 'procurement_officer'], relationships: ['PURCHASE_ORDER', 'SUPPLIER_INVOICE'],
    fields: [{ key: 'supplier_name', label: 'Supplier name', type: 'text', required: true }, { key: 'po_number', label: 'Purchase order number', type: 'text', required: true }, { key: 'delivery_date', label: 'Delivery date', type: 'date', required: true }, { key: 'site', label: 'Site', type: 'text', required: true }, { key: 'vehicle_registration', label: 'Vehicle registration', type: 'text' }, { key: 'materials', label: 'Materials delivered', type: 'items', required: true }, { key: 'quantity_rejected', label: 'Quantity rejected', type: 'number' }, { key: 'rejection_reason', label: 'Reason for rejection', type: 'textarea' }, { key: 'quality_status', label: 'Quality status', type: 'select', required: true, options: ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'PENDING_INSPECTION'] }, { key: 'receiver_name', label: 'NBG receiver', type: 'text', required: true }], validate: (data) => [...required(data, ['supplier_name', 'po_number', 'delivery_date', 'site', 'quality_status', 'receiver_name']), ...items(data, 'materials'), ...positive(data, ['quantity_rejected'])],
  },
  CONSTRUCTION_CONTRACT: {
    type: 'CONSTRUCTION_CONTRACT', label: 'Construction Contract', prefix: 'NBG-CC', purpose: 'Detailed contract for construction works between employer and contractor.', workflow: ['DRAFT', 'LEGAL_REVIEW', 'APPROVED', 'SIGNED', 'ACTIVE', 'COMPLETED'], roles: ['owner', 'admin', 'legal_officer', 'project_manager'], relationships: ['QUOTATION', 'PURCHASE_ORDER', 'PAYMENT_VOUCHER'],
    fields: [{ key: 'employer_name', label: 'Client / employer legal name', type: 'text', required: true }, { key: 'contractor_name', label: 'Contractor legal name', type: 'text', required: true }, { key: 'contractor_registration', label: 'Contractor registration number', type: 'text', required: true }, { key: 'project_name', label: 'Project name', type: 'text', required: true }, { key: 'site_location', label: 'Site location', type: 'text', required: true }, { key: 'contract_sum', label: 'Contract sum', type: 'number', required: true }, { key: 'currency', label: 'Currency', type: 'select', required: true, options: ['KES', 'USD', 'EUR', 'GBP'] }, { key: 'start_date', label: 'Start date', type: 'date', required: true }, { key: 'completion_date', label: 'Expected completion date', type: 'date', required: true }, { key: 'scope', label: 'Detailed scope and specifications', type: 'textarea', required: true }, { key: 'payment_schedule', label: 'Milestone payment schedule', type: 'items', required: true }, { key: 'contractor_obligations', label: 'Contractor obligations', type: 'textarea', required: true }, { key: 'variation_clause', label: 'Variation procedure', type: 'textarea', required: true }, { key: 'defects_clause', label: 'Defects liability', type: 'textarea', required: true }, { key: 'termination_clause', label: 'Termination', type: 'textarea', required: true }, { key: 'dispute_resolution', label: 'Dispute resolution', type: 'textarea', required: true }], validate: (data) => [...required(data, ['employer_name', 'contractor_name', 'contractor_registration', 'project_name', 'site_location', 'contract_sum', 'currency', 'start_date', 'completion_date', 'scope', 'contractor_obligations', 'variation_clause', 'defects_clause', 'termination_clause', 'dispute_resolution']), ...items(data, 'payment_schedule'), ...positive(data, ['contract_sum'])],
  },
  BROCHURE: {
    type: 'BROCHURE', label: 'Project Brochure', prefix: 'NBG-PBR', purpose: 'Approved public marketing and information document.', workflow: ['DRAFT', 'MARKETING_REVIEW', 'APPROVED', 'PUBLISHED'], roles: ['owner', 'admin', 'marketing_manager'], relationships: ['FLOOR_PLAN'],
    fields: [{ key: 'project_id', label: 'Published project', type: 'select', required: true }, { key: 'project_description', label: 'Approved project description', type: 'textarea', required: true }, { key: 'location_information', label: 'Location and accessibility', type: 'textarea', required: true }, { key: 'property_types', label: 'Approved property types', type: 'items', required: true }, { key: 'amenities', label: 'Amenities', type: 'items', required: true }, { key: 'contact_details', label: 'NBG contact details', type: 'textarea', required: true }], validate: (data) => [...required(data, ['project_id', 'project_description', 'location_information', 'contact_details']), ...items(data, 'property_types'), ...items(data, 'amenities')],
  },
  FLOOR_PLAN: {
    type: 'FLOOR_PLAN', label: 'Floor Plan', prefix: 'NBG-FP', purpose: 'Approved architectural or property layout record.', workflow: ['DRAFT', 'TECHNICAL_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED'], roles: ['owner', 'admin', 'project_manager', 'site_engineer', 'legal_officer'], relationships: ['AGREEMENT', 'BROCHURE'],
    fields: [{ key: 'project_id', label: 'Project', type: 'select', required: true }, { key: 'unit_number', label: 'Unit number', type: 'text', required: true }, { key: 'property_type', label: 'Property type', type: 'text', required: true }, { key: 'size', label: 'Approved size', type: 'text' }, { key: 'drawing_number', label: 'Drawing number', type: 'text', required: true }, { key: 'revision_number', label: 'Revision number', type: 'text', required: true }, { key: 'drawing_date', label: 'Drawing date', type: 'date', required: true }, { key: 'prepared_by', label: 'Prepared by', type: 'text', required: true }, { key: 'checked_by', label: 'Checked by', type: 'text' }, { key: 'approved_by', label: 'Approved by', type: 'text' }, { key: 'scale', label: 'Scale', type: 'text', required: true }, { key: 'approved_plan_url', label: 'Approved plan upload', type: 'text', help: 'Use the approved architectural file. Do not invent dimensions.' }, { key: 'draft_notice', label: 'Approval status', type: 'select', required: true, options: ['DRAFT / NOT FOR CONSTRUCTION', 'APPROVED', 'ARCHIVED'] }], validate: (data) => [...required(data, ['project_id', 'unit_number', 'property_type', 'drawing_number', 'revision_number', 'drawing_date', 'prepared_by', 'scale', 'draft_notice']), ...(data.draft_notice === 'APPROVED' && !String(data.approved_by ?? '').trim() ? ['An approved floor plan requires an approver.'] : [])],
  },
};

export const DOCUMENT_TYPE_OPTIONS = Object.values(DOCUMENT_TEMPLATES).map(({ type, label }) => ({ type, label }));
export function getDocumentTemplate(type: string) { return DOCUMENT_TEMPLATES[type as DocumentType]; }

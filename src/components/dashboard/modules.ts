import { FileText, Search, Wallet, Banknote, Receipt, ShoppingCart } from 'lucide-react';
import { MODULE_PERMISSIONS } from '../../lib/permissions';
import { ViewType } from '../Layout';

export interface ModuleConfig {
  key: 'pr' | 'canvass' | 'pettyCash' | 'cashAdvance' | 'reimbursement' | 'po';
  label: string;
  icon: any;
  table: string;
  docNumberColumn: string;
  amountColumn: string;
  requesterColumn: string;
  requestType: string; // matches request_type values used by get_my_pending_approval_ids / approval_ledger / get_overdue_pending_approvals
  dueDateColumn: string | null; // fulfillment "needed by" column, null if none
  requestPermission: string;
  requestView: ViewType;
  approvalPermission: string;
  approvalView: ViewType;
}

export const MODULES: ModuleConfig[] = [
  {
    key: 'pr',
    label: 'Purchase Requisition',
    icon: FileText,
    table: 'purchase_requisitions',
    docNumberColumn: 'document_no',
    amountColumn: 'total_amount',
    requesterColumn: 'requester_id',
    requestType: 'Purchase Requisition',
    dueDateColumn: 'date_required',
    requestPermission: MODULE_PERMISSIONS.PURCHASE_REQUISITION,
    requestView: 'pr-request',
    approvalPermission: MODULE_PERMISSIONS.PR_APPROVAL,
    approvalView: 'pr-approval',
  },
  {
    key: 'canvass',
    label: 'Canvass',
    icon: Search,
    table: 'canvass_requests',
    docNumberColumn: 'canvass_number',
    amountColumn: 'total_amount',
    requesterColumn: 'requester_id',
    requestType: 'Canvass',
    dueDateColumn: 'required_date',
    requestPermission: MODULE_PERMISSIONS.CANVASS,
    requestView: 'canvass-request',
    approvalPermission: MODULE_PERMISSIONS.CANVASS_APPROVAL,
    approvalView: 'canvass-approval',
  },
  {
    key: 'pettyCash',
    label: 'Petty Cash',
    icon: Wallet,
    table: 'petty_cash_requests',
    docNumberColumn: 'pc_number',
    amountColumn: 'amount',
    requesterColumn: 'requester_id',
    requestType: 'Petty Cash',
    dueDateColumn: 'date_needed',
    requestPermission: MODULE_PERMISSIONS.PETTY_CASH,
    requestView: 'petty-cash-request',
    approvalPermission: MODULE_PERMISSIONS.PETTY_CASH_APPROVAL,
    approvalView: 'petty-cash-approval',
  },
  {
    key: 'cashAdvance',
    label: 'Cash Advance',
    icon: Banknote,
    table: 'cash_advance_requests',
    docNumberColumn: 'ca_number',
    amountColumn: 'amount',
    requesterColumn: 'requester_id',
    requestType: 'Cash Advance',
    dueDateColumn: 'date_needed',
    requestPermission: MODULE_PERMISSIONS.CASH_ADVANCE,
    requestView: 'cash-advance-request',
    approvalPermission: MODULE_PERMISSIONS.CASH_ADVANCE_APPROVAL,
    approvalView: 'cash-advance-approval',
  },
  {
    key: 'reimbursement',
    label: 'Reimbursement | Liquidation',
    icon: Receipt,
    table: 'reimbursement_requests',
    docNumberColumn: 'reimb_number',
    amountColumn: 'amount',
    requesterColumn: 'requester_id',
    requestType: 'Reimbursement',
    dueDateColumn: 'date_needed',
    requestPermission: MODULE_PERMISSIONS.REIMBURSEMENT,
    requestView: 'reimbursement-request',
    approvalPermission: MODULE_PERMISSIONS.REIMBURSEMENT_APPROVAL,
    approvalView: 'reimbursement-approval',
  },
  {
    key: 'po',
    label: 'Purchase Order',
    icon: ShoppingCart,
    table: 'purchase_orders',
    docNumberColumn: 'po_number',
    amountColumn: 'total_amount',
    requesterColumn: 'created_by',
    requestType: 'Purchase Order',
    dueDateColumn: 'expected_delivery_date',
    requestPermission: MODULE_PERMISSIONS.PURCHASE_ORDER,
    requestView: 'po-request',
    approvalPermission: MODULE_PERMISSIONS.PO_APPROVAL,
    approvalView: 'po-approval',
  },
];

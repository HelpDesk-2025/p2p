import { supabase } from './supabase';

export interface Permission {
  id: string;
  permission_name: string;
  description: string;
  module: string;
}

export interface Role {
  id: string;
  role_name: string;
  description: string;
  permissions: Permission[];
}

export interface UserPermissions {
  role: string;
  permissions: string[];
}

/**
 * Fetches the current user's role and permissions
 */
export async function getUserPermissions(userId: string): Promise<UserPermissions | null> {
  try {
    // Get user profile with role
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      console.error('Error fetching user profile:', profileError);
      return null;
    }

    // Get role with permissions
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select(`
        name,
        role_permissions (
          permissions (
            name,
            module
          )
        )
      `)
      .eq('name', profile.role)
      .maybeSingle();

    if (roleError || !roleData) {
      console.error('Error fetching role permissions:', roleError);
      return null;
    }

    // Extract permission names
    const permissions = roleData.role_permissions?.map((rp: any) =>
      rp.permissions.name
    ) || [];

    return {
      role: profile.role,
      permissions
    };
  } catch (error) {
    console.error('Error getting user permissions:', error);
    return null;
  }
}

/**
 * Checks if user has a specific permission
 */
export function hasPermission(userPermissions: UserPermissions | null, permission: string): boolean {
  if (!userPermissions) return false;
  return userPermissions.permissions.includes(permission);
}

/**
 * Checks if user has any of the specified permissions
 */
export function hasAnyPermission(userPermissions: UserPermissions | null, permissions: string[]): boolean {
  if (!userPermissions) return false;
  return permissions.some(p => userPermissions.permissions.includes(p));
}

/**
 * Checks if user has all of the specified permissions
 */
export function hasAllPermissions(userPermissions: UserPermissions | null, permissions: string[]): boolean {
  if (!userPermissions) return false;
  return permissions.every(p => userPermissions.permissions.includes(p));
}

/**
 * Module permissions mapping
 */
export const MODULE_PERMISSIONS = {
  // Request Modules
  PURCHASE_REQUISITION: 'Purchase Requisition Request',
  CANVASS: 'Canvass Request',
  CASH_ADVANCE: 'Cash Advance Request',
  PETTY_CASH: 'Petty Cash Request',
  REIMBURSEMENT: 'Reimbursement Request',

  // Approval Modules
  PR_APPROVAL: 'Purchase Requisition Approval',
  CANVASS_APPROVAL: 'Canvass Approval',
  CASH_ADVANCE_APPROVAL: 'Cash Advance Approval',
  PETTY_CASH_APPROVAL: 'Petty Cash Approval',
  REIMBURSEMENT_APPROVAL: 'Reimbursement Approval',
  SME_APPROVAL: 'Subject Matter Approval',
  PETTY_CASH_RELEASE: 'Petty Cash Release',

  // Configuration Modules
  NUMBER_SERIES: 'Configuration',
  APPROVAL_FLOW: 'Configuration',
  SMTP: 'Configuration',
  ROLES_PERMISSIONS: 'Configuration',

  // Accounting Configuration Modules
  CONFIG_EXPENSE_TYPES: 'config_expense_types',
  CONFIG_PAYMENT_MODES: 'config_payment_modes',
  CONFIG_PR_CHECKLISTS: 'config_pr_checklists',
  CONFIG_TAX_RATES: 'config_tax_rates',

  // Procurement
  PROCUREMENT_CHECKING: 'Procurement Checking',
  APPROVAL_LEDGER: 'Approval Ledger',

  // Reimbursement sub-pages
  APPROVED_REJECTED: 'Approved and Rejected'
} as const;

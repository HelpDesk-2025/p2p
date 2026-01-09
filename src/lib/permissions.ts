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
  PURCHASE_REQUISITION: 'view_purchase_requisition',
  CANVASS: 'view_canvass',
  CASH_ADVANCE: 'view_cash_advance',
  PETTY_CASH: 'view_petty_cash',
  REIMBURSEMENT: 'view_reimbursement',

  // Approval Modules
  PR_APPROVAL: 'view_pr_approval',
  CANVASS_APPROVAL: 'view_canvass_approval',
  CASH_ADVANCE_APPROVAL: 'view_cash_advance_approval',
  PETTY_CASH_APPROVAL: 'view_petty_cash_approval',
  REIMBURSEMENT_APPROVAL: 'view_reimbursement_approval',
  SME_APPROVAL: 'view_sme_approval',

  // Configuration Modules
  NUMBER_SERIES: 'view_number_series_config',
  APPROVAL_FLOW: 'view_approval_flow_config',
  SMTP: 'view_smtp_config',
  ROLES_PERMISSIONS: 'view_roles_permissions_config',

  // Procurement
  PROCUREMENT_CHECKING: 'view_procurement_checking',
  APPROVAL_LEDGER: 'view_approval_ledger'
} as const;

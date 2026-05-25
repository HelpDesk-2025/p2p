import { supabase } from './supabase';

export interface AuditTrailParams {
  tableName: string;
  recordId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  module: 'configuration' | 'requests' | 'approvals' | 'p2p';
  description: string;
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
  performedBy: string;
  performedByName: string;
  companyId?: string | null;
}

export async function logAuditTrail(params: AuditTrailParams): Promise<void> {
  try {
    await supabase.from('audit_trail').insert({
      table_name: params.tableName,
      record_id: params.recordId,
      action: params.action,
      module: params.module,
      description: params.description,
      old_values: params.oldValues || null,
      new_values: params.newValues || null,
      performed_by: params.performedBy,
      performed_by_name: params.performedByName,
      company_id: params.companyId || null,
    });
  } catch {
    // Audit logging should never break the main operation
  }
}

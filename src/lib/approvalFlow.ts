import { supabase } from './supabase';

export interface ApprovalFlow {
  id: string;
  company_id: string;
  department_id: string | null;
  approver_type: string;
  sequence: number;
  days_to_approve: number;
  is_required: boolean;
  is_active: boolean;
  workflow_type: number;
  user_id: string | null;
  approval_flow_setup_id: string;
}

export interface ApprovalFlowSetup {
  id: string;
  name: string;
  company_id: string;
  department: string | null;
  request_type: string;
  is_active: boolean;
}

export const WORKFLOW_TYPES = {
  UNBUDGETED: 1,
  BUDGETED_BELOW_MIN: 2,
  BUDGETED_ABOVE_MIN: 3,
};

export async function getApprovalFlow(
  companyId: string,
  department: string,
  requestType: string,
  isBudgeted: boolean,
  totalAmount: number
): Promise<ApprovalFlow[]> {
  try {
    console.log('🔍 Getting approval flow with params:', {
      companyId,
      department,
      requestType,
      isBudgeted,
      totalAmount
    });

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('president_minimum_approval_amount')
      .eq('id', companyId)
      .single();

    if (companyError) throw companyError;

    const presidentMinAmount = company?.president_minimum_approval_amount || 0;

    let workflowType: number;
    if (!isBudgeted) {
      workflowType = WORKFLOW_TYPES.UNBUDGETED;
    } else if (totalAmount < presidentMinAmount) {
      workflowType = WORKFLOW_TYPES.BUDGETED_BELOW_MIN;
    } else {
      workflowType = WORKFLOW_TYPES.BUDGETED_ABOVE_MIN;
    }

    console.log('📊 Workflow type determined:', workflowType, '(1=Unbudgeted, 2=Budgeted<Min, 3=Budgeted>Min)');

    const { data: departmentSetup, error: deptError } = await supabase
      .from('approval_flow_setups')
      .select('id')
      .eq('company_id', companyId)
      .eq('department_id', department)
      .eq('request_type', requestType)
      .eq('is_active', true)
      .maybeSingle();

    console.log('🏢 Department setup lookup result:', departmentSetup, 'Error:', deptError);

    if (deptError) throw deptError;

    if (departmentSetup) {
      console.log('✅ Found department setup, looking for flows...');
      const { data: flows, error: flowsError } = await supabase
        .from('approval_flows')
        .select('*')
        .eq('approval_flow_setup_id', departmentSetup.id)
        .eq('workflow_type', workflowType)
        .eq('is_active', true)
        .order('sequence', { ascending: true });

      if (flowsError) throw flowsError;

      console.log('📋 Flows found for department:', flows?.length || 0, flows);

      if (flows && flows.length > 0) {
        return flows;
      }
    }

    console.log('⚠️ No department setup found, trying company-wide setup...');

    const { data: companySetup, error: companySetupError } = await supabase
      .from('approval_flow_setups')
      .select('id')
      .eq('company_id', companyId)
      .is('department_id', null)
      .eq('request_type', requestType)
      .eq('is_active', true)
      .maybeSingle();

    console.log('🏢 Company setup lookup result:', companySetup, 'Error:', companySetupError);

    if (companySetupError) throw companySetupError;

    if (!companySetup) {
      console.error('❌ No approval flow setup found for this request');
      return [];
    }

    const { data: flows, error: flowsError } = await supabase
      .from('approval_flows')
      .select('*')
      .eq('approval_flow_setup_id', companySetup.id)
      .eq('workflow_type', workflowType)
      .eq('is_active', true)
      .order('sequence', { ascending: true });

    if (flowsError) throw flowsError;

    console.log('📋 Flows found for company:', flows?.length || 0, flows);

    return flows || [];
  } catch (error) {
    console.error('Error getting approval flow:', error);
    return [];
  }
}

export async function getNextApprover(
  approvalFlows: ApprovalFlow[],
  currentLevel: number
): Promise<ApprovalFlow | null> {
  if (currentLevel >= approvalFlows.length) {
    return null;
  }

  return approvalFlows[currentLevel];
}

export async function createApprovalLedgerEntry(
  requestType: string,
  requestId: string,
  requestNumber: string,
  approverId: string,
  approverName: string,
  approverType: string,
  action: string,
  comments: string,
  sequence: number
): Promise<void> {
  try {
    const { error } = await supabase.from('approval_ledger').insert({
      request_type: requestType,
      request_id: requestId,
      request_number: requestNumber,
      approver_id: approverId,
      approver_name: approverName,
      approver_type: approverType,
      action: action,
      comments: comments,
      sequence: sequence,
      approval_date: new Date().toISOString(),
    });

    if (error) throw error;
  } catch (error) {
    console.error('Error creating approval ledger entry:', error);
    throw error;
  }
}

export async function sendApprovalEmail(
  recipientEmail: string,
  recipientName: string,
  requestType: string,
  documentNo: string,
  requesterName: string,
  department: string,
  totalAmount: number,
  action: string,
  actionBy?: string,
  comments?: string,
  nextApprover?: string
): Promise<void> {
  try {
    console.log('📧 Sending approval email to:', recipientEmail, 'for action:', action);

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-approval-email`;

    const headers = {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    };

    const emailData = {
      to: recipientEmail,
      subject: `${requestType} ${action} - ${documentNo}`,
      recipientName,
      requestType,
      documentNo,
      requesterName,
      department,
      totalAmount,
      action,
      actionBy,
      comments,
      nextApprover,
    };

    console.log('📧 Email data:', JSON.stringify(emailData, null, 2));

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(emailData),
    });

    const result = await response.json();

    if (!result.success) {
      console.error('❌ Failed to send email:', result);
      alert(`Email notification failed: ${result.message || 'Unknown error'}. The request was created successfully.`);
    } else {
      console.log('✅ Email sent successfully:', result);
    }
  } catch (error) {
    console.error('❌ Error sending approval email:', error);
  }
}

export async function getApproverEmail(
  approvalFlow: ApprovalFlow,
  companyId: string,
  department: string
): Promise<{ email: string; name: string } | null> {
  try {
    if (approvalFlow.user_id) {
      const { data: user, error } = await supabase
        .from('user_profiles')
        .select('email, full_name')
        .eq('id', approvalFlow.user_id)
        .single();

      if (error) throw error;
      return { email: user.email, name: user.full_name || 'User' };
    }

    const approverType = approvalFlow.approver_type;

    if (approverType === 'Department Head') {
      const { data: user, error } = await supabase
        .from('user_profiles')
        .select('email, full_name')
        .eq('company_id', companyId)
        .eq('department', department)
        .eq('role', 'approver')
        .maybeSingle();

      if (error) throw error;
      if (user) return { email: user.email, name: user.full_name || 'Department Head' };
    }

    if (approverType === 'Procurement' || approverType === 'Procurement Head') {
      const { data: user, error } = await supabase
        .from('user_profiles')
        .select('email, full_name')
        .eq('company_id', companyId)
        .eq('department', 'Procurement')
        .eq('role', 'approver')
        .maybeSingle();

      if (error) throw error;
      if (user) return { email: user.email, name: user.full_name || 'Procurement' };
    }

    if (approverType === 'President') {
      const { data: user, error } = await supabase
        .from('user_profiles')
        .select('email, full_name')
        .eq('company_id', companyId)
        .eq('role', 'approver')
        .maybeSingle();

      if (error) throw error;
      if (user) return { email: user.email, name: user.full_name || 'President' };
    }

    return null;
  } catch (error) {
    console.error('Error getting approver email:', error);
    return null;
  }
}

export async function createRejectedLedgerEntries(
  requestType: string,
  requestId: string,
  requestNumber: string,
  approvalFlows: ApprovalFlow[],
  currentLevel: number,
  companyId: string,
  department: string
): Promise<void> {
  try {
    const remainingApprovers = approvalFlows.slice(currentLevel + 1);

    for (const flow of remainingApprovers) {
      const approverInfo = await getApproverEmail(flow, companyId, department);

      if (approverInfo) {
        await createApprovalLedgerEntry(
          requestType,
          requestId,
          requestNumber,
          'system',
          approverInfo.name,
          flow.approver_type,
          'Auto-Rejected',
          'Previous step was rejected',
          flow.sequence
        );
      }
    }
  } catch (error) {
    console.error('Error creating rejected ledger entries:', error);
    throw error;
  }
}

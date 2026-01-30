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
  department_id: string | null;
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
    console.log('🔍 STRICT APPROVAL FLOW CHECK with params:', {
      companyId,
      department,
      requestType,
      isBudgeted,
      totalAmount
    });

    // STEP 1: Validate company exists
    if (!companyId) {
      console.error('❌ VALIDATION FAILED: Company ID is required');
      throw new Error('Company ID is required for approval flow');
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('president_min_amount')
      .eq('id', companyId)
      .single();

    if (companyError) {
      console.error('❌ VALIDATION FAILED: Company not found');
      throw companyError;
    }

    // STEP 2: Validate department
    if (!department) {
      console.error('❌ VALIDATION FAILED: Department is required');
      throw new Error('Department is required for approval flow');
    }

    // STEP 3: Validate request type
    if (!requestType) {
      console.error('❌ VALIDATION FAILED: Request type is required');
      throw new Error('Request type is required for approval flow');
    }

    // STEP 4: Determine workflow type based on budget setup
    const presidentMinAmount = company?.president_min_amount || 0;
    let workflowType: number;

    // For Purchase Requisition, Canvass, and Cash Advance, check budget setup
    if (requestType === 'Purchase Requisition' || requestType === 'Canvass' || requestType === 'Cash Advance') {
      if (!isBudgeted) {
        workflowType = WORKFLOW_TYPES.UNBUDGETED;
        console.log('📊 Budget Setup: UNBUDGETED - Workflow Type 1');
      } else if (totalAmount < presidentMinAmount) {
        workflowType = WORKFLOW_TYPES.BUDGETED_BELOW_MIN;
        console.log(`📊 Budget Setup: BUDGETED < ₱${presidentMinAmount.toLocaleString()} - Workflow Type 2`);
      } else {
        workflowType = WORKFLOW_TYPES.BUDGETED_ABOVE_MIN;
        console.log(`📊 Budget Setup: BUDGETED ≥ ₱${presidentMinAmount.toLocaleString()} - Workflow Type 3`);
      }
    } else {
      // For other request types (Petty Cash, Reimbursement), use unbudgeted workflow
      workflowType = WORKFLOW_TYPES.UNBUDGETED;
      console.log('📊 Non-budget request type - Using Workflow Type 1');
    }

    // STEP 5: Look for department-specific approval flow setup
    console.log('🔍 STEP 5: Looking for department-specific approval flow setup...');
    const { data: departmentSetup, error: deptError } = await supabase
      .from('approval_flow_setups')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('department_id', department)
      .eq('request_type', requestType)
      .eq('is_active', true)
      .maybeSingle();

    if (deptError) {
      console.error('❌ Error looking up department setup:', deptError);
      throw deptError;
    }

    if (departmentSetup) {
      console.log('✅ Found department-specific setup:', departmentSetup.name);
      console.log('🔍 STEP 6: Looking for approval steps matching workflow type', workflowType);

      const { data: flows, error: flowsError } = await supabase
        .from('approval_flows')
        .select('*')
        .eq('approval_flow_setup_id', departmentSetup.id)
        .eq('workflow_type', workflowType)
        .eq('is_active', true)
        .eq('for_checking', false)
        .order('sequence', { ascending: true });

      if (flowsError) {
        console.error('❌ Error fetching approval flows:', flowsError);
        throw flowsError;
      }

      if (flows && flows.length > 0) {
        console.log('✅ Found', flows.length, 'approval steps for department:', flows.map(f => `Step ${f.sequence}: ${f.approver_type}`));
        return flows;
      }

      console.log('⚠️ No approval steps found for department setup with workflow type', workflowType);
    } else {
      console.log('⚠️ No department-specific setup found');
    }

    // STEP 7: Fallback to company-wide approval flow setup
    console.log('🔍 STEP 7: Looking for company-wide approval flow setup...');
    const { data: companySetup, error: companySetupError } = await supabase
      .from('approval_flow_setups')
      .select('id, name')
      .eq('company_id', companyId)
      .is('department_id', null)
      .eq('request_type', requestType)
      .eq('is_active', true)
      .maybeSingle();

    if (companySetupError) {
      console.error('❌ Error looking up company setup:', companySetupError);
      throw companySetupError;
    }

    if (!companySetup) {
      console.error('❌ VALIDATION FAILED: No approval flow setup found');
      console.error('Missing setup for:', { companyId, department, requestType, workflowType });
      throw new Error(`No approval flow configured for ${requestType} in ${department}`);
    }

    console.log('✅ Found company-wide setup:', companySetup.name);
    console.log('🔍 STEP 8: Looking for approval steps matching workflow type', workflowType);

    const { data: flows, error: flowsError } = await supabase
      .from('approval_flows')
      .select('*')
      .eq('approval_flow_setup_id', companySetup.id)
      .eq('workflow_type', workflowType)
      .eq('is_active', true)
      .eq('for_checking', false)
      .order('sequence', { ascending: true });

    if (flowsError) {
      console.error('❌ Error fetching approval flows:', flowsError);
      throw flowsError;
    }

    if (!flows || flows.length === 0) {
      console.error('❌ VALIDATION FAILED: No approval steps configured');
      throw new Error(`No approval steps configured for workflow type ${workflowType}`);
    }

    console.log('✅ Found', flows.length, 'approval steps:', flows.map(f => `Step ${f.sequence}: ${f.approver_type}`));
    return flows;
  } catch (error) {
    console.error('❌ Error in getApprovalFlow:', error);
    throw error;
  }
}

export async function filterApprovalFlowsForRequester(
  approvalFlows: ApprovalFlow[],
  requesterId: string,
  requesterDepartment: string,
  companyId: string
): Promise<ApprovalFlow[]> {
  try {
    console.log('🔍 Filtering approval flows for requester:', requesterId);

    const { data: requesterProfile, error: requesterError } = await supabase
      .from('user_profiles')
      .select('role, department')
      .eq('id', requesterId)
      .single();

    if (requesterError) {
      console.error('Error fetching requester profile:', requesterError);
      return approvalFlows;
    }

    const filteredFlows = approvalFlows.filter((flow) => {
      if (flow.user_id === requesterId) {
        console.log(`⏭️ Skipping approval step ${flow.sequence} (${flow.approver_type}) - Requester is the approver`);
        return false;
      }

      if (flow.approver_type === 'Department Head' &&
          requesterProfile.role === 'approver' &&
          requesterProfile.department === requesterDepartment) {
        console.log(`⏭️ Skipping approval step ${flow.sequence} (Department Head) - Requester is the department head`);
        return false;
      }

      return true;
    });

    const resequencedFlows = filteredFlows.map((flow, index) => ({
      ...flow,
      sequence: index + 1
    }));

    console.log(`✅ Filtered approval flows: ${approvalFlows.length} → ${resequencedFlows.length} steps`);

    return resequencedFlows;
  } catch (error) {
    console.error('Error filtering approval flows:', error);
    return approvalFlows;
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
  approverId: string | null,
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
    console.log('🔄 Creating auto-rejected entries for remaining approvers:', remainingApprovers.length);

    if (remainingApprovers.length === 0) {
      console.log('ℹ️ No remaining approvers to auto-reject');
      return;
    }

    for (const flow of remainingApprovers) {
      console.log(`🔍 Processing auto-rejection for sequence ${flow.sequence}: ${flow.approver_type}`);
      const approverInfo = await getApproverEmail(flow, companyId, department);

      if (approverInfo) {
        console.log(`✅ Found approver info: ${approverInfo.name}`);
        await createApprovalLedgerEntry(
          requestType,
          requestId,
          requestNumber,
          null,
          approverInfo.name,
          flow.approver_type,
          'Auto-Rejected',
          'Previous step was rejected',
          flow.sequence
        );
        console.log(`✅ Auto-rejected entry created for ${approverInfo.name}`);
      } else {
        console.warn(`⚠️ Could not find approver info for ${flow.approver_type}`);
      }
    }
  } catch (error) {
    console.error('❌ Error creating rejected ledger entries:', error);
    throw error;
  }
}

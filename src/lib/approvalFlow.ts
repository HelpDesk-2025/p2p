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
  alternate_approver_id?: string | null;
  approval_flow_setup_id: string;
  for_checking?: boolean;
  applies_to_po?: boolean;
  applies_to_non_po?: boolean;
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

function filterByPurchaseType(flows: ApprovalFlow[], purchaseType?: string): ApprovalFlow[] {
  if (!purchaseType) return flows;
  return flows.filter((f) => {
    if (purchaseType === 'Purchase Order') return f.applies_to_po !== false;
    if (purchaseType === 'Non-Purchase Order') return f.applies_to_non_po !== false;
    return true;
  });
}

export async function getApprovalFlow(
  companyId: string,
  department: string,
  requestType: string,
  isBudgeted: boolean,
  totalAmount: number,
  expenseCategory?: string,
  purchaseType?: string
): Promise<ApprovalFlow[]> {
  try {
    console.log('STRICT APPROVAL FLOW CHECK with params:', {
      companyId,
      department,
      requestType,
      isBudgeted,
      totalAmount
    });

    if (!companyId) {
      throw new Error('Company ID is required for approval flow');
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('president_min_amount')
      .eq('id', companyId)
      .single();

    if (companyError) {
      throw companyError;
    }

    if (!department) {
      throw new Error('Department is required for approval flow');
    }

    if (!requestType) {
      throw new Error('Request type is required for approval flow');
    }

    const presidentMinAmount = company?.president_min_amount || 0;
    let workflowType: number;

    if (requestType === 'Purchase Requisition' || requestType === 'Canvass' || requestType === 'Cash Advance') {
      if (!isBudgeted) {
        workflowType = WORKFLOW_TYPES.UNBUDGETED;
      } else if (expenseCategory === 'ManCom Expense') {
        workflowType = WORKFLOW_TYPES.BUDGETED_ABOVE_MIN;
      } else if (totalAmount < presidentMinAmount) {
        workflowType = WORKFLOW_TYPES.BUDGETED_BELOW_MIN;
      } else {
        workflowType = WORKFLOW_TYPES.BUDGETED_ABOVE_MIN;
      }
    } else if (requestType === 'Petty Cash' || requestType === 'Reimbursement' || requestType === 'Liquidation') {
      if (expenseCategory === 'CEO Expense') {
        workflowType = WORKFLOW_TYPES.BUDGETED_ABOVE_MIN;
      } else if (expenseCategory === 'ManCom Expense') {
        workflowType = WORKFLOW_TYPES.BUDGETED_BELOW_MIN;
      } else {
        workflowType = WORKFLOW_TYPES.UNBUDGETED;
      }
    } else {
      workflowType = WORKFLOW_TYPES.UNBUDGETED;
    }

    const { data: departmentSetup, error: deptError } = await supabase
      .from('approval_flow_setups')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('department_id', department)
      .eq('request_type', requestType)
      .eq('is_active', true)
      .maybeSingle();

    if (deptError) {
      throw deptError;
    }

    if (departmentSetup) {
      const { data: flows, error: flowsError } = await supabase
        .from('approval_flows')
        .select('*')
        .eq('approval_flow_setup_id', departmentSetup.id)
        .eq('workflow_type', workflowType)
        .eq('is_active', true)
        .order('sequence', { ascending: true });

      if (flowsError) {
        throw flowsError;
      }

      if (flows && flows.length > 0) {
        const filtered = filterByPurchaseType(flows, purchaseType);
        if (filtered.length > 0) return filtered;
      }
    }

    const { data: companySetup, error: companySetupError } = await supabase
      .from('approval_flow_setups')
      .select('id, name')
      .eq('company_id', companyId)
      .is('department_id', null)
      .eq('request_type', requestType)
      .eq('is_active', true)
      .maybeSingle();

    if (companySetupError) {
      throw companySetupError;
    }

    if (!companySetup) {
      throw new Error(`No approval flow configured for ${requestType} in ${department}`);
    }

    const { data: flows, error: flowsError } = await supabase
      .from('approval_flows')
      .select('*')
      .eq('approval_flow_setup_id', companySetup.id)
      .eq('workflow_type', workflowType)
      .eq('is_active', true)
      .order('sequence', { ascending: true });

    if (flowsError) {
      throw flowsError;
    }

    if (!flows || flows.length === 0) {
      throw new Error(`No approval steps configured for workflow type ${workflowType}`);
    }

    return filterByPurchaseType(flows, purchaseType);
  } catch (error) {
    console.error('Error in getApprovalFlow:', error);
    throw error;
  }
}

export async function addExecutiveApprovalSteps(
  approvalFlows: ApprovalFlow[],
  requesterId: string,
  companyId: string,
  isBudgeted: boolean = false
): Promise<ApprovalFlow[]> {
  try {
    console.log('[ManCom] addExecutiveApprovalSteps called with:', { requesterId, companyId, isBudgeted });
    const { data: requesterProfile, error: requesterError } = await supabase
      .from('user_profiles')
      .select('approver_type, approver_email, checker_email, approver_email_non_budgeted, approver_email_budgeted, checker_email_non_budgeted, checker_email_budgeted')
      .eq('id', requesterId)
      .maybeSingle();

    if (requesterError || !requesterProfile) {
      console.error('[ManCom] Error fetching requester profile:', requesterError, 'profile:', requesterProfile);
      return approvalFlows;
    }

    console.log('[ManCom] requesterProfile.approver_type:', requesterProfile.approver_type);
    if (requesterProfile.approver_type !== 'Executive') {
      console.log('[ManCom] Not Executive, returning original flows');
      return approvalFlows;
    }

    const category = isBudgeted ? 'budgeted' : 'non_budgeted';
    console.log('[ManCom] Looking up executive_approval_steps for category:', category);

    const { data: dynamicSteps, error: stepsError } = await supabase
      .from('executive_approval_steps')
      .select('step_type, email, sequence')
      .eq('user_profile_id', requesterId)
      .eq('category', category)
      .order('sequence', { ascending: true });

    if (stepsError) {
      console.error('[ManCom] Error loading executive_approval_steps:', stepsError);
    }
    console.log('[ManCom] dynamicSteps:', dynamicSteps);

    type Step = { step_type: 'approver' | 'checker'; email: string };
    const steps: Step[] = (dynamicSteps || [])
      .map((s: any) => ({ step_type: s.step_type as 'approver' | 'checker', email: s.email }))
      .filter((s: Step) => !!s.email);

    if (steps.length === 0) {
      const approverEmail = isBudgeted
        ? (requesterProfile.approver_email_budgeted || requesterProfile.approver_email)
        : (requesterProfile.approver_email_non_budgeted || requesterProfile.approver_email);
      const checkerEmail = isBudgeted
        ? (requesterProfile.checker_email_budgeted || requesterProfile.checker_email)
        : (requesterProfile.checker_email_non_budgeted || requesterProfile.checker_email);

      if (approverEmail) steps.push({ step_type: 'approver', email: approverEmail });
      if (checkerEmail) steps.push({ step_type: 'checker', email: checkerEmail });
    }

    console.log('[ManCom] Executive steps resolved:', steps);

    const emails = steps.map((s) => s.email);
    const userByEmail: Record<string, { id: string; full_name: string | null; email: string }> = {};
    if (emails.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .in('email', emails);
      console.log('[ManCom] Email lookup result:', { users, usersError });
      (users || []).forEach((u: any) => { userByEmail[u.email] = u; });
    }

    const executiveFlows: ApprovalFlow[] = [];
    let sequence = 1;
    for (const step of steps) {
      const user = userByEmail[step.email];
      if (!user) {
        console.warn('[ManCom] No user_profile found for executive step email:', step.email);
        continue;
      }
      const label = step.step_type === 'approver' ? 'Approver' : 'Checker';
      executiveFlows.push({
        id: `executive-${step.step_type}-${sequence}-${requesterId}`,
        company_id: companyId,
        department_id: null,
        approver_type: `${user.full_name} (${label})`,
        sequence,
        days_to_approve: 3,
        is_required: true,
        is_active: true,
        workflow_type: 1,
        user_id: user.id,
        alternate_approver_id: null,
        approval_flow_setup_id: 'executive-approval',
        for_checking: step.step_type === 'checker',
      });
      sequence++;
    }

    console.log('[ManCom] Returning executive flows:', executiveFlows.length, executiveFlows);
    return executiveFlows;
  } catch (error) {
    console.error('[ManCom] Error adding executive approval steps:', error);
    return approvalFlows;
  }
}

export async function filterApprovalFlowsForRequester(
  approvalFlows: ApprovalFlow[],
  requesterId: string,
  requesterDepartment: string,
  companyId: string
): Promise<ApprovalFlow[]> {
  try {
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
      const primaryIsRequester = flow.user_id === requesterId;
      const alternateIsRequester = flow.alternate_approver_id === requesterId;
      if (primaryIsRequester && (!flow.alternate_approver_id || alternateIsRequester)) {
        return false;
      }

      if (flow.approver_type === 'Department Head' &&
          requesterProfile.role === 'approver' &&
          requesterProfile.department === requesterDepartment) {
        return false;
      }

      return true;
    });

    const resequencedFlows = filteredFlows.map((flow, index) => ({
      ...flow,
      sequence: index + 1
    }));

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
  const uniqueSequences = [...new Set(approvalFlows.map(f => f.sequence))].sort((a, b) => a - b);

  if (currentLevel >= uniqueSequences.length) {
    return null;
  }

  const targetSequence = uniqueSequences[currentLevel];

  return approvalFlows.find(f => f.sequence === targetSequence) || null;
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
  sequence: number,
  forChecking: boolean = false
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
      for_checking: forChecking,
    });

    if (error) throw error;
  } catch (error) {
    console.error('Error creating approval ledger entry:', error);
    throw error;
  }
}

export async function notifyApprover(
  approverUserId: string,
  requestType: string,
  requestNumber: string,
  requestId: string,
  requesterName: string,
  targetView: string
): Promise<void> {
  try {
    const { error } = await supabase.from('user_notifications').insert({
      user_id: approverUserId,
      title: 'Pending Your Approval',
      message: `${requesterName} submitted ${requestType} ${requestNumber} for your approval`,
      notification_type: 'system',
      request_type: requestType,
      request_number: requestNumber,
      request_id: requestId,
      target_view: targetView,
    });
    if (error) {
      console.error('Error creating approver notification:', error);
    }
  } catch (err) {
    console.error('Error notifying approver:', err);
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
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-approval-email`;

    const headers = {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    };

    const emailData = {
      to: recipientEmail,
      subject: `P2P - ${requestType} ${action} - ${documentNo}`,
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

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(emailData),
    });

    const result = await response.json();

    if (!result.success) {
      console.error('Failed to send email:', result);
      alert(`Email notification failed: ${result.message || 'Unknown error'}. The request was created successfully.`);
    }
  } catch (error) {
    console.error('Error sending approval email:', error);
  }
}

export async function getLastApproverContact(
  requestId: string,
  requestType: string
): Promise<{ email: string; name: string } | null> {
  try {
    const { data: ledger } = await supabase
      .from('approval_ledger')
      .select('approver_id, approver_name, sequence')
      .eq('request_id', requestId)
      .eq('request_type', requestType)
      .eq('action', 'Approved')
      .eq('for_checking', false)
      .order('sequence', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ledger?.approver_id) return null;

    const { data: user } = await supabase
      .from('user_profiles')
      .select('email, full_name')
      .eq('id', ledger.approver_id)
      .maybeSingle();

    if (!user?.email) return null;
    return { email: user.email, name: user.full_name || ledger.approver_name || 'Approver' };
  } catch (error) {
    console.error('Error fetching last approver:', error);
    return null;
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

export async function getAllApproverEmails(
  approvalFlow: ApprovalFlow,
  companyId: string,
  department: string
): Promise<{ email: string; name: string }[]> {
  const results: { email: string; name: string }[] = [];

  const primary = await getApproverEmail(approvalFlow, companyId, department);
  if (primary) results.push(primary);

  if (approvalFlow.alternate_approver_id) {
    const { data: altUser } = await supabase
      .from('user_profiles')
      .select('email, full_name')
      .eq('id', approvalFlow.alternate_approver_id)
      .maybeSingle();
    if (altUser) results.push({ email: altUser.email, name: altUser.full_name || 'User' });
  }

  return results;
}

export async function sendApprovalEmailToAll(
  approvalFlow: ApprovalFlow,
  companyId: string,
  department: string,
  requestType: string,
  documentNo: string,
  requesterName: string,
  totalAmount: number,
  action: string,
  actionBy?: string,
  comments?: string,
  nextApprover?: string,
  requestId?: string
): Promise<void> {
  const recipients = await getAllApproverEmails(approvalFlow, companyId, department);
  for (const recipient of recipients) {
    await sendApprovalEmail(
      recipient.email,
      recipient.name,
      requestType,
      documentNo,
      requesterName,
      department,
      totalAmount,
      action,
      actionBy,
      comments,
      nextApprover
    );
  }

  // Create in-app notification for the approver(s) when a request needs their action
  if (requestId && (action === 'Submitted' || action === 'Approved')) {
    const targetView = getTargetViewForRequestType(requestType);
    if (approvalFlow.user_id) {
      await notifyApprover(approvalFlow.user_id, requestType, documentNo, requestId, requesterName, targetView);
    }
    if (approvalFlow.alternate_approver_id) {
      await notifyApprover(approvalFlow.alternate_approver_id, requestType, documentNo, requestId, requesterName, targetView);
    }
  }
}

function getTargetViewForRequestType(requestType: string): string {
  switch (requestType) {
    case 'Purchase Requisition': return 'pr-approval';
    case 'Canvass': return 'canvass-approval';
    case 'Petty Cash': return 'petty-cash-approval';
    case 'Cash Advance': return 'cash-advance-approval';
    case 'Reimbursement': return 'reimbursement-approval';
    case 'Purchase Order': return 'po-approval';
    default: return 'dashboard';
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

    if (remainingApprovers.length === 0) {
      return;
    }

    for (const flow of remainingApprovers) {
      const approverInfo = await getApproverEmail(flow, companyId, department);

      if (approverInfo) {
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
      }
    }
  } catch (error) {
    console.error('Error creating rejected ledger entries:', error);
    throw error;
  }
}

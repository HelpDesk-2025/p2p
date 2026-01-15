import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Save, Send, Eye, FileText, X, Download, CreditCard as Edit, Loader2, Check, RefreshCw } from 'lucide-react';
import { getApprovalFlow, filterApprovalFlowsForRequester, createApprovalLedgerEntry, sendApprovalEmail, getApproverEmail } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import { generatePettyCashForm } from '../../lib/pettyCashFormGenerator';

interface PaymentMode {
  id: string;
  mode_name: string;
}

interface PettyCashReq {
  id: string;
  pc_number: string;
  request_date: string;
  purpose: string;
  amount: number;
  status: string;
  department?: string;
  company_id?: string;
  budgeted?: boolean;
  rfp_pdf_path?: string;
  payee?: string;
  received_at?: string;
  received_by?: string;
  approved_petty_cash_pdf_path?: string;
  request_type?: string;
}

export function PettyCash() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<PettyCashReq[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<PettyCashReq | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<PettyCashReq | null>(null);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [formData, setFormData] = useState({
    document_no: '',
    payee: '',
    purpose: '',
    amount: 0,
    date_needed: '',
    budgeted: true,
    payment_mode_id: '',
    request_type: 'For Cash Advance',
  });
  const [amountError, setAmountError] = useState('');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const handleAmountChange = (value: number) => {
    if (value > 5000) {
      setAmountError('Petty cash amount cannot exceed ₱5,000.00');
    } else {
      setAmountError('');
    }
    setFormData({ ...formData, amount: value });
  };

  useEffect(() => {
    loadRequests();
    loadPaymentModes();
  }, []);

  useEffect(() => {
    if (profile) {
      loadCompanies();
    }
  }, [profile]);

  useEffect(() => {
    if (selectedCompanyId && !formData.document_no) {
      generateDocumentNo();
    }
  }, [selectedCompanyId]);

  const generateDocumentNo = async () => {
    const companyId = profile?.enable_multi_company_requests ? selectedCompanyId : profile?.company_id;
    if (!companyId) {
      console.error('Company ID not available');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_next_number', {
        p_series_name: 'Petty Cash',
        p_company_id: companyId
      });
      if (error) throw error;
      setFormData(prev => ({ ...prev, document_no: data }));
    } catch (error) {
      console.error('Error generating document number:', error);
    }
  };

  const loadCompanies = async () => {
    try {
      if (!profile) return;

      // If user has multi-company access enabled
      if (profile.enable_multi_company_requests && profile.allowed_companies && profile.allowed_companies.length > 0) {
        const { data, error } = await supabase
          .from('companies')
          .select('id, name')
          .in('id', profile.allowed_companies)
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (error) throw error;
        setCompanies(data || []);

        if (data && data.length > 0) {
          const defaultCompany = data.find(c => c.id === profile.company_id) || data[0];
          setSelectedCompanyId(defaultCompany.id);
          loadDepartments(defaultCompany.id);
        }
      } else {
        // Single company mode - load the user's company details
        setSelectedCompanyId(profile.company_id || '');
        if (profile.company_id) {
          const { data: companyData, error: companyError } = await supabase
            .from('companies')
            .select('id, name')
            .eq('id', profile.company_id)
            .single();

          if (!companyError && companyData) {
            setCompanies([companyData]);
          }

          loadDepartments(profile.company_id);
        }
      }
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const loadDepartments = async (companyId: string) => {
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      setDepartments(data || []);

      if (data && data.length > 0) {
        const defaultDept = profile?.department && data.find(d => d.name === profile.department)
          ? profile.department
          : data[0].name;
        setSelectedDepartment(defaultDept);
      }
    } catch (error) {
      console.error('Error loading departments:', error);
    }
  };

  const handleCompanyChange = (companyId: string) => {
    setSelectedCompanyId(companyId);
    setSelectedDepartment('');
    setDepartments([]);

    if (companyId) {
      loadDepartments(companyId);
    }

    setFormData(prev => ({
      ...prev,
      document_no: '',
    }));
  };

  const loadRequests = async () => {
    if (!profile?.company_id && profile?.role !== 'admin') return;

    let query = supabase
      .from('petty_cash_requests')
      .select('*, user_profiles!petty_cash_requests_requester_id_fkey(company_id), companies!petty_cash_requests_company_id_fkey(id, name)')
      .order('created_at', { ascending: false });

    // Only filter by requester_id if user is not an admin
    if (profile?.role !== 'admin') {
      query = query.eq('requester_id', profile?.id);
    }

    const { data } = await query;

    // For admin users, filter in-memory to show all requests
    const filteredRequests = profile.role === 'admin'
      ? data
      : data?.filter(req => req.company_id === profile.company_id || req.user_profiles?.company_id === profile.company_id);

    setRequests(filteredRequests || []);
  };

  const loadPaymentModes = async () => {
    const { data } = await supabase.from('payment_modes').select('*').eq('is_active', true);
    setPaymentModes(data || []);
  };

  const generateNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `PC-${year}${month}-${random}`;
  };

  const handleEditDraft = (request: PettyCashReq) => {
    setEditingRequest(request);
    setFormData({
      document_no: request.pc_number,
      payee: request.payee,
      purpose: request.purpose,
      amount: request.amount,
      date_needed: (request as any).date_needed || '',
      budgeted: (request as any).budgeted !== undefined ? (request as any).budgeted : true,
      payment_mode_id: (request as any).payment_mode_id || '',
      request_type: request.request_type || 'For Cash Advance',
    });
    setShowViewModal(false);
    setViewingRequest(null);
    setShowForm(true);
  };

  const handleSubmit = async (status: 'draft' | 'pending') => {
    if (formData.amount > 5000) {
      alert('Petty cash amount cannot exceed ₱5,000.00');
      return;
    }

    if (status === 'draft') {
      setSavingDraft(true);
    } else {
      setSubmitting(true);
    }
    setLoading(true);
    try {
      let insertedRequest;

      if (editingRequest) {
        const { data, error } = await supabase
          .from('petty_cash_requests')
          .update({
            payee: formData.payee,
            purpose: formData.purpose,
            amount: formData.amount,
            date_needed: formData.date_needed || null,
            budgeted: formData.budgeted,
            payment_mode_id: formData.payment_mode_id || null,
            request_type: formData.request_type,
            status,
          })
          .eq('id', editingRequest.id)
          .select()
          .single();

        if (error) throw error;
        insertedRequest = data;
      } else {
        const companyId = profile?.enable_multi_company_requests ? selectedCompanyId : profile?.company_id;
        const department = profile?.enable_multi_company_requests ? selectedDepartment : (profile?.department || '');
        const { data, error } = await supabase
          .from('petty_cash_requests')
          .insert({
            pc_number: formData.document_no,
            requester_id: profile?.id,
            company_id: companyId,
            department: department,
            request_date: new Date().toISOString().split('T')[0],
            payee: formData.payee,
            purpose: formData.purpose,
            amount: formData.amount,
            date_needed: formData.date_needed || null,
            budgeted: formData.budgeted,
            payment_mode_id: formData.payment_mode_id || null,
            request_type: formData.request_type,
            status,
            current_approval_level: 0,
          })
          .select()
          .single();

        if (error) throw error;
        insertedRequest = data;
      }

      if (status === 'pending' && insertedRequest) {
        const companyId = profile?.enable_multi_company_requests ? selectedCompanyId : profile?.company_id;
        const department = profile?.enable_multi_company_requests ? selectedDepartment : (profile?.department || '');

        const rawApprovalFlows = await getApprovalFlow(
          companyId,
          department,
          'Petty Cash',
          false,
          formData.amount
        );

        // Filter out requester from approval flows
        const approvalFlows = await filterApprovalFlowsForRequester(
          rawApprovalFlows,
          profile.id,
          department,
          companyId
        );

        if (approvalFlows.length > 0) {
          await createApprovalLedgerEntry(
            'Petty Cash',
            insertedRequest.id,
            formData.document_no,
            profile.id,
            profile.full_name || 'Unknown',
            'Requestor',
            'Submitted',
            'Initial submission',
            0
          );

          const firstApprover = approvalFlows[0];
          const approverInfo = await getApproverEmail(
            firstApprover,
            companyId,
            department
          );

          if (approverInfo) {
            await sendApprovalEmail(
              approverInfo.email,
              approverInfo.name,
              'Petty Cash',
              formData.document_no,
              profile.full_name || 'Unknown',
              department,
              formData.amount,
              'Submitted',
              undefined,
              undefined,
              firstApprover.approver_type
            );
          }
        }
      }

      setShowForm(false);
      setFormData({ document_no: '', payee: '', purpose: '', amount: 0, date_needed: '', budgeted: true, payment_mode_id: '', request_type: 'For Cash Advance' });
      setEditingRequest(null);
      setAmountError('');
      loadRequests();
      if (!editingRequest) {
        generateDocumentNo();
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
      setSavingDraft(false);
      setSubmitting(false);
    }
  };

  const handleSubmitDraft = async (request: PettyCashReq) => {
    if (!confirm('Are you sure you want to submit this draft for approval?')) {
      return;
    }

    setSubmitting(true);
    setLoading(true);
    try {
      const companyId = request.company_id || profile?.company_id;
      const department = request.department || profile?.department || '';

      if (!companyId) {
        throw new Error('Company information not found');
      }

      const rawApprovalFlows = await getApprovalFlow(
        companyId,
        department,
        'Petty Cash',
        request.budgeted || false,
        request.amount
      );

      if (!rawApprovalFlows || rawApprovalFlows.length === 0) {
        throw new Error('No approval flow configured for this request. Please contact administrator.');
      }

      // Filter out requester from approval flows
      const approvalFlows = await filterApprovalFlowsForRequester(
        rawApprovalFlows,
        profile.id,
        department,
        companyId
      );

      if (!approvalFlows || approvalFlows.length === 0) {
        throw new Error('No additional approvers required for this request.');
      }

      const { error: updateError } = await supabase
        .from('petty_cash_requests')
        .update({ status: 'pending', current_approval_level: 0 })
        .eq('id', request.id);

      if (updateError) throw updateError;

      await createApprovalLedgerEntry(
        'Petty Cash',
        request.id,
        request.pc_number,
        profile.id,
        profile.full_name || 'Unknown',
        'Requestor',
        'Submitted',
        'Initial submission',
        0
      );

      const firstApprover = approvalFlows[0];
      const approverInfo = await getApproverEmail(
        firstApprover,
        companyId,
        department
      );

      if (approverInfo) {
        await sendApprovalEmail(
          approverInfo.email,
          approverInfo.name,
          'Petty Cash',
          request.pc_number,
          profile.full_name || 'Unknown',
          department,
          request.amount,
          'Submitted',
          undefined,
          undefined,
          firstApprover.approver_type
        );
      }

      setShowViewModal(false);
      setViewingRequest(null);
      alert('Draft submitted for approval successfully!');
      await loadRequests();
    } catch (error: any) {
      console.error('Error submitting draft:', error);
      alert('Failed to submit draft: ' + error.message);
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  };

  const handleReceivePettyCash = async (request: PettyCashReq) => {
    if (!confirm('Are you sure you want to mark this petty cash as received? This will generate the approved petty cash form.')) {
      return;
    }

    setLoading(true);
    try {
      if (!profile?.company_id) {
        throw new Error('Company information not found');
      }

      // Get approval ledger entries to find first approver
      const { data: ledgerData, error: ledgerError } = await supabase
        .from('approval_ledger')
        .select(`
          approver_name,
          approval_date,
          sequence,
          approver_id,
          user_profiles!approval_ledger_approver_id_fkey (
            e_sig
          )
        `)
        .eq('request_type', 'Petty Cash')
        .eq('request_id', request.id)
        .eq('action', 'Approved')
        .order('sequence', { ascending: true });

      if (ledgerError) throw ledgerError;

      if (!ledgerData || ledgerData.length === 0) {
        throw new Error('No approval records found');
      }

      const firstApprover = ledgerData[0];

      // Generate approved petty cash PDF
      const pdfBytes = await generatePettyCashForm({
        pcNumber: request.pc_number,
        recipient: request.payee || profile.full_name || 'Unknown',
        requestDate: new Date(request.request_date).toLocaleDateString(),
        particulars: request.purpose,
        amount: request.amount,
        approvedByName: firstApprover.approver_name,
        approvedByEsig: firstApprover.user_profiles?.e_sig || null,
        approvedByDate: new Date(firstApprover.approval_date).toLocaleDateString(),
        receivedByName: profile.full_name || 'Unknown',
        receivedByEsig: profile.e_sig || null,
        receivedByDate: new Date().toLocaleDateString(),
      });

      // Upload PDF to storage
      const pdfFileName = `approved_petty_cash_${request.pc_number}_${Date.now()}.pdf`;
      const pdfPath = `petty_cash/${profile.company_id}/${pdfFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(pdfPath, pdfBytes, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Update request with received status
      const { error: updateError } = await supabase
        .from('petty_cash_requests')
        .update({
          received_at: new Date().toISOString(),
          received_by: profile.id,
          approved_petty_cash_pdf_path: pdfPath,
        })
        .eq('id', request.id);

      if (updateError) throw updateError;

      alert('Petty cash marked as received successfully! The approved form has been generated.');
      await loadRequests();
      setShowViewModal(false);
      setViewingRequest(null);
    } catch (error: any) {
      console.error('Error receiving petty cash:', error);
      alert('Failed to receive petty cash: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-slate-100 text-slate-700',
      pending: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      disbursed: 'bg-blue-100 text-blue-700',
    };
    return colors[status] || 'bg-slate-100 text-slate-700';
  };

  const downloadRFP = async (rfpPath: string, pcNumber: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(rfpPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RFP_${pcNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading RFP:', error);
      alert('Failed to download RFP');
    }
  };

  const downloadApprovedPettyCash = async (pdfPath: string, pcNumber: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(pdfPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Approved_Petty_Cash_${pcNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading approved petty cash PDF:', error);
      alert('Failed to download PDF');
    }
  };

  const previewApprovedPettyCash = async (pdfPath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(pdfPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error previewing approved petty cash PDF:', error);
      alert('Failed to preview PDF');
    }
  };

  const handleRegenerateApprovedPettyCash = async (request: PettyCashReq) => {
    if (!confirm('Are you sure you want to regenerate the approved petty cash form? This will replace the existing document.')) {
      return;
    }

    setLoading(true);
    try {
      if (!profile?.company_id) {
        throw new Error('Company information not found');
      }

      const { data: ledgerData, error: ledgerError } = await supabase
        .from('approval_ledger')
        .select(`
          approver_name,
          approval_date,
          sequence,
          approver_id,
          user_profiles!approval_ledger_approver_id_fkey (
            e_sig
          )
        `)
        .eq('request_type', 'Petty Cash')
        .eq('request_id', request.id)
        .eq('action', 'Approved')
        .order('sequence', { ascending: true });

      if (ledgerError) throw ledgerError;

      if (!ledgerData || ledgerData.length === 0) {
        throw new Error('No approval records found');
      }

      const firstApprover = ledgerData[0];

      const pdfBytes = await generatePettyCashForm({
        pcNumber: request.pc_number,
        recipient: request.payee || profile.full_name || 'Unknown',
        requestDate: new Date(request.request_date).toLocaleDateString(),
        particulars: request.purpose,
        amount: request.amount,
        approvedByName: firstApprover.approver_name,
        approvedByEsig: firstApprover.user_profiles?.e_sig || null,
        approvedByDate: new Date(firstApprover.approval_date).toLocaleDateString(),
        receivedByName: profile.full_name || 'Unknown',
        receivedByEsig: profile.e_sig || null,
        receivedByDate: new Date(request.received_at || new Date()).toLocaleDateString(),
      });

      const pdfFileName = `approved_petty_cash_${request.pc_number}_${Date.now()}.pdf`;
      const pdfPath = `petty_cash/${profile.company_id}/${pdfFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(pdfPath, pdfBytes, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('petty_cash_requests')
        .update({
          approved_petty_cash_pdf_path: pdfPath,
        })
        .eq('id', request.id);

      if (updateError) throw updateError;

      alert('Approved petty cash form regenerated successfully!');
      await loadRequests();
      setShowViewModal(false);
      setViewingRequest(null);
    } catch (error: any) {
      console.error('Error regenerating approved petty cash:', error);
      alert('Failed to regenerate approved petty cash form: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (showForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">{editingRequest ? 'Edit Petty Cash Request' : 'New Petty Cash Request'}</h2>
          <button onClick={() => { setShowForm(false); setEditingRequest(null); setAmountError(''); }} className="px-4 py-2 text-slate-600">
            Cancel
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Document No.</label>
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg">
              <FileText size={18} className="text-slate-400" />
              <span className="font-mono font-semibold text-slate-900">{formData.document_no}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profile?.enable_multi_company_requests ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Company
                </label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                  required
                >
                  <option value="">Select Company</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company</label>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg">
                  <span className="font-semibold text-slate-900">{companies[0]?.name || profile?.company_name || 'N/A'}</span>
                </div>
              </div>
            )}
            {profile?.enable_multi_company_requests ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Department
                </label>
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
                  required
                  disabled={!selectedCompanyId}
                >
                  <option value="">Select Department</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.name}>
                      {dept.name}
                    </option>
                  ))}
                </select>
                {!selectedCompanyId && (
                  <p className="text-xs text-amber-600 mt-1">Select a company first</p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg">
                  <span className="font-semibold text-slate-900">{profile?.department || 'N/A'}</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">To / Recipient</label>
            <input
              type="text"
              value={formData.payee}
              onChange={(e) => setFormData({ ...formData, payee: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Request Type</label>
            <select
              value={formData.request_type}
              onChange={(e) => setFormData({ ...formData, request_type: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
              required
            >
              <option value="For Cash Advance">For Cash Advance</option>
              <option value="For Reimbursement/Liquidation">For Reimbursement/Liquidation</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Purpose / Particulars</label>
            <textarea
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Amount <span className="text-xs text-slate-500">(Maximum: ₱5,000.00)</span>
            </label>
            <input
              type="number"
              value={formData.amount}
              onChange={(e) => handleAmountChange(Number(e.target.value))}
              max={5000}
              step="0.01"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 outline-none ${
                amountError
                  ? 'border-red-300 focus:ring-red-500'
                  : 'border-slate-300 focus:ring-blue-500'
              }`}
              required
            />
            {amountError && (
              <p className="mt-1 text-sm text-red-600">{amountError}</p>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <button
              onClick={() => {
                if (confirm('Are you sure you want to submit this petty cash request for approval?')) {
                  handleSubmit('pending');
                }
              }}
              disabled={loading || !!amountError}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Petty Cash Requests</h2>
        <button
          onClick={() => {
            setShowForm(true);
            generateDocumentNo();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          New Request
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                PC Number
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                Date
              </th>
              {(profile?.enable_multi_company_requests || profile?.role === 'admin') && (
                <>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Department
                  </th>
                </>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                Purpose
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {requests.length === 0 ? (
              <tr>
                <td colSpan={profile?.enable_multi_company_requests || profile?.role === 'admin' ? 8 : 6} className="px-6 py-8 text-center text-slate-500">
                  No petty cash requests found
                </td>
              </tr>
            ) : (
              requests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{req.pc_number}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {new Date(req.request_date).toLocaleDateString()}
                  </td>
                  {(profile?.enable_multi_company_requests || profile?.role === 'admin') && (
                    <>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {(req as any).companies?.name || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {req.department || 'N/A'}
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                    {req.purpose}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900 text-right font-mono">
                    {formatCurrency(req.amount)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(req.status)}`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => {
                        setViewingRequest(req);
                        setShowViewModal(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <Eye size={16} />
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showViewModal && viewingRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Petty Cash Request Details</h3>
                <p className="text-sm text-slate-600 mt-1">{viewingRequest.pc_number}</p>
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingRequest(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {(viewingRequest.status === 'pending' || viewingRequest.status === 'approved' || viewingRequest.status === 'rejected') && (
                <ApprovalProgressTracker
                  requestType="Petty Cash"
                  requestId={viewingRequest.id}
                />
              )}

              {viewingRequest.status === 'approved' && !viewingRequest.received_at && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                  <Check size={20} className="text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-green-900">Request Approved - Ready for Receiving</h4>
                    <p className="text-sm text-green-700 mt-1">
                      Your petty cash request has been fully approved. Click the "Receive Cash" button below to mark it as received and generate the approved form.
                    </p>
                  </div>
                </div>
              )}

              {viewingRequest.status === 'approved' && viewingRequest.received_at && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                  <Check size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-blue-900">Cash Received</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      Received on {new Date(viewingRequest.received_at).toLocaleDateString()} at {new Date(viewingRequest.received_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">PC Number</label>
                  <p className="text-slate-900 font-mono">{viewingRequest.pc_number}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Request Date</label>
                  <p className="text-slate-900">{new Date(viewingRequest.request_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Company</label>
                  <p className="text-slate-900">{(viewingRequest as any).companies?.name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Department</label>
                  <p className="text-slate-900">{viewingRequest.department || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">To / Receipient</label>
                  <p className="text-slate-900">{viewingRequest.payee || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Request Type</label>
                  <p className="text-slate-900">{viewingRequest.request_type || 'For Cash Advance'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Amount</label>
                  <p className="text-slate-900 font-bold">{formatCurrency(viewingRequest.amount)}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-semibold text-slate-700">Status</label>
                  <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(viewingRequest.status)}`}>
                    {viewingRequest.status}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Purpose / Particulars</label>
                <p className="text-slate-900">{viewingRequest.purpose}</p>
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {viewingRequest.status === 'draft' && (
                  <>
                    <button
                      onClick={() => handleEditDraft(viewingRequest)}
                      disabled={loading}
                      className="flex items-center gap-2 px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Edit size={18} />
                      Edit Draft
                    </button>
                    <button
                      onClick={() => handleSubmitDraft(viewingRequest)}
                      disabled={loading}
                      className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                      {submitting ? 'Submitting...' : 'Submit for Approval'}
                    </button>
                  </>
                )}
                {viewingRequest.status === 'approved' && !viewingRequest.received_at && (
                  <button
                    onClick={() => handleReceivePettyCash(viewingRequest)}
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                    {loading ? 'Processing...' : 'Receive Cash'}
                  </button>
                )}
                {viewingRequest.status === 'approved' && viewingRequest.received_at && viewingRequest.approved_petty_cash_pdf_path && (
                  <>
                    <button
                      onClick={() => previewApprovedPettyCash(viewingRequest.approved_petty_cash_pdf_path!)}
                      className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      <Eye size={18} />
                      Preview Form
                    </button>
                    <button
                      onClick={() => downloadApprovedPettyCash(viewingRequest.approved_petty_cash_pdf_path!, viewingRequest.pc_number)}
                      className="flex items-center gap-2 px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition"
                    >
                      <Download size={18} />
                      Download Form
                    </button>
                    {profile?.role === 'admin' && (
                      <button
                        onClick={() => handleRegenerateApprovedPettyCash(viewingRequest)}
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                        {loading ? 'Regenerating...' : 'Regenerate Document'}
                      </button>
                    )}
                  </>
                )}
                {viewingRequest.status === 'approved' && viewingRequest.rfp_pdf_path && (
                  <button
                    onClick={() => downloadRFP(viewingRequest.rfp_pdf_path!, viewingRequest.pc_number)}
                    className="flex items-center gap-2 px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition"
                  >
                    <Download size={18} />
                    Download RFP
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingRequest(null);
                }}
                className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

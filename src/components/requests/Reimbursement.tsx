import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Save, Send, Eye, FileText, X, Download, CreditCard as Edit, Loader2, RefreshCw, Upload, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { getApprovalFlow, addExecutiveApprovalSteps, filterApprovalFlowsForRequester, createApprovalLedgerEntry, sendApprovalEmail, getApproverEmail } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import { mergeFilesToPDFBlob } from '../../lib/pdfMerger';
import { uploadLargeFile } from '../../lib/storageHelper';
import Pagination from '../Pagination';

interface ExpenseItem {
  date: string;
  description: string;
  amount: number;
}

interface Attachment {
  name: string;
  path: string;
  type: string;
  size: number;
}

interface ReimbursementReq {
  id: string;
  reimb_number: string;
  request_date: string;
  purpose: string;
  amount: number;
  status: string;
  company_id?: string;
  department?: string;
  budgeted?: boolean;
  rfp_pdf_path?: string;
  reimbursement_form_pdf_path?: string;
  merged_pdf_path?: string;
  requester_id?: string;
  expense_items?: ExpenseItem[];
  attachments?: Attachment[];
  user_profiles?: {
    company_id?: string;
    full_name?: string;
  };
  companies?: {
    id: string;
    name: string;
  };
}

export function Reimbursement() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<ReimbursementReq[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<ReimbursementReq | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<ReimbursementReq | null>(null);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([
    { date: '', description: '', amount: 0 }
  ]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [cashAdvance, setCashAdvance] = useState<number>(0);
  const [requestType, setRequestType] = useState<'Reimbursement' | 'Liquidation'>('Reimbursement');
  const [approvedRequests, setApprovedRequests] = useState<any[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');
  const [selectedRequestType, setSelectedRequestType] = useState<'Cash Advance' | 'Petty Cash' | ''>('');
  const [linkedRequestDetails, setLinkedRequestDetails] = useState<any>(null);
  const [sortColumn, setSortColumn] = useState<string>('request_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [formData, setFormData] = useState({
    document_no: '',
    payee: '',
    date_needed: '',
    purpose: '',
  });

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    if (profile) {
      loadCompanies();
    }
  }, [profile]);

  useEffect(() => {
    if (requestType === 'Liquidation') {
      loadApprovedRequestsForLiquidation();
    } else {
      setApprovedRequests([]);
      setSelectedRequestId('');
      setSelectedRequestType('');
      setCashAdvance(0);
    }
  }, [requestType, profile?.id, editingRequest?.id]);

  const generateDocumentNo = async () => {
    const companyId = profile?.enable_multi_company_requests ? selectedCompanyId : profile?.company_id;
    if (!companyId) {
      console.error('Company ID not available');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_next_number', {
        p_series_name: 'Reimbursement',
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
      .from('reimbursement_requests')
      .select('*, user_profiles!reimbursement_requests_requester_id_fkey(company_id, full_name), companies!reimbursement_requests_company_id_fkey(id, name)')
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

  const loadApprovedRequestsForLiquidation = async () => {
    if (!profile?.id) return;

    try {
      // Get all linked_cash_advance_id values from reimbursement requests that are pending, approved, or reimbursed
      // Exclude the currently editing request if applicable
      let query = supabase
        .from('reimbursement_requests')
        .select('linked_cash_advance_id, cash_advance_type')
        .in('status', ['pending', 'approved', 'reimbursed'])
        .not('linked_cash_advance_id', 'is', null);

      // If editing a request, exclude it from the "used" list
      if (editingRequest?.id) {
        query = query.neq('id', editingRequest.id);
      }

      const { data: usedRequestsData } = await query;

      // Extract the IDs that are already used, grouped by type
      const usedCashAdvanceIds = new Set(
        (usedRequestsData || [])
          .filter(req => req.cash_advance_type === 'Cash Advance')
          .map(req => req.linked_cash_advance_id)
      );

      const usedPettyCashIds = new Set(
        (usedRequestsData || [])
          .filter(req => req.cash_advance_type === 'Petty Cash')
          .map(req => req.linked_cash_advance_id)
      );

      // Load approved cash advance requests
      const { data: cashAdvanceData } = await supabase
        .from('cash_advance_requests')
        .select('id, ca_number, request_date, amount, purpose')
        .eq('requester_id', profile.id)
        .eq('status', 'approved')
        .order('request_date', { ascending: false });

      // Load approved petty cash requests with request_type = 'For Cash Advance'
      const { data: pettyCashData } = await supabase
        .from('petty_cash_requests')
        .select('id, pc_number, request_date, amount, purpose, request_type')
        .eq('requester_id', profile.id)
        .eq('status', 'approved')
        .eq('request_type', 'For Cash Advance')
        .order('request_date', { ascending: false });

      // Filter out already used requests and combine the data
      const combined = [
        ...(cashAdvanceData || [])
          .filter(req => !usedCashAdvanceIds.has(req.id))
          .map(req => ({
            ...req,
            type: 'Cash Advance',
            display_number: req.ca_number,
          })),
        ...(pettyCashData || [])
          .filter(req => !usedPettyCashIds.has(req.id))
          .map(req => ({
            ...req,
            type: 'Petty Cash',
            display_number: req.pc_number,
          })),
      ].sort((a, b) => new Date(b.request_date).getTime() - new Date(a.request_date).getTime());

      setApprovedRequests(combined);
    } catch (error) {
      console.error('Error loading approved requests:', error);
    }
  };

  const generateNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `RB-${year}${month}-${random}`;
  };

  const addExpenseItem = () => {
    setExpenseItems([...expenseItems, { date: '', description: '', amount: 0 }]);
  };

  const removeExpenseItem = (index: number) => {
    if (expenseItems.length > 1) {
      setExpenseItems(expenseItems.filter((_, i) => i !== index));
    }
  };

  const updateExpenseItem = (index: number, field: keyof ExpenseItem, value: string | number) => {
    const updated = [...expenseItems];
    updated[index] = { ...updated[index], [field]: value };
    setExpenseItems(updated);
  };

  const calculateTotalExpenditures = () => {
    return expenseItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  };

  const handleRequestSelection = (requestId: string) => {
    setSelectedRequestId(requestId);
    const selectedRequest = approvedRequests.find(req => req.id === requestId);
    if (selectedRequest) {
      setCashAdvance(selectedRequest.amount);
      setSelectedRequestType(selectedRequest.type);
    } else {
      setCashAdvance(0);
      setSelectedRequestType('');
    }
  };

  const loadLinkedRequestDetails = async (linkedId: string, type: 'Cash Advance' | 'Petty Cash') => {
    try {
      if (type === 'Cash Advance') {
        const { data, error } = await supabase
          .from('cash_advance_requests')
          .select('id, ca_number, request_date, amount, purpose')
          .eq('id', linkedId)
          .single();

        if (error) throw error;
        setLinkedRequestDetails({ ...data, type: 'Cash Advance', display_number: data.ca_number });
      } else if (type === 'Petty Cash') {
        const { data, error } = await supabase
          .from('petty_cash_requests')
          .select('id, pc_number, request_date, amount, purpose')
          .eq('id', linkedId)
          .single();

        if (error) throw error;
        setLinkedRequestDetails({ ...data, type: 'Petty Cash', display_number: data.pc_number });
      }
    } catch (error) {
      console.error('Error loading linked request details:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);

      // Validate file types (only images and PDFs)
      const validFiles = selectedFiles.filter(file => {
        const type = file.type;
        return type.startsWith('image/') || type === 'application/pdf';
      });

      if (validFiles.length !== selectedFiles.length) {
        alert('Only image and PDF files are allowed');
      }

      setAttachments(prev => [...prev, ...validFiles]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const uploadAttachments = async (requestId: string, companyId: string) => {
    const uploadedPaths: Attachment[] = [];

    for (const file of attachments) {
      const fileExt = file.name.split('.').pop();
      const fileName = `reimbursement/${companyId}/${requestId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(fileName, file);

      if (uploadError) {
        console.error('Error uploading file:', uploadError);
        throw uploadError;
      }

      uploadedPaths.push({
        name: file.name,
        path: fileName,
        type: file.type,
        size: file.size
      });
    }

    return uploadedPaths;
  };

  const mergeAndUploadAttachmentsPDF = async (requestId: string, files: File[]) => {
    try {
      if (files.length === 0) {
        return null;
      }

      // Merge all attachments (images and PDFs) into a single PDF
      const mergedPdfBlob = await mergeFilesToPDFBlob(files);

      // Upload merged PDF
      const mergedFileName = `${requestId}/merged_attachments_${Date.now()}.pdf`;

      // Convert blob to ArrayBuffer for more efficient upload
      const arrayBuffer = await mergedPdfBlob.arrayBuffer();

      try {
        const { path } = await uploadLargeFile(mergedFileName, arrayBuffer, 'application/pdf');
        return path;
      } catch (uploadError: any) {
        console.error('Error uploading merged PDF:', uploadError);
        throw new Error(`Failed to upload merged PDF: ${uploadError.message || uploadError}`);
      }
    } catch (error) {
      console.error('Error merging and uploading attachments PDF:', error);
      throw error;
    }
  };

  const handleEditDraft = (request: ReimbursementReq) => {
    setEditingRequest(request);
    setFormData({
      document_no: request.reimb_number,
      payee: (request as any).payee || '',
      date_needed: (request as any).date_needed || '',
      purpose: request.purpose,
    });
    setExpenseItems(request.expense_items && request.expense_items.length > 0
      ? request.expense_items
      : [{ date: '', description: '', amount: 0 }]
    );
    setRequestType((request as any).request_type || 'Reimbursement');
    setCashAdvance((request as any).cash_advance || 0);
    setSelectedRequestId((request as any).linked_cash_advance_id || '');
    setSelectedRequestType((request as any).cash_advance_type || '');
    setShowViewModal(false);
    setViewingRequest(null);
    setLinkedRequestDetails(null);
    setShowForm(true);
  };

  const handleSubmit = async (status: 'draft' | 'pending') => {
    // Validate attachments are required for reimbursement
    if (attachments.length === 0 && !editingRequest) {
      alert('Please upload receipts/supporting documents. Attachments are required for reimbursement requests.');
      return;
    }

    // For editing, check if attachments exist either as new uploads or existing ones
    if (editingRequest && attachments.length === 0 && (!editingRequest.attachments || editingRequest.attachments.length === 0)) {
      alert('Please upload receipts/supporting documents. Attachments are required for reimbursement requests.');
      return;
    }

    if (status === 'draft') {
      setSavingDraft(true);
    } else {
      setSubmitting(true);
    }
    setLoading(true);
    try {
      const totalAmount = calculateTotalExpenditures();

      if (totalAmount === 0) {
        alert('Please add at least one expense item with an amount');
        return;
      }

      if (totalAmount < 5000) {
        alert('Total Expenditures must not be lower than ₱5,000.00');
        return;
      }

      let insertedRequest;

      if (editingRequest) {
        // Upload attachments if any
        let uploadedAttachments: Attachment[] = [];
        let mergedPdfPath: string | null = null;
        if (attachments.length > 0) {
          setUploadingFiles(true);
          const requestCompanyId = editingRequest.company_id || profile?.company_id;
          if (!requestCompanyId) throw new Error('Company ID is required');
          uploadedAttachments = await uploadAttachments(editingRequest.id, requestCompanyId);
          // Merge attachments into a single PDF
          mergedPdfPath = await mergeAndUploadAttachmentsPDF(editingRequest.id, requestCompanyId, attachments);
        }

        const { data, error } = await supabase
          .from('reimbursement_requests')
          .update({
            payee: formData.payee,
            purpose: formData.purpose,
            amount: totalAmount,
            expense_items: expenseItems,
            request_type: requestType,
            cash_advance: cashAdvance,
            linked_cash_advance_id: requestType === 'Liquidation' && selectedRequestId ? selectedRequestId : null,
            cash_advance_type: requestType === 'Liquidation' && selectedRequestType ? selectedRequestType : null,
            date_needed: formData.date_needed || null,
            attachments: uploadedAttachments.length > 0 ? uploadedAttachments : (editingRequest.attachments || []),
            merged_pdf_path: mergedPdfPath || editingRequest.merged_pdf_path,
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

        // First create the request
        const { data, error } = await supabase
          .from('reimbursement_requests')
          .insert({
            reimb_number: formData.document_no,
            requester_id: profile?.id,
            company_id: companyId,
            department: department,
            request_date: new Date().toISOString(),
            payee: formData.payee,
            purpose: formData.purpose,
            amount: totalAmount,
            expense_items: expenseItems,
            request_type: requestType,
            cash_advance: cashAdvance,
            linked_cash_advance_id: requestType === 'Liquidation' && selectedRequestId ? selectedRequestId : null,
            cash_advance_type: requestType === 'Liquidation' && selectedRequestType ? selectedRequestType : null,
            date_needed: formData.date_needed || null,
            status,
            current_approval_level: 0,
          })
          .select()
          .single();

        if (error) throw error;
        insertedRequest = data;

        // Upload attachments after creating the request
        if (attachments.length > 0) {
          setUploadingFiles(true);
          if (!companyId) throw new Error('Company ID is required');
          const uploadedAttachments = await uploadAttachments(insertedRequest.id, companyId);

          // Merge attachments into a single PDF
          const mergedPdfPath = await mergeAndUploadAttachmentsPDF(insertedRequest.id, companyId, attachments);

          // Update the request with attachment paths and merged PDF
          await supabase
            .from('reimbursement_requests')
            .update({
              attachments: uploadedAttachments,
              merged_pdf_path: mergedPdfPath
            })
            .eq('id', insertedRequest.id);

          setUploadingFiles(false);
        }
      }

      if (status === 'pending' && insertedRequest) {
        const requestCompanyId = insertedRequest.company_id;
        const requestDepartment = insertedRequest.department || '';

        const rawApprovalFlows = await getApprovalFlow(
          requestCompanyId,
          requestDepartment,
          'Reimbursement',
          false,
          totalAmount
        );

        // Add executive approval steps if requester is Executive
        let flowsWithExecutive = await addExecutiveApprovalSteps(
          rawApprovalFlows,
          profile.id,
          requestCompanyId
        );

        // Filter out requester from approval flows
        const approvalFlows = await filterApprovalFlowsForRequester(
          flowsWithExecutive,
          profile.id,
          requestDepartment,
          requestCompanyId
        );

        if (approvalFlows.length > 0) {
          await createApprovalLedgerEntry(
            'Reimbursement',
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
            requestCompanyId,
            requestDepartment
          );

          if (approverInfo) {
            await sendApprovalEmail(
              approverInfo.email,
              approverInfo.name,
              'Reimbursement',
              formData.document_no,
              profile.full_name || 'Unknown',
              requestDepartment,
              totalAmount,
              'Submitted',
              undefined,
              undefined,
              firstApprover.approver_type
            );
          }
        }
      }

      setShowForm(false);
      setFormData({ document_no: '', payee: '', date_needed: '', purpose: '' });
      setExpenseItems([{ date: '', description: '', amount: 0 }]);
      setRequestType('Reimbursement');
      setCashAdvance(0);
      setSelectedRequestId('');
      setSelectedRequestType('');
      setApprovedRequests([]);
      setAttachments([]);
      setEditingRequest(null);
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
      setUploadingFiles(false);
    }
  };

  const handleSubmitDraft = async (request: ReimbursementReq) => {
    // Validate attachments before submitting draft
    if (!request.attachments || request.attachments.length === 0) {
      alert('Please upload receipts/supporting documents before submitting. Attachments are required for reimbursement requests.');
      return;
    }

    if (!confirm('Are you sure you want to submit this draft for approval?')) {
      return;
    }

    setSubmitting(true);
    setLoading(true);
    try {
      if (!request.company_id) {
        throw new Error('Company information not found');
      }

      const department = request.department || profile?.department || '';
      const rawApprovalFlows = await getApprovalFlow(
        request.company_id,
        department,
        'Reimbursement',
        false,
        request.amount
      );

      if (!rawApprovalFlows || rawApprovalFlows.length === 0) {
        throw new Error('No approval flow configured for this request. Please contact administrator.');
      }

      // Add executive approval steps if requester is Executive
      let flowsWithExecutive = await addExecutiveApprovalSteps(
        rawApprovalFlows,
        profile.id,
        request.company_id
      );

      // Filter out requester from approval flows
      const approvalFlows = await filterApprovalFlowsForRequester(
        flowsWithExecutive,
        profile.id,
        department,
        request.company_id
      );

      if (!approvalFlows || approvalFlows.length === 0) {
        throw new Error('No additional approvers required for this request.');
      }

      const { error: updateError } = await supabase
        .from('reimbursement_requests')
        .update({ status: 'pending', current_approval_level: 0 })
        .eq('id', request.id);

      if (updateError) throw updateError;

      await createApprovalLedgerEntry(
        'Reimbursement',
        request.id,
        request.reimb_number,
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
        request.company_id,
        department
      );

      if (approverInfo) {
        await sendApprovalEmail(
          approverInfo.email,
          approverInfo.name,
          'Reimbursement',
          request.reimb_number,
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
      setLinkedRequestDetails(null);
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

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-slate-100 text-slate-700',
      pending: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      reimbursed: 'bg-blue-100 text-blue-700',
    };
    return colors[status] || 'bg-slate-100 text-slate-700';
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown size={14} className="opacity-40" />;
    }
    return sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  };

  const sortedRequests = [...requests].sort((a, b) => {
    let aVal: any;
    let bVal: any;

    switch (sortColumn) {
      case 'reimb_number':
        aVal = a.reimb_number;
        bVal = b.reimb_number;
        break;
      case 'request_date':
        aVal = new Date(a.request_date).getTime();
        bVal = new Date(b.request_date).getTime();
        break;
      case 'purpose':
        aVal = a.purpose;
        bVal = b.purpose;
        break;
      case 'amount':
        aVal = a.amount;
        bVal = b.amount;
        break;
      case 'status':
        aVal = a.status;
        bVal = b.status;
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedRequests.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRequests = sortedRequests.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const downloadRFP = async (rfpPath: string, reimbNumber: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(rfpPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RFP_${reimbNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading RFP:', error);
      alert('Failed to download RFP');
    }
  };

  const previewReimbursementForm = async (pdfPath: string, reimbNumber: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(pdfPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error previewing reimbursement form:', error);
      alert('Failed to preview reimbursement form');
    }
  };

  const downloadReimbursementForm = async (pdfPath: string, reimbNumber: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(pdfPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reimbNumber}_Approved_Form.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading reimbursement form:', error);
      alert('Failed to download reimbursement form');
    }
  };

  const regenerateReimbursementForm = async (request: ReimbursementReq) => {
    if (!confirm('Are you sure you want to regenerate the reimbursement form PDF? This will replace the existing form.')) {
      return;
    }

    setLoading(true);
    try {
      // Fetch the complete request data from the database
      const { data: fullRequest, error: fetchError } = await supabase
        .from('reimbursement_requests')
        .select('*, user_profiles!reimbursement_requests_requester_id_fkey(full_name, e_sig), companies!reimbursement_requests_company_id_fkey(id, name)')
        .eq('id', request.id)
        .single();

      if (fetchError) throw fetchError;
      if (!fullRequest) throw new Error('Request not found');
      if (!fullRequest.requester_id) throw new Error('Requester information not found');

      // Import the form generator
      const { generateReimbursementForm } = await import('../../lib/reimbursementFormGenerator');

      // Get linked request details if this is a liquidation
      let linkedDetails = null;
      if (fullRequest.request_type === 'Liquidation' && fullRequest.linked_cash_advance_id) {
        const linkedType = fullRequest.cash_advance_type;
        const linkedId = fullRequest.linked_cash_advance_id;

        if (linkedType === 'Cash Advance') {
          const { data, error } = await supabase
            .from('cash_advance_requests')
            .select('ca_number, request_date, amount, purpose')
            .eq('id', linkedId)
            .single();

          if (!error && data) {
            linkedDetails = {
              type: 'Cash Advance',
              display_number: data.ca_number,
              request_date: data.request_date,
              amount: data.amount,
              purpose: data.purpose
            };
          }
        } else if (linkedType === 'Petty Cash') {
          const { data, error } = await supabase
            .from('petty_cash_requests')
            .select('pc_number, request_date, amount, purpose')
            .eq('id', linkedId)
            .single();

          if (!error && data) {
            linkedDetails = {
              type: 'Petty Cash',
              display_number: data.pc_number,
              request_date: data.request_date,
              amount: data.amount,
              purpose: data.purpose
            };
          }
        }
      }

      // Use RPC function to get approval records (excludes for_checking approvers)
      const { data: approvalRecordsData, error: ledgerError } = await supabase
        .rpc('get_approval_records_with_signatures', {
          p_request_id: fullRequest.id,
          p_request_type: 'Reimbursement'
        });

      if (ledgerError) throw ledgerError;

      // RPC now returns JSONB array directly
      const approvalRecords = Array.isArray(approvalRecordsData) ? approvalRecordsData : (approvalRecordsData ? [approvalRecordsData] : []);

      // Fetch signature data for each approver to avoid HTTP header size limits
      const approvalsWithSignatures = await Promise.all(
        (approvalRecords || []).map(async (record: any) => {
          let signatureData = null;

          if (record.approver_esig && record.approver_esig.startsWith('attachments/')) {
            try {
              const { data: fileData } = await supabase.storage
                .from('attachments')
                .download(record.approver_esig);

              if (fileData) {
                const arrayBuffer = await fileData.arrayBuffer();
                const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                signatureData = `data:${fileData.type};base64,${base64}`;
              }
            } catch (error) {
              console.error('Failed to fetch signature from storage:', error);
            }
          }

          if (!signatureData && record.approver_id) {
            const { data: profileData } = await supabase
              .from('user_profiles')
              .select('e_sig')
              .eq('id', record.approver_id)
              .single();

            if (profileData?.e_sig) {
              signatureData = profileData.e_sig;
            }
          }

          return {
            ...record,
            approver_esig: signatureData
          };
        })
      );

      // Use the requester info from the fetched request
      const requesterData = {
        full_name: fullRequest.user_profiles?.full_name || 'Unknown',
        e_sig: fullRequest.user_profiles?.e_sig || null
      };

      // Calculate net amount
      const netAmount = fullRequest.amount - (fullRequest.cash_advance || 0);

      // Get company name
      const companyName = fullRequest.companies?.name || 'N/A';

      // Generate ONLY the reimbursement form PDF (no attachments, no linked forms)
      const requestDateObj = new Date(fullRequest.request_date);
      const reimbursementFormBytes = await generateReimbursementForm({
        reimbNumber: fullRequest.reimb_number,
        requestType: fullRequest.request_type || 'Reimbursement',
        requestedBy: requesterData.full_name || 'Unknown',
        requestedByEsig: requesterData.e_sig || null,
        requestDate: requestDateObj.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
          requestDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        company: companyName,
        department: fullRequest.department || 'N/A',
        linkedRequestType: linkedDetails?.type || undefined,
        linkedRequestNumber: linkedDetails?.display_number || undefined,
        linkedRequestDate: linkedDetails?.request_date ? new Date(linkedDetails.request_date).toLocaleDateString() : undefined,
        linkedRequestAmount: linkedDetails?.amount || undefined,
        linkedRequestPurpose: linkedDetails?.purpose || undefined,
        purpose: fullRequest.purpose,
        expenseItems: fullRequest.expense_items || [],
        totalExpenditures: fullRequest.amount,
        cashAdvance: fullRequest.cash_advance || 0,
        netAmount: netAmount,
        payee: fullRequest.payee || requesterData.full_name || 'Unknown',
        approvals: approvalsWithSignatures
      });

      // Upload the reimbursement form to storage
      const timestamp = Date.now();
      const formPath = `reimbursement-forms/${fullRequest.id}_${timestamp}_form.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(formPath, reimbursementFormBytes, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Update the request with the new form path
      const { error: updateError } = await supabase
        .from('reimbursement_requests')
        .update({
          reimbursement_form_pdf_path: formPath,
          updated_at: new Date().toISOString()
        })
        .eq('id', fullRequest.id);

      if (updateError) throw updateError;

      alert('Reimbursement form generated successfully!');
      await loadRequests();

      // Update viewing request if currently viewing
      if (viewingRequest?.id === fullRequest.id) {
        const updatedRequest = { ...fullRequest, reimbursement_form_pdf_path: formPath };
        setViewingRequest(updatedRequest as ReimbursementReq);
      }
    } catch (error) {
      console.error('Error generating reimbursement form:', error);
      alert('Failed to generate reimbursement form. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (showForm) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{editingRequest ? 'Edit Reimbursement/Liquidation Request' : 'New Reimbursement/Liquidation Request'}</h2>
            <button onClick={() => { setShowForm(false); setEditingRequest(null); }} className="px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base text-slate-600">Cancel</button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-3 sm:space-y-4">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Document No.</label>
            <div className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-50 border border-slate-300 rounded-lg">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
              <span className="font-mono text-sm sm:text-base font-semibold text-slate-900">{formData.document_no}</span>
            </div>
          </div>

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
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                required
              >
                <option value="">Select Department</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.name}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
              <input
                type="text"
                value={profile?.department || ''}
                readOnly
                className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Request Type</label>
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as 'Reimbursement' | 'Liquidation')}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
              required
            >
              <option value="Reimbursement">Reimbursement</option>
              <option value="Liquidation">Liquidation</option>
            </select>
          </div>

          {requestType === 'Liquidation' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Select Approved Cash Advance
              </label>
              <select
                value={selectedRequestId}
                onChange={(e) => handleRequestSelection(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                required={requestType === 'Liquidation'}
              >
                <option value="">Select a cash advance to liquidate</option>
                {approvedRequests.filter(req => req.type === 'Cash Advance').map((req) => (
                  <option key={req.id} value={req.id}>
                    {req.display_number} | ₱{req.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} | {new Date(req.request_date).toLocaleDateString()}
                  </option>
                ))}
              </select>
              {approvedRequests.filter(req => req.type === 'Cash Advance').length === 0 && (
                <p className="text-sm text-amber-600">No approved cash advance requests available for liquidation.</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payee</label>
            <input
              type="text"
              value={formData.payee}
              onChange={(e) => setFormData({ ...formData, payee: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date Needed</label>
            <input
              type="date"
              value={formData.date_needed}
              onChange={(e) => setFormData({ ...formData, date_needed: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Purpose</label>
            <textarea
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">Expense Itemization</label>
              <button
                type="button"
                onClick={addExpenseItem}
                className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition"
              >
                <Plus size={16} />
                Add Item
              </button>
            </div>
            <div className="border border-slate-300 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Supplier Name & Particulars</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Amount</th>
                    <th className="px-4 py-2 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {expenseItems.map((item, index) => (
                    <tr key={index}>
                      <td className="px-4 py-2">
                        <input
                          type="date"
                          value={item.date}
                          onChange={(e) => updateExpenseItem(index, 'date', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          required
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateExpenseItem(index, 'description', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          placeholder="Enter description"
                          required
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={item.amount}
                          onChange={(e) => updateExpenseItem(index, 'amount', Number(e.target.value))}
                          className="w-full px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          required
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        {expenseItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeExpenseItem(index)}
                            className="text-red-600 hover:text-red-700 transition"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t">
                  <tr>
                    <td colSpan={2} className="px-4 py-2 text-right font-semibold text-slate-700">
                      Total Expenditures:
                    </td>
                    <td className="px-4 py-2 font-bold text-slate-900">
                      ₱{calculateTotalExpenditures().toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={2} className="px-4 py-2 text-right font-semibold text-slate-700">
                      Less: Cash Advance:
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={cashAdvance}
                        onChange={(e) => setCashAdvance(Number(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:bg-slate-100 disabled:cursor-not-allowed"
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        disabled={requestType === 'Liquidation' && !!selectedRequestId}
                      />
                    </td>
                    <td></td>
                  </tr>
                  <tr className="border-t-2 border-slate-300">
                    <td colSpan={2} className="px-4 py-2 text-right font-bold text-slate-900">
                      {(calculateTotalExpenditures() - cashAdvance) >= 0 ? 'Over for Reimbursement:' : 'Excess for Deposit:'}
                    </td>
                    <td className="px-4 py-2 font-bold text-lg text-slate-900">
                      ₱{Math.abs(calculateTotalExpenditures() - cashAdvance).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Attachments (Receipts) <span className="text-red-500">*</span></label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-100 transition">
                  <Upload size={18} className="text-slate-600" />
                  <span className="text-sm text-slate-700">Upload Files</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-slate-500">Images and PDFs only</span>
              </div>

              {attachments.length > 0 && (
                <div className="border border-slate-300 rounded-lg divide-y divide-slate-200">
                  {attachments.map((file, index) => (
                    <div key={index} className="flex items-center justify-between px-4 py-2">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-slate-400" />
                        <span className="text-sm text-slate-700">{file.name}</span>
                        <span className="text-xs text-slate-500">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        className="text-red-600 hover:text-red-700 transition"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {uploadingFiles && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Uploading files...</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <button
              onClick={() => {
                if (confirm('Are you sure you want to submit this reimbursement request for approval?')) {
                  handleSubmit('pending');
                }
              }}
              disabled={loading}
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
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Reimbursement/Liquidation Requests</h2>
          <button
            onClick={() => {
              setShowForm(true);
              generateDocumentNo();
            }}
            className="flex items-center justify-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm sm:text-base"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New Request</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-auto flex-1">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200 z-10">
            <tr>
              <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                <button
                  onClick={() => handleSort('reimb_number')}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                >
                  Reimb No.
                  {getSortIcon('reimb_number')}
                </button>
              </th>
              <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                <button
                  onClick={() => handleSort('request_date')}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                >
                  Date
                  {getSortIcon('request_date')}
                </button>
              </th>
              {(profile?.enable_multi_company_requests || profile?.role === 'admin') && (
                <>
                  <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Company
                    </span>
                  </th>
                  <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Department
                    </span>
                  </th>
                </>
              )}
              <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                <button
                  onClick={() => handleSort('purpose')}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                >
                  Purpose
                  {getSortIcon('purpose')}
                </button>
              </th>
              <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                <button
                  onClick={() => handleSort('amount')}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                >
                  Amount
                  {getSortIcon('amount')}
                </button>
              </th>
              <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap">
                <button
                  onClick={() => handleSort('status')}
                  className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors w-full"
                >
                  Status
                  {getSortIcon('status')}
                </button>
              </th>
              <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Action
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedRequests.length === 0 ? (
              <tr>
                <td colSpan={profile?.enable_multi_company_requests || profile?.role === 'admin' ? 8 : 6} className="px-3 py-6 sm:px-6 sm:py-8 text-center text-xs sm:text-sm text-slate-500">No reimbursement/liquidation requests found</td>
              </tr>
            ) : (
              paginatedRequests.map((req, index) => (
                <tr key={req.id} className={`hover:bg-slate-50 transition-colors group ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                  <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                    <span className="font-mono font-bold text-sm text-slate-900 truncate block min-w-[120px]" title={req.reimb_number}>
                      {req.reimb_number}
                    </span>
                  </td>
                  <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                    <span className="text-sm text-slate-700">
                      {new Date(req.request_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                  </td>
                  {(profile?.enable_multi_company_requests || profile?.role === 'admin') && (
                    <>
                      <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-slate-700 truncate block max-w-[150px]" title={(req as any).companies?.name || 'N/A'}>
                          {(req as any).companies?.name || 'N/A'}
                        </span>
                      </td>
                      <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium max-w-[140px] truncate" title={req.department || 'N/A'}>
                          {req.department || 'N/A'}
                        </span>
                      </td>
                    </>
                  )}
                  <td className="px-3 xl:px-4 py-3">
                    <span className="text-sm text-slate-700 truncate block max-w-[200px]" title={req.purpose}>
                      {req.purpose}
                    </span>
                  </td>
                  <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                    <span className="text-sm font-bold text-slate-900">
                      ₱{req.amount.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full ${getStatusColor(req.status)}`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                    <button
                      onClick={async () => {
                        setViewingRequest(req);
                        setShowViewModal(true);
                        setLinkedRequestDetails(null);

                        // Load linked request details if this is a liquidation
                        if ((req as any).request_type === 'Liquidation' && (req as any).linked_cash_advance_id && (req as any).cash_advance_type) {
                          await loadLinkedRequestDetails((req as any).linked_cash_advance_id, (req as any).cash_advance_type);
                        }
                      }}
                      className="inline-flex items-center justify-center p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm hover:shadow group-hover:scale-105 transform"
                      title="View Request"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
        {sortedRequests.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            itemsPerPage={itemsPerPage}
            totalItems={sortedRequests.length}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
          />
        )}
      </div>

      {showViewModal && viewingRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Reimbursement/Liquidation Request Details</h3>
                <p className="text-sm text-slate-600 mt-1">{viewingRequest.reimb_number}</p>
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingRequest(null);
                  setLinkedRequestDetails(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {(viewingRequest.status === 'pending' || viewingRequest.status === 'rejected') && (
                <ApprovalProgressTracker
                  requestType="Reimbursement"
                  requestId={viewingRequest.id}
                />
              )}

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Reimb Number</label>
                  <p className="text-slate-900 font-mono">{viewingRequest.reimb_number}</p>
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
                  <label className="text-sm font-semibold text-slate-700">Request Type</label>
                  <p className="text-slate-900">{(viewingRequest as any).request_type || 'Reimbursement'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Payee</label>
                  <p className="text-slate-900">{(viewingRequest as any).payee || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Status</label>
                  <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(viewingRequest.status)}`}>
                    {viewingRequest.status}
                  </span>
                </div>
              </div>

              {(viewingRequest as any).request_type === 'Liquidation' && linkedRequestDetails && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label className="block text-sm font-semibold text-slate-700 mb-3">Linked Request Details</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-slate-600">Type</label>
                      <p className="text-sm text-slate-900">{linkedRequestDetails.type}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Number</label>
                      <p className="text-sm text-slate-900 font-mono">{linkedRequestDetails.display_number}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Request Date</label>
                      <p className="text-sm text-slate-900">{new Date(linkedRequestDetails.request_date).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Amount</label>
                      <p className="text-sm text-slate-900 font-medium">₱{linkedRequestDetails.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-slate-600">Purpose</label>
                      <p className="text-sm text-slate-900">{linkedRequestDetails.purpose}</p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-semibold text-slate-700">Purpose</label>
                <p className="text-slate-900">{viewingRequest.purpose}</p>
              </div>

              {viewingRequest.expense_items && viewingRequest.expense_items.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Expense Itemization</label>
                  <div className="border border-slate-300 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Supplier Name & Particulars</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {viewingRequest.expense_items.map((item: ExpenseItem, index: number) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-sm text-slate-700">{new Date(item.date).toLocaleDateString()}</td>
                            <td className="px-4 py-2 text-sm text-slate-700">{item.description}</td>
                            <td className="px-4 py-2 text-sm text-slate-900 font-medium">₱{item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t">
                        <tr>
                          <td colSpan={2} className="px-4 py-2 text-right font-semibold text-slate-700">
                            Total Expenditures:
                          </td>
                          <td className="px-4 py-2 font-bold text-slate-900">
                            ₱{viewingRequest.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={2} className="px-4 py-2 text-right font-semibold text-slate-700">
                            Less: Cash Advance:
                          </td>
                          <td className="px-4 py-2 font-semibold text-slate-900">
                            ₱{((viewingRequest as any).cash_advance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                        <tr className="border-t-2 border-slate-300">
                          <td colSpan={2} className="px-4 py-2 text-right font-bold text-slate-900">
                            {(viewingRequest.amount - ((viewingRequest as any).cash_advance || 0)) >= 0 ? 'Over for Reimbursement:' : 'Excess for Deposit:'}
                          </td>
                          <td className="px-4 py-2 font-bold text-lg text-slate-900">
                            ₱{Math.abs(viewingRequest.amount - ((viewingRequest as any).cash_advance || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
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
                {viewingRequest.status === 'approved' && viewingRequest.rfp_pdf_path && (
                  <button
                    onClick={() => downloadRFP(viewingRequest.rfp_pdf_path!, viewingRequest.reimb_number)}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    <Download size={18} />
                    Download RFP
                  </button>
                )}
                {viewingRequest.status === 'approved' && viewingRequest.reimbursement_form_pdf_path && (
                  <>
                    <button
                      onClick={() => previewReimbursementForm(viewingRequest.reimbursement_form_pdf_path!, viewingRequest.reimb_number)}
                      className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                    >
                      <Eye size={18} />
                      Preview Form
                    </button>
                    <button
                      onClick={() => downloadReimbursementForm(viewingRequest.reimbursement_form_pdf_path!, viewingRequest.reimb_number)}
                      className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      <Download size={18} />
                      Download Form
                    </button>
                    {profile?.role === 'admin' && (
                      <button
                        onClick={() => regenerateReimbursementForm(viewingRequest)}
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                        Regenerate PDF
                      </button>
                    )}
                  </>
                )}
                {viewingRequest.status === 'approved' && !viewingRequest.reimbursement_form_pdf_path && profile?.role === 'admin' && (
                  <button
                    onClick={() => regenerateReimbursementForm(viewingRequest)}
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                    Generate PDF
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingRequest(null);
                  setLinkedRequestDetails(null);
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

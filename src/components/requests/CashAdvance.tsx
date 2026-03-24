import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Save, Send, Eye, FileText, X, Download, CreditCard as Edit, Loader2, Upload, Trash2, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { getApprovalFlow, addExecutiveApprovalSteps, filterApprovalFlowsForRequester, createApprovalLedgerEntry, sendApprovalEmailToAll } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import { mergeFilesToPDFBlob } from '../../lib/pdfMerger';
import { uploadLargeFile, fetchApprovalRecordsWithRetry } from '../../lib/storageHelper';
import Pagination from '../Pagination';

interface PaymentModeLine {
  name: string;
  value: string;
  is_required?: boolean;
}

interface CashAdvanceReq {
  id: string;
  ca_number: string;
  request_date: string;
  requester_id: string;
  company_id?: string;
  payee?: string;
  payee_number?: string;
  purpose: string;
  amount: number;
  budgeted: boolean;
  status: string;
  department?: string;
  rfp_pdf_path?: string;
  attachments_pdf_path?: string;
  approved_ca_pdf_path?: string;
  outstanding_asl?: string;
  outstanding_asl_date?: string;
  remarks?: string;
  payment_mode_id?: string;
  payment_mode_lines?: PaymentModeLine[];
  attachment_metadata?: Array<{
    name: string;
    type: string;
    size: number;
  }>;
  msbc_sync_status?: string;
  msbc_sync_date?: string;
  msbc_sync_error?: string;
  msbc_journal_id?: string;
  companies?: {
    name: string;
  };
  user_profiles?: {
    full_name: string;
    email: string;
    company_id: string;
    department?: string;
  };
}

export function CashAdvance() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<CashAdvanceReq[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [vendorSearchTerm, setVendorSearchTerm] = useState('');
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const vendorDropdownRef = useRef<HTMLDivElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<CashAdvanceReq | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<CashAdvanceReq | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [postingToMsbc, setPostingToMsbc] = useState(false);
  const [paymentModes, setPaymentModes] = useState<any[]>([]);
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<any>(null);
  const [sortColumn, setSortColumn] = useState<string>('request_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

  // Multi-company support
  const [companies, setCompanies] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const companiesInitialized = useRef(false);

  const [formData, setFormData] = useState({
    document_no: '',
    payee: '',
    payee_number: '',
    purpose: '',
    amount: 0,
    date_needed: '',
    budgeted: 'Budgeted',
    payment_mode_id: '',
    payment_mode_lines: [] as PaymentModeLine[],
  });

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
    if (selectedCompanyId) {
      loadVendors();
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (vendorDropdownRef.current && !vendorDropdownRef.current.contains(event.target as Node)) {
        setShowVendorDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const generateDocumentNo = async (overrideCompanyId?: string) => {
    const companyId = overrideCompanyId ?? (profile?.enable_multi_company_requests ? selectedCompanyId : profile?.company_id);
    if (!companyId) {
      console.error('Company ID not available');
      alert('Unable to generate document number: Company information not available');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_next_number', {
        p_series_name: 'Cash Advance',
        p_company_id: companyId
      });
      if (error) throw error;
      setFormData(prev => ({ ...prev, document_no: data }));
    } catch (error: any) {
      console.error('Error generating document number:', error);
      alert('Error generating document number: ' + error.message);
    }
  };

  const loadRequests = async () => {
    if (!profile?.company_id && profile?.role !== 'admin') return;

    let query = supabase
      .from('cash_advance_requests')
      .select('*, user_profiles!cash_advance_requests_requester_id_fkey(full_name, email, company_id, department), companies!cash_advance_requests_company_id_fkey(id, name)')
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

  const loadVendors = async () => {
    setLoadingVendors(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session found');
        return;
      }

      const companyId = profile?.enable_multi_company_requests ? selectedCompanyId : profile?.company_id;

      if (!companyId) {
        console.log('No company ID available, skipping vendor load');
        setVendors([]);
        return;
      }

      console.log('Loading vendors for company ID:', companyId);
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-vendors?company_id=${companyId}`;
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to fetch vendors:', errorData);
        throw new Error(errorData.error || 'Failed to fetch vendors');
      }

      const data = await response.json();
      console.log('Loaded vendors count:', data.value?.length || 0);
      const sortedVendors = (data.value || []).sort((a: any, b: any) =>
        (a.displayName || '').localeCompare(b.displayName || '')
      );
      setVendors(sortedVendors);
    } catch (error) {
      console.error('Error loading vendors:', error);
      setVendors([]);
    } finally {
      setLoadingVendors(false);
    }
  };

  const filteredVendors = vendors.filter((vendor) =>
    vendor.displayName?.toLowerCase().includes(vendorSearchTerm.toLowerCase()) ||
    vendor.number?.toLowerCase().includes(vendorSearchTerm.toLowerCase())
  );

  const loadPaymentModes = async () => {
    try {
      const { data, error } = await supabase
        .from('payment_modes')
        .select('*')
        .eq('is_active', true)
        .order('mode_name', { ascending: true });

      if (error) throw error;
      setPaymentModes(data || []);
    } catch (error) {
      console.error('Error loading payment modes:', error);
    }
  };

  const loadCompanies = async () => {
    try {
      if (!profile) return;

      if (profile.enable_multi_company_requests && profile.allowed_companies && profile.allowed_companies.length > 0) {
        const { data, error } = await supabase
          .from('companies')
          .select('id, name')
          .in('id', profile.allowed_companies)
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (error) throw error;
        setCompanies(data || []);

        if (!companiesInitialized.current && data && data.length > 0) {
          const defaultCompany = data.find(c => c.id === profile.company_id) || data[0];
          setSelectedCompanyId(defaultCompany.id);
          loadDepartments(defaultCompany.id);
          companiesInitialized.current = true;
        }
      } else {
        if (!companiesInitialized.current) {
          setSelectedCompanyId(profile.company_id || '');
          if (profile.company_id) {
            loadDepartments(profile.company_id);
          }
          companiesInitialized.current = true;
        }
      }
    } catch (error) {
      console.error('Error loading companies:', error);
    }
  };

  const loadDepartments = async (companyId: string, setDefault = true) => {
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      setDepartments(data || []);

      if (setDefault && data && data.length > 0) {
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
    setVendors([]);
    setVendorSearchTerm('');

    if (companyId) {
      loadDepartments(companyId);
      generateDocumentNo(companyId);
      setFormData(prev => ({
        ...prev,
        payee: '',
        payee_number: '',
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        document_no: '',
        payee: '',
        payee_number: '',
      }));
    }
  };

  const handlePaymentModeChange = (modeId: string) => {
    const mode = paymentModes.find(m => m.id === modeId);
    setSelectedPaymentMode(mode);

    const lines = mode?.line_names
      ? (mode.line_names as Array<{name: string, is_required: boolean}>).map((lineItem) => ({
          name: lineItem.name,
          value: '',
          is_required: lineItem.is_required
        }))
      : [];

    setFormData({
      ...formData,
      payment_mode_id: modeId,
      payment_mode_lines: lines
    });
  };

  const updatePaymentModeLine = (index: number, value: string) => {
    const newLines = [...formData.payment_mode_lines];
    newLines[index].value = value;
    setFormData({ ...formData, payment_mode_lines: newLines });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    console.log('=== File Selection ===');
    console.log(`Files selected: ${files.length}`);

    const validFiles: File[] = [];
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`Checking file: ${file.name}, type: ${file.type}, size: ${file.size}`);
      if (allowedTypes.includes(file.type)) {
        console.log(`  ✓ Valid file added`);
        validFiles.push(file);
      } else {
        console.log(`  ✗ Invalid file type rejected`);
        alert(`File ${file.name} is not a valid format. Only images (JPG, PNG) and PDF files are allowed.`);
      }
    }

    console.log(`Valid files to add: ${validFiles.length}`);
    setAttachments(prev => {
      const newAttachments = [...prev, ...validFiles];
      console.log(`Total attachments after adding: ${newAttachments.length}`);
      return newAttachments;
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleEditDraft = (request: CashAdvanceReq) => {
    setEditingRequest(request);
    const reqData = request as any;
    setFormData({
      document_no: request.ca_number,
      payee: reqData.payee || '',
      payee_number: reqData.payee_number || '',
      purpose: request.purpose,
      amount: request.amount,
      date_needed: reqData.date_needed || '',
      budgeted: reqData.budgeted ? 'Budgeted' : 'Non-budgeted',
      payment_mode_id: request.payment_mode_id || '',
      payment_mode_lines: request.payment_mode_lines || [],
    });
    setVendorSearchTerm(reqData.payee || '');
    setShowViewModal(false);
    setViewingRequest(null);
    setShowForm(true);
  };

  const handleSubmit = async (status: 'draft' | 'pending') => {
    if (formData.amount < 5000) {
      alert('Amount must be at least ₱5,000');
      return;
    }

    // Validate attachments are required for cash advance
    if (attachments.length === 0 && !editingRequest) {
      alert('Please upload supporting documents. Attachments are required for cash advance requests.');
      return;
    }

    // For editing, check if attachments exist either as new uploads or existing ones
    if (editingRequest && attachments.length === 0 && (!editingRequest.attachment_metadata || editingRequest.attachment_metadata.length === 0)) {
      alert('Please upload supporting documents. Attachments are required for cash advance requests.');
      return;
    }

    // Validate required payment mode lines
    const missingPaymentModeLines = formData.payment_mode_lines.filter(
      line => line.is_required && !line.value.trim()
    );

    if (missingPaymentModeLines.length > 0) {
      const missingNames = missingPaymentModeLines.map(line => line.name).join(', ');
      alert(`Please fill in required payment mode fields: ${missingNames}`);
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
      let attachmentsPdfPath: string | null = null;
      let attachmentMetadata: any[] = [];

      const budgetedValue = formData.budgeted === 'Budgeted';

      if (attachments.length > 0) {
        try {
          console.log('=== Starting PDF merge ===');
          console.log(`Total attachments to merge: ${attachments.length}`);
          attachments.forEach((file, index) => {
            console.log(`  [${index}] ${file.name} - ${file.type} - ${file.size} bytes`);
          });

          const mergedPdfBlob = await mergeFilesToPDFBlob(attachments);
          console.log('=== PDF merge completed ===');

          const fileName = `CA_${formData.document_no}_attachments_${Date.now()}.pdf`;
          const filePath = `cash_advance/${formData.document_no}/${fileName}`;

          // Convert blob to ArrayBuffer for more efficient upload
          const arrayBuffer = await mergedPdfBlob.arrayBuffer();

          try {
            const { path } = await uploadLargeFile(filePath, arrayBuffer, 'application/pdf');
            attachmentsPdfPath = path;
          } catch (uploadError: any) {
            console.error('Upload error:', uploadError);
            throw new Error(`Failed to upload merged PDF: ${uploadError.message || uploadError}`);
          }

          attachmentMetadata = attachments.map(file => ({
            name: file.name,
            type: file.type,
            size: file.size
          }));
        } catch (error: any) {
          console.error('Error processing attachments:', error);
          alert('Error processing attachments: ' + error.message);
          throw error;
        }
      }

      if (editingRequest) {
        const updateData: any = {
          payee: formData.payee,
          payee_number: formData.payee_number,
          purpose: formData.purpose,
          amount: formData.amount,
          date_needed: formData.date_needed || null,
          budgeted: budgetedValue,
          status,
          payment_mode_id: formData.payment_mode_id || null,
          payment_mode_lines: formData.payment_mode_lines,
        };

        if (attachmentsPdfPath) {
          updateData.attachments_pdf_path = attachmentsPdfPath;
          updateData.attachment_metadata = attachmentMetadata;
        }

        const { data, error } = await supabase
          .from('cash_advance_requests')
          .update(updateData)
          .eq('id', editingRequest.id)
          .select()
          .single();

        if (error) throw error;
        insertedRequest = data;
      } else {
        const requestCompanyId = profile?.enable_multi_company_requests ? selectedCompanyId : profile?.company_id;
        const requestDepartment = profile?.enable_multi_company_requests ? selectedDepartment : (profile?.department || '');

        const insertData: any = {
          ca_number: formData.document_no,
          requester_id: profile?.id,
          company_id: requestCompanyId,
          department: requestDepartment,
          request_date: new Date().toISOString(),
          payee: formData.payee,
          payee_number: formData.payee_number,
          purpose: formData.purpose,
          amount: formData.amount,
          date_needed: formData.date_needed || null,
          budgeted: budgetedValue,
          status,
          current_approval_level: 0,
          payment_mode_id: formData.payment_mode_id || null,
          payment_mode_lines: formData.payment_mode_lines,
        };

        if (attachmentsPdfPath) {
          insertData.attachments_pdf_path = attachmentsPdfPath;
          insertData.attachment_metadata = attachmentMetadata;
        }

        const { data, error } = await supabase
          .from('cash_advance_requests')
          .insert(insertData)
          .select()
          .single();

        if (error) throw error;
        insertedRequest = data;
      }

      if (status === 'pending' && insertedRequest) {
        const requestCompanyId = insertedRequest.company_id;
        const requestDepartment = insertedRequest.department || '';

        const rawApprovalFlows = await getApprovalFlow(
          requestCompanyId,
          requestDepartment,
          'Cash Advance',
          budgetedValue,
          formData.amount
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
            'Cash Advance',
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
          await sendApprovalEmailToAll(
            firstApprover,
            profile.company_id,
            profile.department || '',
            'Cash Advance',
            formData.document_no,
            profile.full_name || 'Unknown',
            formData.amount,
            'Submitted',
            undefined,
            undefined,
            firstApprover.approver_type
          );
        }
      }

      setShowForm(false);
      setFormData({ document_no: '', payee: '', payee_number: '', purpose: '', amount: 0, date_needed: '', budgeted: 'Budgeted', payment_mode_id: '', payment_mode_lines: [] });
      setVendorSearchTerm('');
      setAttachments([]);
      setEditingRequest(null);
      setSelectedPaymentMode(null);
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

  const handleSubmitDraft = async (request: CashAdvanceReq) => {
    if (request.amount < 5000) {
      alert('Amount must be at least ₱5,000');
      return;
    }

    // Validate attachments before submitting draft
    if (!request.attachment_metadata || request.attachment_metadata.length === 0) {
      alert('Please upload supporting documents before submitting. Attachments are required for cash advance requests.');
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
        'Cash Advance',
        (request as any).budgeted,
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
        .from('cash_advance_requests')
        .update({ status: 'pending', current_approval_level: 0 })
        .eq('id', request.id);

      if (updateError) throw updateError;

      await createApprovalLedgerEntry(
        'Cash Advance',
        request.id,
        request.ca_number,
        profile.id,
        profile.full_name || 'Unknown',
        'Requestor',
        'Submitted',
        'Initial submission',
        0
      );

      const firstApprover = approvalFlows[0];
      await sendApprovalEmailToAll(
        firstApprover,
        profile.company_id,
        profile.department || '',
        'Cash Advance',
        request.ca_number,
        profile.full_name || 'Unknown',
        request.amount,
        'Submitted',
        undefined,
        undefined,
        firstApprover.approver_type
      );

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
      case 'ca_number':
        aVal = a.ca_number;
        bVal = b.ca_number;
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

  const downloadRFP = async (rfpPath: string, caNumber: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(rfpPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RFP_${caNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading RFP:', error);
      alert('Failed to download RFP');
    }
  };

  const previewAttachments = async (pdfPath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(pdfPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      setPdfPreviewUrl(url);
      setShowPdfPreview(true);
    } catch (error) {
      console.error('Error loading PDF preview:', error);
      alert('Failed to load PDF preview');
    }
  };

  const closePdfPreview = () => {
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
    }
    setPdfPreviewUrl(null);
    setShowPdfPreview(false);
  };

  const regenerateApprovedForm = async (request: CashAdvanceReq) => {
    if (!request?.company_id) {
      alert('Company information not found');
      return;
    }

    setRegenerating(true);
    try {
      const { generateCashAdvanceForm } = await import('../../lib/cashAdvanceFormGenerator');
      const { generateRFP } = await import('../../lib/rfpGenerator');
      const { mergePDFBytes } = await import('../../lib/pdfMerger');

      const { data: companyData } = await supabase
        .from('companies')
        .select('name')
        .eq('id', request.company_id)
        .single();

      const { data: requestorData } = await supabase
        .from('user_profiles')
        .select('full_name, e_sig, department')
        .eq('id', request.requester_id)
        .single();

      const { data: payeeData } = await supabase
        .from('user_profiles')
        .select('e_sig')
        .eq('full_name', request.payee)
        .maybeSingle();

      // Get ALL approval records (including checkers) for Cash Advance form using enhanced retry logic
      const approvalRecordsWithSigs = await fetchApprovalRecordsWithRetry(
        request.id,
        'Cash Advance',
        request.current_level || 1
      );

      // Generate Approved Cash Advance Form with ALL approvers (including checkers)
      const approvedCaFormBytes = await generateCashAdvanceForm({
        caNumber: request.ca_number,
        requestedBy: requestorData?.full_name || 'Unknown',
        requestDate: new Date(request.request_date).toLocaleDateString(),
        amount: request.amount,
        company: companyData?.name || 'N/A',
        department: request.department || requestorData?.department || 'N/A',
        purpose: request.purpose,
        payee: request.payee || 'Unknown',
        payeeEsig: payeeData?.e_sig || null,
        outstandingAsl: request.outstanding_asl || '',
        outstandingAslDate: request.outstanding_asl_date ? new Date(request.outstanding_asl_date).toLocaleDateString() : '',
        remarks: request.remarks || '',
        approvals: approvalRecordsWithSigs
      });

      // Get payment mode information
      let paymentModeName = '';
      const paymentModeLines: Array<{ label: string; value: string }> = [];

      if (request.payment_mode_id) {
        const { data: paymentModeData } = await supabase
          .from('payment_modes')
          .select('mode_name')
          .eq('id', request.payment_mode_id)
          .maybeSingle();

        paymentModeName = paymentModeData?.mode_name || '';

        if (request.payment_mode_lines) {
          request.payment_mode_lines.forEach((line) => {
            paymentModeLines.push({
              label: line.name,
              value: line.value
            });
          });
        }
      }

      // Filter out checkers for RFP (only include actual approvers, not for_checking)
      const rfpApprovals = approvalRecordsWithSigs.filter(record => !record.for_checking);

      // Generate RFP Form with filtered approvals
      const rfpBytes = await generateRFP({
        companyName: companyData?.name || 'N/A',
        requestType: 'Cash Advance',
        dateOfRequest: new Date(request.request_date).toLocaleDateString(),
        payee: request.payee || 'Unknown',
        purpose: request.purpose,
        dateNeeded: request.date_needed ? new Date(request.date_needed).toLocaleDateString() : 'N/A',
        amount: request.amount,
        budgeted: request.budgeted,
        paymentMode: paymentModeName,
        paymentModeLines: paymentModeLines,
        requestorName: requestorData?.full_name || 'Unknown',
        requestorEsig: requestorData?.e_sig || null,
        approvals: rfpApprovals
      });

      // Prepare PDFs to merge: RFP + Approved CA Form + Attachments
      const pdfsToMerge: Uint8Array[] = [rfpBytes, approvedCaFormBytes];

      // Add attachments PDF if it exists
      if (request.attachments_pdf_path) {
        try {
          const { data: attachmentData, error: attachmentError } = await supabase.storage
            .from('attachments')
            .download(request.attachments_pdf_path);

          if (!attachmentError && attachmentData) {
            const attachmentBytes = new Uint8Array(await attachmentData.arrayBuffer());
            pdfsToMerge.push(attachmentBytes);
          }
        } catch (error) {
          console.error('Error downloading attachments:', error);
        }
      }

      // Merge all PDFs into one complete document
      const mergedPdfBytes = await mergePDFBytes(pdfsToMerge);

      const fileName = `CA_${request.ca_number}_Complete_${Date.now()}.pdf`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(fileName, mergedPdfBytes, {
          contentType: 'application/pdf',
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Update the database with the new PDF path
      const { error: updateError } = await supabase
        .from('cash_advance_requests')
        .update({ approved_ca_pdf_path: uploadData.path })
        .eq('id', request.id);

      if (updateError) throw updateError;

      alert('Complete document regenerated successfully!');

      // Reload requests to show updated data
      await loadRequests();

      // Update viewing request if modal is open
      if (viewingRequest?.id === request.id) {
        const { data: updatedRequest } = await supabase
          .from('cash_advance_requests')
          .select('*')
          .eq('id', request.id)
          .single();

        if (updatedRequest) {
          setViewingRequest(updatedRequest);
        }
      }
    } catch (error) {
      console.error('Error regenerating complete document:', error);
      alert('Failed to regenerate complete document. Please try again.');
    } finally {
      setRegenerating(false);
    }
  };

  const postToMsbc = async (request: CashAdvanceReq) => {
    if (!request.approved_ca_pdf_path) {
      alert('No approved form found. Please ensure the request is fully approved.');
      return;
    }

    const isRepost = request.msbc_sync_status === 'synced';
    const action = isRepost ? 'Repost' : 'Post';
    const confirmPost = confirm(`${action} Cash Advance ${request.ca_number} to MSBC?`);
    if (!confirmPost) return;

    setPostingToMsbc(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/post-ca-to-msbc`;
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ requestId: request.id }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to post to MSBC');
      }

      alert(`Successfully posted to MSBC!\n\nJournal ID: ${result.journalId}`);

      await loadRequests();

      if (viewingRequest?.id === request.id) {
        const { data: updatedRequest } = await supabase
          .from('cash_advance_requests')
          .select('*')
          .eq('id', request.id)
          .single();

        if (updatedRequest) {
          setViewingRequest(updatedRequest);
        }
      }
    } catch (error) {
      console.error('Error posting to MSBC:', error);
      alert(`Failed to post to MSBC: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPostingToMsbc(false);
    }
  };

  if (showForm) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{editingRequest ? 'Edit Cash Advance Request' : 'New Cash Advance Request'}</h2>
            <button onClick={() => { setShowForm(false); setEditingRequest(null); }} className="px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base text-slate-600">
              Cancel
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                <input
                  type="text"
                  value={profile?.department || ''}
                  readOnly
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed"
                />
              </div>
            )}
            {profile?.enable_multi_company_requests && (
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
            )}
          </div>

          <div className="relative" ref={vendorDropdownRef}>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Payee/Vendor <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={vendorSearchTerm || formData.payee}
              onChange={(e) => {
                setVendorSearchTerm(e.target.value);
                setShowVendorDropdown(true);
                if (!e.target.value) {
                  setFormData({ ...formData, payee: '', payee_number: '' });
                }
              }}
              onFocus={() => setShowVendorDropdown(true)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder={loadingVendors ? 'Loading vendors...' : 'Search vendors...'}
              disabled={loadingVendors}
              required
            />
            {showVendorDropdown && !loadingVendors && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filteredVendors.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-slate-500">
                    No vendors found
                  </div>
                ) : (
                  filteredVendors.map((vendor) => (
                    <div
                      key={vendor.number}
                      onClick={() => {
                        setFormData({ ...formData, payee: vendor.displayName, payee_number: vendor.number });
                        setVendorSearchTerm(vendor.displayName);
                        setShowVendorDropdown(false);
                      }}
                      className="px-4 py-2 hover:bg-blue-50 cursor-pointer transition-colors border-b border-slate-100 last:border-0"
                    >
                      <div className="font-medium text-slate-900">{vendor.displayName}</div>
                      <div className="text-xs text-slate-500">{vendor.number}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Purpose <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              rows={3}
              maxLength={200}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
            <p className="text-xs text-slate-500 mt-1">{formData.purpose.length}/200 characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Date Needed <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.date_needed}
              onChange={(e) => setFormData({ ...formData, date_needed: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount (Min: ₱5,000)</label>
            <input
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              min="5000"
              step="0.01"
              required
            />
            {formData.amount > 0 && formData.amount < 5000 && (
              <p className="text-red-600 text-sm mt-1">Amount must be at least ₱5,000</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Budget Status</label>
            <select
              value={formData.budgeted}
              onChange={(e) => setFormData({ ...formData, budgeted: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              required
            >
              <option value="Budgeted">Budgeted</option>
              <option value="Non-budgeted">Non-budgeted</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Payment Mode
            </label>
            <select
              value={formData.payment_mode_id}
              onChange={(e) => handlePaymentModeChange(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">Select a payment mode</option>
              {paymentModes.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.mode_name}
                </option>
              ))}
            </select>
          </div>

          {formData.payment_mode_lines.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Payment Mode Details</h3>
                <span className="text-xs text-slate-500">
                  {selectedPaymentMode?.mode_name}
                </span>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="divide-y divide-slate-200">
                  {formData.payment_mode_lines.map((line, index) => (
                    <div key={index} className="p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-500/30">
                          {index + 1}
                        </div>
                        <div className="flex-1 space-y-2">
                          <label className="block text-sm font-semibold text-slate-900">
                            {line.name}
                            {line.is_required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          <input
                            type="text"
                            value={line.value}
                            onChange={(e) => updatePaymentModeLine(index, e.target.value)}
                            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            placeholder={`Enter ${line.name.toLowerCase()}`}
                            required={line.is_required}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Attachments (Images & PDFs) <span className="text-red-500">*</span>
            </label>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,application/pdf"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                >
                  <Upload size={18} />
                  Upload Files
                </button>
                <span className="text-sm text-slate-500">
                  JPG, PNG, or PDF files
                </span>
              </div>

              {attachments.length > 0 && (
                <div className="border border-slate-200 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium text-slate-700 mb-2">
                    {attachments.length} file(s) selected
                  </p>
                  {attachments.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText size={16} className="text-slate-400 flex-shrink-0" />
                        <span className="text-sm text-slate-700 truncate">
                          {file.name}
                        </span>
                        <span className="text-xs text-slate-500 flex-shrink-0">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition flex-shrink-0"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <button
              onClick={() => {
                if (confirm('Are you sure you want to submit this cash advance request for approval?')) {
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
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Cash Advance Requests</h2>
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
                  onClick={() => handleSort('ca_number')}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors"
                >
                  CA No.
                  {getSortIcon('ca_number')}
                </button>
              </th>
              <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Company
                </span>
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
                <td colSpan={7} className="px-3 py-6 sm:px-6 sm:py-8 text-center text-xs sm:text-sm text-slate-500">
                  No cash advance requests found
                </td>
              </tr>
            ) : (
              paginatedRequests.map((req, index) => (
                <tr key={req.id} className={`hover:bg-slate-50 transition-colors group ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                  <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                    <span className="font-mono font-bold text-sm text-slate-900 truncate block min-w-[120px]" title={req.ca_number}>
                      {req.ca_number}
                    </span>
                  </td>
                  <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                    <span className="text-sm text-slate-700 truncate block max-w-[150px]" title={(req as any).companies?.name || 'N/A'}>
                      {(req as any).companies?.name || 'N/A'}
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
                  <td className="px-3 xl:px-4 py-3">
                    <span className="text-sm text-slate-700 truncate block max-w-[200px]" title={req.purpose}>
                      {req.purpose}
                    </span>
                  </td>
                  <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                    <span className="text-sm font-bold text-slate-900">
                      ₱{req.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full ${getStatusColor(req.status)}`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                    <button
                      onClick={() => {
                        setViewingRequest(req);
                        setShowViewModal(true);
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
                <h3 className="text-xl font-bold text-slate-900">Cash Advance Request Details</h3>
                <p className="text-sm text-slate-600 mt-1">{viewingRequest.ca_number}</p>
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
                  requestType="Cash Advance"
                  requestId={viewingRequest.id}
                />
              )}

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">CA Number</label>
                  <p className="text-slate-900 font-mono">{viewingRequest.ca_number}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Request Date</label>
                  <p className="text-slate-900">{new Date(viewingRequest.request_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Company</label>
                  <p className="text-slate-900">{viewingRequest.companies?.name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Department</label>
                  <p className="text-slate-900">{viewingRequest.department || viewingRequest.user_profiles?.department || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Payee/Vendor</label>
                  <p className="text-slate-900">{viewingRequest.payee || 'N/A'}</p>
                  {viewingRequest.payee_number && (
                    <p className="text-xs text-slate-500">Vendor No: {viewingRequest.payee_number}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Amount</label>
                  <p className="text-slate-900 font-bold">₱{viewingRequest.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Budget Status</label>
                  <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${
                    viewingRequest.budgeted ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  }`}>
                    {viewingRequest.budgeted ? 'Budgeted' : 'Non-budgeted'}
                  </span>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Status</label>
                  <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(viewingRequest.status)}`}>
                    {viewingRequest.status}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Purpose</label>
                <p className="text-slate-900">{viewingRequest.purpose}</p>
              </div>

              {viewingRequest.payment_mode_lines && viewingRequest.payment_mode_lines.length > 0 && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Payment Mode Details</label>
                  <div className="space-y-3">
                    {viewingRequest.payment_mode_lines.map((line: any, index: number) => (
                      <div key={index} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">{line.name}</span>
                              {line.is_required && (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">Required</span>
                              )}
                            </div>
                            <p className="text-sm text-slate-700 mt-1">{line.value || <span className="text-slate-400 italic">Not provided</span>}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {viewingRequest.approved_ca_pdf_path && (
                <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Approved Cash Advance Form</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => previewAttachments(viewingRequest.approved_ca_pdf_path!)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                    >
                      <Eye size={18} />
                      Preview Form
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const { data, error } = await supabase.storage
                            .from('attachments')
                            .download(viewingRequest.approved_ca_pdf_path!);

                          if (error) throw error;

                          const url = URL.createObjectURL(data);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${viewingRequest.ca_number}_Approved_Form.pdf`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        } catch (error) {
                          console.error('Error downloading approved form:', error);
                          alert('Failed to download approved form');
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition"
                    >
                      <Download size={18} />
                      Download Form
                    </button>
                    {profile?.role === 'admin' && (
                      <button
                        onClick={() => regenerateApprovedForm(viewingRequest)}
                        disabled={regenerating}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {regenerating ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                        {regenerating ? 'Regenerating...' : 'Regenerate'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {viewingRequest.status === 'approved' && (
                <div className={`border rounded-lg p-4 ${
                  viewingRequest.msbc_sync_status === 'synced' ? 'border-green-200 bg-green-50' :
                  viewingRequest.msbc_sync_status === 'failed' ? 'border-red-200 bg-red-50' :
                  viewingRequest.msbc_sync_status === 'syncing' ? 'border-yellow-200 bg-yellow-50' :
                  'border-slate-200 bg-slate-50'
                }`}>
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">MSBC Sync Status</label>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          Status: <span className={`font-bold ${
                            viewingRequest.msbc_sync_status === 'synced' ? 'text-green-700' :
                            viewingRequest.msbc_sync_status === 'failed' ? 'text-red-700' :
                            viewingRequest.msbc_sync_status === 'syncing' ? 'text-yellow-700' :
                            'text-slate-700'
                          }`}>
                            {viewingRequest.msbc_sync_status === 'synced' ? 'Successfully Posted' :
                             viewingRequest.msbc_sync_status === 'failed' ? 'Failed' :
                             viewingRequest.msbc_sync_status === 'syncing' ? 'Posting...' :
                             'Pending'}
                          </span>
                        </p>
                        {viewingRequest.msbc_sync_date && (
                          <p className="text-xs text-slate-600 mt-1">
                            {new Date(viewingRequest.msbc_sync_date).toLocaleString()}
                          </p>
                        )}
                        {viewingRequest.msbc_journal_id && (
                          <p className="text-xs text-slate-600 mt-1">
                            Journal ID: {viewingRequest.msbc_journal_id}
                          </p>
                        )}
                        {viewingRequest.msbc_sync_status === 'failed' && viewingRequest.msbc_sync_error && (
                          <p className="text-xs text-red-600 mt-2">
                            Error: {viewingRequest.msbc_sync_error}
                          </p>
                        )}
                      </div>
                      {profile?.role === 'admin' && (viewingRequest.msbc_sync_status === 'pending' || viewingRequest.msbc_sync_status === 'failed') && (
                        <button
                          onClick={() => postToMsbc(viewingRequest)}
                          disabled={postingToMsbc}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {postingToMsbc ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                          {postingToMsbc ? 'Posting...' : viewingRequest.msbc_sync_status === 'failed' ? 'Retry Post' : 'Post to MSBC'}
                        </button>
                      )}
                      {profile?.role === 'admin' && viewingRequest.msbc_sync_status === 'synced' && (
                        <button
                          onClick={() => postToMsbc(viewingRequest)}
                          disabled={postingToMsbc}
                          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {postingToMsbc ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                          {postingToMsbc ? 'Reposting...' : 'Repost to MSBC'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {viewingRequest.attachment_metadata && viewingRequest.attachment_metadata.length > 0 && (
                <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Attachments</label>
                  <ul className="space-y-2">
                    {viewingRequest.attachment_metadata.map((file, index) => (
                      <li key={index} className="flex items-center gap-2 text-slate-700">
                        <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        <span className="font-medium">{file.name}</span>
                        <span className="text-xs text-slate-500">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </li>
                    ))}
                  </ul>
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
                    onClick={() => downloadRFP(viewingRequest.rfp_pdf_path!, viewingRequest.ca_number)}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
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

      {showPdfPreview && pdfPreviewUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Attachments Preview</h3>
              <button
                onClick={closePdfPreview}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe
                src={pdfPreviewUrl}
                className="w-full h-full"
                title="PDF Preview"
              />
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={closePdfPreview}
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

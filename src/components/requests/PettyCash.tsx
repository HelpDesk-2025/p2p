import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Save, Send, Eye, FileText, X, Download, CreditCard as Edit, Loader2, Check, RefreshCw, Upload, Paperclip, Trash2 } from 'lucide-react';
import { getApprovalFlow, filterApprovalFlowsForRequester, createApprovalLedgerEntry, sendApprovalEmail, getApproverEmail } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import { generatePettyCashForm } from '../../lib/pettyCashFormGenerator';
import { PDFDocument } from 'pdf-lib';

interface PaymentMode {
  id: string;
  mode_name: string;
}

interface ExpenseItem {
  date: string;
  description: string;
  amount: number;
}

interface ExpenseTypeItem {
  expense_type_id: string;
  expense_type_name: string;
  sub_item_name: string;
  status: string;
  specify_value?: string;
}

interface ExpenseType {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  sub_items: Array<{
    name: string;
    description: string;
    status: string;
  }>;
}

interface PettyCashReq {
  id: string;
  pc_number: string;
  request_date: string;
  date_of_transactions?: string;
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
  expense_items?: ExpenseItem[];
  expense_type_items?: ExpenseTypeItem[];
  linked_petty_cash_id?: string;
  petty_cash_advance?: number;
  no_of_pax?: number;
  attachments?: Array<{
    file_name: string;
    file_path: string;
    file_type: string;
  }>;
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
    date_of_transactions: '',
    budgeted: true,
    payment_mode_id: '',
    request_type: 'For Cash Advance',
    no_of_pax: 0,
  });
  const [amountError, setAmountError] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([
    { date: '', description: '', amount: 0 }
  ]);
  const [approvedPettyCashRequests, setApprovedPettyCashRequests] = useState<any[]>([]);
  const [selectedPettyCashId, setSelectedPettyCashId] = useState<string>('');
  const [pettyCashAdvance, setPettyCashAdvance] = useState<number>(0);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [selectedExpenseTypeId, setSelectedExpenseTypeId] = useState<string>('');
  const [expenseTypeItems, setExpenseTypeItems] = useState<ExpenseTypeItem[]>([]);
  const [tempSubItemSpecifyValues, setTempSubItemSpecifyValues] = useState<{ [key: string]: string }>({});

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

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setAttachmentFile(null);
      setAttachmentError('');
      return;
    }

    // Check if file is PDF or image
    const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      setAttachmentError('Please upload a PDF or image file (JPG, JPEG, PNG)');
      setAttachmentFile(null);
      return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setAttachmentError('File size must be less than 10MB');
      setAttachmentFile(null);
      return;
    }

    setAttachmentFile(file);
    setAttachmentError('');
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

  const convertImageToPDF = async (imageFile: File): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const imageBytes = event.target?.result as ArrayBuffer;
          const pdfDoc = await PDFDocument.create();

          let image;
          if (imageFile.type === 'image/jpeg' || imageFile.type === 'image/jpg') {
            image = await pdfDoc.embedJpg(imageBytes);
          } else if (imageFile.type === 'image/png') {
            image = await pdfDoc.embedPng(imageBytes);
          } else {
            throw new Error('Unsupported image type');
          }

          const page = pdfDoc.addPage([image.width, image.height]);
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: image.width,
            height: image.height,
          });

          const pdfBytes = await pdfDoc.save();
          resolve(pdfBytes);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsArrayBuffer(imageFile);
    });
  };

  useEffect(() => {
    loadRequests();
    loadPaymentModes();
    loadExpenseTypes();
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

  useEffect(() => {
    if (formData.request_type === 'For Liquidation') {
      loadApprovedPettyCashForLiquidation();
    } else {
      setApprovedPettyCashRequests([]);
      setSelectedPettyCashId('');
      setPettyCashAdvance(0);
    }
  }, [formData.request_type, profile?.id, editingRequest?.id]);

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

  const loadApprovedPettyCashForLiquidation = async () => {
    if (!profile?.id) return;

    try {
      // Get all linked_petty_cash_id values from petty cash requests that are pending, approved, or received
      // Exclude the currently editing request if applicable
      let query = supabase
        .from('petty_cash_requests')
        .select('linked_petty_cash_id')
        .in('status', ['pending', 'approved', 'received'])
        .eq('request_type', 'For Liquidation')
        .not('linked_petty_cash_id', 'is', null);

      // If editing a request, exclude it from the "used" list
      if (editingRequest?.id) {
        query = query.neq('id', editingRequest.id);
      }

      const { data: usedRequestsData } = await query;

      // Extract the IDs that are already used
      const usedPettyCashIds = new Set(
        (usedRequestsData || []).map(req => req.linked_petty_cash_id)
      );

      // Load approved petty cash requests with request_type = 'For Cash Advance'
      const { data: pettyCashData } = await supabase
        .from('petty_cash_requests')
        .select('id, pc_number, request_date, amount, purpose, request_type')
        .eq('requester_id', profile.id)
        .eq('status', 'approved')
        .eq('request_type', 'For Cash Advance')
        .order('request_date', { ascending: false });

      // Filter out already used requests
      const available = (pettyCashData || [])
        .filter(req => !usedPettyCashIds.has(req.id))
        .sort((a, b) => new Date(b.request_date).getTime() - new Date(a.request_date).getTime());

      setApprovedPettyCashRequests(available);
    } catch (error) {
      console.error('Error loading approved petty cash requests:', error);
    }
  };

  const handlePettyCashSelection = (requestId: string) => {
    setSelectedPettyCashId(requestId);
    const selectedRequest = approvedPettyCashRequests.find(req => req.id === requestId);
    if (selectedRequest) {
      setPettyCashAdvance(selectedRequest.amount);
    } else {
      setPettyCashAdvance(0);
    }
  };

  const handleAddExpenseTypeItem = (subItemName: string, subItemStatus: string) => {
    const selectedExpenseType = expenseTypes.find(et => et.id === selectedExpenseTypeId);
    if (!selectedExpenseType) return;

    // For "Specify" status, require a value
    if (subItemStatus === 'Specify') {
      const specifyValue = tempSubItemSpecifyValues[subItemName] || '';
      if (!specifyValue.trim()) {
        alert('Please enter a value for the Specify field');
        return;
      }
    }

    const newItem: ExpenseTypeItem = {
      expense_type_id: selectedExpenseType.id,
      expense_type_name: selectedExpenseType.name,
      sub_item_name: subItemName,
      status: subItemStatus,
      specify_value: subItemStatus === 'Specify' ? tempSubItemSpecifyValues[subItemName] : undefined
    };

    const updatedItems = [...expenseTypeItems, newItem];
    setExpenseTypeItems(updatedItems);

    // Update PURPOSE field with all selected sub-items
    updatePurposeFromExpenseTypes(updatedItems);

    // Clear the specify value if it was used
    if (subItemStatus === 'Specify') {
      const newTempValues = { ...tempSubItemSpecifyValues };
      delete newTempValues[subItemName];
      setTempSubItemSpecifyValues(newTempValues);
    }
  };

  const handleRemoveExpenseTypeItem = (index: number) => {
    const updatedItems = expenseTypeItems.filter((_, i) => i !== index);
    setExpenseTypeItems(updatedItems);
    // Update PURPOSE field after removing item
    updatePurposeFromExpenseTypes(updatedItems);
  };

  const updatePurposeFromExpenseTypes = (items: ExpenseTypeItem[]) => {
    if (items.length === 0) {
      return;
    }

    // Build purpose string with each item on a new line
    const purposeLines = items.map(item => {
      const subItemText = item.specify_value
        ? `${item.expense_type_name}: ${item.sub_item_name} (${item.specify_value})`
        : `${item.expense_type_name}: ${item.sub_item_name}`;
      return subItemText;
    });

    setFormData({ ...formData, purpose: purposeLines.join('\n') });
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

  const loadExpenseTypes = async () => {
    const { data } = await supabase
      .from('expense_types')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });
    setExpenseTypes(data || []);
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
      date_of_transactions: request.date_of_transactions || '',
      budgeted: (request as any).budgeted !== undefined ? (request as any).budgeted : true,
      payment_mode_id: (request as any).payment_mode_id || '',
      request_type: request.request_type || 'For Cash Advance',
      no_of_pax: request.no_of_pax || 0,
    });
    // Initialize expense items for liquidation
    if (request.expense_items && request.expense_items.length > 0) {
      setExpenseItems(request.expense_items);
    } else {
      setExpenseItems([{ date: '', description: '', amount: 0 }]);
    }
    // Initialize expense type items
    setExpenseTypeItems([]);
    // Initialize linked petty cash for liquidation
    setPettyCashAdvance((request as any).petty_cash_advance || 0);
    setSelectedPettyCashId((request as any).linked_petty_cash_id || '');
    setShowViewModal(false);
    setViewingRequest(null);
    setShowForm(true);
  };

  const handleSubmit = async (status: 'draft' | 'pending') => {
    // For Liquidation: validate expense items instead of regular amount
    if (formData.request_type === 'For Liquidation') {
      const totalExpenditures = calculateTotalExpenditures();
      if (totalExpenditures > 5000) {
        alert('Total expenditures cannot exceed ₱5,000.00');
        return;
      }
      if (totalExpenditures === 0) {
        alert('Please add at least one expense item with a valid amount');
        return;
      }
      // Validate that all expense items have required fields
      const hasEmptyFields = expenseItems.some(item => !item.date || !item.description || item.amount <= 0);
      if (hasEmptyFields) {
        alert('Please fill in all expense item fields (date, description, and amount must be greater than 0)');
        return;
      }
    } else {
      // For other types: validate regular amount
      if (formData.amount > 5000) {
        alert('Petty cash amount cannot exceed ₱5,000.00');
        return;
      }
    }

    // Validate attachment for "For Reimbursement" or "For Liquidation" type
    if (formData.request_type === 'For Reimbursement' || formData.request_type === 'For Liquidation') {
      // For new requests, attachments are required
      if (!attachmentFile && !editingRequest) {
        alert('Please upload receipts. Attachments are required for Reimbursement and Liquidation requests.');
        return;
      }
      // For editing, check if attachments exist either as new upload or existing ones
      if (editingRequest && !attachmentFile && (!editingRequest.attachments || editingRequest.attachments.length === 0)) {
        alert('Please upload receipts. Attachments are required for Reimbursement and Liquidation requests.');
        return;
      }
    }

    if (status === 'draft') {
      setSavingDraft(true);
    } else {
      setSubmitting(true);
    }
    setLoading(true);
    try {
      let insertedRequest;

      // Calculate amount based on request type
      const finalAmount = formData.request_type === 'For Liquidation'
        ? calculateTotalExpenditures()
        : formData.amount;

      if (editingRequest) {
        const { data, error } = await supabase
          .from('petty_cash_requests')
          .update({
            payee: formData.payee,
            purpose: formData.purpose,
            amount: finalAmount,
            date_needed: formData.date_needed || null,
            date_of_transactions: formData.date_of_transactions || null,
            budgeted: formData.budgeted,
            payment_mode_id: formData.payment_mode_id || null,
            request_type: formData.request_type,
            expense_items: formData.request_type === 'For Liquidation' ? expenseItems : null,
            linked_petty_cash_id: formData.request_type === 'For Liquidation' && selectedPettyCashId ? selectedPettyCashId : null,
            petty_cash_advance: formData.request_type === 'For Liquidation' && selectedPettyCashId ? pettyCashAdvance : null,
            no_of_pax: formData.no_of_pax || null,
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
            amount: finalAmount,
            date_needed: formData.date_needed || null,
            date_of_transactions: formData.date_of_transactions || null,
            budgeted: formData.budgeted,
            payment_mode_id: formData.payment_mode_id || null,
            request_type: formData.request_type,
            expense_items: formData.request_type === 'For Liquidation' ? expenseItems : null,
            linked_petty_cash_id: formData.request_type === 'For Liquidation' && selectedPettyCashId ? selectedPettyCashId : null,
            petty_cash_advance: formData.request_type === 'For Liquidation' && selectedPettyCashId ? pettyCashAdvance : null,
            no_of_pax: formData.no_of_pax || null,
            status,
            current_approval_level: 0,
          })
          .select()
          .single();

        if (error) throw error;
        insertedRequest = data;
      }

      // Upload attachment if present
      if (attachmentFile && insertedRequest) {
        let fileToUpload: Blob | Uint8Array = attachmentFile;
        let fileName = attachmentFile.name;
        let fileType = attachmentFile.type;

        // Convert image to PDF if needed
        if (attachmentFile.type.startsWith('image/')) {
          try {
            const pdfBytes = await convertImageToPDF(attachmentFile);
            fileToUpload = new Blob([pdfBytes], { type: 'application/pdf' });
            // Change file extension to .pdf
            fileName = fileName.replace(/\.(jpg|jpeg|png)$/i, '.pdf');
            fileType = 'application/pdf';
          } catch (conversionError) {
            console.error('Error converting image to PDF:', conversionError);
            throw new Error('Failed to convert image to PDF. Please try again.');
          }
        }

        // Upload to storage
        const timestamp = Date.now();
        const filePath = `petty-cash-attachments/${insertedRequest.id}_${timestamp}_${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(filePath, fileToUpload, {
            contentType: fileType,
            upsert: true
          });

        if (uploadError) throw uploadError;

        // Update request with attachment info
        const attachmentData = [{
          file_name: fileName,
          file_path: filePath,
          file_type: fileType
        }];

        const { error: updateError } = await supabase
          .from('petty_cash_requests')
          .update({ attachments: attachmentData })
          .eq('id', insertedRequest.id);

        if (updateError) throw updateError;
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
      setFormData({ document_no: '', payee: '', purpose: '', amount: 0, date_needed: '', date_of_transactions: '', budgeted: true, payment_mode_id: '', request_type: 'For Cash Advance', no_of_pax: 0 });
      setEditingRequest(null);
      setAmountError('');
      setAttachmentFile(null);
      setAttachmentError('');
      setExpenseItems([{ date: '', description: '', amount: 0 }]);
      setSelectedPettyCashId('');
      setPettyCashAdvance(0);
      setApprovedPettyCashRequests([]);
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
    // Validate attachments for Reimbursement and Liquidation request types
    if (request.request_type === 'For Reimbursement' || request.request_type === 'For Liquidation') {
      if (!request.attachments || request.attachments.length === 0) {
        alert('Please upload receipts before submitting. Attachments are required for Reimbursement and Liquidation requests.');
        return;
      }
    }

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
    if (request.request_type !== 'For Reimbursement' && request.request_type !== 'For Cash Advance') {
      alert('Receive cash functionality is only available for "For Reimbursement" and "For Cash Advance" request types.');
      return;
    }

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

      // Get company name
      const { data: companyData } = await supabase
        .from('companies')
        .select('name')
        .eq('id', request.company_id || profile.company_id)
        .single();

      // Generate approved petty cash PDF
      const requestDateObj = new Date(request.request_date);
      const approvedDateObj = new Date(firstApprover.approval_date);
      const receivedDateObj = new Date();

      const pdfBytes = await generatePettyCashForm({
        pcNumber: request.pc_number,
        recipient: request.payee || profile.full_name || 'Unknown',
        requestDate: requestDateObj.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
          requestDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        requestType: request.request_type || 'For Cash Advance',
        purpose: request.purpose,
        expenseTypeItems: request.expense_type_items || [],
        noOfPax: request.no_of_pax || 0,
        dateOfTransaction: request.date_of_transactions
          ? new Date(request.date_of_transactions).toLocaleDateString()
          : 'N/A',
        company: companyData?.name || profile.company_name || 'Unknown',
        department: request.department || profile.department || 'Unknown',
        amount: request.amount,
        approvedByName: firstApprover.approver_name,
        approvedByEsig: firstApprover.user_profiles?.e_sig || null,
        approvedByDate: approvedDateObj.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
          approvedDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        receivedByName: profile.full_name || 'Unknown',
        receivedByEsig: profile.e_sig || null,
        receivedByDate: receivedDateObj.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
          receivedDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
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

  const downloadAttachment = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading attachment:', error);
      alert('Failed to download attachment');
    }
  };

  const previewAttachment = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error previewing attachment:', error);
      alert('Failed to preview attachment');
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
    if (request.request_type !== 'For Reimbursement' && request.request_type !== 'For Cash Advance') {
      alert('Petty cash form generation is only available for "For Reimbursement" and "For Cash Advance" request types.');
      return;
    }

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

      // Get company name
      const { data: companyData } = await supabase
        .from('companies')
        .select('name')
        .eq('id', request.company_id || profile.company_id)
        .single();

      const requestDateObj = new Date(request.request_date);
      const approvedDateObj = new Date(firstApprover.approval_date);
      const receivedDateObj = new Date(request.received_at || new Date());

      const pdfBytes = await generatePettyCashForm({
        pcNumber: request.pc_number,
        recipient: request.payee || profile.full_name || 'Unknown',
        requestDate: requestDateObj.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
          requestDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        requestType: request.request_type || 'For Cash Advance',
        purpose: request.purpose,
        expenseTypeItems: request.expense_type_items || [],
        noOfPax: request.no_of_pax || 0,
        dateOfTransaction: request.date_of_transactions
          ? new Date(request.date_of_transactions).toLocaleDateString()
          : 'N/A',
        company: companyData?.name || profile.company_name || 'Unknown',
        department: request.department || profile.department || 'Unknown',
        amount: request.amount,
        approvedByName: firstApprover.approver_name,
        approvedByEsig: firstApprover.user_profiles?.e_sig || null,
        approvedByDate: approvedDateObj.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
          approvedDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        receivedByName: profile.full_name || 'Unknown',
        receivedByEsig: profile.e_sig || null,
        receivedByDate: receivedDateObj.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' +
          receivedDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
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
          <button onClick={() => {
            setShowForm(false);
            setEditingRequest(null);
            setAmountError('');
            setExpenseItems([{ date: '', description: '', amount: 0 }]);
            setSelectedPettyCashId('');
            setPettyCashAdvance(0);
            setApprovedPettyCashRequests([]);
          }} className="px-4 py-2 text-slate-600">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <label className="block text-sm font-medium text-slate-700 mb-1">No. of Pax</label>
              <input
                type="number"
                value={formData.no_of_pax}
                onChange={(e) => setFormData({ ...formData, no_of_pax: Number(e.target.value) })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                min="0"
                step="1"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date of Transaction</label>
            <input
              type="date"
              value={formData.date_of_transactions}
              onChange={(e) => setFormData({ ...formData, date_of_transactions: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Request Type</label>
            <select
              value={formData.request_type}
              onChange={(e) => {
                setFormData({ ...formData, request_type: e.target.value });
                // Clear attachment if switching away from Reimbursement/Liquidation
                if (e.target.value !== 'For Reimbursement' && e.target.value !== 'For Liquidation') {
                  setAttachmentFile(null);
                  setAttachmentError('');
                }
              }}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
              required
            >
              <option value="For Cash Advance">For Cash Advance</option>
              <option value="For Reimbursement">For Reimbursement</option>
              <option value="For Liquidation">For Liquidation</option>
            </select>
          </div>

          {(formData.request_type === 'For Reimbursement' || formData.request_type === 'For Liquidation') && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Upload Receipts
                <span className="text-red-500 ml-1">*</span>
              </label>
              <p className="text-xs text-slate-600 mb-3">
                Upload receipts or supporting documents (PDF or image file)
              </p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition">
                  <Upload size={18} className="text-slate-600" />
                  <span className="text-sm text-slate-700">Choose File</span>
                  <input
                    type="file"
                    accept=".pdf,image/jpeg,image/jpg,image/png"
                    onChange={handleAttachmentChange}
                    className="hidden"
                  />
                </label>
                {attachmentFile && (
                  <div className="flex items-center gap-2 text-sm text-slate-700 bg-white px-3 py-2 rounded-lg border border-slate-300">
                    <Paperclip size={16} className="text-blue-600" />
                    <span className="truncate max-w-xs">{attachmentFile.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachmentFile(null);
                        setAttachmentError('');
                      }}
                      className="text-red-500 hover:text-red-700 ml-2"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
              {attachmentError && (
                <p className="mt-2 text-sm text-red-600">{attachmentError}</p>
              )}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <label className="block text-sm font-medium text-slate-900 mb-2">Type of Expense</label>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Select Expense Type</label>
              <select
                value={selectedExpenseTypeId}
                onChange={(e) => setSelectedExpenseTypeId(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
              >
                <option value="">Select an expense type</option>
                {expenseTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedExpenseTypeId && expenseTypes.find(et => et.id === selectedExpenseTypeId)?.sub_items && expenseTypes.find(et => et.id === selectedExpenseTypeId)?.sub_items.length > 0 && (
              <div className="border border-slate-300 rounded-lg bg-white p-3 space-y-2">
                <label className="block text-xs font-medium text-slate-700">Sub-Items</label>
                {expenseTypes.find(et => et.id === selectedExpenseTypeId)?.sub_items.map((subItem, idx) => {
                  const isAdded = expenseTypeItems.some(
                    item => item.expense_type_id === selectedExpenseTypeId && item.sub_item_name === subItem.name
                  );

                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium text-slate-900">{subItem.name}</div>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${subItem.status === 'Pre Identify' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                            {subItem.status || 'Pre Identify'}
                          </span>
                        </div>
                        {subItem.description && (
                          <div className="text-xs text-slate-600">{subItem.description}</div>
                        )}
                      </div>
                      {subItem.status === 'Specify' && (
                        <input
                          type="text"
                          placeholder="Specify value"
                          value={tempSubItemSpecifyValues[subItem.name] || ''}
                          onChange={(e) => setTempSubItemSpecifyValues({ ...tempSubItemSpecifyValues, [subItem.name]: e.target.value })}
                          className="w-48 px-3 py-1.5 border border-slate-300 rounded text-sm"
                          disabled={isAdded}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => handleAddExpenseTypeItem(subItem.name, subItem.status || 'Pre Identify')}
                        disabled={isAdded}
                        className={`px-3 py-1.5 text-sm rounded ${
                          isAdded
                            ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {isAdded ? 'Added' : 'Add'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {expenseTypeItems.length > 0 && (
              <div className="border border-slate-300 rounded-lg bg-white p-3">
                <label className="block text-xs font-medium text-slate-700 mb-2">Added Items</label>
                <div className="space-y-1.5">
                  {expenseTypeItems.map((item, index) => (
                    <div key={index} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded text-sm">
                      <div className="flex-1">
                        <span className="font-medium text-slate-900">{item.expense_type_name}</span>
                        <span className="text-slate-600"> - {item.sub_item_name}</span>
                        {item.specify_value && (
                          <span className="text-slate-700"> ({item.specify_value})</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveExpenseTypeItem(index)}
                        className="text-red-600 hover:text-red-700 transition ml-2"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Purpose / Particulars</label>
            <textarea
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
              required
              disabled={expenseTypeItems.length > 0}
            />
            {expenseTypeItems.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">Purpose is automatically generated from expense type items</p>
            )}
          </div>

          {formData.request_type === 'For Liquidation' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Select Approved Petty Cash (For Cash Advance)
              </label>
              <select
                value={selectedPettyCashId}
                onChange={(e) => handlePettyCashSelection(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
              >
                <option value="">Select a petty cash to liquidate</option>
                {approvedPettyCashRequests.map((req) => (
                  <option key={req.id} value={req.id}>
                    {req.pc_number} | ₱{req.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} | {new Date(req.request_date).toLocaleDateString()}
                  </option>
                ))}
              </select>
              {approvedPettyCashRequests.length === 0 && (
                <p className="text-sm text-amber-600">No approved petty cash (For Cash Advance) available for liquidation.</p>
              )}
            </div>
          )}

          {formData.request_type === 'For Liquidation' ? (
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
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Supplier Name/Vendor Name</th>
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
                        Less: Petty Cash Advance:
                      </td>
                      <td className="px-4 py-2 font-semibold text-slate-900">
                        ₱{pettyCashAdvance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                    <tr className="border-t-2 border-slate-300">
                      <td colSpan={2} className="px-4 py-2 text-right font-bold text-slate-900">
                        {(calculateTotalExpenditures() - pettyCashAdvance) >= 0 ? 'Over for Reimbursement:' : 'Excess for Deposit:'}
                      </td>
                      <td className="px-4 py-2 font-bold text-lg text-slate-900">
                        ₱{Math.abs(calculateTotalExpenditures() - pettyCashAdvance).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {calculateTotalExpenditures() > 5000 && (
                <p className="mt-2 text-sm text-red-600">Total expenditures cannot exceed ₱5,000.00</p>
              )}
            </div>
          ) : (
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
          )}

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
            setExpenseItems([{ date: '', description: '', amount: 0 }]);
            setFormData({
              document_no: '',
              payee: '',
              purpose: '',
              amount: 0,
              date_needed: '',
              date_of_transactions: '',
              budgeted: true,
              payment_mode_id: '',
              request_type: 'For Cash Advance',
              no_of_pax: 0,
            });
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
                    {new Date(req.request_date).toLocaleString()}
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

              {viewingRequest.status === 'approved' && !viewingRequest.received_at && (viewingRequest.request_type === 'For Reimbursement' || viewingRequest.request_type === 'For Cash Advance') && (
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

              {viewingRequest.status === 'approved' && viewingRequest.received_at && (viewingRequest.request_type === 'For Reimbursement' || viewingRequest.request_type === 'For Cash Advance') && (
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
                  <label className="text-sm font-semibold text-slate-700">Date of Transaction</label>
                  <p className="text-slate-900">
                    {viewingRequest.date_of_transactions
                      ? new Date(viewingRequest.date_of_transactions).toLocaleDateString()
                      : 'N/A'}
                  </p>
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
                  <label className="text-sm font-semibold text-slate-700">No. of Pax</label>
                  <p className="text-slate-900">{viewingRequest.no_of_pax || 0}</p>
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

              {viewingRequest.request_type === 'For Liquidation' && viewingRequest.expense_items && viewingRequest.expense_items.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Expense Itemization</label>
                  <div className="border border-slate-300 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Supplier Name/Vendor Name</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {viewingRequest.expense_items.map((item, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-sm text-slate-700">
                              {new Date(item.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </td>
                            <td className="px-4 py-2 text-sm text-slate-700">{item.description}</td>
                            <td className="px-4 py-2 text-sm text-slate-900 font-semibold">
                              ₱{item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                            {formatCurrency(viewingRequest.amount)}
                          </td>
                        </tr>
                        {viewingRequest.petty_cash_advance && (
                          <>
                            <tr>
                              <td colSpan={2} className="px-4 py-2 text-right font-semibold text-slate-700">
                                Less: Petty Cash Advance:
                              </td>
                              <td className="px-4 py-2 font-semibold text-slate-900">
                                {formatCurrency(viewingRequest.petty_cash_advance)}
                              </td>
                            </tr>
                            <tr className="border-t-2 border-slate-300">
                              <td colSpan={2} className="px-4 py-2 text-right font-bold text-slate-900">
                                {(viewingRequest.amount - viewingRequest.petty_cash_advance) >= 0 ? 'Over for Reimbursement:' : 'Excess for Deposit:'}
                              </td>
                              <td className="px-4 py-2 font-bold text-lg text-slate-900">
                                {formatCurrency(Math.abs(viewingRequest.amount - viewingRequest.petty_cash_advance))}
                              </td>
                            </tr>
                          </>
                        )}
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {viewingRequest.attachments && viewingRequest.attachments.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label className="block text-sm font-semibold text-slate-700 mb-3">
                    Attached Receipts
                  </label>
                  {viewingRequest.attachments.map((attachment, index) => (
                    <div key={index} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-300">
                      <div className="flex items-center gap-2">
                        <Paperclip size={18} className="text-blue-600" />
                        <span className="text-sm text-slate-700">{attachment.file_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => previewAttachment(attachment.file_path)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition"
                        >
                          <Eye size={16} />
                          Preview
                        </button>
                        <button
                          onClick={() => downloadAttachment(attachment.file_path, attachment.file_name)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                        >
                          <Download size={16} />
                          Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                {viewingRequest.status === 'approved' && !viewingRequest.received_at && (viewingRequest.request_type === 'For Reimbursement' || viewingRequest.request_type === 'For Cash Advance') && (
                  <button
                    onClick={() => handleReceivePettyCash(viewingRequest)}
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                    {loading ? 'Processing...' : 'Receive Cash'}
                  </button>
                )}
                {viewingRequest.status === 'approved' && viewingRequest.received_at && viewingRequest.approved_petty_cash_pdf_path && (viewingRequest.request_type === 'For Reimbursement' || viewingRequest.request_type === 'For Cash Advance') && (
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

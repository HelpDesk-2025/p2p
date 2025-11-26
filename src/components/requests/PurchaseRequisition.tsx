import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Trash2, Save, Send, Eye, FileText, Upload, X, Download, RefreshCw } from 'lucide-react';
import { getApprovalFlow, createApprovalLedgerEntry, sendApprovalEmail, getApproverEmail } from '../../lib/approvalFlow';
import { uploadAttachments } from '../../lib/storageHelper';
import { mergeFilesToPDFBlob } from '../../lib/pdfMerger';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import { regenerateRFP } from '../../lib/rfpGenerator';

interface PRItem {
  description: string;
  item_description?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  item_number?: string;
}

interface ChecklistItem {
  id: string;
  item_name: string;
  description: string;
  is_required: boolean;
  file?: File | null;
  fileName?: string;
  fileUrl?: string;
}

interface PaymentModeLine {
  name: string;
  value: string;
  is_required?: boolean;
}

interface PurchaseReq {
  id: string;
  document_no: string;
  pr_number: string;
  department: string;
  request_date: string;
  date_required: string;
  description: string;
  purpose: string;
  is_budgeted: boolean;
  purchase_type: string;
  total_amount: number;
  status: string;
  items: PRItem[];
  payee?: string;
  amount_net_vat?: number;
  rfp_pdf_path?: string;
  msbc_posting_status?: string;
  msbc_posting_date?: string;
  msbc_journal_batch_id?: string;
  msbc_error_message?: string;
}

export function PurchaseRequisition() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<PurchaseReq[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [prChecklists, setPrChecklists] = useState<any[]>([]);
  const [paymentModes, setPaymentModes] = useState<any[]>([]);
  const [selectedChecklist, setSelectedChecklist] = useState<any>(null);
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<any>(null);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [vendorSearchTerm, setVendorSearchTerm] = useState('');
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const vendorDropdownRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemSearchTerms, setItemSearchTerms] = useState<string[]>(['']);
  const [showItemDropdown, setShowItemDropdown] = useState<number | null>(null);
  const itemDropdownRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [viewingRequest, setViewingRequest] = useState<PurchaseReq | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<PurchaseReq | null>(null);

  const [formData, setFormData] = useState({
    document_no: '',
    description: '',
    department: profile?.department || '',
    date_required: '',
    purpose: '',
    is_budgeted: false,
    purchase_type: 'Purchase Order',
    pr_checklist_id: '',
    checklist_items: [] as ChecklistItem[],
    payee: '',
    payee_number: '',
    amount_net_vat: '',
    payment_mode_id: '',
    payment_mode_lines: [] as PaymentModeLine[],
    items: [{ description: '', quantity: 1, unit: 'pcs', unit_price: 0, total_price: 0, item_number: '' }],
  });

  useEffect(() => {
    loadRequests();
    loadPRChecklists();
    loadPaymentModes();
    loadVendors();
    loadItems();
  }, []);

  useEffect(() => {
    loadPRChecklists();
  }, [formData.purchase_type]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (vendorDropdownRef.current && !vendorDropdownRef.current.contains(event.target as Node)) {
        setShowVendorDropdown(false);
      }
      itemDropdownRefs.current.forEach((ref, index) => {
        if (ref && !ref.contains(event.target as Node)) {
          if (showItemDropdown === index) {
            setShowItemDropdown(null);
          }
        }
      });
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showItemDropdown]);

  const loadRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('purchase_requisitions')
        .select(`
          *,
          pr_checklists (
            pr_type,
            item_name
          )
        `)
        .eq('requester_id', profile?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error loading requests:', error);
    }
  };

  const convertPurchaseTypeToDbFormat = (purchaseType: string) => {
    if (purchaseType === 'Purchase Order') return 'purchase_order';
    if (purchaseType === 'Non-Purchase Order') return 'non_purchase_order';
    return purchaseType.toLowerCase().replace(/ /g, '_');
  };

  const loadPRChecklists = async () => {
    try {
      const dbPurchaseType = convertPurchaseTypeToDbFormat(formData.purchase_type);
      const { data, error } = await supabase
        .from('pr_checklists')
        .select('*')
        .eq('pr_type', dbPurchaseType)
        .eq('is_active', true)
        .order('order_index', { ascending: true });

      if (error) throw error;
      setPrChecklists(data || []);
    } catch (error) {
      console.error('Error loading PR checklists:', error);
    }
  };

  const loadVendors = async () => {
    setLoadingVendors(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session found');
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-vendors`;
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch vendors');
      }

      const data = await response.json();
      const sortedVendors = (data.value || []).sort((a: any, b: any) =>
        (a.displayName || '').localeCompare(b.displayName || '')
      );
      setVendors(sortedVendors);
    } catch (error) {
      console.error('Error loading vendors:', error);
    } finally {
      setLoadingVendors(false);
    }
  };

  const filteredVendors = vendors.filter((vendor) =>
    vendor.displayName?.toLowerCase().includes(vendorSearchTerm.toLowerCase()) ||
    vendor.number?.toLowerCase().includes(vendorSearchTerm.toLowerCase())
  );

  const loadItems = async () => {
    setLoadingItems(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session found');
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-items`;
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch items');
      }

      const data = await response.json();
      const sortedItems = (data.value || []).sort((a: any, b: any) =>
        (a.displayName || '').localeCompare(b.displayName || '')
      );
      setItems(sortedItems);
    } catch (error) {
      console.error('Error loading items:', error);
    } finally {
      setLoadingItems(false);
    }
  };

  const getFilteredItems = (index: number) => {
    const searchTerm = itemSearchTerms[index] || '';
    return items.filter((item) =>
      item.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.number?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

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

  const generateDocumentNo = async () => {
    try {
      const { data, error } = await supabase.rpc('get_next_number', {
        p_series_name: 'Purchase Requisition'
      });
      if (error) throw error;
      setFormData(prev => ({ ...prev, document_no: data }));
    } catch (error) {
      console.error('Error generating document number:', error);
    }
  };

  const handleChecklistChange = (checklistId: string) => {
    const checklist = prChecklists.find(c => c.id === checklistId);
    setSelectedChecklist(checklist);

    // Map the selected checklist's attachments to checklist items
    const checklistItems = checklist?.attachments
      ? (checklist.attachments as Array<{name: string, is_required: boolean}>).map((attachment, index) => ({
          id: `${checklist.id}-${index}`,
          item_name: attachment.name,
          description: checklist.description,
          is_required: attachment.is_required,
          file: null,
          fileName: ''
        }))
      : [];

    setFormData({
      ...formData,
      pr_checklist_id: checklistId,
      checklist_items: checklistItems
    });
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

  const updateChecklistItem = (index: number, file: File | null) => {
    const newItems = [...formData.checklist_items];
    newItems[index].file = file;
    newItems[index].fileName = file ? file.name : '';
    setFormData({ ...formData, checklist_items: newItems });
  };

  const handleFileChange = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (file) {
      const fileType = file.type;
      const isValidType = fileType === 'application/pdf' || fileType.startsWith('image/');
      if (!isValidType) {
        alert('Only PDF and image files are allowed');
        event.target.value = '';
        return;
      }
    }
    updateChecklistItem(index, file);
  };

  const removeChecklistFile = (index: number) => {
    updateChecklistItem(index, null);
  };

  const updatePaymentModeLine = (index: number, value: string) => {
    const newLines = [...formData.payment_mode_lines];
    newLines[index].value = value;
    setFormData({ ...formData, payment_mode_lines: newLines });
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        { description: '', quantity: 1, unit: 'pcs', unit_price: 0, total_price: 0, item_number: '' },
      ],
    });
    setItemSearchTerms([...itemSearchTerms, '']);
  };

  const removeItem = (index: number) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    const newSearchTerms = itemSearchTerms.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
    setItemSearchTerms(newSearchTerms);
  };

  const updateItem = (index: number, field: keyof PRItem, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };

    if (field === 'quantity' || field === 'unit_price') {
      newItems[index].total_price = newItems[index].quantity * newItems[index].unit_price;
    }

    setFormData({ ...formData, items: newItems });
  };

  const calculateTotal = () => {
    if (formData.purchase_type === 'Purchase Order') {
      return formData.items.reduce((sum, item) => sum + item.total_price, 0);
    } else {
      return parseFloat(formData.amount_net_vat) || 0;
    }
  };

  const generatePRNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `PR-${year}${month}-${random}`;
  };


  const handleEditDraft = async (request: PurchaseReq) => {
    setEditingRequest(request);
    setFormData({
      document_no: request.document_no,
      description: request.description,
      department: request.department,
      date_required: request.date_required || request.required_date,
      purpose: request.purpose,
      is_budgeted: request.is_budgeted,
      purchase_type: request.purchase_type,
      pr_checklist_id: (request as any).pr_checklist_id || '',
      checklist_items: (request as any).checklist_items || [],
      payee: request.payee || '',
      payee_number: (request as any).payee_number || '',
      amount_net_vat: request.amount_net_vat?.toString() || '',
      payment_mode_id: (request as any).payment_mode_id || '',
      payment_mode_lines: (request as any).payment_mode_lines || [],
      items: request.items && request.items.length > 0 ? request.items : [{ description: '', quantity: 1, unit: 'pcs', unit_price: 0, total_price: 0, item_number: '' }],
    });
    setShowViewModal(false);
    setViewingRequest(null);
    setShowForm(true);
  };

  const handleSubmit = async (status: 'draft' | 'pending') => {
    setLoading(true);
    try {
      const total = calculateTotal();
      const prNumber = generatePRNumber();

      const checklistItemsWithoutFiles = formData.checklist_items.map((item) => ({
        id: item.id,
        item_name: item.item_name,
        description: item.description,
        is_required: item.is_required,
        fileName: item.fileName || ''
      }));

      const filesToUpload = formData.checklist_items
        .filter(item => item.file)
        .map(item => item.file!);

      let mergedPdfPath = editingRequest?.merged_pdf_path || null;
      if (filesToUpload.length > 0 && profile?.id) {
        const mergedPdfBlob = await mergeFilesToPDFBlob(filesToUpload);

        const timestamp = Date.now();
        const mergedFileName = `merged_${timestamp}.pdf`;
        const filePath = `purchase-requisitions/${profile.id}/${mergedFileName}`;

        const { data, error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(filePath, mergedPdfBlob, {
            cacheControl: '3600',
            upsert: false,
            contentType: 'application/pdf'
          });

        if (uploadError) {
          throw new Error(`Failed to upload merged PDF: ${uploadError.message}`);
        }

        mergedPdfPath = data.path;
      }

      const payload: any = {
        description: formData.description,
        department: formData.department,
        required_date: formData.date_required,
        date_required: formData.date_required,
        purpose: formData.purpose,
        is_budgeted: formData.is_budgeted,
        purchase_type: formData.purchase_type,
        total_amount: total,
        status,
        pr_checklist_id: formData.pr_checklist_id || null,
        checklist_items: checklistItemsWithoutFiles,
        merged_pdf_path: mergedPdfPath,
      };

      if (formData.purchase_type === 'Purchase Order') {
        payload.items = formData.items;
      } else {
        payload.payee = formData.payee;
        payload.payee_number = formData.payee_number;
        payload.amount_net_vat = parseFloat(formData.amount_net_vat) || 0;
        payload.payment_mode_id = formData.payment_mode_id || null;
        payload.payment_mode_lines = formData.payment_mode_lines;
      }

      let insertedPR;

      if (editingRequest) {
        // Update existing draft
        const { data, error } = await supabase
          .from('purchase_requisitions')
          .update(payload)
          .eq('id', editingRequest.id)
          .select()
          .single();

        if (error) throw error;
        insertedPR = data;
      } else {
        // Create new request
        payload.document_no = formData.document_no;
        payload.pr_number = prNumber;
        payload.requester_id = profile?.id;
        payload.request_date = new Date().toISOString().split('T')[0];
        payload.current_approval_level = 0;

        const { data, error } = await supabase
          .from('purchase_requisitions')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        insertedPR = data;
      }

      if (status === 'pending' && insertedPR && profile?.company_id) {
        console.log('🚀 Starting approval process...');
        console.log('📋 Request details:', {
          companyId: profile.company_id,
          department: formData.department,
          requestType: 'Purchase Requisition',
          isBudgeted: formData.is_budgeted,
          totalAmount: total
        });

        try {
          // STRICT: Get approval flow based on company, department, request type, and budget setup
          const approvalFlows = await getApprovalFlow(
            profile.company_id,
            formData.department,
            'Purchase Requisition',
            formData.is_budgeted,
            total
          );

          if (!approvalFlows || approvalFlows.length === 0) {
            throw new Error('No approval flow configured for this request. Please contact administrator.');
          }

          console.log('✅ Approval flows found:', approvalFlows.length, 'steps');
          console.log('📋 Approval steps:', approvalFlows.map((f, i) => `Step ${i + 1}: ${f.approver_type}`).join(' → '));

          // Create initial ledger entry for submission
          await createApprovalLedgerEntry(
            'Purchase Requisition',
            insertedPR.id,
            formData.document_no,
            profile.id,
            profile.full_name || 'Unknown',
            'Requestor',
            'Submitted',
            'Initial submission',
            0
          );

          // Get first approver (Step 1)
          const firstApprover = approvalFlows[0];
          console.log('👤 Step 1 Approver:', firstApprover.approver_type);

          const approverInfo = await getApproverEmail(
            firstApprover,
            profile.company_id,
            formData.department
          );

          if (!approverInfo) {
            throw new Error(`Could not find approver for ${firstApprover.approver_type}. Please contact administrator.`);
          }

          console.log('📧 Sending email to Step 1 approver:', approverInfo.name, '(' + approverInfo.email + ')');

          // Send email to ONLY Step 1 approver
          await sendApprovalEmail(
            approverInfo.email,
            approverInfo.name,
            'Purchase Requisition',
            formData.document_no,
            profile.full_name || 'Unknown',
            formData.department,
            total,
            'Submitted',
            undefined,
            undefined,
            firstApprover.approver_type
          );

          console.log('✅ Approval process initiated successfully');
        } catch (approvalError: any) {
          console.error('❌ Approval flow error:', approvalError);
          // Rollback: Delete the created PR
          await supabase.from('purchase_requisitions').delete().eq('id', insertedPR.id);
          throw new Error(`Approval flow error: ${approvalError.message}`);
        }
      }

      setShowForm(false);
      resetForm();
      loadRequests();
      if (!editingRequest) {
        generateDocumentNo();
      }
    } catch (error: any) {
      alert('Error ' + (editingRequest ? 'updating' : 'creating') + ' request: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      document_no: '',
      description: '',
      department: profile?.department || '',
      date_required: '',
      purpose: '',
      is_budgeted: false,
      purchase_type: 'Purchase Order',
      pr_checklist_id: '',
      checklist_items: [],
      payee: '',
      payee_number: '',
      amount_net_vat: '',
      payment_mode_id: '',
      payment_mode_lines: [],
      items: [{ description: '', quantity: 1, unit: 'pcs', unit_price: 0, total_price: 0, item_number: '' }],
    });
    setSelectedChecklist(null);
    setSelectedPaymentMode(null);
    setItemSearchTerms(['']);
    setEditingRequest(null);
  };

  const handleRegenerateRFP = async (request: PurchaseReq) => {
    if (!confirm('Are you sure you want to regenerate the RFP? This will replace the existing RFP PDF.')) {
      return;
    }

    setLoading(true);
    try {
      console.log('Starting RFP regeneration for:', request.document_no || request.pr_number);
      const newPath = await regenerateRFP('purchase_requisition', request.id, request.document_no || request.pr_number);
      console.log('RFP regenerated successfully, new path:', newPath);

      // Close the modal first
      setShowViewModal(false);
      setViewingRequest(null);

      alert('RFP regenerated successfully!');

      // Reload requests to get updated data
      await loadRequests();
    } catch (error) {
      console.error('Error regenerating RFP:', error);
      alert('Failed to regenerate RFP: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRepostToMSBC = async (request: PurchaseReq) => {
    if (!confirm('Are you sure you want to repost this request to MSBC?')) {
      return;
    }

    setLoading(true);
    try {
      console.log('Starting MSBC posting for:', request.document_no || request.pr_number);
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/post-pr-to-msbc`;
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      const postResponse = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ requestId: request.id }),
      });

      if (!postResponse.ok) {
        const errorData = await postResponse.json();
        throw new Error(errorData.message || 'Failed to post to MSBC');
      }

      const postResult = await postResponse.json();
      console.log('MSBC posting successful:', postResult);

      // Close the modal first
      setShowViewModal(false);
      setViewingRequest(null);

      alert('Request posted to MSBC successfully!\nJournal Batch ID: ' + postResult.journalBatchId);

      // Reload requests to get updated data
      await loadRequests();
    } catch (error) {
      console.error('Error posting to MSBC:', error);
      alert('Failed to post to MSBC: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const downloadRFP = async (rfpPath: string, prNumber: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(rfpPath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RFP_${prNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading RFP:', error);
      alert('Failed to download RFP');
    }
  };

  const handleSubmitDraft = async (request: PurchaseReq) => {
    if (!confirm('Are you sure you want to submit this draft for approval?')) {
      return;
    }

    setLoading(true);
    try {
      if (!profile?.company_id) {
        throw new Error('Company information not found');
      }

      const approvalFlows = await getApprovalFlow(
        profile.company_id,
        request.department,
        'Purchase Requisition',
        request.is_budgeted,
        request.total_amount
      );

      if (!approvalFlows || approvalFlows.length === 0) {
        throw new Error('No approval flow configured for this request. Please contact administrator.');
      }

      const { error: updateError } = await supabase
        .from('purchase_requisitions')
        .update({ status: 'pending', current_approval_level: 0 })
        .eq('id', request.id);

      if (updateError) throw updateError;

      await createApprovalLedgerEntry(
        'Purchase Requisition',
        request.id,
        request.document_no,
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
        profile.company_id,
        request.department
      );

      if (approverInfo) {
        await sendApprovalEmail(
          approverInfo.email,
          approverInfo.name,
          'Purchase Requisition',
          request.document_no,
          profile.full_name || 'Unknown',
          request.department,
          request.total_amount,
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
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-slate-100 text-slate-700',
      pending: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      in_procurement: 'bg-blue-100 text-blue-700',
    };
    return colors[status] || 'bg-slate-100 text-slate-700';
  };

  if (showForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">
            {editingRequest ? 'Edit Purchase Requisition' : 'New Purchase Requisition'}
          </h2>
          <button
            onClick={() => {
              setShowForm(false);
              resetForm();
            }}
            className="px-4 py-2 text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Document No.
              </label>
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg">
                <FileText size={18} className="text-slate-400" />
                <span className="font-mono font-semibold text-slate-900">{formData.document_no}</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Department
              </label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Brief description of the requisition"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Purpose</label>
            <textarea
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Detailed purpose and justification"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date Required/Needed
              </label>
              <input
                type="date"
                value={formData.date_required}
                onChange={(e) => setFormData({ ...formData, date_required: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Budget Status
              </label>
              <select
                value={formData.is_budgeted ? 'budgeted' : 'non-budgeted'}
                onChange={(e) => setFormData({ ...formData, is_budgeted: e.target.value === 'budgeted' })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="budgeted">Budgeted</option>
                <option value="non-budgeted">Non-budgeted</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Purchase Type
            </label>
            <select
              value={formData.purchase_type}
              onChange={(e) => setFormData({ ...formData, purchase_type: e.target.value, pr_checklist_id: '', checklist_items: [] })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="Purchase Order">Purchase Order</option>
              <option value="Non-Purchase Order">Non-Purchase Order</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              PR Checklist
            </label>
            <select
              value={formData.pr_checklist_id}
              onChange={(e) => handleChecklistChange(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">Select a checklist</option>
              {prChecklists.map((checklist) => (
                <option key={checklist.id} value={checklist.id}>
                  {checklist.item_name}
                </option>
              ))}
            </select>
          </div>

          {formData.checklist_items.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">Checklist Items</h3>
              {formData.checklist_items.map((item, index) => (
                <div key={index} className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">
                    {item.item_name}
                    {item.is_required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {item.description && (
                    <p className="text-xs text-slate-500 mb-2">{item.description}</p>
                  )}

                  {!item.file ? (
                    <div className="relative">
                      <input
                        type="file"
                        id={`checklist-file-${index}`}
                        accept=".pdf,.png,.jpg,.jpeg,.gif,.bmp,.webp,image/*"
                        onChange={(e) => handleFileChange(index, e)}
                        className="hidden"
                        required={item.is_required}
                      />
                      <label
                        htmlFor={`checklist-file-${index}`}
                        className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all"
                      >
                        <Upload size={20} className="text-slate-400" />
                        <span className="text-sm text-slate-600">Click to upload PDF or Image</span>
                      </label>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-white border border-slate-300 rounded-lg">
                      <FileText size={18} className="text-blue-600 flex-shrink-0" />
                      <span className="text-sm text-slate-700 flex-1 truncate">{item.fileName}</span>
                      <button
                        type="button"
                        onClick={() => removeChecklistFile(index)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition-all"
                        title="Remove file"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {formData.purchase_type === 'Purchase Order' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-700">Items</label>
                <button
                  onClick={addItem}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                >
                  <Plus size={16} />
                  Add Item
                </button>
              </div>

              <div className="space-y-3">
                {formData.items.map((item, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-12 gap-2 items-end p-3 bg-slate-50 rounded-lg"
                  >
                    <div className="col-span-4 relative" ref={(el) => (itemDropdownRefs.current[index] = el)}>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={itemSearchTerms[index] || item.description}
                        onChange={(e) => {
                          const newSearchTerms = [...itemSearchTerms];
                          newSearchTerms[index] = e.target.value;
                          setItemSearchTerms(newSearchTerms);
                          updateItem(index, 'description', e.target.value);
                          setShowItemDropdown(index);
                        }}
                        onFocus={() => setShowItemDropdown(index)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder={loadingItems ? 'Loading items...' : 'Search items...'}
                        disabled={loadingItems}
                      />
                      {showItemDropdown === index && !loadingItems && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {getFilteredItems(index).length === 0 ? (
                            <div className="px-4 py-3 text-sm text-slate-500">
                              No items found
                            </div>
                          ) : (
                            getFilteredItems(index).map((item) => (
                              <div
                                key={item.number}
                                onClick={() => {
                                  updateItem(index, 'description', item.displayName);
                                  updateItem(index, 'item_description', item.displayName);
                                  updateItem(index, 'item_number', item.number);
                                  const newSearchTerms = [...itemSearchTerms];
                                  newSearchTerms[index] = item.displayName;
                                  setItemSearchTerms(newSearchTerms);
                                  setShowItemDropdown(null);
                                }}
                                className="px-4 py-2 hover:bg-blue-50 cursor-pointer transition-colors border-b border-slate-100 last:border-0"
                              >
                                <div className="font-medium text-slate-900">{item.displayName}</div>
                                <div className="text-xs text-slate-500">{item.number}</div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Quantity
                      </label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Unit</label>
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => updateItem(index, 'unit', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div className="col-span-1">
                      <button
                        onClick={() => removeItem(index)}
                        className="w-full p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {formData.purchase_type === 'Non-Purchase Order' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative" ref={vendorDropdownRef}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Payee
                  </label>
                  <input
                    type="text"
                    value={vendorSearchTerm || formData.payee}
                    onChange={(e) => {
                      setVendorSearchTerm(e.target.value);
                      setShowVendorDropdown(true);
                      if (!e.target.value) {
                        setFormData({ ...formData, payee: '' });
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
                    Amount Net of VAT
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">₱</span>
                    <input
                      type="number"
                      value={formData.amount_net_vat}
                      onChange={(e) => setFormData({ ...formData, amount_net_vat: e.target.value })}
                      className="w-full pl-8 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="0.00"
                      step="0.01"
                      required
                    />
                  </div>
                </div>
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
                                {line.is_required && (
                                  <span className="text-red-500 ml-1">*</span>
                                )}
                              </label>
                              <input
                                type="text"
                                value={line.value}
                                onChange={(e) => updatePaymentModeLine(index, e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                placeholder={`Enter ${line.name}`}
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

              <div className="flex justify-end">
                <div className="bg-slate-100 px-6 py-3 rounded-lg">
                  <span className="text-sm font-medium text-slate-700">Total Amount: </span>
                  <span className="text-xl font-bold text-slate-900">
                    ₱{calculateTotal().toFixed(2)}
                  </span>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3 justify-end pt-4 border-t">
            <button
              onClick={() => handleSubmit('draft')}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
            >
              <Save size={18} />
              Save as Draft
            </button>
            <button
              onClick={() => handleSubmit('pending')}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              <Send size={18} />
              Submit for Approval
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Purchase Requisitions</h2>
        <button
          onClick={() => {
            setShowForm(true);
            generateDocumentNo();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={20} />
          New Request
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Document No.
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    No purchase requisitions found
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium text-slate-900">
                      {req.document_no || req.pr_number}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                      {req.description || req.purpose}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {new Date(req.request_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {req.purchase_type || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                      ₱{req.total_amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(req.status)}`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
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
      </div>

      {showViewModal && viewingRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Purchase Requisition Details</h3>
                <p className="text-sm text-slate-600 mt-1">{viewingRequest.document_no || viewingRequest.pr_number}</p>
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
                  requestType="Purchase Requisition"
                  requestId={viewingRequest.id}
                />
              )}

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Document No.</label>
                  <p className="text-slate-900 font-mono">{viewingRequest.document_no || viewingRequest.pr_number}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Department</label>
                  <p className="text-slate-900">{viewingRequest.department}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Requester</label>
                  <p className="text-slate-900">{profile?.full_name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Request Date</label>
                  <p className="text-slate-900">{new Date(viewingRequest.request_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Required Date</label>
                  <p className="text-slate-900">{new Date(viewingRequest.required_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Purchase Type</label>
                  <p className="text-slate-900">{viewingRequest.purchase_type}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">PR Checklist</label>
                  <p className="text-slate-900">{(viewingRequest as any).pr_checklists?.item_name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Budget Status</label>
                  <p className="text-slate-900">{viewingRequest.is_budgeted ? 'Budgeted' : 'Non-Budgeted'}</p>
                </div>
                {viewingRequest.purchase_type === 'Non-Purchase Order' && (
                  <div>
                    <label className="text-sm font-semibold text-slate-700">Total Amount</label>
                    <p className="text-slate-900 font-bold">₱{viewingRequest.total_amount.toLocaleString()}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-semibold text-slate-700">Status</label>
                  <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(viewingRequest.status)}`}>
                    {viewingRequest.status}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Description</label>
                <p className="text-slate-900">{viewingRequest.description}</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Purpose</label>
                <p className="text-slate-900">{viewingRequest.purpose}</p>
              </div>

              {viewingRequest.checklist_items && viewingRequest.checklist_items.length > 0 && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Checklist Items & Attachments</label>
                  <div className="space-y-3">
                    {viewingRequest.checklist_items.map((item: any, index: number) => (
                      <div key={index} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">{item.item_name}</span>
                              {item.is_required && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">Required</span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-xs text-slate-600 mt-1">{item.description}</p>
                            )}
                            {item.fileName && (
                              <div className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                                <FileText size={16} className="text-blue-600" />
                                <span>{item.fileName}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {viewingRequest.purchase_type === 'Purchase Order' && viewingRequest.items && viewingRequest.items.length > 0 && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Items</label>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Description</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Quantity</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Unit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {viewingRequest.items.map((item: any, index: number) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-sm text-slate-900">{item.item_description || item.description || 'N/A'}</td>
                            <td className="px-4 py-2 text-sm text-slate-700">{item.quantity}</td>
                            <td className="px-4 py-2 text-sm text-slate-700">{item.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {viewingRequest.purchase_type === 'Non-Purchase Order' && (
                <>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-semibold text-slate-700">Payee</label>
                      <p className="text-slate-900">{viewingRequest.payee}</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-slate-700">Amount Net of VAT</label>
                      <p className="text-slate-900 font-bold">₱{viewingRequest.amount_net_vat?.toFixed(2)}</p>
                    </div>
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
                </>
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
                      <FileText size={18} />
                      Edit Draft
                    </button>
                    <button
                      onClick={() => handleSubmitDraft(viewingRequest)}
                      disabled={loading}
                      className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send size={18} />
                      Submit for Approval
                    </button>
                  </>
                )}
                {viewingRequest.status === 'approved' && viewingRequest.rfp_pdf_path && viewingRequest.purchase_type !== 'Purchase Order' && (
                  <>
                    <button
                      onClick={() => downloadRFP(viewingRequest.rfp_pdf_path!, viewingRequest.document_no || viewingRequest.pr_number)}
                      className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      <Download size={18} />
                      Download RFP
                    </button>
                    <button
                      onClick={() => handleRegenerateRFP(viewingRequest)}
                      disabled={loading}
                      className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                      Regenerate RFP
                    </button>
                    <button
                      onClick={() => handleRepostToMSBC(viewingRequest)}
                      disabled={loading}
                      className="flex items-center gap-2 px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send size={18} />
                      Repost to MSBC
                    </button>
                  </>
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

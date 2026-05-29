import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Trash2, Save, Send, Eye, FileText, Upload, X, Download, RefreshCw, Loader2, ArrowUpDown, ArrowUp, ArrowDown, Search, SlidersHorizontal, Ban, FileSpreadsheet } from 'lucide-react';
import Pagination from '../Pagination';
import FilterModal, { FilterColumn, FilterValues, applyFilters, getActiveFilterCount } from '../FilterModal';
import ExportModal from '../ExportModal';
import { getApprovalFlow, addExecutiveApprovalSteps, filterApprovalFlowsForRequester, createApprovalLedgerEntry, sendApprovalEmailToAll } from '../../lib/approvalFlow';
import { uploadAttachments, uploadLargeFile } from '../../lib/storageHelper';
import { mergeFilesToPDFBlob } from '../../lib/pdfMerger';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import { regenerateRFP } from '../../lib/rfpGenerator';
import { exportToStyledExcel } from '../../lib/excelExporter';
import { logAuditTrail } from '../../lib/auditTrail';
import { TableSkeleton } from '../TableSkeleton';

interface PRItem {
  description: string;
  item_description?: string;
  item_notes?: string;
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
  current_approval_level?: number;
  requester_id?: string;
}

export function PurchaseRequisition() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<PurchaseReq[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterValues, setFilterValues] = useState<FilterValues>({});

  // Export
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Sorting
  const [sortColumn, setSortColumn] = useState<string>('request_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination
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
    items: [{ description: '', item_notes: '', quantity: 1, unit: 'pcs', unit_price: 0, total_price: 0, item_number: '' }],
  });

  useEffect(() => {
    loadRequests();
    loadPRChecklists();
    loadPaymentModes();
  }, []);

  useEffect(() => {
    if (profile) {
      loadCompanies();
      loadVendors();
      loadItems();
    }
  }, [profile]);

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
      if (!profile?.company_id && profile?.role !== 'admin') return;

      const allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('purchase_requisitions')
          .select(`
            *,
            pr_checklists (
              pr_type,
              item_name
            ),
            user_profiles!purchase_requisitions_requester_id_fkey(company_id),
            companies!purchase_requisitions_company_id_fkey(id, name)
          `)
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (profile?.role !== 'admin') {
          query = query.eq('requester_id', profile?.id);
        }

        const { data, error } = await query;
        if (error) throw error;

        allData.push(...(data || []));
        hasMore = (data?.length || 0) === pageSize;
        page++;
      }

      // For admin users, filter in-memory to show all requests
      const filteredRequests = profile.role === 'admin'
        ? allData
        : allData.filter(req => req.company_id === profile.company_id || req.user_profiles?.company_id === profile.company_id);

      setRequests(filteredRequests || []);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoadingRequests(false);
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
        .order('item_name', { ascending: true });

      if (error) throw error;
      setPrChecklists(data || []);
    } catch (error) {
      console.error('Error loading PR checklists:', error);
    }
  };

  const loadVendors = async (companyId?: string, retryCount = 0) => {
    setLoadingVendors(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session found');
        return;
      }

      const targetCompanyId = companyId || (profile?.enable_multi_company_requests ? selectedCompanyId : profile?.company_id);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-vendors${targetCompanyId ? `?company_id=${targetCompanyId}` : ''}`;
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
      if (data.error && retryCount < 2) {
        setTimeout(() => loadVendors(companyId, retryCount + 1), 1500);
        return;
      }
      const sortedVendors = (data.value || []).sort((a: any, b: any) =>
        (a.displayName || '').localeCompare(b.displayName || '')
      );
      setVendors(sortedVendors);
    } catch (error) {
      console.error('Error loading vendors:', error);
      if (retryCount < 2) {
        setTimeout(() => loadVendors(companyId, retryCount + 1), 1500);
      }
    } finally {
      setLoadingVendors(false);
    }
  };

  const filteredVendors = vendors.filter((vendor) =>
    vendor.displayName?.toLowerCase().includes(vendorSearchTerm.toLowerCase()) ||
    vendor.number?.toLowerCase().includes(vendorSearchTerm.toLowerCase())
  );

  const loadItems = async (companyId?: string, retryCount = 0) => {
    setLoadingItems(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session found');
        return;
      }

      const targetCompanyId = companyId || (profile?.enable_multi_company_requests ? selectedCompanyId : profile?.company_id);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-items${targetCompanyId ? `?company_id=${targetCompanyId}` : ''}`;
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
      if (data.error && retryCount < 2) {
        setTimeout(() => loadItems(companyId, retryCount + 1), 1500);
        return;
      }
      const sortedItems = (data.value || []).sort((a: any, b: any) =>
        (a.displayName || '').localeCompare(b.displayName || '')
      );
      setItems(sortedItems);
    } catch (error) {
      console.error('Error loading items:', error);
      if (retryCount < 2) {
        setTimeout(() => loadItems(companyId, retryCount + 1), 1500);
      }
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

  const loadCompanies = async () => {
    try {
      if (!profile) return;

      if (profile.role === 'admin') {
        const { data, error } = await supabase
          .from('companies')
          .select('id, name')
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
      } else if (profile.enable_multi_company_requests && profile.allowed_companies && profile.allowed_companies.length > 0) {
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
        if (profile.company_id) {
          const { data, error } = await supabase
            .from('companies')
            .select('id, name')
            .eq('id', profile.company_id)
            .eq('is_active', true);

          if (error) throw error;
          setCompanies(data || []);
        }

        if (!companiesInitialized.current) {
          setSelectedCompanyId(profile.company_id || '');
          setSelectedDepartment(profile.department || '');
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
        if (profile?.department) {
          const userDept = data.find(d => d.name === profile.department);
          setSelectedDepartment(userDept ? userDept.name : (data[0]?.name || ''));
        } else {
          setSelectedDepartment(data[0].name);
        }
      }
    } catch (error) {
      console.error('Error loading departments:', error);
    }
  };

  const handleCompanyChange = async (companyId: string) => {
    setSelectedCompanyId(companyId);
    setSelectedDepartment('');
    setDepartments([]);
    loadDepartments(companyId);

    // Reload vendors and items for the selected company
    loadVendors(companyId);
    loadItems(companyId);

    // Clear any selected vendor and item data
    setFormData(prev => ({
      ...prev,
      document_no: '',
      payee: '',
      payee_number: '',
    }));
    setVendorSearchTerm('');

    // Generate new document number for the selected company
    if (companyId) {
      try {
        const { data, error } = await supabase.rpc('get_next_number', {
          p_series_name: 'Purchase Requisition',
          p_company_id: companyId
        });
        if (error) throw error;
        setFormData(prev => ({ ...prev, document_no: data }));
      } catch (error: any) {
        console.error('Error generating document number:', error);
        alert('Error generating document number: ' + error.message);
      }
    }
  };

  const generateDocumentNo = async () => {
    const companyId = profile?.enable_multi_company_requests ? selectedCompanyId : profile?.company_id;
    if (!companyId) {
      console.error('Company ID not available');
      alert('Unable to generate document number: Company information not available');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_next_number', {
        p_series_name: 'Purchase Requisition',
        p_company_id: companyId
      });
      if (error) throw error;
      setFormData(prev => ({ ...prev, document_no: data }));
    } catch (error: any) {
      console.error('Error generating document number:', error);
      alert('Error generating document number: ' + error.message);
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
      const maxSizeBytes = 40 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        alert(`File ${file.name} exceeds the 40MB size limit (${(file.size / 1024 / 1024).toFixed(2)}MB).`);
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
    // Check if the last item has a valid total amount
    const lastItem = formData.items[formData.items.length - 1];
    if (lastItem && lastItem.total_price <= 0) {
      alert('Please enter a valid quantity and unit price for the current item before adding a new one.');
      return;
    }

    setFormData({
      ...formData,
      items: [
        ...formData.items,
        { description: '', item_notes: '', quantity: 1, unit: 'pcs', unit_price: 0, total_price: 0, item_number: '' },
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
      // Only sum items with valid total_price > 0
      return formData.items
        .filter(item => item.total_price > 0)
        .reduce((sum, item) => sum + item.total_price, 0);
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

    if ((request as any).payment_mode_id) {
      const mode = paymentModes.find(m => m.id === (request as any).payment_mode_id);
      setSelectedPaymentMode(mode || null);
    }

    setShowViewModal(false);
    setViewingRequest(null);
    setShowForm(true);
  };

  const handleEditReturnedRequest = (request: PurchaseReq) => {
    setEditingRequest(request);
    setFormData({
      document_no: request.document_no,
      description: request.description,
      department: request.department,
      date_required: request.date_required || (request as any).required_date,
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

    if ((request as any).payment_mode_id) {
      const mode = paymentModes.find(m => m.id === (request as any).payment_mode_id);
      setSelectedPaymentMode(mode || null);
    }

    if (profile?.enable_multi_company_requests && (request as any).company_id) {
      setSelectedCompanyId((request as any).company_id);
      loadDepartments((request as any).company_id, false).then(() => {
        setSelectedDepartment(request.department || '');
      });
    }

    setShowViewModal(false);
    setViewingRequest(null);
    setShowForm(true);
  };

  const handlePreviewSubmit = () => {
    // Validate basic required fields
    if (!formData.description.trim()) {
      alert('Please enter a description.');
      return;
    }

    if (!formData.department.trim() && !selectedDepartment) {
      alert('Please select a department.');
      return;
    }

    if (!formData.date_required) {
      alert('Please select a date required.');
      return;
    }

    if (!formData.purpose.trim()) {
      alert('Please enter a purpose.');
      return;
    }

    // Validate payee for Non-Purchase Order
    if (formData.purchase_type === 'Non-Purchase Order' && !formData.payee.trim()) {
      alert('Please enter a payee for Non-Purchase Order requests.');
      return;
    }

    // Validate amount for Non-Purchase Order
    if (formData.purchase_type === 'Non-Purchase Order' && (!formData.amount_net_vat || parseFloat(formData.amount_net_vat) <= 0)) {
      alert('Please enter a valid amount for Non-Purchase Order requests.');
      return;
    }

    // Validate PR Checklist and Payment Mode selection
    if (!formData.pr_checklist_id) {
      alert('Please select a PR Checklist before submitting.');
      return;
    }
    if (formData.purchase_type !== 'Purchase Order' && !formData.payment_mode_id) {
      alert('Please select a Payment Mode before submitting.');
      return;
    }

    // Validate required checklist attachments
    const missingRequiredAttachments = formData.checklist_items.filter(
      item => item.is_required && !item.file && !item.fileName
    );

    if (missingRequiredAttachments.length > 0 && !editingRequest) {
      const missingNames = missingRequiredAttachments.map(item => item.item_name).join(', ');
      alert(`Please upload required attachments: ${missingNames}`);
      return;
    }

    // For editing, check if required items still need files
    if (editingRequest) {
      const missingRequiredForEdit = formData.checklist_items.filter(
        item => item.is_required && !item.file && !item.fileName
      );
      if (missingRequiredForEdit.length > 0) {
        const missingNames = missingRequiredForEdit.map(item => item.item_name).join(', ');
        alert(`Please upload required attachments: ${missingNames}`);
        return;
      }
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

    // Validate items for Purchase Order
    if (formData.purchase_type === 'Purchase Order') {
      const validItems = formData.items.filter(item => item.total_price > 0);
      if (validItems.length === 0) {
        alert('Please add at least one item with a valid quantity and unit price.');
        return;
      }
    }

    // All validations passed, show preview
    console.log('All validations passed, showing preview modal');
    console.log('Current showPreviewModal state:', showPreviewModal);
    setShowPreviewModal(true);
    console.log('Set showPreviewModal to true');

    // Force check after state update
    setTimeout(() => {
      console.log('After state update, showPreviewModal:', showPreviewModal);
    }, 100);
  };

  const handleSubmit = async (status: 'draft' | 'pending') => {
    // Validate payee for Non-Purchase Order
    if (formData.purchase_type === 'Non-Purchase Order' && status === 'pending' && !formData.payee.trim()) {
      alert('Please enter a payee for Non-Purchase Order requests.');
      return;
    }

    // Validate PR Checklist and Payment Mode selection
    if (status === 'pending' && !formData.pr_checklist_id) {
      alert('Please select a PR Checklist before submitting.');
      return;
    }
    if (status === 'pending' && formData.purchase_type !== 'Purchase Order' && !formData.payment_mode_id) {
      alert('Please select a Payment Mode before submitting.');
      return;
    }

    // Validate required checklist attachments
    const missingRequiredAttachments = formData.checklist_items.filter(
      item => item.is_required && !item.file && !item.fileName
    );

    if (missingRequiredAttachments.length > 0 && !editingRequest) {
      const missingNames = missingRequiredAttachments.map(item => item.item_name).join(', ');
      alert(`Please upload required attachments: ${missingNames}`);
      return;
    }

    // For editing, check if required items still need files
    if (editingRequest) {
      const missingRequiredForEdit = formData.checklist_items.filter(
        item => item.is_required && !item.file && !item.fileName
      );
      if (missingRequiredForEdit.length > 0) {
        const missingNames = missingRequiredForEdit.map(item => item.item_name).join(', ');
        alert(`Please upload required attachments: ${missingNames}`);
        return;
      }
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

        const maxSizeInBytes = 40 * 1024 * 1024;
        if (mergedPdfBlob.size > maxSizeInBytes) {
          throw new Error(`Merged PDF is too large (${(mergedPdfBlob.size / 1024 / 1024).toFixed(2)}MB). Maximum allowed size is 40MB. Please reduce the number or size of attachments.`);
        }

        const timestamp = Date.now();
        const mergedFileName = `merged_${timestamp}.pdf`;
        const filePath = `purchase-requisitions/${profile.id}/${mergedFileName}`;

        // Convert blob to ArrayBuffer for more efficient upload
        const arrayBuffer = await mergedPdfBlob.arrayBuffer();

        try {
          const { path } = await uploadLargeFile(filePath, arrayBuffer, 'application/pdf');
          mergedPdfPath = path;
        } catch (uploadError: any) {
          console.error('Upload error:', uploadError);
          if (uploadError.message?.includes('413') || uploadError.message?.includes('431')) {
            throw new Error(`File is too large to upload. Please reduce the number or size of attachments.`);
          }
          throw new Error(`Failed to upload merged PDF: ${uploadError.message || uploadError}`);
        }
      }

      const requestCompanyId = profile?.enable_multi_company_requests ? selectedCompanyId : profile?.company_id;
      const requestDepartment = profile?.enable_multi_company_requests ? selectedDepartment : formData.department;

      const payload: any = {
        description: formData.description,
        department: requestDepartment,
        company_id: requestCompanyId,
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
        // Filter out items with total_price <= 0
        const validItems = formData.items.filter(item => item.total_price > 0);

        if (validItems.length === 0) {
          throw new Error('Please add at least one item with a valid quantity and unit price.');
        }

        payload.items = validItems;
      } else {
        payload.payee = formData.payee;
        payload.payee_number = formData.payee_number;
        payload.amount_net_vat = parseFloat(formData.amount_net_vat) || 0;
        payload.payment_mode_id = formData.payment_mode_id || null;
        payload.payment_mode_lines = formData.payment_mode_lines;
      }

      let insertedPR;

      if (editingRequest) {
        if (status === 'pending') {
          payload.current_approval_level = 0;
        }
        const { data, error } = await supabase
          .from('purchase_requisitions')
          .update(payload)
          .eq('id', editingRequest.id)
          .select()
          .single();

        if (error) throw error;
        insertedPR = data;

        // Audit trail for UPDATE
        logAuditTrail({
          tableName: 'purchase_requisitions',
          recordId: editingRequest.id,
          action: 'UPDATE',
          module: 'requests',
          description: `Updated purchase requisition ${editingRequest.document_no || editingRequest.pr_number || editingRequest.id}`,
          oldValues: editingRequest,
          newValues: insertedPR,
          performedBy: profile?.id || '',
          performedByName: profile?.full_name || 'Unknown',
          companyId: insertedPR.company_id || profile?.company_id || null,
        });
      } else {
        // Create new request
        payload.document_no = formData.document_no;
        payload.pr_number = prNumber;
        payload.requester_id = profile?.id;
        payload.request_date = new Date().toISOString();
        payload.current_approval_level = 0;

        const { data, error } = await supabase
          .from('purchase_requisitions')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        insertedPR = data;

        // Audit trail for CREATE
        logAuditTrail({
          tableName: 'purchase_requisitions',
          recordId: insertedPR.id,
          action: 'CREATE',
          module: 'requests',
          description: `Created purchase requisition ${insertedPR.document_no || insertedPR.pr_number || insertedPR.id}`,
          oldValues: null,
          newValues: insertedPR,
          performedBy: profile?.id || '',
          performedByName: profile?.full_name || 'Unknown',
          companyId: insertedPR.company_id || profile?.company_id || null,
        });
      }

      if (status === 'pending' && insertedPR && requestCompanyId) {
        console.log('🚀 Starting approval process...');
        console.log('📋 Request details:', {
          companyId: requestCompanyId,
          department: requestDepartment,
          requestType: 'Purchase Requisition',
          isBudgeted: formData.is_budgeted,
          totalAmount: total
        });

        try {
          // STRICT: Get approval flow based on company, department, request type, and budget setup
          const rawApprovalFlows = await getApprovalFlow(
            requestCompanyId,
            requestDepartment,
            'Purchase Requisition',
            formData.is_budgeted,
            total,
            undefined,
            formData.purchase_type
          );

          if (!rawApprovalFlows || rawApprovalFlows.length === 0) {
            throw new Error('No approval flow configured for this request. Please contact administrator.');
          }

          // Add executive approval steps if requester is Executive
          let flowsWithExecutive = await addExecutiveApprovalSteps(
            rawApprovalFlows,
            profile.id,
            requestCompanyId,
            !!formData.is_budgeted
          );

          // Filter out requester from approval flows
          const approvalFlows = await filterApprovalFlowsForRequester(
            flowsWithExecutive,
            profile.id,
            requestDepartment,
            requestCompanyId
          );

          if (!approvalFlows || approvalFlows.length === 0) {
            throw new Error('No additional approvers required for this request.');
          }

          console.log('✅ Approval flows found:', approvalFlows.length, 'steps');
          console.log('📋 Approval steps:', approvalFlows.map((f, i) => `Step ${i + 1}: ${f.approver_type}`).join(' → '));

          const isResubmission = editingRequest && editingRequest.status === 'returned_to_maker';

          if (isResubmission) {
            const { error: deleteLedgerError } = await supabase
              .from('approval_ledger')
              .delete()
              .eq('request_id', insertedPR.id)
              .eq('request_type', 'Purchase Requisition');
            if (deleteLedgerError) {
              console.error('Error clearing old approval ledger:', deleteLedgerError);
            }
          }

          await createApprovalLedgerEntry(
            'Purchase Requisition',
            insertedPR.id,
            formData.document_no,
            profile.id,
            profile.full_name || 'Unknown',
            'Requestor',
            'Submitted',
            isResubmission ? 'Resubmission after return' : 'Initial submission',
            0
          );

          // Get first approver (Step 1)
          const firstApprover = approvalFlows[0];
          console.log('👤 Step 1 Approver:', firstApprover.approver_type);

          await sendApprovalEmailToAll(
            firstApprover,
            requestCompanyId,
            requestDepartment,
            'Purchase Requisition',
            formData.document_no,
            profile.full_name || 'Unknown',
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
      setSavingDraft(false);
      setSubmitting(false);
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
      items: [{ description: '', item_notes: '', quantity: 1, unit: 'pcs', unit_price: 0, total_price: 0, item_number: '' }],
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
    // Validate payee for Non-Purchase Order
    if (request.purchase_type === 'Non-Purchase Order' && !request.payee?.trim()) {
      alert('Please enter a payee for Non-Purchase Order requests.');
      return;
    }

    // Validate required checklist attachments from saved draft
    const checklistItems = (request as any).checklist_items || [];
    const missingRequired = checklistItems.filter((item: any) => item.is_required && !item.fileName);

    if (missingRequired.length > 0) {
      const missingNames = missingRequired.map((item: any) => item.item_name).join(', ');
      alert(`Please upload required attachments before submitting: ${missingNames}`);
      return;
    }

    if (!confirm('Are you sure you want to submit this draft for approval?')) {
      return;
    }

    setSubmitting(true);
    setLoading(true);
    try{
      const requestCompanyId = request.company_id || profile?.company_id;
      if (!requestCompanyId) {
        throw new Error('Company information not found');
      }

      const rawApprovalFlows = await getApprovalFlow(
        requestCompanyId,
        request.department,
        'Purchase Requisition',
        request.is_budgeted,
        request.total_amount,
        undefined,
        request.purchase_type
      );

      if (!rawApprovalFlows || rawApprovalFlows.length === 0) {
        throw new Error('No approval flow configured for this request. Please contact administrator.');
      }

      // Add executive approval steps if requester is Executive
      let flowsWithExecutive = await addExecutiveApprovalSteps(
        rawApprovalFlows,
        profile.id,
        requestCompanyId,
        !!request.is_budgeted
      );

      // Filter out requester from approval flows
      const approvalFlows = await filterApprovalFlowsForRequester(
        flowsWithExecutive,
        profile.id,
        request.department,
        requestCompanyId
      );

      if (!approvalFlows || approvalFlows.length === 0) {
        throw new Error('No additional approvers required for this request.');
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
      await sendApprovalEmailToAll(
        firstApprover,
        requestCompanyId,
        request.department,
        'Purchase Requisition',
        request.document_no,
        profile.full_name || 'Unknown',
        request.total_amount,
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

  const handleCancelRequest = async (request: PurchaseReq) => {
    if (request.status !== 'pending' || (request.current_approval_level ?? 0) !== 0) {
      alert('This request can no longer be cancelled because an approver has already acted on it.');
      return;
    }
    const docNo = request.document_no || request.pr_number;
    if (!confirm(`Are you sure you want to cancel Purchase Requisition ${docNo}?\n\nThis action cannot be undone.`)) return;
    const reason = prompt('Please provide a reason for cancelling this request:');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('A cancellation reason is required.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('purchase_requisitions')
        .update({ status: 'cancelled' })
        .eq('id', request.id);
      if (error) throw error;

      await createApprovalLedgerEntry(
        'Purchase Requisition',
        request.id,
        request.document_no || request.pr_number,
        profile?.id || null,
        profile?.full_name || 'Unknown',
        'Requestor',
        'Cancelled',
        reason.trim(),
        0
      );

      setShowViewModal(false);
      setViewingRequest(null);
      alert(`Purchase Requisition ${docNo} has been cancelled successfully.`);
      await loadRequests();
    } catch (error: any) {
      console.error('Error cancelling request:', error);
      alert('Failed to cancel request: ' + error.message);
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
      returned_to_maker: 'bg-amber-100 text-amber-700',
      cancelled: 'bg-slate-200 text-slate-800',
    };
    return colors[status] || 'bg-slate-100 text-slate-700';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'returned_to_maker') return 'Returned to Maker';
    if (status === 'in_procurement') return 'In Procurement';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown size={14} className="opacity-40" />;
    }
    return sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  };

  const prFilterColumns: FilterColumn[] = [
    { key: 'document_no', label: 'Document No.', type: 'text' },
    { key: 'company_name', label: 'Company', type: 'select', options: companies.map(c => ({ value: c.name, label: c.name })) },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'request_date', label: 'Request Date', type: 'dateRange' },
    { key: 'purchase_type', label: 'Type', type: 'select', options: [{ value: 'Purchase Order', label: 'Purchase Order' }, { value: 'Non-Purchase Order', label: 'Non-Purchase Order' }] },
    { key: 'payee', label: 'Payee', type: 'text' },
    { key: 'total_amount', label: 'Amount', type: 'number' },
    { key: 'status', label: 'Status', type: 'select', options: [
      { value: 'draft', label: 'Draft' }, { value: 'pending', label: 'Pending' },
      { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' },
      { value: 'in_procurement', label: 'In Procurement' },
    ]},
    { key: 'is_budgeted', label: 'Budget Status', type: 'select', options: [
      { value: 'true', label: 'Budgeted' }, { value: 'false', label: 'Non-Budgeted' },
    ]},
  ];

  const prGetFieldValue = (item: any, key: string) => {
    if (key === 'document_no') return item.document_no || item.pr_number || '';
    if (key === 'company_name') return item.companies?.name || '';
    if (key === 'description') return item.description || item.purpose || '';
    if (key === 'is_budgeted') return String(item.is_budgeted);
    return item[key];
  };

  const filteredRequests = applyFilters(
    requests.filter((req) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const docNo = req.document_no || req.pr_number || '';
      const description = req.description || req.purpose || '';
      const department = req.department || '';
      const dateStr = new Date(req.request_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const dateReqStr = req.date_required ? new Date(req.date_required).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      const amountStr = req.total_amount?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '';
      return (
        docNo.toLowerCase().includes(term) ||
        description.toLowerCase().includes(term) ||
        department.toLowerCase().includes(term) ||
        dateStr.toLowerCase().includes(term) ||
        dateReqStr.toLowerCase().includes(term) ||
        amountStr.includes(term) ||
        req.status?.toLowerCase().includes(term)
      );
    }),
    filterValues,
    prFilterColumns,
    prGetFieldValue
  );

  const sortedRequests = [...filteredRequests].sort((a, b) => {
    let aVal: any = a[sortColumn as keyof PurchaseReq];
    let bVal: any = b[sortColumn as keyof PurchaseReq];

    if (sortColumn === 'document_no') {
      aVal = a.document_no || a.pr_number;
      bVal = b.document_no || b.pr_number;
    } else if (sortColumn === 'description') {
      aVal = a.description || a.purpose;
      bVal = b.description || b.purpose;
    } else if (sortColumn === 'company_name') {
      aVal = (a as any).companies?.name || '';
      bVal = (b as any).companies?.name || '';
    }

    if (aVal == null) aVal = '';
    if (bVal == null) bVal = '';

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination logic
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                Document No.
              </label>
              <div className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-50 border border-slate-300 rounded-lg">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                <span className="font-mono text-sm sm:text-base font-semibold text-slate-900">
                  {formData.document_no || 'Generating...'}
                </span>
              </div>
            </div>
            {profile?.enable_multi_company_requests ? (
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                  Company
                </label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
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
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={formData.department}
                  readOnly
                  className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed"
                  required
                />
              </div>
            )}
            {profile?.enable_multi_company_requests && (
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                  Department
                </label>
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
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

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Brief description of the requisition"
              maxLength={80}
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              {formData.description.length}/80 characters
            </p>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
              Purpose <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              rows={3}
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Detailed purpose and justification"
              maxLength={200}
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              {formData.purpose.length}/200 characters
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                Date Required/Needed <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.date_required}
                onChange={(e) => setFormData({ ...formData, date_required: e.target.value })}
                className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                Budget Status
              </label>
              <select
                value={formData.is_budgeted ? 'budgeted' : 'non-budgeted'}
                onChange={(e) => setFormData({ ...formData, is_budgeted: e.target.value === 'budgeted' })}
                className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="budgeted">Budgeted</option>
                <option value="non-budgeted">Non-budgeted</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
              Purchase Type
            </label>
            <select
              value={formData.purchase_type}
              onChange={(e) => setFormData({ ...formData, purchase_type: e.target.value, pr_checklist_id: '', checklist_items: [] })}
              className="w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="Purchase Order">Purchase Order</option>
              <option value="Non-Purchase Order">Non-Purchase Order</option>
            </select>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
              PR Checklist <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.pr_checklist_id}
              onChange={(e) => handleChecklistChange(e.target.value)}
              className={`w-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${!formData.pr_checklist_id ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}
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

                  {!item.file && !item.fileName ? (
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
                      <span className="text-sm text-slate-700 flex-1 truncate">
                        {item.file ? item.fileName : `${item.fileName} (previously uploaded)`}
                      </span>
                      <input
                        type="file"
                        id={`checklist-replace-${index}`}
                        accept=".pdf,.png,.jpg,.jpeg,.gif,.bmp,.webp,image/*"
                        onChange={(e) => handleFileChange(index, e)}
                        className="hidden"
                      />
                      <label
                        htmlFor={`checklist-replace-${index}`}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-all cursor-pointer"
                        title="Replace file"
                      >
                        <RefreshCw size={16} />
                      </label>
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
                  <div key={index}>
                    {/* Mobile Card Layout (< 1024px) */}
                    <div className="lg:hidden bg-white border-2 border-slate-200 rounded-xl p-4 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                      {/* Card Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                        <h4 className="text-base font-bold text-slate-900">Item #{index + 1}</h4>
                        <button
                          onClick={() => removeItem(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove item"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>

                      {/* Item Name Field */}
                      <div className="relative" ref={(el) => (itemDropdownRefs.current[index] = el)}>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Item Name
                        </label>
                        <input
                          type="text"
                          value={itemSearchTerms[index] !== undefined ? itemSearchTerms[index] : (item.item_description || item.description)}
                          onChange={(e) => {
                            const newSearchTerms = [...itemSearchTerms];
                            newSearchTerms[index] = e.target.value;
                            setItemSearchTerms(newSearchTerms);
                            setShowItemDropdown(index);
                          }}
                          onFocus={() => setShowItemDropdown(index)}
                          className="w-full px-4 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                                    const newItems = [...formData.items];
                                    newItems[index] = {
                                      ...newItems[index],
                                      description: item.displayName,
                                      item_description: item.displayName,
                                      item_number: item.number
                                    };
                                    setFormData({ ...formData, items: newItems });

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

                      {/* Description Field */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Description
                        </label>
                        <input
                          type="text"
                          value={item.item_notes || ''}
                          onChange={(e) => updateItem(index, 'item_notes', e.target.value)}
                          className="w-full px-4 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          placeholder="Additional description..."
                        />
                      </div>

                      {/* Quantity and Unit in 2-column grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Quantity
                          </label>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                            className="w-full px-4 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Unit</label>
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => updateItem(index, 'unit', e.target.value)}
                            className="w-full px-4 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                        </div>
                      </div>

                      {/* Unit Price Field */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Unit Price</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 font-semibold text-base">₱</span>
                          <input
                            type="number"
                            value={item.unit_price}
                            onChange={(e) => updateItem(index, 'unit_price', Number(e.target.value))}
                            className="w-full pl-10 pr-4 py-3 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            step="0.01"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      {/* Total Amount Display */}
                      <div className="pt-3 border-t border-slate-200">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Total Amount</label>
                        <div className="w-full px-4 py-3 text-lg bg-gradient-to-r from-blue-50 to-slate-50 border-2 border-blue-200 rounded-lg text-slate-900 font-bold">
                          ₱{item.total_price.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Desktop Grid Layout (>= 1024px) */}
                    <div className="hidden lg:grid grid-cols-12 gap-2 items-end p-3 bg-slate-50 rounded-lg">
                      <div className="col-span-2 relative" ref={(el) => (itemDropdownRefs.current[index] = el)}>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Item Name
                        </label>
                        <input
                          type="text"
                          value={itemSearchTerms[index] !== undefined ? itemSearchTerms[index] : (item.item_description || item.description)}
                          onChange={(e) => {
                            const newSearchTerms = [...itemSearchTerms];
                            newSearchTerms[index] = e.target.value;
                            setItemSearchTerms(newSearchTerms);
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
                                    const newItems = [...formData.items];
                                    newItems[index] = {
                                      ...newItems[index],
                                      description: item.displayName,
                                      item_description: item.displayName,
                                      item_number: item.number
                                    };
                                    setFormData({ ...formData, items: newItems });

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
                          Description
                        </label>
                        <input
                          type="text"
                          value={item.item_notes || ''}
                          onChange={(e) => updateItem(index, 'item_notes', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          placeholder="Additional description..."
                        />
                      </div>
                      <div className="col-span-1">
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
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Unit</label>
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => updateItem(index, 'unit', e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Unit Price</label>
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => updateItem(index, 'unit_price', Number(e.target.value))}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          step="0.01"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Estimated Total Amount</label>
                        <div className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-300 rounded-lg text-slate-700 font-medium">
                          ₱{item.total_price.toFixed(2)}
                        </div>
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
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-4">
                <div className="bg-slate-100 px-6 py-3 rounded-lg">
                  <span className="text-sm font-medium text-slate-700">Total Amount: </span>
                  <span className="text-xl font-bold text-slate-900">
                    ₱{calculateTotal().toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {formData.purchase_type === 'Non-Purchase Order' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative" ref={vendorDropdownRef}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Payee <span className="text-red-500">*</span>
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
                  <p className="mt-1 text-xs text-red-600 italic">
                    Note: If the Payee/Vendor does not appear in the options, it's either the payee/vendor is blocked or vendor posting group is blank.
                  </p>
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
                    Amount to be paid
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
                  Payment Mode {formData.purchase_type !== 'Purchase Order' && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={formData.payment_mode_id}
                  onChange={(e) => handlePaymentModeChange(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${formData.purchase_type !== 'Purchase Order' && !formData.payment_mode_id ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}
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
              onClick={() => {
                console.log('Button clicked!');
                handlePreviewSubmit();
              }}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 sm:px-6 sm:py-2.5 text-sm sm:text-base bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
              {submitting ? 'Submitting...' : 'Preview & Submit'}
            </button>
          </div>
        </div>

        {/* Preview Modal */}
        {(() => {
          console.log('Render check - showPreviewModal:', showPreviewModal);
          return showPreviewModal && createPortal(
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={(e) => e.target === e.currentTarget && setShowPreviewModal(false)}>
              <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-200">
                <h3 className="text-2xl font-bold text-slate-900">Review Your Purchase Requisition</h3>
                <p className="text-slate-600 mt-1">Please review the details before submitting</p>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Document No.</label>
                    <p className="text-slate-900 font-semibold">{formData.document_no}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                    <p className="text-slate-900 font-semibold">{profile?.enable_multi_company_requests ? selectedDepartment : formData.department}</p>
                  </div>
                  {profile?.enable_multi_company_requests && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Company</label>
                      <p className="text-slate-900 font-semibold">{companies.find(c => c.id === selectedCompanyId)?.name}</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Date Required</label>
                    <p className="text-slate-900 font-semibold">{new Date(formData.date_required).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Type</label>
                    <p className="text-slate-900 font-semibold">{formData.purchase_type}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Budgeted</label>
                    <p className="text-slate-900 font-semibold">{formData.is_budgeted ? 'Yes' : 'No'}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <p className="text-slate-900">{formData.description}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Purpose</label>
                  <p className="text-slate-900">{formData.purpose}</p>
                </div>

                {formData.purchase_type === 'Purchase Order' ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Items</label>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-slate-700">Description</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-slate-700">Qty</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-slate-700">Unit</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-slate-700">Unit Price</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-slate-700">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {formData.items.filter(item => item.total_price > 0).map((item, index) => (
                            <tr key={index}>
                              <td className="px-4 py-2 text-sm text-slate-900">
                                {item.description}
                                {item.item_notes && (
                                  <div className="text-xs text-slate-500 mt-1">{item.item_notes}</div>
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm text-slate-900">{item.quantity}</td>
                              <td className="px-4 py-2 text-sm text-slate-900">{item.unit}</td>
                              <td className="px-4 py-2 text-sm text-slate-900 text-right">₱{item.unit_price.toFixed(2)}</td>
                              <td className="px-4 py-2 text-sm text-slate-900 text-right font-semibold">₱{item.total_price.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Payee</label>
                      <p className="text-slate-900 font-semibold">{formData.payee}</p>
                    </div>
                    {formData.payee_number && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Payee Number</label>
                        <p className="text-slate-900 font-semibold">{formData.payee_number}</p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Amount (Net VAT)</label>
                      <p className="text-slate-900 font-semibold">₱{parseFloat(formData.amount_net_vat || '0').toFixed(2)}</p>
                    </div>
                    {(selectedPaymentMode || formData.payment_mode_lines.length > 0) && (
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Payment Details ({selectedPaymentMode?.mode_name || paymentModes.find(m => m.id === formData.payment_mode_id)?.mode_name || 'N/A'})</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {formData.payment_mode_lines.map((line, index) => (
                            <div key={index}>
                              <label className="block text-xs font-medium text-slate-600 mb-1">{line.name}</label>
                              <p className="text-slate-900">{line.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {formData.checklist_items.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Attachments</label>
                    <div className="space-y-2">
                      {formData.checklist_items.map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{item.item_name}</p>
                            {item.description && <p className="text-xs text-slate-600">{item.description}</p>}
                          </div>
                          <div className="text-sm text-slate-700">
                            {item.file ? item.file.name : item.fileName || 'Not uploaded'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-200">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold text-slate-700">Total Amount:</span>
                    <span className="text-2xl font-bold text-slate-900">₱{calculateTotal().toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
                <button
                  onClick={() => setShowPreviewModal(false)}
                  disabled={loading}
                  className="px-6 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition disabled:opacity-50"
                >
                  Back to Edit
                </button>
                <button
                  onClick={() => {
                    setShowPreviewModal(false);
                    handleSubmit('pending');
                  }}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Confirm & Submit
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
          );
        })()}
      </div>
    );
  }

  const handleNewRequest = () => {
    resetForm();
    setShowForm(true);
    generateDocumentNo();
  };

  const handleExport = async (exportVals: FilterValues) => {
    setExporting(true);
    try {
      const from = exportVals.request_date_from;
      const to = exportVals.request_date_to;

      const allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('purchase_requisitions')
          .select('*, companies(name)')
          .gte('request_date', from + 'T00:00:00')
          .lte('request_date', to + 'T23:59:59')
          .order('request_date', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (profile?.role !== 'admin') {
          query = query.eq('requester_id', profile?.id);
        }
        if (exportVals.status) query = query.eq('status', exportVals.status);
        if (exportVals.purchase_type) query = query.eq('purchase_type', exportVals.purchase_type);
        if (exportVals.is_budgeted) query = query.eq('is_budgeted', exportVals.is_budgeted === 'true');

        const { data, error } = await query;
        if (error) throw error;

        allData.push(...(data || []));
        hasMore = (data?.length || 0) === pageSize;
        page++;
      }

      let filtered = allData;
      if (exportVals.document_no) filtered = filtered.filter((r: any) => (r.document_no || r.pr_number || '').toLowerCase().includes(exportVals.document_no.toLowerCase()));
      if (exportVals.company_name) filtered = filtered.filter((r: any) => (r.companies?.name || '').toLowerCase().includes(exportVals.company_name.toLowerCase()));
      if (exportVals.description) filtered = filtered.filter((r: any) => (r.description || r.purpose || '').toLowerCase().includes(exportVals.description.toLowerCase()));
      if (exportVals.payee) filtered = filtered.filter((r: any) => (r.payee || '').toLowerCase().includes(exportVals.payee.toLowerCase()));

      const rows = filtered.map((req: any) => [
        req.document_no || req.pr_number || '',
        req.companies?.name || '',
        req.department || '',
        req.description || req.purpose || '',
        req.request_date ? new Date(req.request_date).toLocaleDateString('en-US') : '',
        req.date_required ? new Date(req.date_required).toLocaleDateString('en-US') : '',
        req.purchase_type || '',
        req.payee || '',
        req.total_amount || 0,
        req.status || '',
        req.is_budgeted ? 'Budgeted' : 'Non-Budgeted',
      ]);

      exportToStyledExcel(rows, [
        { header: 'Document No.', width: 18 },
        { header: 'Company', width: 20 },
        { header: 'Department', width: 16 },
        { header: 'Description', width: 35 },
        { header: 'Request Date', width: 14 },
        { header: 'Date Required', width: 14 },
        { header: 'Type', width: 12 },
        { header: 'Payee', width: 25 },
        { header: 'Total Amount', width: 15, isAmount: true },
        { header: 'Status', width: 16 },
        { header: 'Budget Status', width: 16 },
      ], 'Purchase Requisitions', `purchase_requisitions_${new Date().toISOString().split('T')[0]}.xlsx`);

      setShowExportModal(false);
    } catch (error: any) {
      alert('Export failed: ' + error.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 w-full max-w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Purchase Requisitions</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center justify-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm sm:text-base transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="sm:hidden">Export</span>
              <span className="hidden sm:inline">Export to Excel</span>
            </button>
            <button
              onClick={handleNewRequest}
              className="flex items-center justify-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm sm:text-base"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="sm:hidden">New</span>
              <span className="hidden sm:inline">New Request</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden w-full max-w-full">
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setSearchTerm(searchInput); setCurrentPage(1); } }}
                placeholder="Search by document no., description, department, amount, status..."
                className="w-full pl-10 pr-10 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
              {searchInput && (
                <button
                  onClick={() => { setSearchInput(''); setSearchTerm(''); setCurrentPage(1); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => { setSearchTerm(searchInput); setCurrentPage(1); }}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Search</span>
            </button>
            <button
              onClick={() => setShowFilterModal(true)}
              className={`relative px-4 py-2 text-sm border rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                getActiveFilterCount(filterValues) > 0
                  ? 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Filter</span>
              {getActiveFilterCount(filterValues) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {getActiveFilterCount(filterValues)}
                </span>
              )}
            </button>
          </div>
        </div>
        {loadingRequests ? (
          <TableSkeleton columns={9} />
        ) : (
        <>
        {/* Mobile Card View */}
        <div className="lg:hidden w-full max-w-full overflow-x-hidden">
          {paginatedRequests.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No purchase requisitions found
            </div>
          ) : (
            <div className="divide-y divide-slate-200 w-full">
              {paginatedRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-4 hover:bg-slate-50 transition-colors w-full"
                >
                  <div className="space-y-3 w-full overflow-hidden">
                    {/* Header: Document No and Status */}
                    <div className="flex items-start justify-between gap-2 w-full min-w-0">
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                          Document No.
                        </div>
                        <div className="font-mono font-bold text-sm text-slate-900 truncate">
                          {req.document_no || req.pr_number}
                        </div>
                      </div>
                      <span
                        className={`flex-shrink-0 px-2.5 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap ${getStatusColor(req.status)}`}
                      >
                        {getStatusLabel(req.status)}
                      </span>
                    </div>

                    {/* Description */}
                    <div className="w-full min-w-0">
                      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                        Description
                      </div>
                      <div className="text-sm text-slate-700 line-clamp-2 break-words">
                        {req.description || req.purpose}
                      </div>
                    </div>

                    {/* Info Grid: Date and Type */}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 w-full">
                      <div className="min-w-0 overflow-hidden">
                        <div className="text-xs font-medium text-slate-500 mb-1">Date</div>
                        <div className="text-sm text-slate-900 truncate">
                          {new Date(req.request_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </div>
                      </div>
                      <div className="min-w-0 overflow-hidden">
                        <div className="text-xs font-medium text-slate-500 mb-1">Type</div>
                        <div className="text-sm text-slate-900 truncate">
                          {req.purchase_type === 'Purchase Order' ? 'PO' : 'Non-PO'}
                        </div>
                      </div>
                    </div>

                    {/* Payee */}
                    {req.payee && (
                      <div className="pt-2 border-t border-slate-100 w-full min-w-0">
                        <div className="text-xs font-medium text-slate-500 mb-1">Payee</div>
                        <div className="text-sm text-slate-900 truncate">
                          {req.payee}
                        </div>
                      </div>
                    )}

                    {/* Amount */}
                    <div className="pt-2 border-t border-slate-100 w-full min-w-0">
                      <div className="text-xs font-medium text-slate-500 mb-1">Total Amount</div>
                      <div className="text-lg font-bold text-slate-900 break-all">
                        ₱{req.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => {
                        setViewingRequest(req);
                        setShowViewModal(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm"
                    >
                      <Eye className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">View Details</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-auto flex-1">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200 z-10">
              <tr>
                <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                  <button onClick={() => handleSort('document_no')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                    Doc No. {getSortIcon('document_no')}
                  </button>
                </th>
                <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                  <button onClick={() => handleSort('company_name')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                    Company {getSortIcon('company_name')}
                  </button>
                </th>
                <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                  <button onClick={() => handleSort('description')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                    Description {getSortIcon('description')}
                  </button>
                </th>
                <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                  <button onClick={() => handleSort('request_date')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                    Date {getSortIcon('request_date')}
                  </button>
                </th>
                <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                  <button onClick={() => handleSort('purchase_type')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                    Type {getSortIcon('purchase_type')}
                  </button>
                </th>
                <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                  <button onClick={() => handleSort('payee')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                    Payee {getSortIcon('payee')}
                  </button>
                </th>
                <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                  <button onClick={() => handleSort('total_amount')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                    Amount {getSortIcon('total_amount')}
                  </button>
                </th>
                <th className="px-3 xl:px-4 py-3.5 text-center whitespace-nowrap">
                  <button onClick={() => handleSort('status')} className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors w-full">
                    Status {getSortIcon('status')}
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
                  <td colSpan={9} className="px-6 py-8 text-center text-sm text-slate-500">
                    No purchase requisitions found
                  </td>
                </tr>
              ) : (
                paginatedRequests.map((req, index) => (
                  <tr key={req.id} className={`hover:bg-slate-50 transition-colors group ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="font-mono font-bold text-sm text-slate-900 truncate block min-w-[120px]" title={req.document_no || req.pr_number}>
                        {req.document_no || req.pr_number}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-slate-700 truncate block max-w-[150px]" title={(req as any).companies?.name || 'N/A'}>
                        {(req as any).companies?.name || 'N/A'}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3">
                      <span className="text-sm text-slate-700 truncate block max-w-[250px]" title={req.description || req.purpose}>
                        {req.description || req.purpose}
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
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-100 text-blue-700 text-xs font-medium" title={req.purchase_type || 'N/A'}>
                        {req.purchase_type || 'N/A'}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-slate-700 truncate block max-w-[150px]" title={req.payee || '-'}>
                        {req.payee || '-'}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="text-sm font-bold text-slate-900">
                        ₱{req.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full ${getStatusColor(req.status)}`}>
                        {getStatusLabel(req.status)}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
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
                        {req.status === 'pending'
                          && (req.current_approval_level ?? 0) === 0
                          && req.requester_id === profile?.id && (
                          <button
                            onClick={() => handleCancelRequest(req)}
                            disabled={loading}
                            className="inline-flex items-center justify-center p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Cancel Request"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        </>
        )}

        {/* Pagination */}
        {!loadingRequests && sortedRequests.length > 0 && (
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
              {(viewingRequest.status === 'pending' || viewingRequest.status === 'approved' || viewingRequest.status === 'rejected' || viewingRequest.status === 'returned_to_maker') && (
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
                  <label className="text-sm font-semibold text-slate-700">Company</label>
                  <p className="text-slate-900">{(viewingRequest as any).companies?.name || 'N/A'}</p>
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
                    {getStatusLabel(viewingRequest.status)}
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
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-slate-700">Checklist Items & Attachments</label>
                    {viewingRequest.merged_pdf_path && (
                      <button
                        onClick={async () => {
                          try {
                            const { data, error } = await supabase.storage
                              .from('attachments')
                              .download(viewingRequest.merged_pdf_path!);
                            if (error) throw error;
                            const url = URL.createObjectURL(data);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${viewingRequest.pr_number}_attachments.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          } catch (err) {
                            console.error('Error downloading attachments:', err);
                            alert('Failed to download attachments');
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition"
                      >
                        <Download size={14} />
                        Download Attachments
                      </button>
                    )}
                  </div>
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

              {viewingRequest.purchase_type === 'Purchase Order' && viewingRequest.items && viewingRequest.items.length > 0 && (() => {
                // Filter items to only show those with valid total_price > 0
                const validItems = viewingRequest.items.filter((item: any) => item.total_price > 0);

                if (validItems.length === 0) return null;

                return (
                  <div>
                    <label className="text-sm font-semibold text-slate-700 mb-3 block">Items</label>
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Item Name</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Description</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Quantity</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Unit</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Unit Price</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Total Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {validItems.map((item: any, index: number) => (
                            <tr key={index}>
                              <td className="px-4 py-2 text-sm text-slate-900">{item.item_description || item.description || 'N/A'}</td>
                              <td className="px-4 py-2 text-sm text-slate-700">{item.item_notes || '-'}</td>
                              <td className="px-4 py-2 text-sm text-slate-700">{item.quantity}</td>
                              <td className="px-4 py-2 text-sm text-slate-700">{item.unit}</td>
                              <td className="px-4 py-2 text-sm text-slate-700">₱{item.unit_price?.toFixed(2) || '0.00'}</td>
                              <td className="px-4 py-2 text-sm text-slate-900 font-semibold">₱{item.total_price?.toFixed(2) || '0.00'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {viewingRequest.purchase_type === 'Non-Purchase Order' && (
                <>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-semibold text-slate-700">Payee</label>
                      <p className="text-slate-900">{viewingRequest.payee}</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-slate-700">Amount to be paid</label>
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
                      {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                      {submitting ? 'Submitting...' : 'Submit for Approval'}
                    </button>
                  </>
                )}
                {viewingRequest.status === 'returned_to_maker' && (
                  <button
                    onClick={() => handleEditReturnedRequest(viewingRequest)}
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                  >
                    <RefreshCw size={18} />
                    Edit & Resubmit
                  </button>
                )}
                {viewingRequest.status === 'pending'
                  && (viewingRequest.current_approval_level ?? 0) === 0
                  && viewingRequest.requester_id === profile?.id && (
                  <button
                    onClick={() => handleCancelRequest(viewingRequest)}
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Ban size={18} />
                    Cancel Request
                  </button>
                )}
                {viewingRequest.status === 'approved' && viewingRequest.rfp_pdf_path && viewingRequest.purchase_type !== 'Purchase Order' && (
                  <button
                    onClick={() => downloadRFP(viewingRequest.rfp_pdf_path!, viewingRequest.document_no || viewingRequest.pr_number)}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    <Download size={18} />
                    Download RFP
                  </button>
                )}
                {viewingRequest.status === 'approved' && profile?.role === 'admin' && (
                  <>
                    {viewingRequest.purchase_type !== 'Purchase Order' && (
                      <button
                        onClick={() => handleRegenerateRFP(viewingRequest)}
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        {viewingRequest.rfp_pdf_path ? 'Regenerate' : 'Generate'} RFP
                      </button>
                    )}
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

      <FilterModal
        isOpen={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        columns={prFilterColumns}
        values={filterValues}
        onApply={(vals) => { setFilterValues(vals); setCurrentPage(1); }}
      />

      <ExportModal
        isOpen={showExportModal}
        onClose={() => { setShowExportModal(false); setExporting(false); }}
        columns={prFilterColumns}
        onExport={(vals) => { handleExport(vals); }}
        exporting={exporting}
      />
    </div>
  );
}

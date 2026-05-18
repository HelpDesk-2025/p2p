import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Save, Send, Eye, FileText, X, CreditCard as Edit, Loader2, Download, RefreshCw, LayoutGrid, LayoutList, ArrowUpDown, ArrowUp, ArrowDown, Search, SlidersHorizontal, Ban, FileSpreadsheet } from 'lucide-react';
import { getApprovalFlow, addExecutiveApprovalSteps, filterApprovalFlowsForRequester, createApprovalLedgerEntry, sendApprovalEmailToAll } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import { PDFDocument } from 'pdf-lib';
import { generateAndUploadCanvassRFP } from '../../lib/rfpGenerator';
import Pagination from '../Pagination';
import FilterModal, { FilterColumn, FilterValues, applyFilters, getActiveFilterCount } from '../FilterModal';
import ExportModal from '../ExportModal';
import { exportToStyledExcel } from '../../lib/excelExporter';

// Helper function to convert image to PDF
const convertImageToPDF = async (imageFile: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const imageBytes = e.target?.result as ArrayBuffer;
        const pdfDoc = await PDFDocument.create();

        let image;
        const fileType = imageFile.type.toLowerCase();

        if (fileType === 'image/jpeg' || fileType === 'image/jpg') {
          image = await pdfDoc.embedJpg(imageBytes);
        } else if (fileType === 'image/png') {
          image = await pdfDoc.embedPng(imageBytes);
        } else {
          // For other image types, try to load as PNG
          image = await pdfDoc.embedPng(imageBytes);
        }

        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });

        const pdfBytes = await pdfDoc.save();
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        resolve(pdfBlob);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsArrayBuffer(imageFile);
  });
};

interface CanvassReq {
  id: string;
  canvass_number: string;
  request_date: string;
  required_date: string;
  status: string;
  total_amount: number;
  pr_id?: string;
  company_id?: string;
  department?: string;
  items?: any[];
  suppliers?: any[];
  recommended_quotation_index?: number | null;
  recommendation_remarks?: string | null;
  rfp_pdf_path?: string | null;
  msbc_posting_status?: string;
  msbc_posting_date?: string;
  msbc_journal_batch_id?: string;
  msbc_error_message?: string;
  current_approval_level?: number;
  requester_id?: string;
  purchase_requisitions?: {
    document_no: string;
    pr_number: string;
    total_amount: number;
  };
}

interface PurchaseRequisition {
  id: string;
  document_no: string;
  pr_number: string;
  description: string;
  purpose: string;
  department: string;
  total_amount: number;
  request_date: string;
  required_date?: string;
  request_type?: string;
  line_name?: string;
  is_budgeted?: boolean;
  items: any[];
  merged_pdf_path: string | null;
  ready_for_canvass: boolean;
  company_id: string;
  requester_id?: string;
  requester_name?: string;
  pr_requester?: { full_name?: string | null; email?: string | null } | null;
  companies?: { name: string } | null;
}

interface QuotationItem {
  description: string;
  quantity: number;
  uom: string;
  unit_price: number;
  amount: number;
  source_pr_item_id?: string;
}

interface PRItemUsageEntry {
  canvass_number: string;
  status: string;
  request_date: string;
}

interface QuotationForm {
  vendor_name: string;
  vendor_number?: string;
  items: QuotationItem[];
  quoted_amount: number;
  invoice_availability: boolean;
  delivery: boolean;
  installation: boolean;
  delivery_fee: number;
  total: number;
  discounted_price: number;
  purchase_price: number;
  withholding_tax: boolean;
  withholding_tax_rate_id?: string;
  withholding_tax_rate?: number;
  vatable: boolean;
  is_service: boolean;
  is_item: boolean;
  net_of_vat: number;
  vat_12: number;
  ewt: number;
  net_payable: number;
  registered_name: string;
  complete_address: string;
  tin: string;
  contact_person: string;
  contact_no: string;
  email_address: string;
  bank_account_no: string;
  depository_bank: string;
  other_information: string;
  payment_type: string;
  quotation_file?: File | null;
  quotation_file_path?: string;
}

interface Vendor {
  number: string;
  displayName: string;
  type: string;
  address: {
    street: string;
    city: string;
    state: string;
    countryLetterCode: string;
    postalCode: string;
  };
  phoneNumber: string;
  email: string;
  taxRegistrationNumber: string;
  contactPerson?: string;
  bankAccountNumber?: string;
  bankName?: string;
}

export function Canvass() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<CanvassReq[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showPRSelection, setShowPRSelection] = useState(false);
  const [availablePRs, setAvailablePRs] = useState<PurchaseRequisition[]>([]);
  const [selectedPR, setSelectedPR] = useState<PurchaseRequisition | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<CanvassReq | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<CanvassReq | null>(null);
  const [viewingPR, setViewingPR] = useState<PurchaseRequisition | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [vendorSearchTerm, setVendorSearchTerm] = useState<{ [key: number]: string }>({});
  const [showVendorDropdown, setShowVendorDropdown] = useState<{ [key: number]: boolean }>({});
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedPRCompany, setSelectedPRCompany] = useState<string>('');
  const [smeRecommendations, setSmeRecommendations] = useState<Array<{
    id: string;
    status: string;
    purpose: string;
    sme_comments: string | null;
    created_at: string;
    updated_at: string;
    sme_user?: { full_name?: string | null; email?: string | null } | null;
  }>>([]);
  const [isHorizontalLayout, setIsHorizontalLayout] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filterValues, setFilterValues] = useState<FilterValues>({});
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('request_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [withholdingTaxRates, setWithholdingTaxRates] = useState<{ id: string; name: string; rate: number; description?: string }[]>([]);
  const [formData, setFormData] = useState({
    document_no: '',
    required_date: '',
    items: [{ description: '', quantity: 1, unit: 'pcs' }],
  });

  const createEmptyQuotation = (items?: QuotationItem[]): QuotationForm => ({
    vendor_name: '',
    items: items || [{ description: '', quantity: 1, uom: '', unit_price: 0, amount: 0 }],
    quoted_amount: 0,
    invoice_availability: false,
    delivery: false,
    installation: false,
    delivery_fee: 0,
    total: 0,
    discounted_price: 0,
    purchase_price: 0,
    withholding_tax: false,
    withholding_tax_rate_id: undefined,
    withholding_tax_rate: undefined,
    vatable: false,
    is_service: false,
    is_item: false,
    net_of_vat: 0,
    vat_12: 0,
    ewt: 0,
    net_payable: 0,
    registered_name: '',
    complete_address: '',
    tin: '',
    contact_person: '',
    contact_no: '',
    email_address: '',
    bank_account_no: '',
    depository_bank: '',
    other_information: '',
    payment_type: 'Cash on Delivery',
    quotation_file: null,
  });

  // Helper function to add an item row to all quotations
  const addItemToAllQuotations = (quots: QuotationForm[]): QuotationForm[] => {
    return quots.map(quotation => ({
      ...quotation,
      items: [...quotation.items, { description: '', quantity: 1, uom: '', unit_price: 0, amount: 0 }]
    }));
  };

  // Helper function to remove an item row from all quotations
  const removeItemFromAllQuotations = (quots: QuotationForm[], itemIndex: number): QuotationForm[] => {
    return quots.map(quotation => {
      const newItems = [...quotation.items];
      newItems.splice(itemIndex, 1);
      if (newItems.length === 0) {
        newItems.push({ description: '', quantity: 1, uom: '', unit_price: 0, amount: 0 });
      }
      return calculateQuotationValues({
        ...quotation,
        items: newItems
      });
    });
  };

  // Fetch which PR items have been used in other canvass requests for the same PR
  const loadPRItemUsage = async (prId: string, excludeCanvassId?: string) => {
    try {
      let query = supabase
        .from('canvass_requests')
        .select('id, canvass_number, status, request_date, suppliers')
        .eq('pr_id', prId);

      if (excludeCanvassId) {
        query = query.neq('id', excludeCanvassId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const usage: Record<string, PRItemUsageEntry[]> = {};
      (data || []).forEach((canvass: any) => {
        if (canvass.status === 'cancelled') return;
        const seenForCanvass = new Set<string>();
        (canvass.suppliers || []).forEach((supplier: any) => {
          (supplier?.items || []).forEach((item: any) => {
            const sourceId = item?.source_pr_item_id;
            if (!sourceId || seenForCanvass.has(sourceId)) return;
            seenForCanvass.add(sourceId);
            if (!usage[sourceId]) usage[sourceId] = [];
            usage[sourceId].push({
              canvass_number: canvass.canvass_number,
              status: canvass.status,
              request_date: canvass.request_date,
            });
          });
        });
      });
      setPrItemUsage(usage);
    } catch (err) {
      console.error('Error loading PR item usage:', err);
      setPrItemUsage({});
    }
  };

  const getPRItemKey = (item: any, index: number): string => {
    return item?.item_number || item?.id || `idx-${index}`;
  };

  const addPRItemToQuotations = (prItem: any, prItemKey: string) => {
    const usage = prItemUsage[prItemKey] || [];
    const alreadyInDraft = quotations.some(q =>
      q.items.some(it => it.source_pr_item_id === prItemKey)
    );

    if (usage.length > 0 || alreadyInDraft) {
      const parts: string[] = [];
      if (alreadyInDraft) {
        parts.push('This item has already been added to the current canvass draft.');
      }
      if (usage.length > 0) {
        const details = usage
          .map(u => `- ${u.canvass_number} (${u.status}, ${new Date(u.request_date).toLocaleDateString()})`)
          .join('\n');
        parts.push(`This item has been used in the following canvass request(s):\n${details}`);
      }
      parts.push('\nDo you still want to add it?');
      const confirmed = window.confirm(parts.join('\n\n'));
      if (!confirmed) return;
    }

    const description =
      prItem.item_description ||
      prItem.description ||
      prItem.item_notes ||
      '';
    const quantity = Number(prItem.quantity) || 0;
    const uom = prItem.unit || '';

    setQuotations(prev => prev.map(q => {
      const filtered = q.items.filter(it =>
        !(
          !it.source_pr_item_id &&
          (!it.description || it.description.trim() === '') &&
          (!it.unit_price || it.unit_price === 0)
        )
      );
      return {
        ...q,
        items: [
          ...filtered,
          {
            description,
            quantity,
            uom,
            unit_price: 0,
            amount: 0,
            source_pr_item_id: prItemKey,
          },
        ],
      };
    }));
  };

  // Helper function to update shared item fields (description, uom) across all quotations
  const updateSharedItemField = (
    quots: QuotationForm[],
    itemIndex: number,
    field: 'description' | 'uom',
    value: string
  ): QuotationForm[] => {
    return quots.map(quotation => {
      const newItems = [...quotation.items];
      newItems[itemIndex] = { ...newItems[itemIndex], [field]: value };
      return {
        ...quotation,
        items: newItems
      };
    });
  };

  const [quotations, setQuotations] = useState<QuotationForm[]>([
    createEmptyQuotation(),
    createEmptyQuotation(),
    createEmptyQuotation(),
  ]);
  const [recommendedQuotationIndex, setRecommendedQuotationIndex] = useState<number | null>(null);
  const [recommendationRemarks, setRecommendationRemarks] = useState<string>('');
  const [prItemUsage, setPrItemUsage] = useState<Record<string, PRItemUsageEntry[]>>({});

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    if (profile) {
      loadCompanies();
      loadWithholdingTaxRates();
    }
  }, [profile]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.vendor-dropdown-container')) {
        setShowVendorDropdown({});
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadCompanies = async () => {
    if (!profile?.company_id) return;

    let query = supabase
      .from('companies')
      .select('id, name')
      .eq('is_active', true)
      .order('name');

    // Filter companies based on user access
    if (!['admin', 'approver', 'procurement'].includes(profile?.role || '')) {
      // If user has multi-company access enabled
      if (profile.enable_multi_company_requests && profile.allowed_companies && profile.allowed_companies.length > 0) {
        // Filter to only show accessible companies
        query = query.in('id', profile.allowed_companies);
      } else {
        // Single company mode - only show user's company
        query = query.eq('id', profile.company_id);
      }
    }

    const { data } = await query;
    setCompanies(data || []);
  };

  const loadWithholdingTaxRates = async () => {
    const { data } = await supabase
      .from('withholding_tax_rates')
      .select('id, name, rate, description')
      .eq('is_active', true)
      .order('name');

    setWithholdingTaxRates(data || []);
  };

  const loadAvailablePRs = async () => {
    let query = supabase
      .from('purchase_requisitions')
      .select('*, pr_requester:requester_id ( full_name, email ), companies ( name )')
      .eq('ready_for_canvass', true)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (profile?.role !== 'admin') {
      if (profile?.enable_multi_company_requests && profile?.allowed_companies && profile.allowed_companies.length > 0) {
        query = query.in('company_id', profile.allowed_companies);
      } else if (profile?.company_id) {
        query = query.eq('company_id', profile.company_id);
      }
    }

    const { data } = await query;
    setAvailablePRs(data || []);
  };

  const generateDocumentNo = async () => {
    const companyId = selectedCompanyId || profile?.company_id;
    if (!companyId) {
      console.error('Company ID not available');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_next_number', {
        p_series_name: 'Canvass',
        p_company_id: companyId
      });
      if (error) throw error;
      setFormData(prev => ({ ...prev, document_no: data }));
    } catch (error) {
      console.error('Error generating document number:', error);
    }
  };

  const loadRequests = async () => {
    if (!profile?.company_id && profile?.role !== 'admin') return;

    let query = supabase
      .from('canvass_requests')
      .select('*, user_profiles!canvass_requests_requester_id_fkey(company_id), companies!canvass_requests_company_id_fkey(id, name), purchase_requisitions!canvass_requests_pr_id_fkey(document_no, pr_number, total_amount)')
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

  const handleViewRequest = async (request: CanvassReq) => {
    setViewingRequest(request);
    setShowViewModal(true);
    setViewingPR(null);
    setSelectedPRCompany('');
    setSmeRecommendations([]);

    if (request.pr_id) {
      fetchSmeRecommendations(request.pr_id);
    }

    // Fetch full canvass details including PR if pr_id exists
    if (request.pr_id) {
      try {
        const { data: prData, error: prError } = await supabase
          .from('purchase_requisitions')
          .select('*, pr_requester:requester_id ( full_name, email )')
          .eq('id', request.pr_id)
          .maybeSingle();

        if (prError) {
          console.error('Error fetching PR:', prError);
        } else if (prData) {
          setViewingPR(prData as PurchaseRequisition);

          // Fetch the company name for the PR
          if (prData.company_id) {
            const { data: companyData } = await supabase
              .from('companies')
              .select('name')
              .eq('id', prData.company_id)
              .single();

            if (companyData) {
              setSelectedPRCompany(companyData.name);
            }
          }
        }
      } catch (error) {
        console.error('Error loading PR details:', error);
      }
    }
  };

  const generateNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `CV-${year}${month}-${random}`;
  };

  const calculateQuotationValues = (quotation: QuotationForm): QuotationForm => {
    const updated = { ...quotation };

    // Calculate quoted_amount from all items
    updated.quoted_amount = Math.round(
      updated.items.reduce((sum, item) => sum + (item.amount || 0), 0) * 100
    ) / 100;

    updated.total = Math.round((updated.quoted_amount + updated.delivery_fee) * 100) / 100;
    updated.purchase_price = Math.round((updated.total - updated.discounted_price) * 100) / 100;

    if (updated.vatable) {
      updated.net_of_vat = Math.round((updated.purchase_price / 1.12) * 100) / 100;
      updated.vat_12 = Math.round((updated.purchase_price - updated.net_of_vat) * 100) / 100;
    } else {
      updated.net_of_vat = Math.round(updated.purchase_price * 100) / 100;
      updated.vat_12 = 0;
    }

    if (updated.withholding_tax && updated.withholding_tax_rate !== undefined) {
      updated.ewt = Math.round((updated.net_of_vat * (updated.withholding_tax_rate / 100)) * 100) / 100;
    } else if (updated.withholding_tax) {
      if (updated.is_service) {
        updated.ewt = Math.round((updated.net_of_vat * 0.02) * 100) / 100;
      } else if (updated.is_item) {
        updated.ewt = Math.round((updated.net_of_vat * 0.01) * 100) / 100;
      } else {
        updated.ewt = 0;
      }
    } else {
      updated.ewt = 0;
    }

    updated.net_payable = Math.round((updated.net_of_vat + updated.vat_12 - updated.ewt) * 100) / 100;

    return updated;
  };

  const handleEditDraft = (request: CanvassReq) => {
    setEditingRequest(request);
    setFormData({
      document_no: request.canvass_number,
      required_date: request.required_date,
      items: (request as any).items || [{ description: '', quantity: 1, unit: 'pcs' }],
    });
    setShowViewModal(false);
    setViewingRequest(null);
    setViewingPR(null);
    setSelectedPRCompany('');
    setShowForm(true);

    if (request.pr_id) {
      loadPRItemUsage(request.pr_id, request.id);
    } else {
      setPrItemUsage({});
    }
  };

  const handleSubmit = async (status: 'draft' | 'pending') => {
    // Validate company selection
    if (!selectedCompanyId) {
      alert('Please select a company.');
      return;
    }

    // Validate quotations for pending submissions
    if (status === 'pending') {
      const filledQuotations = quotations.filter(q => q.vendor_name && q.vendor_name.trim() !== '');

      if (filledQuotations.length === 0) {
        alert('Please add at least one quotation before submitting.');
        return;
      }

      // Validate that each filled quotation has an attachment
      const quotationsWithoutFiles = filledQuotations.filter(
        (q, index) => !q.quotation_file && !q.quotation_file_path
      );

      if (quotationsWithoutFiles.length > 0) {
        alert('Please upload quotation attachments for all vendors. Each quotation requires a supporting document.');
        return;
      }

      if (recommendedQuotationIndex === null) {
        alert('Please select a recommended quotation.');
        return;
      }

      if (!recommendationRemarks || recommendationRemarks.trim() === '') {
        alert('Please provide remarks for your recommended quotation.');
        return;
      }

      if (!selectedPR) {
        alert('Please select a Purchase Requisition.');
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
      const totalAmount = selectedPR?.total_amount || 0;

      // Upload quotation files to storage
      const quotationsWithFiles = await Promise.all(
        quotations.map(async (quotation, index) => {
          // If a new file was uploaded, upload it
          if (quotation.quotation_file && quotation.quotation_file instanceof File) {
            const timestamp = Date.now();
            let fileToUpload: File | Blob = quotation.quotation_file;
            let fileName = `canvass_${formData.document_no}_quotation_${index + 1}_${timestamp}`;

            // Check if file is an image and convert to PDF
            const isImage = quotation.quotation_file.type.startsWith('image/');
            if (isImage) {
              try {
                const pdfBlob = await convertImageToPDF(quotation.quotation_file);
                fileToUpload = pdfBlob;
                fileName += '.pdf';
              } catch (error) {
                console.error('Error converting image to PDF:', error);
                alert(`Failed to convert image to PDF for quotation ${index + 1}`);
                const { quotation_file, ...quotationWithoutFile } = quotation;
                return quotationWithoutFile;
              }
            } else {
              fileName += '_' + quotation.quotation_file.name;
            }

            const filePath = `canvass/${fileName}`;

            const { error: uploadError } = await supabase.storage
              .from('attachments')
              .upload(filePath, fileToUpload);

            if (uploadError) {
              console.error('Error uploading quotation file:', uploadError);
              // Preserve existing file path if upload failed
              const { quotation_file, ...quotationWithoutFile } = quotation;
              return quotationWithoutFile;
            }

            // Return quotation with new file path
            const { quotation_file, ...quotationWithoutFile } = quotation;
            return { ...quotationWithoutFile, quotation_file_path: filePath };
          }

          // Remove quotation_file field but preserve quotation_file_path if it exists
          const { quotation_file, ...quotationWithoutFile } = quotation;
          return quotationWithoutFile;
        })
      );

      let insertedRequest;

      if (editingRequest) {
        const { data, error } = await supabase
          .from('canvass_requests')
          .update({
            company_id: selectedCompanyId,
            required_date: formData.required_date,
            items: formData.items,
            status,
            total_amount: totalAmount,
            suppliers: quotationsWithFiles,
            recommended_quotation_index: status === 'pending' ? recommendedQuotationIndex : null,
            recommendation_remarks: status === 'pending' ? recommendationRemarks : null,
            is_budgeted: selectedPR?.is_budgeted || false,
          })
          .eq('id', editingRequest.id)
          .select()
          .single();

        if (error) throw error;
        insertedRequest = data;
      } else {
        const { data, error } = await supabase
          .from('canvass_requests')
          .insert({
            canvass_number: formData.document_no,
            requester_id: profile?.id,
            company_id: selectedCompanyId,
            pr_id: selectedPR?.id || null,
            department: selectedPR?.department || profile?.department || '',
            request_date: new Date().toISOString(),
            required_date: formData.required_date,
            items: formData.items,
            suppliers: quotationsWithFiles,
            status,
            current_approval_level: 0,
            total_amount: totalAmount,
            recommended_quotation_index: status === 'pending' ? recommendedQuotationIndex : null,
            recommendation_remarks: status === 'pending' ? recommendationRemarks : null,
            is_budgeted: selectedPR?.is_budgeted || false,
          })
          .select()
          .single();

        if (error) throw error;
        insertedRequest = data;

        // If pending, link the PR to this canvass request
        if (status === 'pending' && selectedPR) {
          const { error: prError } = await supabase
            .from('purchase_requisitions')
            .update({ canvass_id: insertedRequest.id })
            .eq('id', selectedPR.id);

          if (prError) throw prError;
        }
      }

      if (status === 'pending' && insertedRequest && selectedCompanyId) {
        const department = selectedPR?.department || selectedDepartment || profile?.department || '';
        const rawApprovalFlows = await getApprovalFlow(
          selectedCompanyId,
          department,
          'Canvass',
          false,
          totalAmount
        );

        // Add executive approval steps if requester is Executive
        let flowsWithExecutive = await addExecutiveApprovalSteps(
          rawApprovalFlows,
          profile.id,
          selectedCompanyId,
          false
        );

        // Filter out requester from approval flows
        const approvalFlows = await filterApprovalFlowsForRequester(
          flowsWithExecutive,
          profile.id,
          department,
          selectedCompanyId
        );

        if (approvalFlows.length > 0) {
          const isResubmission = editingRequest?.status === 'returned_to_maker';
          if (isResubmission) {
            await supabase
              .from('approval_ledger')
              .delete()
              .eq('request_id', insertedRequest.id)
              .eq('request_type', 'Canvass');
          }

          await createApprovalLedgerEntry(
            'Canvass',
            insertedRequest.id,
            formData.document_no,
            profile.id,
            profile.full_name || 'Unknown',
            'Requestor',
            'Submitted',
            isResubmission ? 'Resubmission after return' : 'Initial submission',
            0
          );

          const firstApprover = approvalFlows[0];
          await sendApprovalEmailToAll(
            firstApprover,
            profile.company_id,
            department,
            'Canvass',
            formData.document_no,
            profile.full_name || 'Unknown',
            totalAmount,
            'Submitted',
            undefined,
            undefined,
            firstApprover.approver_type
          );
        }
      }

      setShowForm(false);
      setShowPRSelection(false);
      setSelectedPR(null);
      setSelectedPRCompany('');
      setSmeRecommendations([]);
      setFormData({ document_no: '', required_date: '', items: [{ description: '', quantity: 1, unit: 'pcs' }] });
      setQuotations([createEmptyQuotation(), createEmptyQuotation(), createEmptyQuotation()]);
      setRecommendedQuotationIndex(null);
      setRecommendationRemarks('');
      setEditingRequest(null);
      loadRequests();
      if (!editingRequest) {
        generateDocumentNo();
      }
      generateDocumentNo();
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
      setSavingDraft(false);
      setSubmitting(false);
    }
  };

  const handleSubmitDraft = async (request: CanvassReq) => {
    // Validate that all quotations have attachments
    const suppliers = request.suppliers || [];
    const quotationsWithoutFiles = suppliers.filter(
      (supplier: any) => !supplier.quotation_file_path
    );

    if (quotationsWithoutFiles.length > 0) {
      alert('Please upload quotation attachments for all vendors before submitting. Each quotation requires a supporting document.');
      return;
    }

    if (suppliers.length === 0) {
      alert('Please add at least one quotation before submitting.');
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
        'Canvass',
        false,
        request.total_amount
      );

      if (!rawApprovalFlows || rawApprovalFlows.length === 0) {
        throw new Error('No approval flow configured for this request. Please contact administrator.');
      }

      // Add executive approval steps if requester is Executive
      let flowsWithExecutive = await addExecutiveApprovalSteps(
        rawApprovalFlows,
        profile.id,
        request.company_id,
        !!request.is_budgeted
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

      const isResubmission = request.status === 'returned_to_maker';

      const { error: updateError } = await supabase
        .from('canvass_requests')
        .update({ status: 'pending', current_approval_level: 0 })
        .eq('id', request.id);

      if (updateError) throw updateError;

      if (isResubmission) {
        await supabase
          .from('approval_ledger')
          .delete()
          .eq('request_id', request.id)
          .eq('request_type', 'Canvass');
      }

      await createApprovalLedgerEntry(
        'Canvass',
        request.id,
        request.canvass_number,
        profile.id,
        profile.full_name || 'Unknown',
        'Requestor',
        'Submitted',
        isResubmission ? 'Resubmission after return' : 'Initial submission',
        0
      );

      const firstApprover = approvalFlows[0];
      await sendApprovalEmailToAll(
        firstApprover,
        profile.company_id,
        profile.department || '',
        'Canvass',
        request.canvass_number,
        profile.full_name || 'Unknown',
        request.total_amount,
        'Submitted',
        undefined,
        undefined,
        firstApprover.approver_type
      );

      setShowViewModal(false);
      setViewingRequest(null);
      setViewingPR(null);
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

  const downloadRFP = async (rfpPath: string, canvassNumber: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .download(rfpPath);

      if (error) throw error;
      if (!data) throw new Error('No data returned');

      const url = window.URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CVS_RFP_${canvassNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading CVS and RFP:', error);
      alert('Failed to download CVS and RFP');
    }
  };

  const handleRepostToMSBC = async (request: CanvassReq) => {
    if (!confirm('Are you sure you want to repost this canvass to MSBC?')) {
      return;
    }

    setLoading(true);
    try {
      console.log('Starting MSBC posting for canvass:', request.canvass_number);
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/post-canvass-to-msbc`;
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      const postResponse = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ canvass_id: request.id }),
      });

      if (!postResponse.ok) {
        const errorData = await postResponse.json();
        throw new Error(errorData.message || 'Failed to post to MSBC');
      }

      const postResult = await postResponse.json();
      console.log('MSBC posting successful:', postResult);

      setShowViewModal(false);
      setViewingRequest(null);

      let message = 'Canvass posted to MSBC successfully!';
      if (postResult.warning) {
        message += `\n\nNote: ${postResult.warning}`;
      }

      alert(message);
      await loadRequests();
    } catch (error) {
      console.error('Error posting to MSBC:', error);
      alert('Failed to post to MSBC: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRequest = async (request: CanvassReq) => {
    if (request.status !== 'pending' || (request.current_approval_level ?? 0) !== 0) {
      alert('This request can no longer be cancelled because an approver has already acted on it.');
      return;
    }
    if (!confirm(`Are you sure you want to cancel Canvass ${request.canvass_number}?\n\nThis action cannot be undone.`)) return;
    const reason = prompt('Please provide a reason for cancelling this request:');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('A cancellation reason is required.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('canvass_requests')
        .update({ status: 'cancelled' })
        .eq('id', request.id);
      if (error) throw error;

      await createApprovalLedgerEntry(
        'Canvass',
        request.id,
        request.canvass_number,
        profile?.id || null,
        profile?.full_name || 'Unknown',
        'Requestor',
        'Cancelled',
        reason.trim(),
        0
      );

      setShowViewModal(false);
      setViewingRequest(null);
      alert(`Canvass ${request.canvass_number} has been cancelled successfully.`);
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
      returned_to_maker: 'bg-amber-100 text-amber-700',
      cancelled: 'bg-slate-200 text-slate-800',
    };
    return colors[status] || 'bg-slate-100 text-slate-700';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'returned_to_maker') return 'Returned to Maker';
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

  const canvassFilterColumns: FilterColumn[] = [
    { key: 'canvass_number', label: 'Canvass No.', type: 'text' },
    { key: 'company_name', label: 'Company', type: 'select', options: companies.map(c => ({ value: c.name, label: c.name })) },
    { key: 'request_date', label: 'Request Date', type: 'dateRange' },
    { key: 'required_date', label: 'Required Date', type: 'dateRange' },
    { key: 'status', label: 'Status', type: 'select', options: [
      { value: 'draft', label: 'Draft' }, { value: 'pending', label: 'Pending' },
      { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' },
      { value: 'returned_to_maker', label: 'Returned to Maker' },
    ]},
  ];

  const canvassGetFieldValue = (item: any, key: string) => {
    if (key === 'company_name') return item.companies?.name || '';
    return item[key];
  };

  const filteredRequests = applyFilters(
    requests.filter((req) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const companyName = (req as any).companies?.name || '';
      const prDocNo = req.purchase_requisitions?.document_no || req.purchase_requisitions?.pr_number || '';
      const prAmount = req.purchase_requisitions?.total_amount?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '';
      const dateStr = new Date(req.request_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const reqDateStr = req.required_date ? new Date(req.required_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      return (
        req.canvass_number?.toLowerCase().includes(term) ||
        companyName.toLowerCase().includes(term) ||
        prDocNo.toLowerCase().includes(term) ||
        prAmount.includes(term) ||
        dateStr.toLowerCase().includes(term) ||
        reqDateStr.toLowerCase().includes(term) ||
        req.status?.toLowerCase().includes(term)
      );
    }),
    filterValues,
    canvassFilterColumns,
    canvassGetFieldValue
  );

  const sortedRequests = [...filteredRequests].sort((a, b) => {
    let aVal: any = a[sortColumn as keyof CanvassReq];
    let bVal: any = b[sortColumn as keyof CanvassReq];

    if (sortColumn === 'company_name') {
      aVal = (a as any).companies?.name || '';
      bVal = (b as any).companies?.name || '';
    }

    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
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

  const previewMergedPDF = async (pdfPath: string) => {
    const { data } = await supabase.storage.from('attachments').createSignedUrl(pdfPath, 60);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank');
    }
  };

  const fetchVendors = async (companyId: string) => {
    setLoadingVendors(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.error('Session error:', sessionError);
        alert('Your session has expired. Please refresh the page and log in again.');
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-vendors?company_id=${companyId}`;
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        let errorMessage = 'Failed to fetch vendors';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
          console.error('Error response:', errorData);
        } catch (e) {
          const errorText = await response.text();
          console.error('Error text:', errorText);
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setVendors(data.value || []);
    } catch (error: any) {
      console.error('Error fetching vendors:', error);
      alert('Failed to load vendors: ' + error.message);
      setVendors([]);
    } finally {
      setLoadingVendors(false);
    }
  };

  const fetchSmeRecommendations = async (prId: string) => {
    try {
      const { data, error } = await supabase
        .from('sme_requests')
        .select(`
          id,
          status,
          purpose,
          sme_comments,
          created_at,
          updated_at,
          sme_user:sme_user_id ( full_name, email )
        `)
        .eq('pr_id', prId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setSmeRecommendations((data as any) || []);
    } catch (err) {
      console.error('Error fetching SME recommendations:', err);
      setSmeRecommendations([]);
    }
  };

  const handlePRSelection = async (pr: PurchaseRequisition) => {
    // Check if this PR is already used in another canvass request
    if (pr.id) {
      const { data: existingCanvass, error: canvassError } = await supabase
        .from('canvass_requests')
        .select('canvass_number')
        .eq('pr_id', pr.id)
        .maybeSingle();

      if (canvassError) {
        console.error('Error checking existing canvass:', canvassError);
      }

      if (existingCanvass) {
        const userConfirmed = window.confirm(
          `This Purchase Requisition (${pr.document_no || pr.pr_number}) has already been used in Canvass Request ${existingCanvass.canvass_number}.\n\nDo you want to proceed and create another canvass request for this PR?`
        );

        if (!userConfirmed) {
          return;
        }
      }
    }

    setSelectedPR(pr);
    setShowPRSelection(false);
    setShowForm(true);

    if (pr.id) {
      fetchSmeRecommendations(pr.id);
    } else {
      setSmeRecommendations([]);
    }

    // Set the company ID from the PR and generate document number
    if (pr.company_id) {
      setSelectedCompanyId(pr.company_id);

      // Fetch vendors for this company
      fetchVendors(pr.company_id);

      // Generate document number using the PR's company ID directly
      try {
        const { data, error } = await supabase.rpc('get_next_number', {
          p_series_name: 'Canvass',
          p_company_id: pr.company_id
        });
        if (error) throw error;
        setFormData(prev => ({ ...prev, document_no: data }));
      } catch (error) {
        console.error('Error generating document number:', error);
      }

      // Fetch the company name for display
      const { data: companyData } = await supabase
        .from('companies')
        .select('name')
        .eq('id', pr.company_id)
        .single();

      if (companyData) {
        setSelectedPRCompany(companyData.name);
      }
    }

    setQuotations([
      createEmptyQuotation(),
      createEmptyQuotation(),
      createEmptyQuotation(),
    ]);

    if (pr.id) {
      loadPRItemUsage(pr.id);
    } else {
      setPrItemUsage({});
    }
  };

  if (showPRSelection) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Select Purchase Requisition</h2>
            <p className="text-sm text-slate-600 mt-1">Choose a PR that is ready for canvass</p>
          </div>
          <button
            onClick={() => setShowPRSelection(false)}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition self-start sm:self-auto"
          >
            Cancel
          </button>
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Document No.</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Company</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Department</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Request Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {availablePRs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                      No purchase requisitions ready for canvass
                    </td>
                  </tr>
                ) : (
                  availablePRs.map((pr) => (
                    <tr key={pr.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm font-mono font-medium text-slate-900">
                        {pr.document_no || pr.pr_number}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{pr.companies?.name || '-'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{pr.department}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">{pr.description}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(pr.request_date).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button
                          onClick={() => handlePRSelection(pr)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden space-y-3">
          {availablePRs.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center text-slate-500">
              No purchase requisitions ready for canvass
            </div>
          ) : (
            availablePRs.map((pr) => (
              <div key={pr.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-500 uppercase mb-1">Document No.</p>
                    <p className="text-sm font-mono font-semibold text-slate-900">{pr.document_no || pr.pr_number}</p>
                  </div>
                  <button
                    onClick={() => handlePRSelection(pr)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium whitespace-nowrap"
                  >
                    Select
                  </button>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase mb-1">Company</p>
                  <p className="text-sm text-slate-700">{pr.companies?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase mb-1">Description</p>
                  <p className="text-sm text-slate-700 line-clamp-2">{pr.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase mb-1">Department</p>
                    <p className="text-sm text-slate-700">{pr.department}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase mb-1">Request Date</p>
                    <p className="text-sm text-slate-700">{new Date(pr.request_date).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">New Canvass Request</h2>
          <button
            onClick={() => {
              setShowForm(false);
              setSelectedPR(null);
              setSelectedPRCompany('');
              setSmeRecommendations([]);
              setVendors([]);
              setQuotations([
                createEmptyQuotation(),
                createEmptyQuotation(),
                createEmptyQuotation(),
              ]);
            }}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition self-start sm:self-auto"
          >
            Cancel
          </button>
        </div>

        {selectedPR && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-bold text-blue-900 mb-4">Selected Purchase Requisition</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
                <div>
                  <label className="font-semibold text-blue-700">Document No.</label>
                  <p className="text-blue-900 font-mono">{selectedPR.document_no || selectedPR.pr_number}</p>
                </div>
                <div>
                  <label className="font-semibold text-blue-700">Company</label>
                  <p className="text-blue-900">{selectedPRCompany || 'Loading...'}</p>
                </div>
                <div>
                  <label className="font-semibold text-blue-700">Requester</label>
                  <p className="text-blue-900">{selectedPR.pr_requester?.full_name || selectedPR.requester_name || 'N/A'}</p>
                </div>
                <div>
                  <label className="font-semibold text-blue-700">Department</label>
                  <p className="text-blue-900">{selectedPR.department}</p>
                </div>
                <div>
                  <label className="font-semibold text-blue-700">Total Amount</label>
                  <p className="text-blue-900 font-semibold">₱{selectedPR.total_amount.toLocaleString()}</p>
                </div>
                <div>
                  <label className="font-semibold text-blue-700">Request Date</label>
                  <p className="text-blue-900">{new Date(selectedPR.request_date).toLocaleDateString()}</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="font-semibold text-blue-700">Description</label>
                  <p className="text-blue-900">{selectedPR.description}</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="font-semibold text-blue-700">Purpose</label>
                  <p className="text-blue-900">{selectedPR.purpose}</p>
                </div>
              </div>

              {smeRecommendations.length > 0 && (
                <div className="mt-4">
                  <label className="font-semibold text-blue-700 block mb-2">SME Recommendations</label>
                  <div className="space-y-3">
                    {smeRecommendations.map((rec) => {
                      const statusColor =
                        rec.status === 'approved' || rec.status === 'reviewed'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : rec.status === 'rejected'
                          ? 'bg-red-50 border-red-200 text-red-800'
                          : 'bg-amber-50 border-amber-200 text-amber-800';
                      return (
                        <div key={rec.id} className="bg-white border border-blue-200 rounded-lg p-3 sm:p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="text-sm">
                              <span className="font-semibold text-blue-700">SME: </span>
                              <span className="text-blue-900">{rec.sme_user?.full_name || rec.sme_user?.email || 'Unknown'}</span>
                            </div>
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full border capitalize ${statusColor}`}>
                              {rec.status}
                            </span>
                          </div>
                          <div className="text-sm mb-2">
                            <span className="font-semibold text-blue-700">Purpose of Request: </span>
                            <span className="text-blue-900 whitespace-pre-wrap break-words">{rec.purpose}</span>
                          </div>
                          <div className="text-sm">
                            <span className="font-semibold text-blue-700">Recommendation: </span>
                            {rec.sme_comments ? (
                              <span className="text-blue-900 whitespace-pre-wrap break-words">{rec.sme_comments}</span>
                            ) : (
                              <span className="text-slate-500 italic">Pending SME response</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-2">
                            {new Date(rec.updated_at || rec.created_at).toLocaleString()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedPR.merged_pdf_path && (
                <div className="mt-4">
                  <label className="font-semibold text-blue-700 block mb-2">Merged PDF Document</label>
                  <button
                    onClick={() => previewMergedPDF(selectedPR.merged_pdf_path!)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition w-full sm:w-auto"
                  >
                    <FileText size={16} />
                    View Merged PDF
                  </button>
                </div>
              )}

              {selectedPR.items && selectedPR.items.length > 0 && (() => {
                // Filter items to only show those with valid total_price > 0
                const validItems = selectedPR.items.filter((item: any) => item.total_price > 0);

                if (validItems.length === 0) return null;

                return (
                  <div className="mt-4">
                    <label className="font-semibold text-blue-700 block mb-2">Items</label>
                    <div className="bg-white border border-blue-200 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-blue-100">
                            <tr>
                              <th className="px-3 py-2 text-left text-blue-900 whitespace-nowrap">Item Name</th>
                              <th className="px-3 py-2 text-left text-blue-900 whitespace-nowrap">Description</th>
                              <th className="px-3 py-2 text-left text-blue-900 whitespace-nowrap">Quantity</th>
                              <th className="px-3 py-2 text-left text-blue-900 whitespace-nowrap">Unit</th>
                              <th className="px-3 py-2 text-left text-blue-900 whitespace-nowrap">Unit Price</th>
                              <th className="px-3 py-2 text-left text-blue-900 whitespace-nowrap">Total Amount</th>
                              <th className="px-3 py-2 text-left text-blue-900 whitespace-nowrap">Used In</th>
                              <th className="px-3 py-2 text-left text-blue-900 whitespace-nowrap">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-blue-100">
                            {validItems.map((item: any, index: number) => {
                              const prItemKey = getPRItemKey(item, index);
                              const usage = prItemUsage[prItemKey] || [];
                              const addedToDraft = quotations.some(q =>
                                q.items.some(it => it.source_pr_item_id === prItemKey)
                              );
                              return (
                              <tr key={index}>
                                <td className="px-3 py-2 text-slate-900 whitespace-nowrap">{item.item_description || item.description || 'N/A'}</td>
                                <td className="px-3 py-2 text-slate-700">{item.item_notes || '-'}</td>
                                <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{item.quantity}</td>
                                <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{item.unit}</td>
                                <td className="px-3 py-2 text-slate-700 whitespace-nowrap">₱{item.unit_price?.toFixed(2) || '0.00'}</td>
                                <td className="px-3 py-2 text-slate-900 font-semibold whitespace-nowrap">₱{item.total_price?.toFixed(2) || '0.00'}</td>
                                <td className="px-3 py-2">
                                  {usage.length === 0 ? (
                                    <span className="text-xs text-slate-400">—</span>
                                  ) : (
                                    <div className="flex flex-col gap-1">
                                      {usage.map((u, i) => {
                                        const statusColor =
                                          u.status === 'approved'
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                            : u.status === 'rejected'
                                            ? 'bg-red-100 text-red-800 border-red-200'
                                            : u.status === 'draft'
                                            ? 'bg-slate-100 text-slate-700 border-slate-200'
                                            : 'bg-amber-100 text-amber-800 border-amber-200';
                                        return (
                                          <span
                                            key={i}
                                            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${statusColor}`}
                                            title={`Used in ${u.canvass_number} (${u.status}) on ${new Date(u.request_date).toLocaleDateString()}`}
                                          >
                                            <span className="font-mono">{u.canvass_number}</span>
                                            <span className="capitalize opacity-80">· {u.status}</span>
                                            <span className="opacity-70">· {new Date(u.request_date).toLocaleDateString()}</span>
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => addPRItemToQuotations(item, prItemKey)}
                                    title={addedToDraft ? 'Already added — click to add again' : 'Add to all 3 quotations'}
                                    className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition ${
                                      addedToDraft
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                                        : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                                    }`}
                                  >
                                    <Plus size={16} />
                                  </button>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-4 sm:space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Canvass Document No.</label>
                <div className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg">
                  <FileText size={18} className="text-slate-400" />
                  <span className="font-mono font-semibold text-slate-900 text-sm sm:text-base">{formData.document_no}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Required Date</label>
                <input
                  type="date"
                  value={formData.required_date}
                  onChange={(e) => setFormData({ ...formData, required_date: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm sm:text-base"
                  required
                />
              </div>

              <div className="border-t pt-4 sm:pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">Quotations (atleast 1)</h3>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsHorizontalLayout(!isHorizontalLayout)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-600 text-white text-sm rounded-lg hover:bg-slate-700 transition"
                      title={isHorizontalLayout ? "Switch to Vertical Layout" : "Switch to Horizontal Layout"}
                    >
                      {isHorizontalLayout ? (
                        <>
                          <LayoutList size={16} />
                          <span className="hidden sm:inline">Vertical</span>
                          <span className="sm:hidden">Vertical Layout</span>
                        </>
                      ) : (
                        <>
                          <LayoutGrid size={16} />
                          <span className="hidden sm:inline">Horizontal</span>
                          <span className="sm:hidden">Horizontal Layout</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuotations(addItemToAllQuotations(quotations));
                      }}
                      className="flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                    >
                      <Plus size={16} />
                      <span className="hidden sm:inline">Add Item Row to All Quotations</span>
                      <span className="sm:hidden">Add Item Row</span>
                    </button>
                  </div>
                </div>
                {loadingVendors && (
                  <div className="flex items-center gap-2 mb-4 text-blue-600">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-sm">Loading vendors...</span>
                  </div>
                )}
                <div className={isHorizontalLayout ? "grid grid-cols-1 lg:grid-cols-3 gap-4" : "space-y-6"}>
                  {quotations.map((quotation, idx) => (
                    <div key={idx} className={`bg-slate-50 border border-slate-200 rounded-lg flex flex-col ${isHorizontalLayout ? 'p-3 space-y-2.5' : 'p-4 space-y-3'}`}>
                      <h4 className={`font-semibold text-slate-900 text-center border-b ${isHorizontalLayout ? 'text-sm pb-1.5' : 'text-base pb-2'}`}>Quotation {idx + 1}</h4>

                      <div className="space-y-2 flex-1">
                        <div className="relative vendor-dropdown-container">
                          <label className="block text-xs font-medium text-slate-700 mb-1">Vendor Name *</label>
                          <input
                            type="text"
                            value={vendorSearchTerm[idx] !== undefined ? vendorSearchTerm[idx] : quotation.vendor_name}
                            onChange={(e) => {
                              setVendorSearchTerm({ ...vendorSearchTerm, [idx]: e.target.value });
                              setShowVendorDropdown({ ...showVendorDropdown, [idx]: true });
                            }}
                            onFocus={() => setShowVendorDropdown({ ...showVendorDropdown, [idx]: true })}
                            placeholder="Search vendors..."
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                          <p className="mt-1 text-[10px] text-red-600 italic leading-tight">
                            Note: If the Payee/Vendor does not appear in the options, it's either the payee/vendor is blocked or vendor posting group is blank.
                          </p>
                          {showVendorDropdown[idx] && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {vendors
                                .filter((vendor) =>
                                  vendor.displayName.toLowerCase().includes((vendorSearchTerm[idx] || '').toLowerCase()) ||
                                  vendor.number.toLowerCase().includes((vendorSearchTerm[idx] || '').toLowerCase())
                                )
                                .map((vendor) => (
                                  <div
                                    key={vendor.number}
                                    className="px-2.5 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-b-0"
                                    onClick={() => {
                                      const newQuotations = [...quotations];
                                      newQuotations[idx].vendor_name = vendor.displayName;
                                      newQuotations[idx].vendor_number = vendor.number;
                                      newQuotations[idx].registered_name = vendor.displayName;
                                      newQuotations[idx].complete_address = `${vendor.address.street}, ${vendor.address.city}, ${vendor.address.state} ${vendor.address.postalCode}`;
                                      newQuotations[idx].tin = vendor.taxRegistrationNumber;
                                      newQuotations[idx].contact_person = vendor.contactPerson || '';
                                      newQuotations[idx].contact_no = vendor.phoneNumber;
                                      newQuotations[idx].email_address = vendor.email;
                                      newQuotations[idx].bank_account_no = vendor.bankAccountNumber || '';
                                      newQuotations[idx].depository_bank = vendor.bankName || '';
                                      setQuotations(newQuotations);
                                      setVendorSearchTerm({ ...vendorSearchTerm, [idx]: vendor.displayName });
                                      setShowVendorDropdown({ ...showVendorDropdown, [idx]: false });
                                    }}
                                  >
                                    <div className="font-semibold text-slate-900 text-xs">{vendor.displayName}</div>
                                    <div className="text-xs text-slate-500">{vendor.number}</div>
                                  </div>
                                ))}
                              {vendors.filter((vendor) =>
                                vendor.displayName.toLowerCase().includes((vendorSearchTerm[idx] || '').toLowerCase()) ||
                                vendor.number.toLowerCase().includes((vendorSearchTerm[idx] || '').toLowerCase())
                              ).length === 0 && (
                                <div className="px-2.5 py-2 text-xs text-slate-500">No vendors found</div>
                              )}
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Payment Type *</label>
                          <select
                            value={quotation.payment_type || 'Cash on Delivery'}
                            onChange={(e) => {
                              const newQuotations = [...quotations];
                              newQuotations[idx].payment_type = e.target.value;
                              setQuotations(newQuotations);
                            }}
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                          >
                            <option value="Cash on Delivery">Cash on Delivery</option>
                            <option value="Terms">Terms</option>
                          </select>
                        </div>

                        {/* Itemization Table */}
                        <div className="border-t pt-3 mt-3">
                          <label className="block text-xs font-medium text-slate-700 mb-2">Items</label>

                          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-100">
                                <tr>
                                  <th className="px-1.5 py-1.5 text-left text-xs font-semibold text-slate-700">Description</th>
                                  <th className="px-1.5 py-1.5 text-left text-xs font-semibold text-slate-700 w-16">Qty</th>
                                  <th className="px-1.5 py-1.5 text-left text-xs font-semibold text-slate-700 w-16">UOM</th>
                                  <th className="px-1.5 py-1.5 text-left text-xs font-semibold text-slate-700 w-24">Unit Price</th>
                                  <th className="px-1.5 py-1.5 text-right text-xs font-semibold text-slate-700 w-24">Amount</th>
                                  <th className="px-1.5 py-1.5 w-8"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {quotation.items.map((item, itemIdx) => (
                                  <tr key={itemIdx}>
                                    <td className="px-1.5 py-1.5">
                                      <input
                                        type="text"
                                        value={item.description}
                                        onChange={(e) => {
                                          setQuotations(updateSharedItemField(quotations, itemIdx, 'description', e.target.value));
                                        }}
                                        className="w-full px-1.5 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                        placeholder="Item description"
                                      />
                                    </td>
                                    <td className="px-1.5 py-1.5">
                                      <input
                                        type="number"
                                        value={item.quantity}
                                        onChange={(e) => {
                                          const newQuotations = [...quotations];
                                          newQuotations[idx].items[itemIdx].quantity = Number(e.target.value);
                                          newQuotations[idx].items[itemIdx].amount = Math.round(
                                            newQuotations[idx].items[itemIdx].quantity *
                                            newQuotations[idx].items[itemIdx].unit_price * 100
                                          ) / 100;
                                          newQuotations[idx] = calculateQuotationValues(newQuotations[idx]);
                                          setQuotations(newQuotations);
                                        }}
                                        className="w-full px-1.5 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                      />
                                    </td>
                                    <td className="px-1.5 py-1.5">
                                      <input
                                        type="text"
                                        value={item.uom}
                                        onChange={(e) => {
                                          setQuotations(updateSharedItemField(quotations, itemIdx, 'uom', e.target.value));
                                        }}
                                        className="w-full px-1.5 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                        placeholder="pcs"
                                      />
                                    </td>
                                    <td className="px-1.5 py-1.5">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={item.unit_price}
                                        onChange={(e) => {
                                          const newQuotations = [...quotations];
                                          newQuotations[idx].items[itemIdx].unit_price = Number(e.target.value);
                                          newQuotations[idx].items[itemIdx].amount = Math.round(
                                            newQuotations[idx].items[itemIdx].quantity *
                                            newQuotations[idx].items[itemIdx].unit_price * 100
                                          ) / 100;
                                          newQuotations[idx] = calculateQuotationValues(newQuotations[idx]);
                                          setQuotations(newQuotations);
                                        }}
                                        className="w-full px-1.5 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                      />
                                    </td>
                                    <td className="px-1.5 py-1.5 text-right font-semibold text-slate-900 text-xs">
                                      ₱{item.amount.toFixed(2)}
                                    </td>
                                    <td className="px-1.5 py-1.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setQuotations(removeItemFromAllQuotations(quotations, itemIdx));
                                        }}
                                        className="p-0.5 text-red-600 hover:bg-red-50 rounded transition"
                                        title="Remove this item row from all quotations"
                                      >
                                        <X size={12} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                                <tr>
                                  <td colSpan={4} className="px-1.5 py-1.5 text-right font-bold text-slate-900 text-xs">
                                    Total:
                                  </td>
                                  <td className="px-1.5 py-1.5 text-right font-bold text-blue-600 text-xs">
                                    ₱{quotation.quoted_amount.toFixed(2)}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>

                          {/* Add Item Button */}
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => setQuotations(addItemToAllQuotations(quotations))}
                              className="w-full px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition flex items-center justify-center gap-2 font-medium text-xs"
                            >
                              <Plus size={14} />
                              Add Item
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={quotation.invoice_availability}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].invoice_availability = e.target.checked;
                                setQuotations(newQuotations);
                              }}
                              className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <label className="text-xs font-medium text-slate-700">Invoice Availability</label>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={quotation.delivery}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].delivery = e.target.checked;
                                if (!e.target.checked) {
                                  newQuotations[idx].delivery_fee = 0;
                                  newQuotations[idx] = calculateQuotationValues(newQuotations[idx]);
                                }
                                setQuotations(newQuotations);
                              }}
                              className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <label className="text-xs font-medium text-slate-700">Delivery</label>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={quotation.installation}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].installation = e.target.checked;
                                setQuotations(newQuotations);
                              }}
                              className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <label className="text-xs font-medium text-slate-700">Installation</label>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Delivery Fee</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.delivery_fee || ''}
                            onChange={(e) => {
                              const newQuotations = [...quotations];
                              newQuotations[idx].delivery_fee = Number(e.target.value);
                              newQuotations[idx] = calculateQuotationValues(newQuotations[idx]);
                              setQuotations(newQuotations);
                            }}
                            disabled={!quotation.delivery}
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Total (Quoted + Delivery)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.total || ''}
                            readOnly
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-100 text-slate-700"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Discounted Price</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.discounted_price || ''}
                            onChange={(e) => {
                              const newQuotations = [...quotations];
                              newQuotations[idx].discounted_price = Number(e.target.value);
                              newQuotations[idx] = calculateQuotationValues(newQuotations[idx]);
                              setQuotations(newQuotations);
                            }}
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Purchase Price</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.purchase_price || ''}
                            readOnly
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-100 text-slate-700"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={quotation.withholding_tax}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].withholding_tax = e.target.checked;
                                if (!e.target.checked) {
                                  newQuotations[idx].is_service = false;
                                  newQuotations[idx].is_item = false;
                                  newQuotations[idx].withholding_tax_rate_id = undefined;
                                  newQuotations[idx].withholding_tax_rate = undefined;
                                }
                                newQuotations[idx] = calculateQuotationValues(newQuotations[idx]);
                                setQuotations(newQuotations);
                              }}
                              className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <label className="text-xs font-medium text-slate-700">Withholding Tax</label>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={quotation.vatable}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].vatable = e.target.checked;
                                newQuotations[idx] = calculateQuotationValues(newQuotations[idx]);
                                setQuotations(newQuotations);
                              }}
                              className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <label className="text-xs font-medium text-slate-700">Vatable</label>
                          </div>
                        </div>

                        {quotation.withholding_tax && (
                          <div className="ml-4">
                            <label className="block text-xs font-medium text-slate-700 mb-1">Withholding Tax Rate</label>
                            <select
                              value={quotation.withholding_tax_rate_id || ''}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                const selectedRate = withholdingTaxRates.find(r => r.id === e.target.value);
                                newQuotations[idx].withholding_tax_rate_id = e.target.value || undefined;
                                newQuotations[idx].withholding_tax_rate = selectedRate?.rate || undefined;
                                newQuotations[idx] = calculateQuotationValues(newQuotations[idx]);
                                setQuotations(newQuotations);
                              }}
                              className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="">Select Rate</option>
                              {withholdingTaxRates.map((rate) => (
                                <option key={rate.id} value={rate.id}>
                                  {rate.name}{rate.description ? ` - ${rate.description}` : ''} ({rate.rate}%)
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Net of VAT</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.net_of_vat || ''}
                            readOnly
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-100 text-slate-700"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">VAT 12%</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.vat_12 || ''}
                            readOnly
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-100 text-slate-700"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">EWT</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.ewt || ''}
                            readOnly
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-100 text-slate-700"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Net Payable</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.net_payable || ''}
                            readOnly
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-100 text-slate-700"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Quotation File
                          <span className="block text-xs text-slate-500 mt-0.5">PDF or Image</span>
                        </label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            if (file && file.size > 40 * 1024 * 1024) {
                              alert(`File ${file.name} exceeds the 40MB size limit (${(file.size / 1024 / 1024).toFixed(2)}MB).`);
                              e.target.value = '';
                              return;
                            }
                            const newQuotations = [...quotations];
                            newQuotations[idx].quotation_file = file;
                            setQuotations(newQuotations);
                          }}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                        />
                        {quotation.quotation_file && (
                          <p className="text-xs text-slate-600 mt-1 truncate" title={quotation.quotation_file.name}>
                            {quotation.quotation_file.name}
                          </p>
                        )}
                      </div>

                      <div className="border-t pt-3 mt-3">
                        <h5 className="font-semibold text-slate-900 mb-2 text-sm">Vendor Details</h5>
                        <div className={`grid gap-2 ${isHorizontalLayout ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Registered Name</label>
                            <input
                              type="text"
                              value={quotation.registered_name}
                              readOnly
                              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">TIN</label>
                            <input
                              type="text"
                              value={quotation.tin}
                              readOnly
                              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed"
                            />
                          </div>
                          <div className={isHorizontalLayout ? '' : 'sm:col-span-2'}>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Complete Address</label>
                            <textarea
                              value={quotation.complete_address}
                              readOnly
                              rows={2}
                              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Contact Person</label>
                            <input
                              type="text"
                              value={quotation.contact_person}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].contact_person = e.target.value;
                                setQuotations(newQuotations);
                              }}
                              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Contact No.</label>
                            <input
                              type="text"
                              value={quotation.contact_no}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].contact_no = e.target.value;
                                setQuotations(newQuotations);
                              }}
                              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
                            <input
                              type="email"
                              value={quotation.email_address}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].email_address = e.target.value;
                                setQuotations(newQuotations);
                              }}
                              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Bank Account No.</label>
                            <input
                              type="text"
                              value={quotation.bank_account_no}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].bank_account_no = e.target.value;
                                setQuotations(newQuotations);
                              }}
                              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Depository Bank</label>
                            <input
                              type="text"
                              value={quotation.depository_bank}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].depository_bank = e.target.value;
                                setQuotations(newQuotations);
                              }}
                              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div className={isHorizontalLayout ? '' : 'sm:col-span-2'}>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Other Information</label>
                            <textarea
                              value={quotation.other_information}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].other_information = e.target.value;
                                setQuotations(newQuotations);
                              }}
                              rows={2}
                              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendation Section */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 sm:p-6">
                <h4 className="text-base sm:text-lg font-bold text-slate-900 mb-3 sm:mb-4">Recommended Quotation</h4>
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Select Recommended Quotation <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-2">
                      {quotations.map((quotation, idx) => (
                        quotation.vendor_name && quotation.vendor_name.trim() !== '' && (
                          <div key={idx} className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 bg-white rounded-lg border border-slate-200">
                            <input
                              type="radio"
                              id={`quotation-${idx}`}
                              name="recommended-quotation"
                              checked={recommendedQuotationIndex === idx}
                              onChange={() => setRecommendedQuotationIndex(idx)}
                              className="mt-1 w-4 h-4 text-blue-600 border-slate-300 focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                            />
                            <label htmlFor={`quotation-${idx}`} className="flex-1 cursor-pointer">
                              <div className="font-semibold text-slate-900 text-sm sm:text-base">Quotation {idx + 1}: {quotation.vendor_name}</div>
                              <div className="text-xs sm:text-sm text-slate-600 mt-1 space-y-0.5 sm:space-y-0">
                                <div className="sm:inline">Net Payable: ₱{quotation.net_payable.toFixed(2)}</div>
                                <span className="hidden sm:inline"> | </span>
                                <div className="sm:inline">Quoted Amount: ₱{quotation.quoted_amount.toFixed(2)}</div>
                                <span className="hidden sm:inline"> | </span>
                                <div className="sm:inline">Items: {quotation.items.length}</div>
                              </div>
                            </label>
                          </div>
                        )
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Recommendation Remarks <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={recommendationRemarks}
                      onChange={(e) => setRecommendationRemarks(e.target.value)}
                      placeholder="Provide detailed remarks explaining why you recommend this quotation..."
                      rows={4}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm sm:text-base"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:justify-end pt-4 border-t">
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to submit this canvass request for approval?')) {
                      handleSubmit('pending');
                    }
                  }}
                  disabled={loading}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base font-medium"
                >
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  {submitting ? 'Submitting...' : 'Submit for Approval'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

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
          .from('canvass_requests')
          .select('*, companies(name)')
          .gte('request_date', from + 'T00:00:00')
          .lte('request_date', to + 'T23:59:59')
          .order('request_date', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (exportVals.status) query = query.eq('status', exportVals.status);

        const { data, error } = await query;
        if (error) throw error;

        allData.push(...(data || []));
        hasMore = (data?.length || 0) === pageSize;
        page++;
      }

      let filtered = allData;
      if (exportVals.canvass_number) filtered = filtered.filter((r: any) => (r.canvass_number || '').toLowerCase().includes(exportVals.canvass_number.toLowerCase()));
      if (exportVals.company_name) filtered = filtered.filter((r: any) => (r.companies?.name || '').toLowerCase().includes(exportVals.company_name.toLowerCase()));

      const rows = filtered.map((req: any) => [
        req.canvass_number || '',
        req.companies?.name || '',
        req.department || '',
        req.request_date ? new Date(req.request_date).toLocaleDateString('en-US') : '',
        req.required_date ? new Date(req.required_date).toLocaleDateString('en-US') : '',
        req.total_amount || 0,
        req.status || '',
      ]);
      exportToStyledExcel(rows, [
        { header: 'Canvass No.', width: 18 },
        { header: 'Company', width: 20 },
        { header: 'Department', width: 16 },
        { header: 'Request Date', width: 14 },
        { header: 'Required Date', width: 14 },
        { header: 'Total Amount', width: 15, isAmount: true },
        { header: 'Status', width: 16 },
      ], 'Canvass Requests', `canvass_requests_${new Date().toISOString().split('T')[0]}.xlsx`);
      setShowExportModal(false);
    } catch (error: any) {
      alert('Export failed: ' + error.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Canvass Requests</h2>
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
              onClick={() => {
                loadAvailablePRs();
                setShowPRSelection(true);
              }}
              className="flex items-center justify-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm sm:text-base"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="sm:hidden">New</span>
              <span className="hidden sm:inline">New Request</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setSearchTerm(searchInput); setCurrentPage(1); } }}
                placeholder="Search by canvass no., company, PR no., date, status..."
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
        <div className="overflow-auto flex-1">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200 z-10">
              <tr>
                <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                  <button onClick={() => handleSort('canvass_number')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                    Canvass No. {getSortIcon('canvass_number')}
                  </button>
                </th>
                <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                  <button onClick={() => handleSort('company_name')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                    Company {getSortIcon('company_name')}
                  </button>
                </th>
                <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    PR Document No.
                  </span>
                </th>
                <th className="px-3 xl:px-4 py-3.5 text-right whitespace-nowrap">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    PR Amount
                  </span>
                </th>
                <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                  <button onClick={() => handleSort('request_date')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                    Request Date {getSortIcon('request_date')}
                  </button>
                </th>
                <th className="px-3 xl:px-4 py-3.5 text-left whitespace-nowrap">
                  <button onClick={() => handleSort('required_date')} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider hover:text-slate-900 transition-colors">
                    Required Date {getSortIcon('required_date')}
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
                  <td colSpan={8} className="px-3 py-6 sm:px-6 sm:py-8 text-center text-slate-500 text-xs sm:text-sm">No canvass requests found</td>
                </tr>
              ) : (
                paginatedRequests.map((req, index) => (
                  <tr key={req.id} className={`hover:bg-slate-50 transition-colors group ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="font-mono font-bold text-sm text-slate-900 truncate block min-w-[120px]" title={req.canvass_number}>
                        {req.canvass_number}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-slate-700 truncate block max-w-[150px]" title={(req as any).companies?.name || 'N/A'}>
                        {(req as any).companies?.name || 'N/A'}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-sm text-blue-700 font-semibold">
                        {req.purchase_requisitions?.document_no || req.purchase_requisitions?.pr_number || 'N/A'}
                      </span>
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap text-right">
                      <span className="text-sm text-slate-900 font-semibold">
                        {req.purchase_requisitions?.total_amount ? `₱${req.purchase_requisitions.total_amount.toLocaleString()}` : 'N/A'}
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
                      <span className="text-sm text-slate-700">
                        {new Date(req.required_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
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
                          onClick={() => handleViewRequest(req)}
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
      </div>

      {showViewModal && viewingRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Canvass Request Details</h3>
                <p className="text-sm text-slate-600 mt-1">{viewingRequest.canvass_number}</p>
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingRequest(null);
                  setViewingPR(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {(viewingRequest.status === 'pending' || viewingRequest.status === 'approved' || viewingRequest.status === 'rejected') && (
                <ApprovalProgressTracker
                  requestType="Canvass"
                  requestId={viewingRequest.id}
                />
              )}

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Canvass Number</label>
                  <p className="text-slate-900 font-mono">{viewingRequest.canvass_number}</p>
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
                  <label className="text-sm font-semibold text-slate-700">Status</label>
                  <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(viewingRequest.status)}`}>
                    {getStatusLabel(viewingRequest.status)}
                  </span>
                </div>
                {viewingRequest.total_amount && (
                  <div>
                    <label className="text-sm font-semibold text-slate-700">Total Amount</label>
                    <p className="text-slate-900 font-bold">₱{viewingRequest.total_amount.toLocaleString()}</p>
                  </div>
                )}
              </div>

              {viewingPR && (
                <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
                  <h4 className="text-lg font-bold text-slate-900 mb-4">
                    Selected Purchase Requisition
                  </h4>

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                      <div>
                        <label className="text-sm font-semibold text-blue-600 block mb-1">Document No.</label>
                        <p className="text-sm text-blue-900 font-mono">{viewingPR.document_no || viewingPR.pr_number}</p>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-blue-600 block mb-1">Company</label>
                        <p className="text-sm text-slate-900">{selectedPRCompany || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-blue-600 block mb-1">Department</label>
                        <p className="text-sm text-slate-900">{viewingPR.department}</p>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-blue-600 block mb-1">Total Amount</label>
                        <p className="text-sm text-blue-900 font-semibold">₱{viewingPR.total_amount?.toLocaleString()}</p>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-blue-600 block mb-1">Request Date</label>
                      <p className="text-sm text-slate-900">{new Date(viewingPR.request_date).toLocaleDateString()}</p>
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-blue-600 block mb-1">Description</label>
                      <p className="text-sm text-slate-900">{viewingPR.description}</p>
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-blue-600 block mb-1">Purpose</label>
                      <p className="text-sm text-slate-900">{viewingPR.purpose}</p>
                    </div>

                    {viewingPR.merged_pdf_path && (
                      <div>
                        <label className="text-sm font-semibold text-blue-600 block mb-2">Merged PDF Document</label>
                        <button
                          onClick={async () => {
                            const { data } = await supabase.storage
                              .from('attachments')
                              .createSignedUrl(viewingPR.merged_pdf_path!, 3600);
                            if (data?.signedUrl) {
                              window.open(data.signedUrl, '_blank');
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                        >
                          <FileText size={18} />
                          View Merged PDF
                        </button>
                      </div>
                    )}

                    {viewingPR.items && viewingPR.items.length > 0 && (
                      <div>
                        <label className="text-sm font-semibold text-blue-600 block mb-2">Items</label>
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <table className="w-full">
                            <thead className="bg-slate-100">
                              <tr>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Item Name</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Description</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Quantity</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Unit</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Unit Price</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Total Amount</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                              {viewingPR.items.map((item: any, index: number) => (
                                <tr key={index}>
                                  <td className="px-4 py-3 text-sm text-slate-900">{item.item_number || item.description}</td>
                                  <td className="px-4 py-3 text-sm text-slate-700">{item.item_description || item.item_notes || '-'}</td>
                                  <td className="px-4 py-3 text-sm text-slate-700">{item.quantity}</td>
                                  <td className="px-4 py-3 text-sm text-slate-700">{item.unit}</td>
                                  <td className="px-4 py-3 text-sm text-slate-700 text-right">₱{item.unit_price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                  <td className="px-4 py-3 text-sm text-slate-900 font-semibold text-right">₱{item.total_price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {viewingRequest.suppliers && viewingRequest.suppliers.length > 0 && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Quotations Summary</label>
                  <div className="space-y-4">
                    {viewingRequest.suppliers.map((supplier: any, index: number) => {
                      if (!supplier.vendor_name || supplier.vendor_name.trim() === '') return null;
                      const isRecommended = viewingRequest.recommended_quotation_index === index;
                      return (
                        <div
                          key={index}
                          className={`border rounded-lg p-4 ${isRecommended ? 'border-green-500 bg-green-50' : 'border-slate-200 bg-white'}`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="font-bold text-slate-900 flex items-center gap-2">
                              Quotation {index + 1}
                              {isRecommended && (
                                <span className="px-2 py-1 bg-green-600 text-white text-xs rounded-full">Recommended</span>
                              )}
                            </h5>
                            <span className="text-lg font-bold text-blue-600">₱{supplier.net_payable?.toLocaleString() || '0'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <label className="text-xs font-semibold text-slate-600">Vendor</label>
                              <p className="text-slate-900">{supplier.vendor_name}</p>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-slate-600">Registered Name</label>
                              <p className="text-slate-900">{supplier.registered_name || 'N/A'}</p>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-slate-600">Contact Person</label>
                              <p className="text-slate-900">{supplier.contact_person || 'N/A'}</p>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-slate-600">Contact Number</label>
                              <p className="text-slate-900">{supplier.contact_no || 'N/A'}</p>
                            </div>
                            <div className="col-span-2">
                              <label className="text-xs font-semibold text-slate-600">Address</label>
                              <p className="text-slate-900 text-xs">{supplier.complete_address || 'N/A'}</p>
                            </div>
                          </div>

                          {/* Items Table */}
                          {supplier.items && supplier.items.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-200">
                              <label className="text-xs font-semibold text-slate-600 mb-2 block">Items</label>
                              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-50">
                                    <tr>
                                      <th className="px-2 py-2 text-left text-xs font-semibold text-slate-700">Description</th>
                                      <th className="px-2 py-2 text-center text-xs font-semibold text-slate-700">Qty</th>
                                      <th className="px-2 py-2 text-center text-xs font-semibold text-slate-700">UOM</th>
                                      <th className="px-2 py-2 text-right text-xs font-semibold text-slate-700">Unit Price</th>
                                      <th className="px-2 py-2 text-right text-xs font-semibold text-slate-700">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {supplier.items.map((item: any, itemIdx: number) => (
                                      <tr key={itemIdx}>
                                        <td className="px-2 py-2">{item.description}</td>
                                        <td className="px-2 py-2 text-center">{item.quantity}</td>
                                        <td className="px-2 py-2 text-center">{item.uom}</td>
                                        <td className="px-2 py-2 text-right">₱{item.unit_price?.toFixed(2)}</td>
                                        <td className="px-2 py-2 text-right font-semibold">₱{item.amount?.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                                    <tr>
                                      <td colSpan={4} className="px-2 py-2 text-right font-bold text-slate-900">Total:</td>
                                      <td className="px-2 py-2 text-right font-bold text-blue-600">₱{supplier.quoted_amount?.toFixed(2) || '0.00'}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                          )}

                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                              <div>
                                <label className="text-xs font-semibold text-slate-600">Quoted Amount</label>
                                <p className="text-slate-900">₱{supplier.quoted_amount?.toLocaleString()}</p>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600">Delivery Fee</label>
                                <p className="text-slate-900">₱{supplier.delivery_fee?.toLocaleString() || '0'}</p>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600">Discounted Price</label>
                                <p className="text-slate-900">₱{supplier.discounted_price?.toLocaleString() || '0'}</p>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600">Net of VAT</label>
                                <p className="text-slate-900">₱{supplier.net_of_vat?.toLocaleString() || '0'}</p>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600">VAT (12%)</label>
                                <p className="text-slate-900">₱{supplier.vat_12?.toLocaleString() || '0'}</p>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600">EWT</label>
                                <p className="text-slate-900">₱{supplier.ewt?.toLocaleString() || '0'}</p>
                              </div>
                            </div>
                            <div className="mt-2 flex gap-2 flex-wrap">
                              {supplier.invoice_availability && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Invoice Available</span>
                              )}
                              {supplier.delivery && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Delivery</span>
                              )}
                              {supplier.installation && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Installation</span>
                              )}
                              {supplier.vatable && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">VATable</span>
                              )}
                              {supplier.withholding_tax && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">Withholding Tax</span>
                              )}
                              {supplier.is_service && (
                                <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">Service</span>
                              )}
                              {supplier.is_item && (
                                <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">Item</span>
                              )}
                            </div>
                            {(supplier.quotation_file_path || (supplier as any).quotation_file_path) && (
                              <div className="mt-3 pt-3 border-t border-slate-200">
                                <button
                                  onClick={async () => {
                                    console.log('Supplier data:', supplier);
                                    const filePath = supplier.quotation_file_path || (supplier as any).quotation_file_path;
                                    console.log('File path:', filePath);
                                    const { data, error } = await supabase.storage
                                      .from('attachments')
                                      .createSignedUrl(filePath, 60);
                                    if (error) {
                                      console.error('Error creating signed URL:', error);
                                      alert('Error loading file: ' + error.message);
                                      return;
                                    }
                                    if (data?.signedUrl) {
                                      window.open(data.signedUrl, '_blank');
                                    }
                                  }}
                                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                                >
                                  <FileText size={16} />
                                  View Quotation File
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {viewingRequest.recommendation_remarks && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <label className="text-sm font-semibold text-slate-700 mb-2 block">Recommendation Remarks</label>
                  <p className="text-sm text-slate-900">{viewingRequest.recommendation_remarks}</p>
                </div>
              )}

              {viewingRequest.status === 'approved' && viewingRequest.rfp_pdf_path && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Canvass Sheet & RFP Document</label>
                  <div className="flex gap-3">
                    <button
                      onClick={async () => {
                        try {
                          const { data, error } = await supabase.storage
                            .from('attachments')
                            .createSignedUrl(viewingRequest.rfp_pdf_path!, 60);
                          if (error) {
                            console.error('Error creating signed URL:', error);
                            alert('Error loading document: ' + error.message);
                            return;
                          }
                          if (data?.signedUrl) {
                            window.open(data.signedUrl, '_blank');
                          }
                        } catch (error) {
                          console.error('Error viewing document:', error);
                          alert('Error viewing document');
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      <Eye size={16} />
                      View Document
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const { data, error } = await supabase.storage
                            .from('attachments')
                            .download(viewingRequest.rfp_pdf_path!);
                          if (error) {
                            console.error('Error downloading document:', error);
                            alert('Error downloading document: ' + error.message);
                            return;
                          }
                          if (data) {
                            const url = URL.createObjectURL(data);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${viewingRequest.canvass_number}_document.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }
                        } catch (error) {
                          console.error('Error downloading document:', error);
                          alert('Error downloading document');
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                    >
                      <FileText size={16} />
                      Download Document
                    </button>
                  </div>
                </div>
              )}

              {viewingRequest.status === 'approved' && !viewingRequest.rfp_pdf_path && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <label className="text-sm font-semibold text-slate-700 mb-3 block">Canvass Sheet & RFP Document</label>
                  <p className="text-sm text-amber-800 mb-3">The CVS and RFP document was not generated during approval. Click below to generate it now.</p>
                  <button
                    onClick={async () => {
                      try {
                        setLoading(true);
                        await generateAndUploadCanvassRFP(viewingRequest.id, viewingRequest.canvass_number);
                        alert('CVS and RFP document generated successfully!');
                        loadRequests();
                        setShowViewModal(false);
                      } catch (error: any) {
                        console.error('Error generating CVS and RFP:', error);
                        alert('Error generating CVS and RFP: ' + error.message);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                    {loading ? 'Generating...' : 'Generate CVS and RFP'}
                  </button>
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
                {viewingRequest.status === 'returned_to_maker' && (
                  <button
                    onClick={() => handleEditDraft(viewingRequest)}
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                  >
                    <Edit size={18} />
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
                {viewingRequest.status === 'approved' && viewingRequest.rfp_pdf_path && (
                  <>
                    <button
                      onClick={() => downloadRFP(viewingRequest.rfp_pdf_path!, viewingRequest.canvass_number)}
                      className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      <Download size={18} />
                      Download CVS & RFP
                    </button>
                    {profile?.role === 'admin' && (
                      <button
                        onClick={() => handleRepostToMSBC(viewingRequest)}
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send size={18} />
                        Repost to MSBC
                      </button>
                    )}
                  </>
                )}
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingRequest(null);
                  setViewingPR(null);
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
        columns={canvassFilterColumns}
        values={filterValues}
        onApply={(vals) => { setFilterValues(vals); setCurrentPage(1); }}
      />

      <ExportModal
        isOpen={showExportModal}
        onClose={() => { setShowExportModal(false); setExporting(false); }}
        columns={canvassFilterColumns}
        onExport={handleExport}
        exporting={exporting}
      />
    </div>
  );
}

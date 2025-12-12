import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Save, Send, Eye, FileText, X, Edit, Loader2 } from 'lucide-react';
import { getApprovalFlow, createApprovalLedgerEntry, sendApprovalEmail, getApproverEmail } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';
import { PDFDocument } from 'pdf-lib';
import { generateAndUploadCanvassRFP } from '../../lib/rfpGenerator';

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
  department?: string;
  items?: any[];
  suppliers?: any[];
  recommended_quotation_index?: number | null;
  recommendation_remarks?: string | null;
  rfp_pdf_path?: string | null;
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
}

interface QuotationItem {
  description: string;
  quantity: number;
  uom: string;
  unit_price: number;
  amount: number;
}

interface QuotationForm {
  vendor_name: string;
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
      return calculateQuotationValues({
        ...quotation,
        items: newItems
      });
    });
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

  useEffect(() => {
    loadRequests();
    loadCompanies();
  }, []);

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
    const { data } = await supabase
      .from('companies')
      .select('id, name')
      .order('name');
    setCompanies(data || []);
  };

  const loadAvailablePRs = async () => {
    const { data } = await supabase
      .from('purchase_requisitions')
      .select('*')
      .eq('ready_for_canvass', true)
      .eq('status', 'approved')
      .is('canvass_id', null)
      .order('created_at', { ascending: false });

    setAvailablePRs(data || []);
  };

  const generateDocumentNo = async () => {
    try {
      const { data, error } = await supabase.rpc('get_next_number', {
        p_series_name: 'Canvass'
      });
      if (error) throw error;
      setFormData(prev => ({ ...prev, document_no: data }));
    } catch (error) {
      console.error('Error generating document number:', error);
    }
  };

  const loadRequests = async () => {
    const { data } = await supabase
      .from('canvass_requests')
      .select('*')
      .eq('requester_id', profile?.id)
      .order('created_at', { ascending: false });
    setRequests(data || []);
  };

  const handleViewRequest = async (request: CanvassReq) => {
    setViewingRequest(request);
    setShowViewModal(true);
    setViewingPR(null);

    // Fetch full canvass details including PR if pr_id exists
    if (request.pr_id) {
      try {
        const { data: prData, error: prError } = await supabase
          .from('purchase_requisitions')
          .select('*')
          .eq('id', request.pr_id)
          .maybeSingle();

        if (prError) {
          console.error('Error fetching PR:', prError);
        } else if (prData) {
          setViewingPR(prData as PurchaseRequisition);
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

    if (updated.withholding_tax) {
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
    setShowForm(true);
  };

  const handleSubmit = async (status: 'draft' | 'pending') => {
    // Validate quotations for pending submissions
    if (status === 'pending') {
      const filledQuotations = quotations.filter(q => q.vendor_name && q.vendor_name.trim() !== '');

      if (filledQuotations.length === 0) {
        alert('Please add at least one quotation before submitting.');
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
            required_date: formData.required_date,
            items: formData.items,
            status,
            total_amount: totalAmount,
            suppliers: quotationsWithFiles,
            recommended_quotation_index: status === 'pending' ? recommendedQuotationIndex : null,
            recommendation_remarks: status === 'pending' ? recommendationRemarks : null,
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
            company_id: profile?.company_id,
            pr_id: selectedPR?.id || null,
            department: selectedPR?.department || profile?.department || '',
            request_date: new Date().toISOString().split('T')[0],
            required_date: formData.required_date,
            items: formData.items,
            suppliers: quotationsWithFiles,
            status,
            current_approval_level: 0,
            total_amount: totalAmount,
            recommended_quotation_index: status === 'pending' ? recommendedQuotationIndex : null,
            recommendation_remarks: status === 'pending' ? recommendationRemarks : null,
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

      if (status === 'pending' && insertedRequest && profile?.company_id) {
        const department = selectedPR?.department || profile?.department || '';
        const approvalFlows = await getApprovalFlow(
          profile.company_id,
          department,
          'Canvass',
          false,
          totalAmount
        );

        if (approvalFlows.length > 0) {
          await createApprovalLedgerEntry(
            'Canvass',
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
            profile.company_id,
            department
          );

          if (approverInfo) {
            await sendApprovalEmail(
              approverInfo.email,
              approverInfo.name,
              'Canvass',
              formData.document_no,
              profile.full_name || 'Unknown',
              department,
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
      setShowPRSelection(false);
      setSelectedPR(null);
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
    if (!confirm('Are you sure you want to submit this draft for approval?')) {
      return;
    }

    setSubmitting(true);
    setLoading(true);
    try {
      if (!profile?.company_id) {
        throw new Error('Company information not found');
      }

      const approvalFlows = await getApprovalFlow(
        profile.company_id,
        profile.department || '',
        'Canvass',
        false,
        request.total_amount
      );

      if (!approvalFlows || approvalFlows.length === 0) {
        throw new Error('No approval flow configured for this request. Please contact administrator.');
      }

      const { error: updateError } = await supabase
        .from('canvass_requests')
        .update({ status: 'pending', current_approval_level: 0 })
        .eq('id', request.id);

      if (updateError) throw updateError;

      await createApprovalLedgerEntry(
        'Canvass',
        request.id,
        request.canvass_number,
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
        profile.department || ''
      );

      if (approverInfo) {
        await sendApprovalEmail(
          approverInfo.email,
          approverInfo.name,
          'Canvass',
          request.canvass_number,
          profile.full_name || 'Unknown',
          profile.department || '',
          request.total_amount,
          'Submitted',
          undefined,
          undefined,
          firstApprover.approver_type
        );
      }

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

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-slate-100 text-slate-700',
      pending: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return colors[status] || 'bg-slate-100 text-slate-700';
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

  const handlePRSelection = async (pr: PurchaseRequisition) => {
    setSelectedPR(pr);
    setShowPRSelection(false);
    setShowForm(true);
    generateDocumentNo();
    setQuotations([
      createEmptyQuotation(),
      createEmptyQuotation(),
      createEmptyQuotation(),
    ]);
    setSelectedCompanyId('');
    setVendors([]);
  };

  if (showPRSelection) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Select Purchase Requisition</h2>
            <p className="text-sm text-slate-600 mt-1">Choose a PR that is ready for canvass</p>
          </div>
          <button
            onClick={() => setShowPRSelection(false)}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            Cancel
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Document No.</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Department</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Request Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {availablePRs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    No purchase requisitions ready for canvass
                  </td>
                </tr>
              ) : (
                availablePRs.map((pr) => (
                  <tr key={pr.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-mono font-medium text-slate-900">
                      {pr.document_no || pr.pr_number}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">{pr.description}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{pr.department}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {new Date(pr.request_date).toLocaleDateString()}
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
    );
  }

  if (showForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">New Canvass Request</h2>
          <button
            onClick={() => {
              setShowForm(false);
              setSelectedPR(null);
              setVendors([]);
              setQuotations([
                createEmptyQuotation(),
                createEmptyQuotation(),
                createEmptyQuotation(),
              ]);
            }}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            Cancel
          </button>
        </div>

        {selectedPR && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h3 className="text-lg font-bold text-blue-900 mb-4">Selected Purchase Requisition</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="font-semibold text-blue-700">Document No.</label>
                  <p className="text-blue-900 font-mono">{selectedPR.document_no || selectedPR.pr_number}</p>
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
                <div className="col-span-2">
                  <label className="font-semibold text-blue-700">Description</label>
                  <p className="text-blue-900">{selectedPR.description}</p>
                </div>
                <div className="col-span-2">
                  <label className="font-semibold text-blue-700">Purpose</label>
                  <p className="text-blue-900">{selectedPR.purpose}</p>
                </div>
              </div>

              {selectedPR.merged_pdf_path && (
                <div className="mt-4">
                  <label className="font-semibold text-blue-700 block mb-2">Merged PDF Document</label>
                  <button
                    onClick={() => previewMergedPDF(selectedPR.merged_pdf_path!)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
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
                      <table className="w-full text-sm">
                        <thead className="bg-blue-100">
                          <tr>
                            <th className="px-3 py-2 text-left text-blue-900">Item Name</th>
                            <th className="px-3 py-2 text-left text-blue-900">Description</th>
                            <th className="px-3 py-2 text-left text-blue-900">Quantity</th>
                            <th className="px-3 py-2 text-left text-blue-900">Unit</th>
                            <th className="px-3 py-2 text-left text-blue-900">Unit Price</th>
                            <th className="px-3 py-2 text-left text-blue-900">Total Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-100">
                          {validItems.map((item: any, index: number) => (
                            <tr key={index}>
                              <td className="px-3 py-2 text-slate-900">{item.item_description || item.description || 'N/A'}</td>
                              <td className="px-3 py-2 text-slate-700">{item.item_notes || '-'}</td>
                              <td className="px-3 py-2 text-slate-700">{item.quantity}</td>
                              <td className="px-3 py-2 text-slate-700">{item.unit}</td>
                              <td className="px-3 py-2 text-slate-700">₱{item.unit_price?.toFixed(2) || '0.00'}</td>
                              <td className="px-3 py-2 text-slate-900 font-semibold">₱{item.total_price?.toFixed(2) || '0.00'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Canvass Document No.</label>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg">
                  <FileText size={18} className="text-slate-400" />
                  <span className="font-mono font-semibold text-slate-900">{formData.document_no}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Required Date</label>
                <input
                  type="date"
                  value={formData.required_date}
                  onChange={(e) => setFormData({ ...formData, required_date: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company *</label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => {
                    setSelectedCompanyId(e.target.value);
                    if (e.target.value) {
                      fetchVendors(e.target.value);
                    } else {
                      setVendors([]);
                    }
                  }}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                >
                  <option value="">Select a company</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900">Quotations (atleast 1)</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setQuotations(addItemToAllQuotations(quotations));
                    }}
                    className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                  >
                    <Plus size={16} />
                    Add Item Row to All Quotations
                  </button>
                </div>
                {loadingVendors && (
                  <div className="flex items-center gap-2 mb-4 text-blue-600">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-sm">Loading vendors...</span>
                  </div>
                )}
                <div className="space-y-6">
                  {quotations.map((quotation, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                      <h4 className="font-semibold text-slate-900 text-base text-center border-b pb-2">Quotation {idx + 1}</h4>

                      <div className="space-y-3">
                        <div className="relative vendor-dropdown-container">
                          <label className="block text-sm font-medium text-slate-700 mb-1">Vendor Name *</label>
                          <input
                            type="text"
                            value={vendorSearchTerm[idx] !== undefined ? vendorSearchTerm[idx] : quotation.vendor_name}
                            onChange={(e) => {
                              setVendorSearchTerm({ ...vendorSearchTerm, [idx]: e.target.value });
                              setShowVendorDropdown({ ...showVendorDropdown, [idx]: true });
                            }}
                            onFocus={() => setShowVendorDropdown({ ...showVendorDropdown, [idx]: true })}
                            placeholder="Search vendors..."
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                          {showVendorDropdown[idx] && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                              {vendors
                                .filter((vendor) =>
                                  vendor.displayName.toLowerCase().includes((vendorSearchTerm[idx] || '').toLowerCase()) ||
                                  vendor.number.toLowerCase().includes((vendorSearchTerm[idx] || '').toLowerCase())
                                )
                                .map((vendor) => (
                                  <div
                                    key={vendor.number}
                                    className="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-b-0"
                                    onClick={() => {
                                      const newQuotations = [...quotations];
                                      newQuotations[idx].vendor_name = vendor.displayName;
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
                                    <div className="font-semibold text-slate-900">{vendor.displayName}</div>
                                    <div className="text-sm text-slate-500">{vendor.number}</div>
                                  </div>
                                ))}
                              {vendors.filter((vendor) =>
                                vendor.displayName.toLowerCase().includes((vendorSearchTerm[idx] || '').toLowerCase()) ||
                                vendor.number.toLowerCase().includes((vendorSearchTerm[idx] || '').toLowerCase())
                              ).length === 0 && (
                                <div className="px-4 py-3 text-sm text-slate-500">No vendors found</div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Itemization Table */}
                        <div className="border-t pt-4 mt-4">
                          <label className="block text-sm font-medium text-slate-700 mb-2">Items</label>

                          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-100">
                                <tr>
                                  <th className="px-2 py-2 text-left text-xs font-semibold text-slate-700">Description</th>
                                  <th className="px-2 py-2 text-left text-xs font-semibold text-slate-700 w-20">Qty</th>
                                  <th className="px-2 py-2 text-left text-xs font-semibold text-slate-700 w-20">UOM</th>
                                  <th className="px-2 py-2 text-left text-xs font-semibold text-slate-700 w-28">Unit Price</th>
                                  <th className="px-2 py-2 text-right text-xs font-semibold text-slate-700 w-28">Amount</th>
                                  <th className="px-2 py-2 w-10"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {quotation.items.map((item, itemIdx) => (
                                  <tr key={itemIdx}>
                                    <td className="px-2 py-2">
                                      <input
                                        type="text"
                                        value={item.description}
                                        onChange={(e) => {
                                          setQuotations(updateSharedItemField(quotations, itemIdx, 'description', e.target.value));
                                        }}
                                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                        placeholder="Item description"
                                      />
                                    </td>
                                    <td className="px-2 py-2">
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
                                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                      />
                                    </td>
                                    <td className="px-2 py-2">
                                      <input
                                        type="text"
                                        value={item.uom}
                                        onChange={(e) => {
                                          setQuotations(updateSharedItemField(quotations, itemIdx, 'uom', e.target.value));
                                        }}
                                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                        placeholder="pcs"
                                      />
                                    </td>
                                    <td className="px-2 py-2">
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
                                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                      />
                                    </td>
                                    <td className="px-2 py-2 text-right font-semibold text-slate-900">
                                      ₱{item.amount.toFixed(2)}
                                    </td>
                                    <td className="px-2 py-2">
                                      {quotation.items.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setQuotations(removeItemFromAllQuotations(quotations, itemIdx));
                                          }}
                                          className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                                          title="Remove this item row from all quotations"
                                        >
                                          <X size={14} />
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                                <tr>
                                  <td colSpan={4} className="px-2 py-2 text-right font-bold text-slate-900">
                                    Total:
                                  </td>
                                  <td className="px-2 py-2 text-right font-bold text-blue-600">
                                    ₱{quotation.quoted_amount.toFixed(2)}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>

                          {/* Add Item Button */}
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => setQuotations(addItemToAllQuotations(quotations))}
                              className="w-full px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition flex items-center justify-center gap-2 font-medium"
                            >
                              <Plus size={16} />
                              Add Item
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={quotation.invoice_availability}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].invoice_availability = e.target.checked;
                                setQuotations(newQuotations);
                              }}
                              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <label className="text-sm font-medium text-slate-700">Invoice Availability</label>
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
                              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <label className="text-sm font-medium text-slate-700">Delivery</label>
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
                              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <label className="text-sm font-medium text-slate-700">Installation</label>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Delivery Fee</label>
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
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Total (Quoted + Delivery)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.total || ''}
                            readOnly
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-700"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Discounted Price</label>
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
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Price</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.purchase_price || ''}
                            readOnly
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-700"
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-4">
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
                                }
                                newQuotations[idx] = calculateQuotationValues(newQuotations[idx]);
                                setQuotations(newQuotations);
                              }}
                              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <label className="text-sm font-medium text-slate-700">Withholding Tax</label>
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
                              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <label className="text-sm font-medium text-slate-700">Vatable</label>
                          </div>
                        </div>

                        {quotation.withholding_tax && (
                          <div className="flex items-center gap-4 ml-6">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={quotation.is_service}
                                onChange={(e) => {
                                  const newQuotations = [...quotations];
                                  newQuotations[idx].is_service = e.target.checked;
                                  if (e.target.checked) {
                                    newQuotations[idx].is_item = false;
                                  }
                                  newQuotations[idx] = calculateQuotationValues(newQuotations[idx]);
                                  setQuotations(newQuotations);
                                }}
                                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                              />
                              <label className="text-sm font-medium text-slate-700">Service</label>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={quotation.is_item}
                                onChange={(e) => {
                                  const newQuotations = [...quotations];
                                  newQuotations[idx].is_item = e.target.checked;
                                  if (e.target.checked) {
                                    newQuotations[idx].is_service = false;
                                  }
                                  newQuotations[idx] = calculateQuotationValues(newQuotations[idx]);
                                  setQuotations(newQuotations);
                                }}
                                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                              />
                              <label className="text-sm font-medium text-slate-700">Item</label>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Net of VAT</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.net_of_vat || ''}
                            readOnly
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-700"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">VAT 12%</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.vat_12 || ''}
                            readOnly
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-700"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">EWT</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.ewt || ''}
                            readOnly
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-700"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Net Payable</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.net_payable || ''}
                            readOnly
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-700"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Quotation File (1 file only)
                          <span className="block text-xs text-slate-500 mt-0.5">PDF or Image (will be converted to PDF)</span>
                        </label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.svg"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            const newQuotations = [...quotations];
                            newQuotations[idx].quotation_file = file;
                            setQuotations(newQuotations);
                          }}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                        {quotation.quotation_file && (
                          <p className="text-xs text-slate-600 mt-1">
                            Selected: {quotation.quotation_file.name}
                            {quotation.quotation_file.type.startsWith('image/') && (
                              <span className="text-blue-600"> (will be converted to PDF)</span>
                            )}
                          </p>
                        )}
                      </div>

                      <div className="border-t pt-4 mt-4">
                        <h5 className="font-semibold text-slate-900 mb-3">Vendor Details</h5>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Registered Name</label>
                            <input
                              type="text"
                              value={quotation.registered_name}
                              readOnly
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">TIN</label>
                            <input
                              type="text"
                              value={quotation.tin}
                              readOnly
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Complete Address</label>
                            <textarea
                              value={quotation.complete_address}
                              readOnly
                              rows={2}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person</label>
                            <input
                              type="text"
                              value={quotation.contact_person}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].contact_person = e.target.value;
                                setQuotations(newQuotations);
                              }}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Contact No.</label>
                            <input
                              type="text"
                              value={quotation.contact_no}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].contact_no = e.target.value;
                                setQuotations(newQuotations);
                              }}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                            <input
                              type="email"
                              value={quotation.email_address}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].email_address = e.target.value;
                                setQuotations(newQuotations);
                              }}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Bank Account No.</label>
                            <input
                              type="text"
                              value={quotation.bank_account_no}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].bank_account_no = e.target.value;
                                setQuotations(newQuotations);
                              }}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Depository Bank</label>
                            <input
                              type="text"
                              value={quotation.depository_bank}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].depository_bank = e.target.value;
                                setQuotations(newQuotations);
                              }}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Other Information</label>
                            <textarea
                              value={quotation.other_information}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].other_information = e.target.value;
                                setQuotations(newQuotations);
                              }}
                              rows={2}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendation Section */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h4 className="text-lg font-bold text-slate-900 mb-4">Recommended Quotation</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Select Recommended Quotation <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-2">
                      {quotations.map((quotation, idx) => (
                        quotation.vendor_name && quotation.vendor_name.trim() !== '' && (
                          <div key={idx} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200">
                            <input
                              type="radio"
                              id={`quotation-${idx}`}
                              name="recommended-quotation"
                              checked={recommendedQuotationIndex === idx}
                              onChange={() => setRecommendedQuotationIndex(idx)}
                              className="mt-1 w-4 h-4 text-blue-600 border-slate-300 focus:ring-2 focus:ring-blue-500"
                            />
                            <label htmlFor={`quotation-${idx}`} className="flex-1 cursor-pointer">
                              <div className="font-semibold text-slate-900">Quotation {idx + 1}: {quotation.vendor_name}</div>
                              <div className="text-sm text-slate-600 mt-1">
                                Net Payable: ₱{quotation.net_payable.toFixed(2)} |
                                Quoted Amount: ₱{quotation.quoted_amount.toFixed(2)} |
                                Items: {quotation.items.length}
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
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t">
                <button
                  onClick={() => handleSubmit('draft')}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingDraft ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {savingDraft ? 'Saving...' : 'Save as Draft'}
                </button>
                <button
                  onClick={() => handleSubmit('pending')}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Canvass Requests</h2>
        <button
          onClick={() => {
            loadAvailablePRs();
            setShowPRSelection(true);
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
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Canvass Number</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Required Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {requests.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">No canvass requests found</td>
              </tr>
            ) : (
              requests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{req.canvass_number}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{new Date(req.request_date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{new Date(req.required_date).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(req.status)}`}>{req.status}</span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => handleViewRequest(req)}
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
                    {viewingRequest.status}
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
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <h4 className="text-base font-bold text-slate-900 border-b border-blue-200 pb-2">
                    Purchase Requisition Details
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-600">PR Number</label>
                      <p className="text-sm text-slate-900 font-mono">{viewingPR.pr_number}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Request Type</label>
                      <p className="text-sm text-slate-900">{viewingPR.request_type || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Line Name</label>
                      <p className="text-sm text-slate-900">{viewingPR.line_name || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Budgeted</label>
                      <p className="text-sm text-slate-900">{viewingPR.is_budgeted ? 'Yes' : 'No'}</p>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-slate-600">Purpose</label>
                      <p className="text-sm text-slate-900">{viewingPR.purpose}</p>
                    </div>
                  </div>

                  {viewingPR.items && viewingPR.items.length > 0 && (
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-2 block">PR Items</label>
                      <div className="border border-blue-200 rounded-lg overflow-hidden bg-white">
                        <table className="w-full">
                          <thead className="bg-blue-100">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700">Description</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700">Quantity</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700">Unit</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-700">Unit Price</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-700">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-blue-100">
                            {viewingPR.items.map((item: any, index: number) => (
                              <tr key={index}>
                                <td className="px-3 py-2 text-xs text-slate-900">{item.description}</td>
                                <td className="px-3 py-2 text-xs text-slate-700">{item.quantity}</td>
                                <td className="px-3 py-2 text-xs text-slate-700">{item.unit}</td>
                                <td className="px-3 py-2 text-xs text-slate-700 text-right">₱{item.unit_price?.toLocaleString()}</td>
                                <td className="px-3 py-2 text-xs text-slate-900 font-semibold text-right">₱{item.total_price?.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
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
    </div>
  );
}

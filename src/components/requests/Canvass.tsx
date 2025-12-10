import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Save, Send, Eye, FileText, X, Edit, Loader2 } from 'lucide-react';
import { getApprovalFlow, createApprovalLedgerEntry, sendApprovalEmail, getApproverEmail } from '../../lib/approvalFlow';
import { ApprovalProgressTracker } from '../ApprovalProgressTracker';

interface CanvassReq {
  id: string;
  canvass_number: string;
  request_date: string;
  required_date: string;
  status: string;
  total_amount: number;
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
  items: any[];
  merged_pdf_path: string | null;
  ready_for_canvass: boolean;
}

interface QuotationForm {
  vendor_name: string;
  quantity: number;
  unit_name: string;
  unit_price: number;
  quoted_amount: number;
  invoice_availability: boolean;
  delivery: boolean;
  installation: boolean;
  delivery_fee: number;
  total: number;
  discounted_price: number;
  purchase_price: number;
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
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [vendorSearchTerm, setVendorSearchTerm] = useState<{ [key: number]: string }>({});
  const [showVendorDropdown, setShowVendorDropdown] = useState<{ [key: number]: boolean }>({});
  const [formData, setFormData] = useState({
    document_no: '',
    required_date: '',
    items: [{ description: '', quantity: 1, unit: 'pcs' }],
  });

  const createEmptyQuotation = (): QuotationForm => ({
    vendor_name: '',
    quantity: 0,
    unit_name: '',
    unit_price: 0,
    quoted_amount: 0,
    invoice_availability: false,
    delivery: false,
    installation: false,
    delivery_fee: 0,
    total: 0,
    discounted_price: 0,
    purchase_price: 0,
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

  const [quotations, setQuotations] = useState<QuotationForm[]>([
    createEmptyQuotation(),
    createEmptyQuotation(),
    createEmptyQuotation(),
  ]);

  useEffect(() => {
    loadRequests();
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

  const loadAvailablePRs = async () => {
    const { data } = await supabase
      .from('purchase_requisitions')
      .select('*')
      .eq('ready_for_canvass', true)
      .eq('status', 'approved')
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

  const generateNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `CV-${year}${month}-${random}`;
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
    setShowForm(true);
  };

  const handleSubmit = async (status: 'draft' | 'pending') => {
    if (status === 'draft') {
      setSavingDraft(true);
    } else {
      setSubmitting(true);
    }
    setLoading(true);
    try {
      const totalAmount = 0;

      let insertedRequest;

      if (editingRequest) {
        const { data, error } = await supabase
          .from('canvass_requests')
          .update({
            required_date: formData.required_date,
            items: formData.items,
            status,
            total_amount: totalAmount,
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
            department: profile?.department || '',
            request_date: new Date().toISOString().split('T')[0],
            required_date: formData.required_date,
            items: formData.items,
            status,
            current_approval_level: 0,
            total_amount: totalAmount,
          })
          .select()
          .single();

        if (error) throw error;
        insertedRequest = data;
      }

      if (status === 'pending' && insertedRequest && profile?.company_id) {
        const approvalFlows = await getApprovalFlow(
          profile.company_id,
          profile.department || '',
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
            profile.department || ''
          );

          if (approverInfo) {
            await sendApprovalEmail(
              approverInfo.email,
              approverInfo.name,
              'Canvass',
              formData.document_no,
              profile.full_name || 'Unknown',
              profile.department || '',
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
      setFormData({ document_no: '', required_date: '', items: [{ description: '', quantity: 1, unit: 'pcs' }] });
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Session expired. Please log in again.');
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-vendors?company_id=${companyId}`;
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch vendors');
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

    const { data: prData } = await supabase
      .from('purchase_requisitions')
      .select('company_id')
      .eq('id', pr.id)
      .maybeSingle();

    if (prData?.company_id) {
      await fetchVendors(prData.company_id);
    }
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

              {selectedPR.items && selectedPR.items.length > 0 && (
                <div className="mt-4">
                  <label className="font-semibold text-blue-700 block mb-2">Items</label>
                  <div className="bg-white border border-blue-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-blue-100">
                        <tr>
                          <th className="px-3 py-2 text-left text-blue-900">Description</th>
                          <th className="px-3 py-2 text-left text-blue-900">Quantity</th>
                          <th className="px-3 py-2 text-left text-blue-900">Unit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-blue-100">
                        {selectedPR.items.map((item: any, index: number) => (
                          <tr key={index}>
                            <td className="px-3 py-2 text-slate-900">{item.item_description || item.description}</td>
                            <td className="px-3 py-2 text-slate-700">{item.quantity}</td>
                            <td className="px-3 py-2 text-slate-700">{item.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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

              <div className="border-t pt-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Quotations (3 Required)</h3>
                {loadingVendors && (
                  <div className="flex items-center gap-2 mb-4 text-blue-600">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-sm">Loading vendors...</span>
                  </div>
                )}
                <div className="space-y-6">
                  {quotations.map((quotation, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
                      <h4 className="font-semibold text-slate-900 text-lg">Quotation {idx + 1}</h4>

                      <div className="grid grid-cols-3 gap-3">
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
                                      newQuotations[idx].contact_no = vendor.phoneNumber;
                                      newQuotations[idx].email_address = vendor.email;
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
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                          <input
                            type="number"
                            value={quotation.quantity || ''}
                            onChange={(e) => {
                              const newQuotations = [...quotations];
                              newQuotations[idx].quantity = Number(e.target.value);
                              setQuotations(newQuotations);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Unit Name/Symbol</label>
                          <input
                            type="text"
                            value={quotation.unit_name}
                            onChange={(e) => {
                              const newQuotations = [...quotations];
                              newQuotations[idx].unit_name = e.target.value;
                              setQuotations(newQuotations);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Unit Price</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.unit_price || ''}
                            onChange={(e) => {
                              const newQuotations = [...quotations];
                              newQuotations[idx].unit_price = Number(e.target.value);
                              setQuotations(newQuotations);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Quoted Amount</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.quoted_amount || ''}
                            onChange={(e) => {
                              const newQuotations = [...quotations];
                              newQuotations[idx].quoted_amount = Number(e.target.value);
                              newQuotations[idx].total = newQuotations[idx].quoted_amount + newQuotations[idx].delivery_fee;
                              setQuotations(newQuotations);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
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
                              newQuotations[idx].total = newQuotations[idx].quoted_amount + newQuotations[idx].delivery_fee;
                              setQuotations(newQuotations);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
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
                            onChange={(e) => {
                              const newQuotations = [...quotations];
                              newQuotations[idx].purchase_price = Number(e.target.value);
                              setQuotations(newQuotations);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Net of VAT</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.net_of_vat || ''}
                            onChange={(e) => {
                              const newQuotations = [...quotations];
                              newQuotations[idx].net_of_vat = Number(e.target.value);
                              setQuotations(newQuotations);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">VAT 12%</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.vat_12 || ''}
                            onChange={(e) => {
                              const newQuotations = [...quotations];
                              newQuotations[idx].vat_12 = Number(e.target.value);
                              setQuotations(newQuotations);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">EWT</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.ewt || ''}
                            onChange={(e) => {
                              const newQuotations = [...quotations];
                              newQuotations[idx].ewt = Number(e.target.value);
                              setQuotations(newQuotations);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Net Payable</label>
                          <input
                            type="number"
                            step="0.01"
                            value={quotation.net_payable || ''}
                            onChange={(e) => {
                              const newQuotations = [...quotations];
                              newQuotations[idx].net_payable = Number(e.target.value);
                              setQuotations(newQuotations);
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
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

                      <div className="border-t pt-4 mt-4">
                        <h5 className="font-semibold text-slate-900 mb-3">Vendor Details</h5>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Registered Name</label>
                            <input
                              type="text"
                              value={quotation.registered_name}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].registered_name = e.target.value;
                                setQuotations(newQuotations);
                              }}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">TIN</label>
                            <input
                              type="text"
                              value={quotation.tin}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].tin = e.target.value;
                                setQuotations(newQuotations);
                              }}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Complete Address</label>
                            <textarea
                              value={quotation.complete_address}
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].complete_address = e.target.value;
                                setQuotations(newQuotations);
                              }}
                              rows={2}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
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
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Quotation File</label>
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => {
                                const newQuotations = [...quotations];
                                newQuotations[idx].quotation_file = e.target.files?.[0] || null;
                                setQuotations(newQuotations);
                              }}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
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
                <h3 className="text-xl font-bold text-slate-900">Canvass Request Details</h3>
                <p className="text-sm text-slate-600 mt-1">{viewingRequest.canvass_number}</p>
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
              </div>
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

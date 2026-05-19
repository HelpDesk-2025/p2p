import { supabase } from './supabase';
import { generatePurchaseOrderPdf } from './poPdfGenerator';
import { generateRFP, generateCanvassSheet, sanitizeForPDF, RFPData, CanvassSheetData } from './rfpGenerator';
import { mergePDFBytes } from './pdfMerger';

export async function generateAndUploadPOMergedPdf(
  po: {
    id: string;
    po_number: string;
    vendor_name: string;
    vendor_address: string;
    vendor_contact: string;
    vendor_email: string;
    vendor_tin: string;
    department: string;
    po_date: string;
    expected_delivery_date: string | null;
    delivery_address: string;
    payment_terms: string;
    delivery_terms: string;
    remarks: string;
    subtotal: number;
    vat_amount: number;
    total_amount: number;
    canvass_request_id: string | null;
    company_id?: string | null;
    prepared_by?: string | null;
  },
  items: Array<{
    item_description: string;
    unit_of_measure: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>
): Promise<string> {
  // Fetch signatories from actual approval records
  let approverName: string | undefined;
  let approverEsig: string | null | undefined;
  let preparedByName: string | undefined;
  let preparedByEsig: string | null | undefined;

  // Get actual approval records for this PO (who actually approved it)
  const { data: poApprovalData } = await supabase
    .rpc('get_approval_records_with_signatures', {
      p_request_id: po.id,
      p_request_type: 'Purchase Order',
      p_requester_id: po.prepared_by || undefined,
    });

  const poApprovalRecords = Array.isArray(poApprovalData) ? poApprovalData : [];

  if (poApprovalRecords.length > 0) {
    // Last non-checker record is the final approver ("Approved By")
    const lastApprover = [...poApprovalRecords]
      .filter((r: any) => !r.for_checking)
      .sort((a: any, b: any) => (b.sequence || 0) - (a.sequence || 0))[0];

    if (lastApprover) {
      approverName = lastApprover.approver_name || undefined;
      if (lastApprover.approver_esig) {
        if (lastApprover.approver_esig.startsWith('data:image')) {
          approverEsig = lastApprover.approver_esig;
        } else {
          const { data: sigFile } = await supabase.storage
            .from('attachments')
            .download(lastApprover.approver_esig);
          if (sigFile) {
            const arrayBuffer = await sigFile.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            approverEsig = `data:${sigFile.type};base64,${base64}`;
          }
        }
      }
    }
  }

  // Fetch prepared by user info
  if (po.prepared_by) {
    const { data: prepProfile } = await supabase
      .from('user_profiles')
      .select('full_name, e_sig, signature_path')
      .eq('id', po.prepared_by)
      .maybeSingle();

    if (prepProfile) {
      preparedByName = prepProfile.full_name || undefined;
      if (prepProfile.signature_path) {
        if (prepProfile.signature_path.startsWith('data:image')) {
          preparedByEsig = prepProfile.signature_path;
        } else {
          const { data: sigFile } = await supabase.storage
            .from('attachments')
            .download(prepProfile.signature_path);
          if (sigFile) {
            const arrayBuffer = await sigFile.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            preparedByEsig = `data:${sigFile.type};base64,${base64}`;
          }
        }
      } else if (prepProfile.e_sig) {
        preparedByEsig = prepProfile.e_sig;
      }
    }
  }

  // 1. Generate PO Form PDF
  const ewtTotal = items.reduce((sum, it) => sum + Number((it as any).ewt_amount || 0), 0);
  const poFormBlob = await generatePurchaseOrderPdf(
    {
      po_number: po.po_number,
      vendor_name: po.vendor_name,
      vendor_address: po.vendor_address,
      vendor_contact: po.vendor_contact,
      vendor_email: po.vendor_email,
      vendor_tin: po.vendor_tin,
      department: po.department,
      po_date: po.po_date,
      expected_delivery_date: po.expected_delivery_date,
      delivery_address: po.delivery_address,
      payment_terms: po.payment_terms,
      delivery_terms: po.delivery_terms,
      remarks: po.remarks,
      subtotal: po.subtotal,
      vat_amount: po.vat_amount,
      ewt_amount: ewtTotal,
      total_amount: po.total_amount,
      approver_name: approverName,
      approver_esig: approverEsig,
      prepared_by_name: preparedByName,
      prepared_by_esig: preparedByEsig,
    },
    items
  );
  const poFormBytes = new Uint8Array(await poFormBlob.arrayBuffer());

  const pdfParts: Uint8Array[] = [poFormBytes];

  // 2. Get RFP + Canvass Summary + Winning Quotation from linked canvass
  if (po.canvass_request_id) {
    const { data: canvass } = await supabase
      .from('canvass_requests')
      .select(`
        *,
        requester:user_profiles!requester_id(full_name, e_sig),
        company:companies!company_id(name),
        pr:purchase_requisitions!pr_id(purpose, required_date, is_budgeted)
      `)
      .eq('id', po.canvass_request_id)
      .maybeSingle();

    if (canvass) {
      let canvassIncluded = false;

      // Prefer the already-generated PDF (has complete signatories with e-signatures)
      if (canvass.rfp_pdf_path) {
        const { data: storedPdf } = await supabase.storage
          .from('attachments')
          .download(canvass.rfp_pdf_path);
        if (storedPdf) {
          const storedBytes = new Uint8Array(await storedPdf.arrayBuffer());
          pdfParts.push(storedBytes);
          canvassIncluded = true;
        }
      }

      // Fallback: regenerate from scratch if stored PDF is unavailable
      if (!canvassIncluded) {
        const rfpBytes = await buildCanvassRFP(canvass);
        if (rfpBytes) pdfParts.push(rfpBytes);

        const canvassSheetBytes = await buildCanvassSheet(canvass);
        if (canvassSheetBytes) pdfParts.push(canvassSheetBytes);

        const winningIndex = canvass.recommended_quotation_index || 0;
        const winningSupplier = canvass.suppliers?.[winningIndex];
        if (winningSupplier?.quotation_file_path) {
          const { data: quotationFile } = await supabase.storage
            .from('attachments')
            .download(winningSupplier.quotation_file_path);
          if (quotationFile) {
            const quotationBytes = new Uint8Array(await quotationFile.arrayBuffer());
            pdfParts.push(quotationBytes);
          }
        }
      }
    }
  }

  // 3. Merge all PDFs in order: PO Form, RFP, Canvass Summary, Winning Quotation
  const mergedBytes = pdfParts.length > 1
    ? await mergePDFBytes(pdfParts)
    : pdfParts[0];

  // 4. Upload to storage
  const fileName = `po_merged_${po.po_number}_${Date.now()}.pdf`;
  const filePath = `po-merged/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(filePath, mergedBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) throw new Error(`Failed to upload merged PDF: ${uploadError.message}`);

  // 5. Update PO record with merged PDF path
  await supabase
    .from('purchase_orders')
    .update({ merged_pdf_path: filePath })
    .eq('id', po.id);

  return filePath;
}

async function buildCanvassRFP(canvass: any): Promise<Uint8Array | null> {
  try {
    const winningIndex = canvass.recommended_quotation_index || 0;
    const winningVendor = canvass.suppliers?.[winningIndex];
    const winningVendorName = winningVendor?.vendor_name || winningVendor?.name || '';

    const winningTotal = parseFloat(winningVendor?.total || winningVendor?.purchase_price || 0);
    const winningNetOfVat = parseFloat(winningVendor?.net_of_vat || String(winningTotal / 1.12));
    const winningEwt = parseFloat(winningVendor?.ewt || String(winningNetOfVat * 0.02));
    const winningNetPayable = parseFloat(winningVendor?.net_payable || String(winningTotal - winningEwt));

    // Fetch approval records for the canvass
    const { data: approvalRecordsData } = await supabase
      .rpc('get_approval_records_with_signatures', {
        p_request_id: canvass.id,
        p_request_type: 'Canvass',
        p_requester_id: canvass.requester_id,
      });

    const approvalRecords = Array.isArray(approvalRecordsData) ? approvalRecordsData : [];

    const approvals = await Promise.all(
      approvalRecords.map(async (record: any) => {
        let signatureData = null;
        if (record.approver_esig?.startsWith('data:image')) {
          signatureData = record.approver_esig;
        } else if (record.approver_esig?.startsWith('attachments/')) {
          const { data: fileData } = await supabase.storage
            .from('attachments')
            .download(record.approver_esig);
          if (fileData) {
            const arrayBuffer = await fileData.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            signatureData = `data:${fileData.type};base64,${base64}`;
          }
        }
        if (!signatureData && record.approver_id) {
          const { data: profileData } = await supabase
            .from('user_profiles')
            .select('e_sig')
            .eq('id', record.approver_id)
            .maybeSingle();
          if (profileData?.e_sig) signatureData = profileData.e_sig;
        }
        return {
          approver_name: sanitizeForPDF(record.approver_name),
          approver_esig: signatureData,
          approval_date: new Date(record.approval_date).toLocaleDateString('en-US', {
            year: 'numeric', month: '2-digit', day: '2-digit',
          }) + ' ' + new Date(record.approval_date).toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', hour12: true,
          }),
          sequence: record.sequence,
        };
      })
    );

    const rfpData: RFPData = {
      companyName: sanitizeForPDF(canvass.company?.name || ''),
      requestType: 'Canvass',
      documentNumber: sanitizeForPDF(canvass.canvass_number),
      dateOfRequest: new Date(canvass.request_date).toLocaleDateString('en-US', {
        year: 'numeric', month: '2-digit', day: '2-digit',
      }),
      payee: sanitizeForPDF(winningVendorName),
      purpose: sanitizeForPDF(canvass.pr?.purpose || ''),
      dateNeeded: canvass.pr?.required_date
        ? new Date(canvass.pr.required_date).toLocaleDateString('en-US', {
            year: 'numeric', month: '2-digit', day: '2-digit',
          })
        : '',
      amount: winningNetPayable,
      budgeted: canvass.pr?.is_budgeted !== false,
      paymentMode: '',
      paymentModeLines: [],
      requestorName: sanitizeForPDF(canvass.requester?.full_name || ''),
      requestorEsig: canvass.requester?.e_sig || null,
      approvals,
    };

    return await generateRFP(rfpData);
  } catch (error) {
    console.error('Error building canvass RFP for PO merge:', error);
    return null;
  }
}

async function buildCanvassSheet(canvass: any): Promise<Uint8Array | null> {
  try {
    const winningIndex = canvass.recommended_quotation_index || 0;

    // Fetch approval records
    const { data: approvalRecordsData } = await supabase
      .rpc('get_approval_records_with_signatures', {
        p_request_id: canvass.id,
        p_request_type: 'Canvass',
        p_requester_id: canvass.requester_id,
      });

    const approvalRecords = Array.isArray(approvalRecordsData) ? approvalRecordsData : [];

    const approvals = approvalRecords.map((record: any) => ({
      approver_name: sanitizeForPDF(record.approver_name),
      approver_esig: null,
      approval_date: new Date(record.approval_date).toLocaleDateString('en-US', {
        year: 'numeric', month: '2-digit', day: '2-digit',
      }) + ' ' + new Date(record.approval_date).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: true,
      }),
      sequence: record.sequence,
    }));

    const canvassSheetData: CanvassSheetData = {
      companyName: sanitizeForPDF(canvass.company?.name || ''),
      companyAddress: '',
      vatTin: '',
      date: new Date(canvass.request_date).toLocaleDateString('en-US', {
        month: '2-digit', day: '2-digit', year: 'numeric',
      }),
      requestFor: sanitizeForPDF(canvass.pr?.purpose || ''),
      items: (() => {
        if (canvass.suppliers?.[0]?.items?.length > 0) {
          return canvass.suppliers[0].items.map((item: any) => ({
            description: sanitizeForPDF(item.description || ''),
            quantity: item.quantity || 0,
            unit: sanitizeForPDF(item.uom || item.unit || ''),
          }));
        }
        return (canvass.items || []).map((item: any) => ({
          description: sanitizeForPDF(item.description || ''),
          quantity: item.quantity || 0,
          unit: sanitizeForPDF(item.unit || item.uom || ''),
        }));
      })(),
      suppliers: (canvass.suppliers || []).map((supplier: any, supplierIndex: number) => {
        const quotations = (supplier.items?.length > 0)
          ? supplier.items.map((item: any) => ({
              unitPrice: parseFloat(item.unit_price || 0),
              amount: parseFloat(item.amount || 0),
            }))
          : (canvass.items || []).map(() => ({
              unitPrice: parseFloat(supplier.unit_price || 0),
              amount: parseFloat(supplier.quoted_amount || 0),
            }));

        const total = parseFloat(supplier.total || supplier.purchase_price || supplier.quoted_amount || 0);
        const netOfVat = parseFloat(supplier.net_of_vat || String(total / 1.12));
        const vat12 = parseFloat(supplier.vat_12 || String(total - netOfVat));
        const ewt = parseFloat(supplier.ewt || String(netOfVat * 0.02));
        const netPayable = parseFloat(supplier.net_payable || String(total - ewt));

        return {
          name: sanitizeForPDF(supplier.vendor_name || supplier.name || ''),
          quotations,
          invoiceAvailability: supplier.invoice_availability ? 'Yes' : 'No',
          delivery: supplier.delivery ? 'Yes' : 'No',
          installation: supplier.installation ? 'Yes' : 'No',
          deliveryFee: parseFloat(supplier.delivery_fee || 0),
          total,
          discountPrice: parseFloat(supplier.discounted_price || 0),
          purchasePrice: parseFloat(supplier.purchase_price || total),
          netOfVat,
          vat12,
          ewt,
          netPayable,
          registeredName: sanitizeForPDF(supplier.registered_name || supplier.vendor_name || ''),
          address: sanitizeForPDF(supplier.complete_address || supplier.address || ''),
          tin: sanitizeForPDF(supplier.tin || ''),
          contactPerson: sanitizeForPDF(supplier.contact_person || ''),
          contactNo: sanitizeForPDF(supplier.contact_no || ''),
          email: sanitizeForPDF(supplier.email_address || supplier.email || ''),
          bankAccount: sanitizeForPDF(supplier.bank_account_no || ''),
          depositoryBank: sanitizeForPDF(supplier.depository_bank || ''),
          isWinner: supplierIndex === winningIndex,
          quotationFilePath: supplier.quotation_file_path || null,
        };
      }),
      approvals,
    };

    return await generateCanvassSheet(canvassSheetData);
  } catch (error) {
    console.error('Error building canvass sheet for PO merge:', error);
    return null;
  }
}

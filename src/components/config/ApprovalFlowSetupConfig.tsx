import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Plus, CreditCard as Edit, Trash2, X, Search, Filter, ArrowUpDown, Download } from "lucide-react";
import Pagination from "../Pagination";
import { logAuditTrail } from '../../lib/auditTrail';
import { useAuth } from '../../contexts/AuthContext';
import { exportToMultiSheetExcel } from '../../lib/excelExporter';

interface ApprovalFlowSetup {
  id: string;
  name: string;
  company_id: string;
  department_id: string | null;
  request_type: string;
  is_active: boolean;
  companies?: { name: string; president_min_amount: number };
}

interface ApprovalStep {
  id: string;
  approval_flow_setup_id: string;
  workflow_type: number;
  approver_type: string;
  user_id: string | null;
  alternate_approver_id: string | null;
  sequence: number;
  days_to_approve: number;
  for_checking: boolean;
  applies_to_po: boolean;
  applies_to_non_po: boolean;
}

export function ApprovalFlowSetupConfig() {
  const { profile } = useAuth();
  const [setups, setSetups] = useState<ApprovalFlowSetup[]>([]);
  const [steps, setSteps] = useState<ApprovalStep[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSetupId, setEditingSetupId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    company_id: "",
    department: "",
    request_type: "Purchase Requisition"
  });
  const [companies, setCompanies] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [addingStepToWorkflow, setAddingStepToWorkflow] = useState<number | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [newStepData, setNewStepData] = useState({
    user_id: "",
    alternate_approver_id: "",
    days_to_approve: "3",
    for_checking: false,
    applies_to_po: true,
    applies_to_non_po: true
  });
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [alternateUserSearchQuery, setAlternateUserSearchQuery] = useState("");
  const [stepCountMap, setStepCountMap] = useState<Record<string, number>>({});

  // Filter and sorting states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterRequestType, setFilterRequestType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "company" | "request_type" | "status">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    loadSetups();
    loadStepCounts();
    loadCompanies();
    loadUsers();
  }, []);

  const loadSetups = async () => {
    try {
      const { data: setupsData } = await supabase
        .from("approval_flow_setups")
        .select(`
          *,
          companies(name, president_min_amount)
        `)
        .order("created_at", { ascending: false });
      setSetups(setupsData || []);
    } catch (error: any) {
      console.error("Error loading setups:", error);
    }
  };

  const loadStepsForSetup = async (setupId: string) => {
    try {
      const { data: stepsData } = await supabase
        .from("approval_flows")
        .select("*")
        .eq("approval_flow_setup_id", setupId);
      setSteps(stepsData || []);
    } catch (error: any) {
      console.error("Error loading steps:", error);
    }
  };

  const loadStepCounts = async () => {
    try {
      const allRows: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data } = await supabase
          .from("approval_flows")
          .select("approval_flow_setup_id")
          .not("approval_flow_setup_id", "is", null)
          .range(from, from + pageSize - 1);
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setStepCountMap(
        allRows.reduce((acc: Record<string, number>, row: any) => {
          acc[row.approval_flow_setup_id] = (acc[row.approval_flow_setup_id] || 0) + 1;
          return acc;
        }, {})
      );
    } catch (error: any) {
      console.error("Error loading step counts:", error);
    }
  };

  const loadCompanies = async () => {
    try {
      const { data } = await supabase
        .from("companies")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });
      setCompanies(data || []);
    } catch (error: any) {
      console.error("Error loading companies:", error);
    }
  };

  const loadUsers = async (companyName?: string) => {
    try {
      let query = supabase
        .from("user_profiles")
        .select("*")
        .eq("is_active", true)
        .order("company", { ascending: true })
        .order("full_name", { ascending: true });

      if (companyName) {
        query = query.eq("company", companyName);
      }

      const { data } = await query;
      setUsers(data || []);
    } catch (error: any) {
      console.error("Error loading users:", error);
    }
  };

  const loadDepartments = async (companyId: string) => {
    try {
      const { data } = await supabase
        .from("departments")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      setDepartments(data || []);
    } catch (error: any) {
      console.error("Error loading departments:", error);
    }
  };

  useEffect(() => {
    if (editingSetupId) {
      // Load ALL users from all companies for cross-company approvals
      loadUsers();
    }
  }, [editingSetupId]);

  useEffect(() => {
    if (formData.company_id) {
      loadDepartments(formData.company_id);
      const selectedCompany = companies.find(c => c.id === formData.company_id);
      if (selectedCompany && !editingSetupId) {
        loadUsers(selectedCompany.name);
        setFormData(prev => ({ ...prev, department: "" }));
      }
    } else {
      setDepartments([]);
      setUsers([]);
    }
  }, [formData.company_id, companies, editingSetupId]);

  useEffect(() => {
    if (!editingSetupId && formData.company_id && formData.request_type) {
      if (formData.department) {
        const selectedCompany = companies.find(c => c.id === formData.company_id);
        if (selectedCompany) {
          const autoName = `${selectedCompany.name} - ${formData.department} - ${formData.request_type}`;
          setFormData(prev => ({ ...prev, name: autoName }));
        }
      }
    }
  }, [formData.company_id, formData.department, formData.request_type, companies, editingSetupId]);

  const handleSaveSetup = async () => {
    try {
      if (!formData.company_id || !formData.department || !formData.request_type) {
        alert("Please select a company, department, and request type");
        return;
      }

      const payload = {
        name: formData.name,
        company_id: formData.company_id,
        department_id: formData.department || null,
        request_type: formData.request_type,
        is_active: true
      };

      if (editingSetupId) {
        const oldSetup = setups.find(s => s.id === editingSetupId);
        const { error } = await supabase
          .from("approval_flow_setups")
          .update(payload)
          .eq("id", editingSetupId);
        if (error) throw error;
        logAuditTrail({
          tableName: 'approval_flow_setups',
          recordId: editingSetupId,
          action: 'UPDATE',
          module: 'configuration',
          description: 'Updated approval flow setup',
          oldValues: oldSetup || null,
          newValues: payload,
          performedBy: profile?.id || '',
          performedByName: profile?.full_name || '',
        });
      } else {
        const { data: insertedSetup, error } = await supabase
          .from("approval_flow_setups")
          .insert(payload)
          .select()
          .maybeSingle();
        if (error) throw error;
        logAuditTrail({
          tableName: 'approval_flow_setups',
          recordId: insertedSetup?.id || '',
          action: 'CREATE',
          module: 'configuration',
          description: 'Created approval flow setup',
          oldValues: null,
          newValues: payload,
          performedBy: profile?.id || '',
          performedByName: profile?.full_name || '',
        });
      }

      setShowForm(false);
      setEditingSetupId(null);
      setSteps([]);
      setFormData({ name: "", company_id: "", department: "", request_type: "Purchase Requisition" });
      await loadSetups();
    } catch (error: any) {
      alert("Error: " + error.message);
    }
  };

  const handleDeleteSetup = async (id: string) => {
    if (!confirm("Delete this approval flow setup and all its steps?")) return;
    try {
      const oldSetup = setups.find(s => s.id === id);
      const { error } = await supabase
        .from("approval_flow_setups")
        .delete()
        .eq("id", id);
      if (error) throw error;
      logAuditTrail({
        tableName: 'approval_flow_setups',
        recordId: id,
        action: 'DELETE',
        module: 'configuration',
        description: 'Deleted approval flow setup',
        oldValues: oldSetup || null,
        newValues: null,
        performedBy: profile?.id || '',
        performedByName: profile?.full_name || '',
      });
      await loadSetups();
      loadStepCounts();
    } catch (error: any) {
      alert("Error: " + error.message);
    }
  };

  const handleAddStep = async (workflowType: number) => {
    try {
      if (!editingSetupId) {
        alert("Please save the setup first");
        return;
      }

      const existingSteps = steps.filter(
        s => s.approval_flow_setup_id === editingSetupId && s.workflow_type === workflowType
      );
      const nextSequence = existingSteps.length > 0
        ? Math.max(...existingSteps.map(s => s.sequence)) + 1
        : 1;

      if (!newStepData.user_id) {
        alert("Please select a user");
        return;
      }

      if (!newStepData.applies_to_po && !newStepData.applies_to_non_po) {
        alert("At least one purchase type must be selected (PO or Non-PO)");
        return;
      }

      const payload = {
        approval_flow_setup_id: editingSetupId,
        workflow_type: workflowType,
        approver_type: "Specific User",
        user_id: newStepData.user_id,
        alternate_approver_id: newStepData.alternate_approver_id || null,
        sequence: nextSequence,
        days_to_approve: parseInt(newStepData.days_to_approve),
        for_checking: newStepData.for_checking,
        applies_to_po: newStepData.applies_to_po,
        applies_to_non_po: newStepData.applies_to_non_po,
        is_required: true,
        is_active: true
      };

      const { data: insertedStep, error } = await supabase.from("approval_flows").insert(payload).select().maybeSingle();
      if (error) throw error;
      if (!insertedStep) throw new Error("Failed to create approval step");

      logAuditTrail({
        tableName: 'approval_flows',
        recordId: insertedStep.id,
        action: 'CREATE',
        module: 'configuration',
        description: 'Created approval flow step',
        oldValues: null,
        newValues: payload,
        performedBy: profile?.id || '',
        performedByName: profile?.full_name || '',
      });

      setAddingStepToWorkflow(null);
      setNewStepData({ user_id: "", alternate_approver_id: "", days_to_approve: "3", for_checking: false, applies_to_po: true, applies_to_non_po: true });
      setUserSearchQuery("");
      setAlternateUserSearchQuery("");
      await loadStepsForSetup(editingSetupId);
      loadStepCounts();
    } catch (error: any) {
      alert("Error: " + error.message);
    }
  };

  const handleEditStep = (step: ApprovalStep) => {
    setEditingStepId(step.id);
    setNewStepData({
      user_id: step.user_id || "",
      alternate_approver_id: step.alternate_approver_id || "",
      days_to_approve: step.days_to_approve.toString(),
      for_checking: step.for_checking || false,
      applies_to_po: step.applies_to_po ?? true,
      applies_to_non_po: step.applies_to_non_po ?? true
    });
    setUserSearchQuery("");
    setAlternateUserSearchQuery("");
    setAddingStepToWorkflow(step.workflow_type);
  };

  const handleUpdateStep = async (workflowType: number) => {
    try {
      if (!editingStepId) return;

      if (!newStepData.user_id) {
        alert("Please select a user");
        return;
      }

      if (!newStepData.applies_to_po && !newStepData.applies_to_non_po) {
        alert("At least one purchase type must be selected (PO or Non-PO)");
        return;
      }

      const payload = {
        approver_type: "Specific User",
        user_id: newStepData.user_id,
        alternate_approver_id: newStepData.alternate_approver_id || null,
        days_to_approve: parseInt(newStepData.days_to_approve),
        for_checking: newStepData.for_checking,
        applies_to_po: newStepData.applies_to_po,
        applies_to_non_po: newStepData.applies_to_non_po
      };

      const oldStep = steps.find(s => s.id === editingStepId);
      const { error } = await supabase
        .from("approval_flows")
        .update(payload)
        .eq("id", editingStepId);

      if (error) throw error;

      logAuditTrail({
        tableName: 'approval_flows',
        recordId: editingStepId,
        action: 'UPDATE',
        module: 'configuration',
        description: 'Updated approval flow step',
        oldValues: oldStep || null,
        newValues: payload,
        performedBy: profile?.id || '',
        performedByName: profile?.full_name || '',
      });

      setEditingStepId(null);
      setAddingStepToWorkflow(null);
      setNewStepData({ user_id: "", alternate_approver_id: "", days_to_approve: "3", for_checking: false, applies_to_po: true, applies_to_non_po: true });
      setUserSearchQuery("");
      setAlternateUserSearchQuery("");
      if (editingSetupId) await loadStepsForSetup(editingSetupId);
    } catch (error: any) {
      alert("Error: " + error.message);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm("Are you sure you want to delete this step?")) return;

    try {
      const oldStep = steps.find(s => s.id === stepId);
      const { error } = await supabase
        .from("approval_flows")
        .delete()
        .eq("id", stepId);

      if (error) throw error;

      logAuditTrail({
        tableName: 'approval_flows',
        recordId: stepId,
        action: 'DELETE',
        module: 'configuration',
        description: 'Deleted approval flow step',
        oldValues: oldStep || null,
        newValues: null,
        performedBy: profile?.id || '',
        performedByName: profile?.full_name || '',
      });

      if (editingSetupId) await loadStepsForSetup(editingSetupId);
      loadStepCounts();
    } catch (error: any) {
      alert("Error: " + error.message);
    }
  };

  const handleEditSetup = (setup: ApprovalFlowSetup) => {
    setEditingSetupId(setup.id);
    setFormData({
      name: setup.name,
      company_id: setup.company_id,
      department: setup.department_id || "",
      request_type: setup.request_type
    });
    setShowForm(true);
    loadStepsForSetup(setup.id);
  };

  const selectedCompany = companies.find(c => c.id === formData.company_id);
  const currentSteps = editingSetupId ? steps.filter(s => s.approval_flow_setup_id === editingSetupId) : [];

  // Filter and sort setups
  const filteredAndSortedSetups = setups
    .filter((setup) => {
      // Search filter
      if (searchQuery && !setup.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      // Company filter
      if (filterCompany && setup.company_id !== filterCompany) {
        return false;
      }

      // Request type filter
      if (filterRequestType && setup.request_type !== filterRequestType) {
        return false;
      }

      // Status filter
      if (filterStatus === "active" && !setup.is_active) {
        return false;
      }
      if (filterStatus === "inactive" && setup.is_active) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      let compareA: string | boolean = "";
      let compareB: string | boolean = "";

      switch (sortBy) {
        case "name":
          compareA = a.name.toLowerCase();
          compareB = b.name.toLowerCase();
          break;
        case "company":
          compareA = (a.companies?.name || "").toLowerCase();
          compareB = (b.companies?.name || "").toLowerCase();
          break;
        case "request_type":
          compareA = a.request_type.toLowerCase();
          compareB = b.request_type.toLowerCase();
          break;
        case "status":
          compareA = a.is_active;
          compareB = b.is_active;
          break;
      }

      if (sortOrder === "asc") {
        return compareA < compareB ? -1 : compareA > compareB ? 1 : 0;
      } else {
        return compareA > compareB ? -1 : compareA < compareB ? 1 : 0;
      }
    });

  const handleSort = (column: "name" | "company" | "request_type" | "status") => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  const filteredAndSortedUsers = users
    .filter((user) => {
      if (!userSearchQuery) return true;
      const searchLower = userSearchQuery.toLowerCase();
      return (
        user.full_name?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower) ||
        user.company?.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      const nameA = (a.full_name || "").toLowerCase();
      const nameB = (b.full_name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

  const filteredAlternateUsers = users
    .filter((user) => {
      if (user.id === newStepData.user_id) return false;
      if (!alternateUserSearchQuery) return true;
      const searchLower = alternateUserSearchQuery.toLowerCase();
      return (
        user.full_name?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower) ||
        user.company?.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      const nameA = (a.full_name || "").toLowerCase();
      const nameB = (b.full_name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

  const clearFilters = () => {
    setSearchQuery("");
    setFilterCompany("");
    setFilterRequestType("");
    setFilterStatus("");
    setCurrentPage(1);
  };

  // Pagination logic
  const totalPages = Math.ceil(filteredAndSortedSetups.length / itemsPerPage);
  const paginatedSetups = filteredAndSortedSetups.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const [exporting, setExporting] = useState(false);

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const allSteps: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data } = await supabase
          .from("approval_flows")
          .select("*")
          .not("approval_flow_setup_id", "is", null)
          .range(from, from + pageSize - 1);
        if (!data || data.length === 0) break;
        allSteps.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      const userIds = new Set<string>();
      allSteps.forEach(s => {
        if (s.user_id) userIds.add(s.user_id);
        if (s.alternate_approver_id) userIds.add(s.alternate_approver_id);
      });
      const userMap: Record<string, any> = {};
      if (userIds.size > 0) {
        const ids = Array.from(userIds);
        for (let i = 0; i < ids.length; i += 50) {
          const batch = ids.slice(i, i + 50);
          const { data: userData } = await supabase
            .from("user_profiles")
            .select("id, full_name, email, company")
            .in("id", batch);
          (userData || []).forEach(u => { userMap[u.id] = u; });
        }
      }

      const stepsGrouped: Record<string, any[]> = {};
      allSteps.forEach(step => {
        if (!stepsGrouped[step.approval_flow_setup_id]) stepsGrouped[step.approval_flow_setup_id] = [];
        stepsGrouped[step.approval_flow_setup_id].push(step);
      });

      const workflowTypeLabel = (wt: number, requestType: string) => {
        const isExpenseCategory = requestType === 'Petty Cash' || requestType === 'Reimbursement' || requestType === 'Liquidation';
        const isPO = requestType === 'Purchase Order';
        if (isPO) return 'Approval Flow';
        if (isExpenseCategory) return ['Department Expense', 'ManCom Expense', 'CEO Expense'][wt - 1] || `Type ${wt}`;
        return ['Unbudgeted', 'Budgeted (Below Threshold)', 'Budgeted (Above Threshold)'][wt - 1] || `Type ${wt}`;
      };

      // Group setups by Company + Request Type for separate sheets
      const sheetGroups: Record<string, { company: string; requestType: string; setups: typeof filteredAndSortedSetups }> = {};
      filteredAndSortedSetups.forEach(setup => {
        const companyName = setup.companies?.name || 'Unknown';
        const key = `${companyName}|||${setup.request_type}`;
        if (!sheetGroups[key]) {
          sheetGroups[key] = { company: companyName, requestType: setup.request_type, setups: [] };
        }
        sheetGroups[key].setups.push(setup);
      });

      // Sort sheet groups by company then request type
      const sortedKeys = Object.keys(sheetGroups).sort((a, b) => {
        const ga = sheetGroups[a];
        const gb = sheetGroups[b];
        const compCompare = ga.company.localeCompare(gb.company);
        if (compCompare !== 0) return compCompare;
        return ga.requestType.localeCompare(gb.requestType);
      });

      const sheets: { name: string; data: any[][] }[] = [];
      sortedKeys.forEach(key => {
        const group = sheetGroups[key];
        const sheetRows: any[][] = [];

        group.setups.forEach(setup => {
          const setupSteps = (stepsGrouped[setup.id] || []).sort((a, b) => {
            if (a.workflow_type !== b.workflow_type) return a.workflow_type - b.workflow_type;
            return a.sequence - b.sequence;
          });

          if (setupSteps.length === 0) {
            sheetRows.push([
              setup.department_id || 'Whole Company',
              setup.is_active ? 'Active' : 'Inactive',
              '-',
              '-',
              '-',
              '-',
              '-',
              '-',
              '-'
            ]);
          } else {
            setupSteps.forEach(step => {
              const approver = step.user_id ? userMap[step.user_id] : null;
              const alternate = step.alternate_approver_id ? userMap[step.alternate_approver_id] : null;
              sheetRows.push([
                setup.department_id || 'Whole Company',
                setup.is_active ? 'Active' : 'Inactive',
                workflowTypeLabel(step.workflow_type, setup.request_type),
                step.sequence,
                approver ? `${approver.full_name} (${approver.company})` : '-',
                alternate ? `${alternate.full_name} (${alternate.company})` : '-',
                step.days_to_approve,
                step.for_checking ? 'Yes' : 'No',
                step.applies_to_po && step.applies_to_non_po ? 'Both' : step.applies_to_po ? 'PO Only' : step.applies_to_non_po ? 'Non-PO Only' : '-'
              ]);
            });
          }
        });

        const sheetName = `${group.company} ${group.requestType}`;
        sheets.push({ name: sheetName, data: sheetRows });
      });

      const columns = [
        { header: 'Department', width: 22 },
        { header: 'Status', width: 10 },
        { header: 'Workflow Type', width: 28 },
        { header: 'Sequence', width: 10 },
        { header: 'Primary Approver', width: 35 },
        { header: 'Alternate Approver', width: 35 },
        { header: 'Days to Approve', width: 15 },
        { header: 'For Checking', width: 12 },
        { header: 'Purchase Type', width: 15 },
      ];

      const timestamp = new Date().toISOString().slice(0, 10);
      exportToMultiSheetExcel(sheets, columns, `Approval_Flows_${timestamp}.xlsx`);
    } catch (error: any) {
      alert('Export failed: ' + error.message);
    } finally {
      setExporting(false);
    }
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterCompany, filterRequestType, filterStatus, sortBy, sortOrder]);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Approval Flow Setups</h2>
          <p className="text-slate-600 mt-1">Create and manage approval workflows with 3 budget scenarios</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportExcel}
            disabled={exporting || filteredAndSortedSetups.length === 0}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-emerald-800 shadow-lg shadow-emerald-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={20} />
            {exporting ? 'Exporting...' : 'Export Excel'}
          </button>
          <button
            onClick={() => {
              setShowForm(true);
              setEditingSetupId(null);
              setFormData({ name: "", company_id: "", department: "", request_type: "Purchase Requisition" });
            }}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/30 transition-all"
          >
            <Plus size={20} />
            Add Setup
          </button>
        </div>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-6 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowForm(false);
              setEditingSetupId(null);
              setFormData({ name: "", company_id: "", department: "", request_type: "Purchase Requisition" });
            }
          }}
        >
        <div className="bg-gradient-to-br from-white to-slate-50 rounded-xl sm:rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl my-4 sm:my-8 max-h-[95vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white/80 backdrop-blur rounded-t-xl sm:rounded-t-2xl">
            <h3 className="text-lg sm:text-2xl font-bold text-slate-900">
              {editingSetupId ? "Edit Approval Flow Setup" : "New Approval Flow Setup"}
            </h3>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingSetupId(null);
                setFormData({ name: "", company_id: "", department: "", request_type: "Purchase Requisition" });
              }}
              className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors p-2"
            >
              <X size={22} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Company *</label>
                <select
                  value={formData.company_id}
                  onChange={(e) => setFormData({ ...formData, company_id: e.target.value, department: "" })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                  disabled={!!editingSetupId}
                >
                  <option value="">Select Company</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Department *</label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white disabled:bg-slate-100"
                  disabled={!formData.company_id || !!editingSetupId}
                >
                  <option value="">Select Department</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.name}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Request Type *</label>
                <select
                  value={formData.request_type}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData({ ...formData, request_type: val });
                  }}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white disabled:bg-slate-100"
                  disabled={!!editingSetupId}
                >
                  <option value="Purchase Requisition">Purchase Requisition</option>
                  <option value="Canvass">Canvass</option>
                  <option value="Purchase Order">Purchase Order</option>
                  <option value="Petty Cash">Petty Cash</option>
                  <option value="Cash Advance">Cash Advance</option>
                  <option value="Reimbursement">Reimbursement</option>
                  <option value="Liquidation">Liquidation</option>
                </select>
              </div>
            </div>

            {formData.name && (
              <div className="bg-gradient-to-r from-blue-50 to-slate-50 border-2 border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-slate-700">Setup Name:</div>
                  <div className="text-sm font-bold text-slate-900">{formData.name}</div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSaveSetup}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all"
              >
                {editingSetupId ? "Update Setup" : "Save Setup"}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingSetupId(null);
                  setFormData({ name: "", company_id: "", department: "", request_type: "Purchase Requisition" });
                }}
                className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl transition-all"
              >
                Cancel
              </button>
            </div>
          </div>

          {editingSetupId && selectedCompany && (() => {
            const isExpenseCategoryType = formData.request_type === 'Petty Cash' || formData.request_type === 'Reimbursement' || formData.request_type === 'Liquidation';
            const isPurchaseOrder = formData.request_type === 'Purchase Order';
            const workflowTypes = isPurchaseOrder ? [1] : [1, 2, 3];
            const presidentAmountLabel = selectedCompany.president_min_amount
              ? parseFloat(selectedCompany.president_min_amount).toLocaleString('en-US', { minimumFractionDigits: 0 })
              : '0';
            return (
            <>
              {!isExpenseCategoryType && !isPurchaseOrder && (
                <div className="border-t border-slate-200 pt-6">
                  <h4 className="text-lg font-bold text-slate-900 mb-4">Approval Steps Configuration</h4>
                  <div className="bg-gradient-to-r from-blue-50 to-slate-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">President Min Amount</p>
                        <p className="text-lg font-bold text-slate-900 font-mono">
                          ₱{selectedCompany.president_min_amount
                            ? parseFloat(selectedCompany.president_min_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })
                            : '0.00'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {isPurchaseOrder && (
                <div className="border-t border-slate-200 pt-6">
                  <h4 className="text-lg font-bold text-slate-900 mb-4">Approval Steps Configuration</h4>
                </div>
              )}
              {isExpenseCategoryType && (
                <div className="border-t border-slate-200 pt-6">
                  <h4 className="text-lg font-bold text-slate-900 mb-2">Approval Steps Configuration</h4>
                  <p className="text-sm text-slate-600 mb-4">{formData.request_type} uses three expense categories. Each category drives its own approval workflow.</p>
                </div>
              )}

              <div className={`grid grid-cols-1 ${isPurchaseOrder ? '' : 'lg:grid-cols-3'} gap-4`}>
                {workflowTypes.map((workflowType) => {
                  const colors = [
                    { bg: "from-red-50 to-orange-50", border: "border-red-200", btn: "bg-red-500 hover:bg-red-600", badge: "bg-red-100 text-red-800", ring: "focus:ring-red-500", borderLight: "border-red-200", borderDark: "border-red-300" },
                    { bg: "from-green-50 to-emerald-50", border: "border-green-200", btn: "bg-green-500 hover:bg-green-600", badge: "bg-green-100 text-green-800", ring: "focus:ring-green-500", borderLight: "border-green-200", borderDark: "border-green-300" },
                    { bg: "from-amber-50 to-yellow-50", border: "border-amber-200", btn: "bg-amber-500 hover:bg-amber-600", badge: "bg-amber-100 text-amber-800", ring: "focus:ring-amber-500", borderLight: "border-amber-200", borderDark: "border-amber-300" }
                  ][workflowType - 1];

                  const titles = isExpenseCategoryType
                    ? ["Department Expense", "ManCom Expense", "CEO Expense"]
                    : isPurchaseOrder
                    ? ["Approval Flow"]
                    : ["Unbudgeted", `Budgeted <${presidentAmountLabel}`, `Budgeted >${presidentAmountLabel}`];
                  const subtitles = isExpenseCategoryType
                    ? ["Routine department-level expenses", "Requires ManCom-level approval", "Requires CEO-level approval"]
                    : isPurchaseOrder
                    ? ["Configure the approval steps for Purchase Orders"]
                    : ["No budget allocation", `Less than ₱${presidentAmountLabel}`, `More than ₱${presidentAmountLabel}`];

                  const workflowSteps = currentSteps.filter(s => s.workflow_type === workflowType).sort((a, b) => a.sequence - b.sequence);

                  return (
                    <div key={workflowType} className={`bg-gradient-to-br ${colors.bg} rounded-xl shadow-md border-2 ${colors.border} p-4`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 ${colors.btn} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                            {workflowType}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{titles[workflowType - 1]}</h4>
                            <p className="text-xs text-slate-600">{subtitles[workflowType - 1]}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setEditingStepId(null);
                            setNewStepData({ user_id: "", alternate_approver_id: "", days_to_approve: "3", for_checking: false, applies_to_po: true, applies_to_non_po: true });
                            setUserSearchQuery("");
                            setAlternateUserSearchQuery("");
                            setAddingStepToWorkflow(workflowType);
                          }}
                          className={`p-1.5 ${colors.btn} text-white rounded-lg transition-all`}
                          title="Add Step"
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      {addingStepToWorkflow === workflowType && !editingStepId && (
                        <div className={`bg-white rounded-lg p-3 mb-2 border-2 ${colors.borderDark} space-y-2`}>
                          <h5 className="text-xs font-bold text-slate-900 mb-1">Add New Step</h5>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-700">Primary Approver</label>
                            <input
                              type="text"
                              placeholder="Search users..."
                              value={userSearchQuery}
                              onChange={(e) => setUserSearchQuery(e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-1"
                            />
                            <select
                              value={newStepData.user_id}
                              onChange={(e) => setNewStepData({ ...newStepData, user_id: e.target.value })}
                              className={`w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg ${colors.ring}`}
                              size={4}
                            >
                              <option value="">Select User</option>
                              {filteredAndSortedUsers.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.full_name} - {user.company} ({user.email})
                                </option>
                              ))}
                            </select>
                            {filteredAndSortedUsers.length === 0 && userSearchQuery && (
                              <p className="text-xs text-slate-500 mt-1">No users found</p>
                            )}
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-700">
                                Alternate Approver <span className="text-slate-400 font-normal">(optional — either can approve)</span>
                              </label>
                              {newStepData.alternate_approver_id && (
                                <button
                                  type="button"
                                  onClick={() => { setNewStepData({ ...newStepData, alternate_approver_id: "" }); setAlternateUserSearchQuery(""); }}
                                  className="text-xs text-red-600 hover:text-red-800 font-medium"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              placeholder="Search users..."
                              value={alternateUserSearchQuery}
                              onChange={(e) => setAlternateUserSearchQuery(e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-1"
                            />
                            <select
                              value={newStepData.alternate_approver_id}
                              onChange={(e) => setNewStepData({ ...newStepData, alternate_approver_id: e.target.value })}
                              className={`w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg ${colors.ring}`}
                              size={4}
                            >
                              <option value="">None</option>
                              {filteredAlternateUsers.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.full_name} - {user.company} ({user.email})
                                </option>
                              ))}
                            </select>
                            {filteredAlternateUsers.length === 0 && alternateUserSearchQuery && (
                              <p className="text-xs text-slate-500 mt-1">No users found</p>
                            )}
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-700">Days to Approve</label>
                            <input
                              type="number"
                              min="1"
                              value={newStepData.days_to_approve}
                              onChange={(e) => setNewStepData({ ...newStepData, days_to_approve: e.target.value })}
                              className={`w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg ${colors.ring}`}
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="for-checking-add"
                              checked={newStepData.for_checking}
                              onChange={(e) => setNewStepData({ ...newStepData, for_checking: e.target.checked })}
                              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="for-checking-add" className="text-xs font-semibold text-slate-700 cursor-pointer">
                              For Checking Only (Not a Signatory)
                            </label>
                          </div>

                          {formData.request_type === 'Purchase Requisition' && (
                            <div className="space-y-1 border-t border-slate-200 pt-2 mt-1">
                              <label className="text-xs font-semibold text-slate-700">Applies to Purchase Type</label>
                              <div className="flex items-center gap-4">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={newStepData.applies_to_po}
                                    onChange={(e) => setNewStepData({ ...newStepData, applies_to_po: e.target.checked })}
                                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                  />
                                  <span className="text-xs text-slate-700">Purchase Order</span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={newStepData.applies_to_non_po}
                                    onChange={(e) => setNewStepData({ ...newStepData, applies_to_non_po: e.target.checked })}
                                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                  />
                                  <span className="text-xs text-slate-700">Non-Purchase Order</span>
                                </label>
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAddStep(workflowType)}
                              className={`flex-1 px-3 py-1.5 ${colors.btn} text-white text-xs font-semibold rounded-lg transition-all`}
                            >
                              Add
                            </button>
                            <button
                              onClick={() => {
                                setAddingStepToWorkflow(null);
                                setNewStepData({ user_id: "", alternate_approver_id: "", days_to_approve: "3", for_checking: false, applies_to_po: true, applies_to_non_po: true });
                                setUserSearchQuery("");
                                setAlternateUserSearchQuery("");
                              }}
                              className="flex-1 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {editingStepId && addingStepToWorkflow === workflowType && (
                        <div className={`bg-white rounded-lg p-3 mb-2 border-2 ${colors.borderDark} space-y-2`}>
                          <h5 className="text-xs font-bold text-slate-900 mb-1">Edit Step</h5>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-700">Primary Approver</label>
                            <input
                              type="text"
                              placeholder="Search users..."
                              value={userSearchQuery}
                              onChange={(e) => setUserSearchQuery(e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-1"
                            />
                            <select
                              value={newStepData.user_id}
                              onChange={(e) => setNewStepData({ ...newStepData, user_id: e.target.value })}
                              className={`w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg ${colors.ring}`}
                              size={4}
                            >
                              <option value="">Select User</option>
                              {filteredAndSortedUsers.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.full_name} - {user.company} ({user.email})
                                </option>
                              ))}
                            </select>
                            {filteredAndSortedUsers.length === 0 && userSearchQuery && (
                              <p className="text-xs text-slate-500 mt-1">No users found</p>
                            )}
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-700">
                                Alternate Approver <span className="text-slate-400 font-normal">(optional — either can approve)</span>
                              </label>
                              {newStepData.alternate_approver_id && (
                                <button
                                  type="button"
                                  onClick={() => { setNewStepData({ ...newStepData, alternate_approver_id: "" }); setAlternateUserSearchQuery(""); }}
                                  className="text-xs text-red-600 hover:text-red-800 font-medium"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              placeholder="Search users..."
                              value={alternateUserSearchQuery}
                              onChange={(e) => setAlternateUserSearchQuery(e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-1"
                            />
                            <select
                              value={newStepData.alternate_approver_id}
                              onChange={(e) => setNewStepData({ ...newStepData, alternate_approver_id: e.target.value })}
                              className={`w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg ${colors.ring}`}
                              size={4}
                            >
                              <option value="">None</option>
                              {filteredAlternateUsers.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.full_name} - {user.company} ({user.email})
                                </option>
                              ))}
                            </select>
                            {filteredAlternateUsers.length === 0 && alternateUserSearchQuery && (
                              <p className="text-xs text-slate-500 mt-1">No users found</p>
                            )}
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-700">Days to Approve</label>
                            <input
                              type="number"
                              min="1"
                              value={newStepData.days_to_approve}
                              onChange={(e) => setNewStepData({ ...newStepData, days_to_approve: e.target.value })}
                              className={`w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg ${colors.ring}`}
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="for-checking-edit"
                              checked={newStepData.for_checking}
                              onChange={(e) => setNewStepData({ ...newStepData, for_checking: e.target.checked })}
                              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="for-checking-edit" className="text-xs font-semibold text-slate-700 cursor-pointer">
                              For Checking Only (Not a Signatory)
                            </label>
                          </div>

                          {formData.request_type === 'Purchase Requisition' && (
                            <div className="space-y-1 border-t border-slate-200 pt-2 mt-1">
                              <label className="text-xs font-semibold text-slate-700">Applies to Purchase Type</label>
                              <div className="flex items-center gap-4">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={newStepData.applies_to_po}
                                    onChange={(e) => setNewStepData({ ...newStepData, applies_to_po: e.target.checked })}
                                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                  />
                                  <span className="text-xs text-slate-700">Purchase Order</span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={newStepData.applies_to_non_po}
                                    onChange={(e) => setNewStepData({ ...newStepData, applies_to_non_po: e.target.checked })}
                                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                  />
                                  <span className="text-xs text-slate-700">Non-Purchase Order</span>
                                </label>
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleUpdateStep(workflowType)}
                              className={`flex-1 px-3 py-1.5 ${colors.btn} text-white text-xs font-semibold rounded-lg transition-all`}
                            >
                              Update
                            </button>
                            <button
                              onClick={() => {
                                setEditingStepId(null);
                                setAddingStepToWorkflow(null);
                                setNewStepData({ user_id: "", alternate_approver_id: "", days_to_approve: "3", for_checking: false, applies_to_po: true, applies_to_non_po: true });
                                setUserSearchQuery("");
                                setAlternateUserSearchQuery("");
                              }}
                              className="flex-1 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        {workflowSteps.map((step) => {
                          const approverUser = step.user_id ? users.find(u => u.id === step.user_id) : null;
                          const alternateUser = step.alternate_approver_id ? users.find(u => u.id === step.alternate_approver_id) : null;
                          const displayName = approverUser
                            ? `${approverUser.full_name} (${approverUser.company})`
                            : step.approver_type;

                          return (
                            <div key={step.id} className={`bg-white rounded-lg p-2 shadow-sm border ${colors.borderLight}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-xs font-semibold text-slate-700 shrink-0">Step {step.sequence}</span>
                                    <span className={`text-xs px-2 py-0.5 ${colors.badge} rounded-full font-bold truncate`}>
                                      {displayName}
                                    </span>
                                  </div>
                                  {alternateUser && (
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <span className="text-xs text-slate-400 shrink-0">or</span>
                                      <span className="text-xs text-slate-600 font-medium truncate">
                                        {alternateUser.full_name} ({alternateUser.company})
                                      </span>
                                    </div>
                                  )}
                                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                    <span>{step.days_to_approve} days</span>
                                    {step.for_checking && <span className="text-amber-600 font-medium">Checker</span>}
                                    {formData.request_type === 'Purchase Requisition' && !(step.applies_to_po && step.applies_to_non_po) && (
                                      <span className="text-blue-600 font-medium">
                                        {step.applies_to_po && !step.applies_to_non_po ? 'PO Only' : ''}
                                        {step.applies_to_non_po && !step.applies_to_po ? 'Non-PO Only' : ''}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 ml-2 shrink-0">
                                  <button
                                    onClick={() => handleEditStep(step)}
                                    className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-all"
                                    title="Edit Step"
                                  >
                                    <Edit size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteStep(step.id)}
                                    className="p-1 text-red-600 hover:bg-red-50 rounded transition-all"
                                    title="Delete Step"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {workflowSteps.length === 0 && (
                          <p className="text-xs text-slate-500 text-center py-2">No steps</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
            );
          })()}
          </div>
        </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">All Approval Flow Setups</h3>
              <p className="text-sm text-slate-600 mt-0.5">
                {filteredAndSortedSetups.length} of {setups.length} setups
              </p>
            </div>
            {(searchQuery || filterCompany || filterRequestType || filterStatus) && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-all"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Filter Section */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            {/* Company Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <select
                value={filterCompany}
                onChange={(e) => setFilterCompany(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm appearance-none bg-white"
              >
                <option value="">All Companies</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Request Type Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <select
                value={filterRequestType}
                onChange={(e) => setFilterRequestType(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm appearance-none bg-white"
              >
                <option value="">All Request Types</option>
                <option value="Purchase Requisition">Purchase Requisition</option>
                <option value="Canvass">Canvass</option>
                <option value="Purchase Order">Purchase Order</option>
                <option value="Petty Cash">Petty Cash</option>
                <option value="Cash Advance">Cash Advance</option>
                <option value="Reimbursement">Reimbursement</option>
                <option value="Liquidation">Liquidation</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm appearance-none bg-white"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50">
              <tr>
                <th
                  onClick={() => handleSort("name")}
                  className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Name
                    <ArrowUpDown size={14} className={sortBy === "name" ? "text-blue-600" : "text-slate-400"} />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("company")}
                  className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Company
                    <ArrowUpDown size={14} className={sortBy === "company" ? "text-blue-600" : "text-slate-400"} />
                  </div>
                </th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Department</th>
                <th
                  onClick={() => handleSort("request_type")}
                  className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Request Type
                    <ArrowUpDown size={14} className={sortBy === "request_type" ? "text-blue-600" : "text-slate-400"} />
                  </div>
                </th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Total Steps</th>
                <th
                  onClick={() => handleSort("status")}
                  className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Status
                    <ArrowUpDown size={14} className={sortBy === "status" ? "text-blue-600" : "text-slate-400"} />
                  </div>
                </th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedSetups.length > 0 ? (
                paginatedSetups.map((setup) => {
                  const setupStepCount = stepCountMap[setup.id] || 0;
                  return (
                    <tr key={setup.id} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all">
                      <td className="px-4 py-4 text-sm font-semibold text-slate-900">{setup.name}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{setup.companies?.name || "-"}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {setup.department_id || <span className="text-slate-400 italic">Whole Company</span>}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <span className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shadow-sm bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800">
                          {setup.request_type}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <span className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shadow-sm bg-gradient-to-r from-amber-100 to-amber-200 text-amber-800">
                          {setupStepCount} Steps
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <span className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shadow-sm ${
                          setup.is_active
                            ? "bg-gradient-to-r from-green-100 to-green-200 text-green-800"
                            : "bg-gradient-to-r from-red-100 to-red-200 text-red-800"
                        }`}>
                          {setup.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditSetup(setup)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all group"
                            title="Edit"
                          >
                            <Edit size={18} className="group-hover:scale-110 transition-transform" />
                          </button>
                          <button
                            onClick={() => handleDeleteSetup(setup.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all group"
                            title="Delete"
                          >
                            <Trash2 size={18} className="group-hover:scale-110 transition-transform" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-500">
                      <Filter size={48} className="mb-4 text-slate-300" />
                      <p className="text-lg font-semibold mb-1">No setups found</p>
                      <p className="text-sm">Try adjusting your filters or search criteria</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          itemsPerPage={itemsPerPage}
          totalItems={filteredAndSortedSetups.length}
          onPageChange={handlePageChange}
          onItemsPerPageChange={handleItemsPerPageChange}
        />
      </div>
    </div>
  );
}

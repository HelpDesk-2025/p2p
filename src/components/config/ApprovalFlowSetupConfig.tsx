import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Plus, Edit, Trash2, X } from "lucide-react";

interface ApprovalFlowSetup {
  id: string;
  name: string;
  company_id: string;
  department_id: string | null;
  is_active: boolean;
  companies?: { name: string; president_min_amount: number };
}

interface ApprovalStep {
  id: string;
  approval_flow_setup_id: string;
  workflow_type: number;
  approver_type: string;
  user_id: string | null;
  sequence: number;
  days_to_approve: number;
}

export function ApprovalFlowSetupConfig() {
  const [setups, setSetups] = useState<ApprovalFlowSetup[]>([]);
  const [steps, setSteps] = useState<ApprovalStep[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSetupId, setEditingSetupId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    company_id: "",
    department: ""
  });
  const [companies, setCompanies] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [addingStepToWorkflow, setAddingStepToWorkflow] = useState<number | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [newStepData, setNewStepData] = useState({
    user_id: "",
    days_to_approve: "3"
  });

  useEffect(() => {
    loadSetups();
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

      const { data: stepsData } = await supabase
        .from("approval_flows")
        .select("*")
        .not("approval_flow_setup_id", "is", null);
      setSteps(stepsData || []);
    } catch (error: any) {
      console.error("Error loading setups:", error);
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
    if (editingSetupId && formData.company_id) {
      const selectedCompany = companies.find(c => c.id === formData.company_id);
      if (selectedCompany) {
        loadUsers(selectedCompany.name);
      }
    }
  }, [editingSetupId, formData.company_id, companies]);

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
    if (!editingSetupId && formData.company_id && formData.department) {
      const selectedCompany = companies.find(c => c.id === formData.company_id);
      if (selectedCompany) {
        const autoName = `${selectedCompany.name} - ${formData.department}`;
        setFormData(prev => ({ ...prev, name: autoName }));
      }
    }
  }, [formData.company_id, formData.department, companies, editingSetupId]);

  const handleSaveSetup = async () => {
    try {
      if (!formData.company_id || !formData.department) {
        alert("Please select a company and department");
        return;
      }

      const payload = {
        name: formData.name,
        company_id: formData.company_id,
        department_id: formData.department || null,
        is_active: true
      };

      if (editingSetupId) {
        const { error } = await supabase
          .from("approval_flow_setups")
          .update(payload)
          .eq("id", editingSetupId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("approval_flow_setups")
          .insert(payload);
        if (error) throw error;
      }

      setShowForm(false);
      setEditingSetupId(null);
      setFormData({ name: "", company_id: "", department: "" });
      loadSetups();
    } catch (error: any) {
      alert("Error: " + error.message);
    }
  };

  const handleDeleteSetup = async (id: string) => {
    if (!confirm("Delete this approval flow setup and all its steps?")) return;
    try {
      const { error } = await supabase
        .from("approval_flow_setups")
        .delete()
        .eq("id", id);
      if (error) throw error;
      loadSetups();
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

      if (newStepData.approver_type === "Specific User" && !newStepData.user_id) {
        alert("Please select a user");
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

      const selectedUser = users.find(u => u.id === newStepData.user_id);
      const payload = {
        approval_flow_setup_id: editingSetupId,
        workflow_type: workflowType,
        approver_type: "Specific User",
        user_id: newStepData.user_id,
        sequence: nextSequence,
        days_to_approve: parseInt(newStepData.days_to_approve),
        is_required: true,
        is_active: true
      };

      const { error } = await supabase.from("approval_flows").insert(payload);
      if (error) throw error;

      setAddingStepToWorkflow(null);
      setNewStepData({ user_id: "", days_to_approve: "3" });
      loadSetups();
    } catch (error: any) {
      alert("Error: " + error.message);
    }
  };

  const handleEditStep = (step: ApprovalStep) => {
    setEditingStepId(step.id);
    setNewStepData({
      user_id: step.user_id || "",
      days_to_approve: step.days_to_approve.toString()
    });
    setAddingStepToWorkflow(step.workflow_type);
  };

  const handleUpdateStep = async (workflowType: number) => {
    try {
      if (!editingStepId) return;

      if (!newStepData.user_id) {
        alert("Please select a user");
        return;
      }

      const payload = {
        approver_type: "Specific User",
        user_id: newStepData.user_id,
        days_to_approve: parseInt(newStepData.days_to_approve)
      };

      const { error } = await supabase
        .from("approval_flows")
        .update(payload)
        .eq("id", editingStepId);

      if (error) throw error;

      setEditingStepId(null);
      setAddingStepToWorkflow(null);
      setNewStepData({ user_id: "", days_to_approve: "3" });
      loadSetups();
    } catch (error: any) {
      alert("Error: " + error.message);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm("Are you sure you want to delete this step?")) return;

    try {
      const { error } = await supabase
        .from("approval_flows")
        .delete()
        .eq("id", stepId);

      if (error) throw error;

      loadSetups();
    } catch (error: any) {
      alert("Error: " + error.message);
    }
  };

  const handleEditSetup = (setup: ApprovalFlowSetup) => {
    setEditingSetupId(setup.id);
    setFormData({
      name: setup.name,
      company_id: setup.company_id,
      department: setup.department_id || ""
    });
    setShowForm(true);
  };

  const selectedCompany = companies.find(c => c.id === formData.company_id);
  const currentSteps = editingSetupId ? steps.filter(s => s.approval_flow_setup_id === editingSetupId) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Approval Flow Setups</h2>
          <p className="text-slate-600 mt-1">Create and manage approval workflows with 3 budget scenarios</p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingSetupId(null);
            setFormData({ name: "", company_id: "", department: "" });
          }}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/30 transition-all"
        >
          <Plus size={20} />
          Add Setup
        </button>
      </div>

      {showForm && (
        <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl shadow-lg border border-slate-200 p-8 mb-8 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-slate-900">
              {editingSetupId ? "Edit Approval Flow Setup" : "New Approval Flow Setup"}
            </h3>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingSetupId(null);
                setFormData({ name: "", company_id: "", department: "" });
              }}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-2 gap-4">
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
                  setFormData({ name: "", company_id: "", department: "" });
                }}
                className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl transition-all"
              >
                Cancel
              </button>
            </div>
          </div>

          {editingSetupId && selectedCompany && (
            <>
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

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((workflowType) => {
                  const colors = [
                    { bg: "from-red-50 to-orange-50", border: "border-red-200", btn: "bg-red-500 hover:bg-red-600", badge: "bg-red-100 text-red-800", ring: "focus:ring-red-500", borderLight: "border-red-200", borderDark: "border-red-300" },
                    { bg: "from-green-50 to-emerald-50", border: "border-green-200", btn: "bg-green-500 hover:bg-green-600", badge: "bg-green-100 text-green-800", ring: "focus:ring-green-500", borderLight: "border-green-200", borderDark: "border-green-300" },
                    { bg: "from-amber-50 to-yellow-50", border: "border-amber-200", btn: "bg-amber-500 hover:bg-amber-600", badge: "bg-amber-100 text-amber-800", ring: "focus:ring-amber-500", borderLight: "border-amber-200", borderDark: "border-amber-300" }
                  ][workflowType - 1];

                  const titles = ["Unbudgeted", "Budgeted <" + (selectedCompany.president_min_amount ? parseFloat(selectedCompany.president_min_amount).toLocaleString('en-US', { minimumFractionDigits: 0 }) : '0'), "Budgeted >" + (selectedCompany.president_min_amount ? parseFloat(selectedCompany.president_min_amount).toLocaleString('en-US', { minimumFractionDigits: 0 }) : '0')];
                  const subtitles = ["No budget allocation", `Less than ₱${selectedCompany.president_min_amount ? parseFloat(selectedCompany.president_min_amount).toLocaleString('en-US', { minimumFractionDigits: 0 }) : '0'}`, `More than ₱${selectedCompany.president_min_amount ? parseFloat(selectedCompany.president_min_amount).toLocaleString('en-US', { minimumFractionDigits: 0 }) : '0'}`];

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
                          onClick={() => setAddingStepToWorkflow(workflowType)}
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
                            <label className="text-xs font-semibold text-slate-700">Select User</label>
                            <select
                              value={newStepData.user_id}
                              onChange={(e) => setNewStepData({ ...newStepData, user_id: e.target.value })}
                              className={`w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg ${colors.ring}`}
                            >
                              <option value="">Select User</option>
                              {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.full_name} ({user.email})
                                </option>
                              ))}
                            </select>
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
                                setNewStepData({ user_id: "", days_to_approve: "3" });
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
                            <label className="text-xs font-semibold text-slate-700">Select User</label>
                            <select
                              value={newStepData.user_id}
                              onChange={(e) => setNewStepData({ ...newStepData, user_id: e.target.value })}
                              className={`w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg ${colors.ring}`}
                            >
                              <option value="">Select User</option>
                              {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.full_name} ({user.email})
                                </option>
                              ))}
                            </select>
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
                                setNewStepData({ user_id: "", days_to_approve: "3" });
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
                          const displayName = step.approver_type === "Specific User" && step.user_id
                            ? users.find(u => u.id === step.user_id)?.full_name || "Specific User"
                            : step.approver_type;

                          return (
                            <div key={step.id} className={`bg-white rounded-lg p-2 shadow-sm border ${colors.borderLight}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-700">Step {step.sequence}</span>
                                    <span className={`text-xs px-2 py-0.5 ${colors.badge} rounded-full font-bold`}>
                                      {displayName}
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5">{step.days_to_approve} days</div>
                                </div>
                                <div className="flex items-center gap-1 ml-2">
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
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">All Approval Flow Setups</h3>
          <p className="text-sm text-slate-600 mt-0.5">{setups.length} configured setups</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50">
              <tr>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Name</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Company</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Department</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Total Steps</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Status</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {setups.map((setup) => {
                const setupSteps = steps.filter(s => s.approval_flow_setup_id === setup.id);
                return (
                  <tr key={setup.id} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all">
                    <td className="px-4 py-4 text-sm font-semibold text-slate-900">{setup.name}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">{setup.companies?.name || "-"}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">
                      {setup.department_id || <span className="text-slate-400 italic">Whole Company</span>}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <span className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shadow-sm bg-gradient-to-r from-amber-100 to-amber-200 text-amber-800">
                        {setupSteps.length} Steps
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
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

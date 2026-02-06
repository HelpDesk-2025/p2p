# User Acceptance Testing (UAT) Document

## Procure-to-Pay (P2P) System

**Document Version:** 1.0
**Date:** February 6, 2026
**Prepared For:** Stakeholder Review & Sign-Off

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [UAT Scope & Objectives](#2-uat-scope--objectives)
3. [User Roles & Access Levels](#3-user-roles--access-levels)
4. [Test Environment Prerequisites](#4-test-environment-prerequisites)
5. [Module 1: Authentication & Account Management](#5-module-1-authentication--account-management)
6. [Module 2: Dashboard](#6-module-2-dashboard)
7. [Module 3: Purchase Requisition](#7-module-3-purchase-requisition)
8. [Module 4: Canvass Request](#8-module-4-canvass-request)
9. [Module 5: Cash Advance](#9-module-5-cash-advance)
10. [Module 6: Petty Cash](#10-module-6-petty-cash)
11. [Module 7: Reimbursement](#11-module-7-reimbursement)
12. [Module 8: Approval Workflows](#12-module-8-approval-workflows)
13. [Module 9: SME Review](#13-module-9-sme-review)
14. [Module 10: Procurement Checking](#14-module-10-procurement-checking)
15. [Module 11: Approval Ledger (Reports)](#15-module-11-approval-ledger-reports)
16. [Module 12: Configuration](#16-module-12-configuration)
17. [Module 13: MSBC Integration](#17-module-13-msbc-integration)
18. [Module 14: Email Notifications](#18-module-14-email-notifications)
19. [Module 15: PDF & Document Generation](#19-module-15-pdf--document-generation)
20. [Module 16: Mobile Responsiveness](#20-module-16-mobile-responsiveness)
21. [End-to-End Workflow Scenarios](#21-end-to-end-workflow-scenarios)
22. [UAT Sign-Off](#22-uat-sign-off)
23. [Glossary](#23-glossary)

---

## 1. Introduction

This document outlines the User Acceptance Testing plan for the Procure-to-Pay (P2P) System. The system manages the complete lifecycle of procurement and payment requests, including Purchase Requisitions, Canvass Requests, Cash Advances, Petty Cash, and Reimbursements, each with configurable multi-level approval workflows.

**System Modules:**
- Authentication & User Management
- Dashboard & Reporting
- Request Creation (PR, Canvass, Cash Advance, Petty Cash, Reimbursement)
- Multi-Level Approval Workflows
- Procurement Checking & SME Reviews
- Configuration Management
- MSBC Accounting Integration
- Email Notifications & PDF Generation

---

## 2. UAT Scope & Objectives

### Objectives
- Validate that all business processes function as specified
- Confirm correct approval flow routing based on company, department, request type, budget status, and amount thresholds
- Verify role-based access control and permissions
- Ensure data integrity across all request lifecycles
- Validate email notifications at each approval stage
- Confirm PDF/document generation accuracy
- Test MSBC accounting system integration
- Verify mobile responsiveness

### Out of Scope
- Load/performance testing
- Penetration/security testing
- Infrastructure/deployment testing

---

## 3. User Roles & Access Levels

| Role | Description | Access |
|------|-------------|--------|
| Standard | Regular employees | Create & view own requests, Dashboard |
| Approver | Department heads, managers | All Standard permissions + Approve assigned requests |
| Procurement | Procurement staff | All Standard + Procurement Checking, SME requests |
| Admin | System administrators | Full system access including Configuration |

---

## 4. Test Environment Prerequisites

Before beginning UAT, confirm the following:

- [ ] Test user accounts created for each role (Standard, Approver, Procurement, Admin)
- [ ] At least two companies configured with departments
- [ ] Approval flow setups defined for all request types (PR, Canvass, Cash Advance, Petty Cash, Reimbursement)
- [ ] Number series configured for all document types
- [ ] Payment modes configured with required fields
- [ ] SMTP settings configured for email testing
- [ ] PR Checklists configured (for Purchase Requisition testing)
- [ ] Expense Types configured (for Petty Cash testing)
- [ ] MSBC credentials available (for integration testing)

---

## 5. Module 1: Authentication & Account Management

### TC-AUTH-001: User Registration

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Navigate to login page, click "Sign Up" tab | Registration form displayed with fields: Full Name, Email, Password, Company, Department | | |
| 2 | Select a Company from dropdown | Only active companies shown; Department dropdown populates with departments for that company | | |
| 3 | Fill all fields and click "Sign Up" | OTP sent to email; OTP verification screen appears | | |
| 4 | Enter correct 6-digit OTP | Account created; success message shown: "Account created, pending admin approval" | | |
| 5 | Enter incorrect OTP | Error message: "Invalid OTP" | | |
| 6 | Attempt to log in with new account before admin activation | Login denied with message: "Account is pending approval" | | |

### TC-AUTH-002: User Login

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Enter valid email and password for active account | Successful login; redirected to Dashboard | | |
| 2 | Enter valid email with wrong password | Error message displayed; login denied | | |
| 3 | Enter non-existent email | Error message displayed; login denied | | |
| 4 | Login with inactive/deactivated account | Error: "Account is inactive" or "Account pending approval" | | |

### TC-AUTH-003: Password Reset (Forgot Password)

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Click "Forgot password?" on login page | Email input form appears | | |
| 2 | Enter registered email and submit | OTP sent to email; OTP entry screen shown | | |
| 3 | Enter correct 6-digit OTP | New password form appears | | |
| 4 | Enter new password (min 6 characters) and confirm | Password updated; redirected to login | | |
| 5 | Login with new password | Successful login | | |
| 6 | Attempt login with old password | Login denied | | |

### TC-AUTH-004: Change Password (While Logged In)

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Navigate to Change Password from sidebar | Change Password form displayed | | |
| 2 | Enter current password, new password (min 6 chars), and confirmation | Password updated; success message | | |
| 3 | Enter mismatched new password and confirmation | Validation error: "Passwords do not match" | | |
| 4 | Enter new password shorter than 6 characters | Validation error: minimum length | | |

### TC-AUTH-005: User Impersonation (Admin Only)

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | As Admin, navigate to Impersonation config | User list displayed | | |
| 2 | Select a Standard user to impersonate | Orange banner appears: "Viewing as: [User Name]" with role/company/department info | | |
| 3 | Navigate to Dashboard | Dashboard shows the impersonated user's request counts and pending approvals | | |
| 4 | Navigate to Requests modules | Only impersonated user's requests visible | | |
| 5 | Click "Exit View" on the banner | Returns to admin context; banner disappears | | |
| 6 | As non-admin user, attempt to access Impersonation | Menu item not visible; access denied | | |

### TC-AUTH-006: Session Management

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Log in and leave browser idle | Session validated periodically (every 30 seconds) | | |
| 2 | Manually invalidate session (e.g., clear cookies) | User redirected to login on next action | | |

---

## 6. Module 2: Dashboard

### TC-DASH-001: Dashboard Display

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Log in as Standard user | Dashboard shows: Pending/Approved/Rejected status cards with correct counts | | |
| 2 | Verify "My Requests" section | Shows count per request type (PR, Canvass, Petty Cash, Cash Advance, Reimbursement) matching actual data | | |
| 3 | Log in as Approver | "Pending Approvals" section visible with counts per request type | | |
| 4 | Verify pending approval count | Count matches actual number of requests awaiting this approver's action | | |
| 5 | Click on a request type in Pending Approvals | Navigates to the corresponding approval module | | |
| 6 | Log in as Standard (non-approver) | "Pending Approvals" section not visible | | |

### TC-DASH-002: Dashboard During Impersonation

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | As Admin, impersonate an Approver user | Dashboard refreshes to show impersonated user's counts | | |
| 2 | Verify pending approval counts | Counts reflect requests pending for the impersonated user | | |
| 3 | Exit impersonation | Dashboard reverts to admin's actual counts | | |

---

## 7. Module 3: Purchase Requisition

### TC-PR-001: Create PR Draft

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Navigate to Purchase Requisition module | PR list displayed (user's own requests) | | |
| 2 | Click "New Request" or equivalent button | PR creation form opens | | |
| 3 | Verify auto-generated fields | Document No and PR Number auto-populated | | |
| 4 | Fill in: Description, Purpose, Date Required | Fields accept input; Date Required must be today or later | | |
| 5 | Select Company and Department | Department dropdown cascades based on Company selection | | |
| 6 | Toggle "Is Budgeted" | Budget toggle works; affects approval workflow type | | |
| 7 | Select Purchase Type (Purchase Order / Non-Purchase Order) | If Non-PO: Payee field becomes required | | |
| 8 | Add line items (Description, Qty, Unit, Unit Price) | Total Price auto-calculated (Qty x Unit Price); Grand Total updated | | |
| 9 | Select Payment Mode | Dynamic payment mode fields appear based on selection | | |
| 10 | Click "Save as Draft" | PR saved with status "Draft"; appears in PR list | | |

### TC-PR-002: PR Validation on Submit

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Attempt submit without Description | Validation error shown | | |
| 2 | Attempt submit with Date Required in past | Validation error shown | | |
| 3 | Attempt submit with 0 amount (no items) | Validation error: amount must be > 0 | | |
| 4 | Attempt submit Non-PO without Payee name | Validation error: Payee required for Non-PO | | |
| 5 | Attempt submit without selecting Payment Mode | Validation error shown | | |
| 6 | Attempt submit with required payment mode fields empty | Validation error on missing required fields | | |
| 7 | Attempt submit with required checklist items missing attachments | Validation error: required checklist items incomplete | | |

### TC-PR-003: Submit PR for Approval

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Complete all required fields and click "Submit" | PR status changes from "Draft" to "Pending" | | |
| 2 | Verify approval level | current_approval_level set to 0 (first approver) | | |
| 3 | Check email notification | First approver in the approval chain receives email | | |
| 4 | Verify request appears in approver's pending list | First approver sees the PR in their PR Approval module | | |

### TC-PR-004: Edit Draft PR

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Open a Draft PR | Edit form displayed with all previously saved data | | |
| 2 | Modify fields and save | Changes saved; data persists on reload | | |
| 3 | Attempt to edit a Pending or Approved PR | Edit not available; view-only mode | | |

### TC-PR-005: PR Attachments & Checklist

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Upload attachment file (PDF, image) | File uploaded; shown in attachments list | | |
| 2 | Upload large file (>10MB) | File uploaded via large file handler; no timeout | | |
| 3 | Upload checklist item attachment | File associated with correct checklist item | | |
| 4 | Download previously uploaded attachment | File downloads correctly | | |
| 5 | Remove an attachment | File removed from list | | |

### TC-PR-006: View PR Details

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Click on any PR in the list | Detail modal opens showing all fields | | |
| 2 | Verify all data displayed: items, payment mode, checklist, attachments, approval progress | All data matches what was entered | | |
| 3 | Verify approval progress tracker | Shows correct current level, approver names, and statuses | | |

### TC-PR-007: Delete Draft PR

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Open a Draft PR and click Delete | Confirmation dialog appears | | |
| 2 | Confirm deletion | PR removed from active list | | |
| 3 | Attempt to delete a Pending PR | Delete option not available | | |

---

## 8. Module 4: Canvass Request

### TC-CNV-001: Create Canvass Linked to PR

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Navigate to Canvass module and create new request | Canvass form opens | | |
| 2 | Select "Link to existing PR" | PR dropdown shows approved PRs available for linking | | |
| 3 | Select a PR | Items auto-populate from the linked PR | | |
| 4 | Add supplier quotations (Supplier Name, Contact, Unit Price per item) | Supplier data entered; totals calculated per supplier | | |
| 5 | Add at least 2 suppliers for comparison | Multiple supplier columns displayed | | |
| 6 | Save as Draft | Canvass saved with linked PR reference | | |

### TC-CNV-002: Create Standalone Canvass

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Create new canvass without linking to PR | Blank items section shown | | |
| 2 | Manually add items (Description, Qty, UOM) | Items added to list | | |
| 3 | Add supplier quotations | Quotation data entered per supplier | | |
| 4 | Submit for approval | Status changes to Pending; approval workflow starts | | |

### TC-CNV-003: Canvass Approval with Vendor Recommendation

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | As non-final approver, approve canvass | Request moves to next level; no recommendation option shown | | |
| 2 | As final approver, view canvass | Recommendation section visible | | |
| 3 | Select recommended supplier and enter remarks | Recommendation saved with approval | | |
| 4 | Verify approved canvass shows recommendation | recommended_quotation_index and remarks visible | | |

---

## 9. Module 5: Cash Advance

### TC-CA-001: Create Cash Advance

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Navigate to Cash Advance module, click new request | CA form opens with auto-generated CA Number | | |
| 2 | Fill in: Payee, Purpose, Amount, Date Needed | Fields accept input | | |
| 3 | Select Company and Department | Cascading dropdown works | | |
| 4 | Toggle Budgeted status | Budget status recorded | | |
| 5 | Select Payment Mode | Dynamic payment mode line fields appear | | |
| 6 | Fill required payment mode lines | Required fields validated | | |
| 7 | Upload attachments | Files uploaded and listed | | |
| 8 | Save as Draft | CA saved as Draft | | |

### TC-CA-002: Submit Cash Advance

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Complete all required fields and Submit | Status changes to Pending | | |
| 2 | Verify approval email sent | First approver receives notification | | |
| 3 | Verify CA appears in approver's pending list | CA visible in Cash Advance Approval module | | |

### TC-CA-003: Cash Advance Approval with ASL

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | As approver, open pending CA | Detail modal shown with all CA fields | | |
| 2 | Fill Outstanding ASL field | ASL status dropdown/checkboxes functional | | |
| 3 | Enter Remarks (OK / Under Query) | Remarks saved | | |
| 4 | Approve the request | CA moves to next approval level or Approved status | | |

### TC-CA-004: Cash Advance Validation

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Submit CA with amount = 0 | Validation error | | |
| 2 | Submit CA without Payee | Validation error | | |
| 3 | Submit CA without Payment Mode | Validation error | | |

---

## 10. Module 6: Petty Cash

### TC-PC-001: Create Petty Cash Request

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Navigate to Petty Cash module, create new | PC form with auto-generated PC Number | | |
| 2 | Select Request Type: "For Cash Advance" / "For Reimbursement" / "For Liquidation" | Type recorded; form adjusts accordingly | | |
| 3 | Fill in: Purpose, Amount, Date of Transactions | Fields accept input | | |
| 4 | Add expense items (Date, Description, Amount, Expense Type, Sub-item) | Expense items listed; totals calculated | | |
| 5 | Select Expense Type from dropdown | Sub-items populate based on selected type | | |
| 6 | If sub-item has "Specify" option, enter custom value | Custom input field appears and accepts value | | |
| 7 | Submit for approval | Status changes to Pending | | |

### TC-PC-002: Petty Cash - Mark as Received

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | As authorized user, open an Approved petty cash | "Mark as Received" option available | | |
| 2 | Mark as received | received_at and received_by fields updated; status changes to Disbursed | | |

### TC-PC-003: Petty Cash Liquidation Link

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Create PC with type "For Liquidation" | Link field appears for selecting original CA/PC | | |
| 2 | Select original request | Original amount displayed; variance calculated | | |
| 3 | Enter actual expenses | Balance (original - expenses) calculated automatically | | |

### TC-PC-004: Generate Petty Cash Form PDF

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Open an Approved petty cash request | "Generate Form" button visible | | |
| 2 | Click Generate Form | PDF generated with all request data pre-filled | | |
| 3 | Download the generated PDF | Valid PDF downloaded | | |

---

## 11. Module 7: Reimbursement

### TC-REIMB-001: Create Standalone Reimbursement

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Navigate to Reimbursement module, create new | Reimbursement form with auto-generated number | | |
| 2 | Fill in: Purpose, Date Needed, Payee | Fields accept input | | |
| 3 | Add expense items (Date, Description, Amount) | Items listed; total auto-calculated | | |
| 4 | Upload receipt attachments | Files uploaded | | |
| 5 | Submit for approval | Status changes to Pending | | |

### TC-REIMB-002: Create Liquidation Reimbursement

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Create reimbursement with Liquidation type | Link to CA/PC dropdown appears | | |
| 2 | Select an approved Cash Advance or Petty Cash | Original advance amount displayed | | |
| 3 | Enter actual expense items | Variance (overage/shortage) calculated | | |
| 4 | Submit | Linked request reference stored; approval workflow starts | | |

### TC-REIMB-003: Reimbursement Validation

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Submit without expense items | Validation error: at least one expense required | | |
| 2 | Submit with amount = 0 | Validation error | | |
| 3 | Expense dates in the future | Validation error or warning | | |

### TC-REIMB-004: Generate Reimbursement Form PDF

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Open Approved reimbursement | "Generate Form" button available | | |
| 2 | Click Generate Form | PDF generated with expense details and amounts | | |
| 3 | Verify PDF content | All data matches the request record | | |

---

## 12. Module 8: Approval Workflows

### TC-APPR-001: Single-Level Approval

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Submit a request with single-level approval configured | Request goes to Pending; single approver notified | | |
| 2 | Approver approves the request | Status changes directly to Approved; requester notified | | |

### TC-APPR-002: Multi-Level Approval (3 Levels)

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Submit a request with 3-level approval | Status: Pending (Level 1); first approver notified | | |
| 2 | Level 1 approver approves | Status: Pending (Level 2); second approver notified | | |
| 3 | Level 2 approver approves | Status: Pending (Level 3); third approver notified | | |
| 4 | Level 3 approver approves | Status: Approved; requester notified | | |
| 5 | Verify approval ledger | 3 "Approved" entries plus original "Submitted" entry | | |

### TC-APPR-003: Rejection at Any Level

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Submit request; Level 1 approver rejects | Status: Rejected; requester notified | | |
| 2 | Verify rejection requires comments | Empty comments on reject shows validation error | | |
| 3 | Verify remaining approvers get "Auto-Rejected" ledger entries | Ledger shows auto-rejected entries for levels 2, 3 | | |
| 4 | Submit another request; Level 1 approves, Level 2 rejects | Status: Rejected at Level 2 | | |

### TC-APPR-004: Workflow Type Selection

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Submit request: Budgeted = No | Uses Workflow Type 1 (Unbudgeted) approval chain | | |
| 2 | Submit request: Budgeted = Yes, Amount < President Min | Uses Workflow Type 2 approval chain | | |
| 3 | Submit request: Budgeted = Yes, Amount >= President Min | Uses Workflow Type 3 approval chain (includes President) | | |

### TC-APPR-005: For-Checking Approval Steps

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Configure an approval step with "For Checking" flag | Step saved with for_checking = true | | |
| 2 | Submit request that routes through this step | Checker sees request and can approve | | |
| 3 | Checker approves | Request advances; checker's action logged as informational | | |
| 4 | Verify checker's signature excluded from final RFP | RFP PDF does not include checker's e-signature | | |

### TC-APPR-006: Approval Progress Tracker

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Open a Pending request (any level) | Progress tracker shows all approval steps | | |
| 2 | Verify completed steps show green checkmark | Approved levels marked with checkmark and date | | |
| 3 | Verify current step shows "In Progress" indicator | Current level highlighted | | |
| 4 | Verify future steps show pending indicator | Upcoming levels shown as grey/pending | | |
| 5 | After rejection, verify rejected step shows X mark | Rejected level marked with X icon | | |

### TC-APPR-007: Unauthorized Approval Attempt

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | As non-designated approver, attempt to approve | Error: "You are not authorized to approve this request at this level" | | |
| 2 | As designated approver for Level 2, attempt to approve Level 1 request | Error: Not the current approver | | |

### TC-APPR-008: Executive Requester Approval Rules

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Submit request as user with approver_type = "Executive" | Additional executive approval steps injected into workflow | | |
| 2 | Verify RFP signatures for Executive requester (non-CA) | Only first approver signature shown | | |
| 3 | Verify RFP signatures for Executive requester (CA) | First and second approver signatures shown | | |

---

## 13. Module 9: SME Review

### TC-SME-001: Request SME Review

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | As Procurement user, open approved PO in Procurement Checking | "Request SME Review" option available | | |
| 2 | Select SME user from list | User list shows eligible users | | |
| 3 | Enter review purpose and submit | SME request created; SME user notified via email | | |

### TC-SME-002: SME Approval

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | As SME user, navigate to SME Approval module | Pending SME reviews listed | | |
| 2 | Open an SME review request | Full PR details visible with review purpose | | |
| 3 | Enter technical comments and Approve | SME request status: Approved | | |
| 4 | Alternatively, Reject with technical concerns | SME request status: Rejected | | |

### TC-SME-003: SME Unique Constraint

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Request SME review for same PR to same SME twice | Error or prevented: duplicate request not allowed | | |
| 2 | Request SME review for same PR to different SME | Allowed: new SME request created | | |

---

## 14. Module 10: Procurement Checking

### TC-PROC-001: View Approved Purchase Orders

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | As Procurement user, navigate to Procurement Checking | List of approved POs (Purchase Order type PRs) displayed | | |
| 2 | Verify only Purchase Order type PRs shown | Non-PO requests not listed | | |

### TC-PROC-002: Procurement Verification

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Open an approved PO | Full PR details, checklist status, and attachments visible | | |
| 2 | Verify checklist completion status | Shows which required items are complete/incomplete | | |
| 3 | Mark as "Ready for Canvass" | ready_for_canvass flag set; can proceed to create Canvass | | |

### TC-PROC-003: Create Canvass from Procurement

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | From Procurement Checking, create linked Canvass | Canvass form opens with PR items pre-populated | | |
| 2 | Verify PR link maintained | Canvass record references the source PR | | |

---

## 15. Module 11: Approval Ledger (Reports)

### TC-LEDG-001: View Approval Ledger

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Navigate to Approval Ledger | Full ledger list displayed with all approval actions | | |
| 2 | Verify columns: Request Type, Request Number, Approver, Action, Date, Comments | All columns visible | | |

### TC-LEDG-002: Filter Approval Ledger

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Filter by Request Type: "Purchase Requisition" | Only PR entries shown | | |
| 2 | Filter by Action: "Approved" | Only approval entries shown | | |
| 3 | Filter by Action: "Rejected" | Only rejection entries shown | | |
| 4 | Filter by Date Range (From - To) | Only entries within date range shown | | |
| 5 | Search by request number | Matching entries shown | | |
| 6 | Search by approver name | Matching entries shown | | |
| 7 | Combine multiple filters | Results match all filter criteria | | |

### TC-LEDG-003: Ledger Pagination

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | With more than 25 entries, verify pagination | Page controls visible; items per page selector works | | |
| 2 | Change items per page (10, 25, 50, 100) | List updates to show selected count | | |
| 3 | Navigate between pages | Data loads correctly for each page | | |

---

## 16. Module 12: Configuration

### TC-CFG-001: Approval Flow Setup

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Navigate to Approval Flow Setup (Admin only) | List of existing setups displayed | | |
| 2 | Create new setup: Name, Company, Department, Request Type | Setup saved; appears in list | | |
| 3 | Add Workflow Type 1 steps (sequence, approver type, days, for_checking, required) | Steps saved in correct order | | |
| 4 | Add Workflow Type 2 steps | Different approval chain saved for budgeted requests | | |
| 5 | Add Workflow Type 3 steps | Includes President-level approval | | |
| 6 | Edit existing setup | Changes saved and reflected | | |
| 7 | Deactivate a setup | Setup no longer used for new requests | | |
| 8 | Create department-specific setup | Takes precedence over company-wide setup | | |

### TC-CFG-002: Number Series

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | View number series list | All series shown (PR, CV, PC, CA, RB) | | |
| 2 | Edit prefix or number length | Changes saved; preview updated | | |
| 3 | Verify auto-numbering | New document gets correctly formatted number (e.g., PR000000042) | | |
| 4 | Verify sequential numbering | Each new document increments by 1 with no gaps | | |
| 5 | Reset number series | Next document starts from reset value | | |

### TC-CFG-003: Roles & Permissions

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | View roles list | Standard, Approver, Procurement, Admin roles shown | | |
| 2 | View permissions for a role | Checkboxes show assigned permissions by module | | |
| 3 | Add a permission to Standard role (e.g., "Canvass Request") | Standard users can now access Canvass module | | |
| 4 | Remove a permission from a role | Users with that role lose access to the module | | |
| 5 | Verify permission changes take effect | After role change, user's menu and access updates | | |

### TC-CFG-004: Company Configuration

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Create a new company | Company saved; appears in dropdowns | | |
| 2 | Set President Minimum Amount (e.g., 500,000) | Amount saved; affects workflow type determination | | |
| 3 | Add departments to company | Departments available in cascading dropdown | | |
| 4 | Deactivate a company | Company no longer appears in active dropdowns | | |

### TC-CFG-005: Payment Modes

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Create payment mode (e.g., "Bank Transfer") | Mode saved | | |
| 2 | Add line items (Account No - Required, Branch - Optional) | Line definitions saved | | |
| 3 | Select this mode in a request form | Dynamic fields appear: Account No (required), Branch (optional) | | |
| 4 | Submit request with required payment mode field empty | Validation error | | |

### TC-CFG-006: SMTP Configuration

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Configure SMTP: Host, Port, From Email, Username, Password, TLS | Settings saved | | |
| 2 | Test email sending (if test button available) | Test email received at configured address | | |
| 3 | Submit a request to trigger approval email | Email sent via configured SMTP server | | |

### TC-CFG-007: Expense Types (for Petty Cash)

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Create expense type (e.g., "Transportation") | Type saved | | |
| 2 | Add sub-items (e.g., "Taxi", "Grab", "Specify") | Sub-items saved under parent type | | |
| 3 | In Petty Cash form, select this expense type | Sub-items appear in dropdown | | |
| 4 | Select "Specify" sub-item | Custom text input field appears | | |

### TC-CFG-008: Withholding Tax Rates

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | View withholding tax rates list | Rates displayed | | |
| 2 | Create/edit a rate | Rate saved and available for calculations | | |

### TC-CFG-009: User Management

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | View all users | Complete user list with name, email, role, company, department, status | | |
| 2 | Activate a pending user account | User can now log in | | |
| 3 | Deactivate an active user | User can no longer log in | | |
| 4 | Change user role (e.g., Standard to Approver) | User's permissions update accordingly | | |
| 5 | Update user's company/department | Changes reflected in user's profile | | |

---

## 17. Module 13: MSBC Integration

### TC-MSBC-001: Post PR to MSBC

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Open an Approved PR (Non-PO type) | "Post to MSBC" button visible (Admin only) | | |
| 2 | Click "Post to MSBC" | Loading indicator shown; edge function called | | |
| 3 | On success | msbc_posting_status = "synced"; journal ID stored; notification email sent | | |
| 4 | Verify sync status display | Status badge shows "Synced" with date and journal ID | | |

### TC-MSBC-002: Post CA to MSBC

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Open an Approved Cash Advance | "Post to MSBC" button visible | | |
| 2 | Post to MSBC | msbc_sync_status updated; journal ID recorded | | |

### TC-MSBC-003: Post Canvass to MSBC

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Open an Approved Canvass | "Post to MSBC" button visible | | |
| 2 | Post to MSBC | Sync status updated | | |

### TC-MSBC-004: MSBC Failure Handling

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Simulate MSBC posting failure (invalid credentials or network issue) | msbc_posting_status = "failed"; error message stored | | |
| 2 | Verify error display | Error message visible to admin | | |
| 3 | Retry posting after fixing issue | Can re-attempt posting; status updates on success | | |

---

## 18. Module 14: Email Notifications

### TC-EMAIL-001: Submission Notification

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Submit any request | First approver receives email with: Request Type, Document No, Requester Name, Department, Amount | | |
| 2 | Verify email formatting | HTML email with proper styling, readable layout | | |

### TC-EMAIL-002: Approval Notification

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Approve a request (non-final level) | Next approver receives email notification | | |
| 2 | Approve a request (final level) | Requester receives "Fully Approved" email | | |
| 3 | Verify email content | Includes approver name, action taken, comments (if any) | | |

### TC-EMAIL-003: Rejection Notification

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Reject a request with comments | Requester receives rejection email | | |
| 2 | Verify email content | Includes rejection reason/comments, approver name | | |

### TC-EMAIL-004: OTP Emails

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Trigger signup OTP | 6-digit OTP email received | | |
| 2 | Trigger password reset OTP | 6-digit OTP email received | | |
| 3 | Verify OTP expiration | Expired OTP rejected on verification | | |

---

## 19. Module 15: PDF & Document Generation

### TC-PDF-001: RFP Generation

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Final-approve a Non-PO Purchase Requisition | RFP PDF auto-generated | | |
| 2 | Download RFP | Valid PDF with request details, items, and approval signatures | | |
| 3 | Verify e-signatures on RFP | Approved approvers' signatures shown (checkers excluded) | | |
| 4 | Regenerate RFP (Admin) | New PDF generated replacing old one | | |

### TC-PDF-002: Cash Advance Form

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Open approved Cash Advance | "View Approved CA Form" or download option | | |
| 2 | Download form | PDF with all CA details, payment info, approval info | | |

### TC-PDF-003: Petty Cash Form

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Generate Petty Cash form | PDF with expense items, amounts, and approval data | | |
| 2 | Verify form data accuracy | All fields match the request record | | |

### TC-PDF-004: Liquidation Form

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Generate Liquidation form for Petty Cash | PDF with original amount, expenses, and balance | | |
| 2 | Verify calculations | Original amount - expenses = correct balance | | |

### TC-PDF-005: Reimbursement Form

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Generate Reimbursement form | PDF with expense breakdown and totals | | |
| 2 | Verify form content | All expense items and amounts accurate | | |

### TC-PDF-006: PDF Merging

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Upload multiple attachments to a request | Files stored individually | | |
| 2 | Merge attachments into single PDF | Combined PDF created with all attachments | | |
| 3 | Download merged PDF | Valid multi-page PDF | | |

---

## 20. Module 16: Mobile Responsiveness

### TC-MOB-001: Login Page

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Open login page on mobile device/viewport | Login form properly scaled and usable | | |
| 2 | Sign up form on mobile | All fields accessible; dropdowns work | | |

### TC-MOB-002: Navigation

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Open sidebar on mobile | Collapsible sidebar opens/closes properly | | |
| 2 | Navigate between modules | Smooth transitions; no layout breaks | | |

### TC-MOB-003: Request Lists

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | View PR list on mobile | Card layout displayed (instead of table) | | |
| 2 | Scroll through list with many items | List scrolls smoothly; no clipping | | |
| 3 | Pagination controls accessible | Page controls usable on mobile | | |

### TC-MOB-004: Request Forms

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Create request on mobile | Form fields properly stacked and accessible | | |
| 2 | Add/remove items on mobile | Item management controls work on touch | | |
| 3 | Upload files on mobile | File picker works; upload succeeds | | |

### TC-MOB-005: Approval List Scrolling

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | View PR Approvals list on mobile | Card layout displayed; list scrollable | | |
| 2 | View Canvass Approvals on mobile | Table scrollable horizontally and vertically | | |
| 3 | View Cash Advance Approvals on mobile | List scrollable within constrained height | | |
| 4 | View Petty Cash Approvals on mobile | List scrollable | | |
| 5 | View Reimbursement Approvals on mobile | List scrollable | | |
| 6 | View SME Approvals on mobile | List scrollable | | |

### TC-MOB-006: Approval Modals

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Open request detail modal on mobile | Modal fills screen; content scrollable | | |
| 2 | Approve/Reject buttons accessible | Action buttons visible and tappable | | |

---

## 21. End-to-End Workflow Scenarios

### E2E-001: Complete Purchase Requisition to Canvass Workflow

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | Standard user creates and submits a Purchase Order PR | PR status: Pending; first approver notified | | |
| 2 | Level 1 approver approves | Level 2 approver notified | | |
| 3 | Level 2 approver approves | PR status: Approved; requester notified | | |
| 4 | Procurement officer opens PR in Procurement Checking | PR details and checklist visible | | |
| 5 | Procurement requests SME review | SME notified | | |
| 6 | SME approves technical review | SME status: Approved | | |
| 7 | Procurement marks PR as "Ready for Canvass" | Flag updated | | |
| 8 | Procurement creates linked Canvass | Canvass with PR items; submitted for approval | | |
| 9 | Canvass approvers approve with vendor recommendation | Canvass: Approved with recommendation | | |
| 10 | Admin posts to MSBC | Sync successful; journal ID recorded | | |

### E2E-002: Cash Advance and Liquidation Workflow

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | User creates and submits Cash Advance (amount: 50,000) | CA status: Pending | | |
| 2 | Approver(s) approve CA | CA status: Approved | | |
| 3 | Finance marks CA as received/disbursed | CA status: Disbursed | | |
| 4 | User creates Reimbursement (Liquidation type) linked to this CA | Original amount (50,000) displayed | | |
| 5 | User enters actual expenses (45,000) | Variance: 5,000 (under-spent) displayed | | |
| 6 | User submits liquidation reimbursement | Reimbursement: Pending | | |
| 7 | Approver(s) approve | Reimbursement: Approved | | |
| 8 | Finance processes settlement (user returns 5,000) | Process complete | | |

### E2E-003: Non-PO Purchase Requisition with RFP

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | User creates Non-PO PR with Payee | Draft saved | | |
| 2 | User submits | PR: Pending | | |
| 3 | All approval levels approve | PR: Approved; RFP auto-generated | | |
| 4 | Download and verify RFP PDF | RFP contains request details and approval signatures | | |
| 5 | Admin posts to MSBC | Sync successful | | |

### E2E-004: Multi-Company Request

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | User with access to Company A creates PR for Company A | PR uses Company A's approval flow and number series | | |
| 2 | Company A approvers approve | Approval follows Company A workflow | | |
| 3 | Verify Company B approvers cannot see this request | Request filtered by company | | |
| 4 | Admin can see requests from both companies | All requests visible for admin | | |

### E2E-005: Rejection and Resubmission

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | User submits a request | Status: Pending | | |
| 2 | Approver rejects with comments: "Insufficient documentation" | Status: Rejected; requester notified with reason | | |
| 3 | Verify auto-rejected ledger entries for remaining approvers | All remaining levels show "Auto-Rejected" | | |
| 4 | User reviews rejection reason | Rejection comments visible in request details | | |
| 5 | User edits the request, adds documentation, resubmits | Status: Pending (approval restarts from Level 1) | | |
| 6 | Approvers approve | Status: Approved | | |

### E2E-006: Petty Cash with Expense Types and Liquidation

| Step | Action | Expected Result | Pass/Fail | Remarks |
|------|--------|-----------------|-----------|---------|
| 1 | User creates Petty Cash (For Cash Advance), amount: 5,000 | PC saved with correct type | | |
| 2 | Submit and get approved | PC: Approved | | |
| 3 | Mark as received | PC: Disbursed | | |
| 4 | User creates new Petty Cash (For Liquidation) linked to original | Original amount shown; expense entry form available | | |
| 5 | Add categorized expenses (Transportation: Taxi - 1,200; Meals: 800) | Expenses categorized; total: 2,000 | | |
| 6 | Submit liquidation | Liquidation request: Pending | | |
| 7 | Approve liquidation | Approved; balance: 3,000 to return | | |
| 8 | Generate Liquidation PDF | PDF with expense breakdown and balance | | |

---

## 22. UAT Sign-Off

### Test Summary

| Module | Total Test Cases | Passed | Failed | Blocked | Not Tested |
|--------|-----------------|--------|--------|---------|------------|
| Authentication | | | | | |
| Dashboard | | | | | |
| Purchase Requisition | | | | | |
| Canvass | | | | | |
| Cash Advance | | | | | |
| Petty Cash | | | | | |
| Reimbursement | | | | | |
| Approval Workflows | | | | | |
| SME Review | | | | | |
| Procurement Checking | | | | | |
| Approval Ledger | | | | | |
| Configuration | | | | | |
| MSBC Integration | | | | | |
| Email Notifications | | | | | |
| PDF Generation | | | | | |
| Mobile Responsiveness | | | | | |
| End-to-End Scenarios | | | | | |
| **TOTAL** | | | | | |

### Defects Found

| Defect ID | Module | Severity | Description | Status |
|-----------|--------|----------|-------------|--------|
| | | | | |
| | | | | |
| | | | | |

### Sign-Off

| Role | Name | Signature | Date | Verdict (Accept/Reject) |
|------|------|-----------|------|-------------------------|
| Project Manager | | | | |
| Business Analyst | | | | |
| QA Lead | | | | |
| End User Representative | | | | |
| IT Manager | | | | |

**UAT Status:** [ ] ACCEPTED / [ ] ACCEPTED WITH CONDITIONS / [ ] REJECTED

**Conditions (if applicable):**

---

## 23. Glossary

| Term | Definition |
|------|-----------|
| PR | Purchase Requisition |
| PO | Purchase Order (a type of PR) |
| Non-PO | Non-Purchase Order (a type of PR, e.g., services, utilities) |
| CA | Cash Advance |
| PC | Petty Cash |
| Reimb | Reimbursement |
| RFP | Request for Payment (generated PDF document with approval signatures) |
| SME | Subject Matter Expert |
| MSBC | Microsoft Business Central (accounting system) |
| ASL | Advanced Settlement Ledger |
| SLA | Service Level Agreement (approval time limit) |
| RLS | Row Level Security (database access control) |
| OTP | One-Time Password |
| E-Sig | Electronic Signature |
| DH | Department Head |

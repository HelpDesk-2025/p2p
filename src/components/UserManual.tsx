import { useState } from 'react';
import {
  BookOpen, ChevronDown, ChevronRight, UserPlus, LogIn, FileText,
  DollarSign, ShoppingCart, CheckSquare, Settings, Users, Mail,
  ClipboardCheck, Search, AlertCircle
} from 'lucide-react';

interface Section {
  id: string;
  title: string;
  icon: any;
  content: {
    subtitle?: string;
    steps?: string[];
    notes?: string[];
    tips?: string[];
  }[];
}

export function UserManual() {
  const [expandedSections, setExpandedSections] = useState<string[]>(['getting-started']);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const sections: Section[] = [
    {
      id: 'getting-started',
      title: 'Getting Started',
      icon: UserPlus,
      content: [
        {
          subtitle: 'Creating Your Account',
          steps: [
            'Click "Sign Up" on the login page',
            'Fill in your full name, email, and password',
            'Select your company from the dropdown',
            'Select your department',
            'Click "Send OTP" to receive a verification code via email',
            'Enter the 6-digit OTP code sent to your email',
            'Click "Verify & Sign Up" to complete registration',
            'Wait for an administrator to activate your account'
          ],
          notes: [
            'Your account will be inactive until approved by an administrator',
            'You will receive an email with your OTP code within a few minutes',
            'The OTP code expires after 10 minutes'
          ]
        },
        {
          subtitle: 'Logging In',
          steps: [
            'Enter your email address',
            'Enter your password',
            'Click "Sign In"'
          ],
          notes: [
            'If you forgot your password, click "Forgot password?" and follow the OTP verification process',
            'Contact your administrator if your account is pending approval'
          ]
        }
      ]
    },
    {
      id: 'purchase-requisition',
      title: 'Purchase Requisition (PR)',
      icon: FileText,
      content: [
        {
          subtitle: 'Creating a Purchase Requisition',
          steps: [
            'Navigate to Requests > Purchase Requisition',
            'Fill in all fields',
            'Select the Purchase Type (Purchase Order or Non-Purchase Order)',
            'Select the Purchase Checklist',
            'Upload required attachments',
            'For PO requests: Add item/s in the Items section',
            'For NON-PO requests: Fill in the Payee and the Amount (Net of VAT)',
            'For NON-PO requests: Select the Payment Mode',
            'For NON-PO requests: Fill in the Payment Mode Details',
            'Review all information carefully',
            'Click "Submit" to send for approval'
          ],
          tips: [
            'Ensure all line items have accurate quantities and prices',
            'Complete the checklist thoroughly to avoid delays',
            'Upload clear and legible attachments',
            'Double-check vendor information for accuracy'
          ]
        },
        {
          subtitle: 'Tracking Your PR',
          steps: [
            'Go to Requests > Purchase Requisition',
            'View the list of all your submitted PRs',
            'Check the status column to see current approval stage',
            'Click "View Progress" to see detailed approval history',
            'View who has approved and who is pending'
          ]
        }
      ]
    },
    {
      id: 'cash-advance',
      title: 'Cash Advance Requests',
      icon: DollarSign,
      content: [
        {
          subtitle: 'Requesting a Cash Advance',
          steps: [
            'Navigate to Requests > Cash Advance',
            'Fill in the purpose of the cash advance',
            'Enter the requested amount',
            'Specify the date needed',
            'Add detailed justification for the advance',
            'Fill in payment mode information (bank, account number, etc.)',
            'Upload supporting documents if required',
            'Click "Submit" to send for approval'
          ],
          notes: [
            'Cash advances are subject to company policy limits',
            'Ensure you provide clear justification for the amount requested',
            'Outstanding cash advances may need to be settled before requesting new ones'
          ]
        }
      ]
    },
    {
      id: 'petty-cash',
      title: 'Petty Cash & Reimbursement',
      icon: DollarSign,
      content: [
        {
          subtitle: 'Petty Cash Request',
          steps: [
            'Navigate to Requests > Petty Cash',
            'Select "Petty Cash" as request type',
            'Enter the description of expenses',
            'Input the total amount',
            'Specify the date of expense',
            'Upload receipts and supporting documents',
            'Click "Submit" for approval'
          ]
        },
        {
          subtitle: 'Reimbursement Request',
          steps: [
            'Navigate to Requests > Petty Cash',
            'Select "Reimbursement" as request type',
            'List all expenses with descriptions',
            'Enter amounts for each expense',
            'Upload all original receipts',
            'Provide bank details for reimbursement',
            'Submit for approval'
          ],
          tips: [
            'Keep all original receipts',
            'Ensure receipts are clear and legible',
            'Submit reimbursements within company policy timeframe',
            'Provide detailed descriptions for each expense'
          ]
        }
      ]
    },
    {
      id: 'canvass',
      title: 'Canvass Process',
      icon: ShoppingCart,
      content: [
        {
          subtitle: 'For Procurement Team',
          steps: [
            'Navigate to Procurement > Canvass',
            'View PRs that are ready for canvassing',
            'Click "View Details" on a PR',
            'Add vendor quotations (minimum 3 vendors)',
            'Enter vendor details, quoted prices, and terms',
            'Upload vendor quotation documents',
            'Provide your recommendation for vendor selection',
            'Submit the canvass for approval'
          ],
          notes: [
            'Most items require at least 3 vendor quotations',
            'Ensure all vendor information is accurate',
            'Provide clear reasoning for your vendor recommendation',
            'All quotations must be uploaded as supporting documents'
          ]
        },
        {
          subtitle: 'Canvass Approval',
          steps: [
            'Approvers receive notification when canvass is submitted',
            'Review all vendor quotations',
            'Compare prices, terms, and delivery schedules',
            'Select the winning vendor or provide recommendation',
            'Approve or reject the canvass',
            'Add comments if needed'
          ]
        }
      ]
    },
    {
      id: 'approval',
      title: 'Approval Process',
      icon: CheckSquare,
      content: [
        {
          subtitle: 'For Approvers',
          steps: [
            'Check your dashboard for pending approvals',
            'Navigate to Approvals section',
            'Select the type of request to review',
            'Click on a request to view full details',
            'Review all information, attachments, and checklists',
            'Click "Approve" to approve or "Reject" to reject',
            'Add comments to explain your decision',
            'Confirm your action'
          ],
          notes: [
            'You can only approve requests within your authority level',
            'Some requests require multiple levels of approval',
            'Email notifications are sent when you have pending approvals',
            'Rejected requests return to the requestor with your comments'
          ]
        },
        {
          subtitle: 'Approval Flow',
          steps: [
            'Requests follow a defined approval hierarchy',
            'Department Head approves first (if configured)',
            'Division Head approves next',
            'President/CEO approves for amounts above threshold',
            'Each level receives email notification',
            'Approval progresses to next level automatically'
          ]
        }
      ]
    },
    {
      id: 'sme-checking',
      title: 'SME Checking (Subject Matter Expert)',
      icon: ClipboardCheck,
      content: [
        {
          subtitle: 'For SME Role',
          steps: [
            'Navigate to Procurement > SME Checking',
            'View list of requests pending SME review',
            'Click on a request to review details',
            'Verify technical specifications',
            'Check if requirements are complete and accurate',
            'Validate quantities and technical feasibility',
            'Add detailed comments about your findings and recommendations'
          ],
          notes: [
            'SME review happens before final approval',
            'Focus on technical accuracy and completeness',
            'Flag any specification issues or concerns',
            'Provide constructive feedback for revisions'
          ]
        }
      ]
    },
    {
      id: 'configuration',
      title: 'System Configuration (Admin)',
      icon: Settings,
      content: [
        {
          subtitle: 'Company Setup',
          steps: [
            'Navigate to Configuration > Company Setup',
            'Add or edit company details',
            'Configure departments',
            'Set up approval flow type',
            'Configure president minimum approval amount',
            'Save changes'
          ]
        },
        {
          subtitle: 'Approval Flow Setup',
          steps: [
            'Go to Configuration > Approval Flow',
            'Select company and request type',
            'Define minimum and maximum amounts for each level',
            'Set approver positions (Department Head, Division Head, etc.)',
            'Configure whether each level is required',
            'Test the flow with sample amounts',
            'Save configuration'
          ],
          tips: [
            'Set up different flows for different request types',
            'Ensure amount thresholds don\'t overlap',
            'Test flows before deploying to production',
            'Document your approval matrix for reference'
          ]
        },
        {
          subtitle: 'Number Series Setup',
          steps: [
            'Navigate to Configuration > Number Series',
            'Configure prefixes for each request type',
            'Set starting numbers',
            'Define number format and padding',
            'System will auto-increment for each new request'
          ]
        },
        {
          subtitle: 'SMTP Configuration',
          steps: [
            'Go to Configuration > SMTP Setup',
            'Enter your email server details (host, port)',
            'Configure authentication credentials',
            'Set sender name and email address',
            'Test email sending',
            'Activate configuration'
          ],
          notes: [
            'Required for email notifications and OTP delivery',
            'Use secure credentials and encryption (TLS/SSL)',
            'Test thoroughly before activating'
          ]
        },
        {
          subtitle: 'Roles & Permissions',
          steps: [
            'Navigate to Configuration > Roles & Permissions',
            'Create custom roles',
            'Assign permissions for each module',
            'Define what actions each role can perform',
            'Assign roles to users'
          ]
        }
      ]
    },
    {
      id: 'user-management',
      title: 'User Management (Admin)',
      icon: Users,
      content: [
        {
          subtitle: 'Managing Users',
          steps: [
            'Navigate to Configuration > User Management',
            'View list of all users',
            'Search and filter users by company, department, role, or status',
            'Click "Edit" on a user to modify details',
            'Update user information as needed',
            'Change user status (Active/Inactive)',
            'Assign or change user roles',
            'Save changes'
          ]
        },
        {
          subtitle: 'Activating New Users',
          steps: [
            'New sign-ups appear with "Inactive" status',
            'Review the user\'s information',
            'Verify the user belongs to your organization',
            'Edit user details if needed',
            'Change status to "Active"',
            'User can now log in and access the system'
          ],
          notes: [
            'Only activate users you recognize',
            'Verify user information before activation',
            'Assign appropriate roles based on job function',
            'Users receive notification when activated'
          ]
        }
      ]
    },
    {
      id: 'best-practices',
      title: 'Best Practices',
      icon: AlertCircle,
      content: [
        {
          subtitle: 'General Tips',
          tips: [
            'Always fill in all required fields completely',
            'Upload clear, legible documents',
            'Provide detailed descriptions and justifications',
            'Double-check amounts and calculations',
            'Review all information before submitting',
            'Keep copies of all submitted requests',
            'Monitor your request status regularly',
            'Respond promptly to revision requests'
          ]
        },
        {
          subtitle: 'For Approvers',
          tips: [
            'Review approval notifications promptly',
            'Check all attachments and supporting documents',
            'Verify amounts against budget allocations',
            'Ask for clarification if information is unclear',
            'Provide constructive feedback when rejecting',
            'Follow up on urgent or time-sensitive requests',
            'Keep track of your approval authority limits'
          ]
        },
        {
          subtitle: 'Document Management',
          tips: [
            'Scan documents at high resolution',
            'Use PDF format for official documents',
            'Name files descriptively',
            'Ensure all pages are included',
            'Remove any sensitive information not needed',
            'Keep original documents for audit purposes'
          ]
        },
        {
          subtitle: 'Security',
          tips: [
            'Never share your password',
            'Log out when leaving your workstation',
            'Report suspicious activity immediately',
            'Keep your contact information updated',
            'Review your account activity regularly',
            'Use strong, unique passwords',
            'Enable two-factor authentication if available'
          ]
        }
      ]
    },
    {
      id: 'troubleshooting',
      title: 'Troubleshooting',
      icon: Search,
      content: [
        {
          subtitle: 'Common Issues',
          steps: [
            'Cannot log in: Verify email and password, check if account is active',
            'OTP not received: Check spam folder, verify email address, wait a few minutes',
            'Cannot submit request: Ensure all required fields are filled',
            'Upload failed: Check file size (max 5MB), use supported formats',
            'Request stuck in approval: Contact the pending approver',
            'Cannot view request details: Check your permissions and role',
            'Email notifications not working: Verify SMTP configuration (Admin)'
          ]
        },
        {
          subtitle: 'Getting Help',
          steps: [
            'Contact your immediate supervisor for process questions',
            'Reach out to IT support for technical issues',
            'Contact Finance for payment and reimbursement queries',
            'Ask Procurement team for canvass-related questions',
            'Contact system administrator for access issues'
          ]
        }
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-lg p-8 text-white">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
            <BookOpen size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-bold">User Manual</h1>
            <p className="text-blue-100 mt-1">
              Complete guide to using the Point to Point system
            </p>
          </div>
        </div>
        <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm mt-6">
          <p className="text-sm text-blue-50">
            This manual covers everything you need to know about using Point to Point,
            from creating your account to submitting and approving requests. Click on any
            section below to expand and view detailed instructions.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        {sections.map((section, index) => {
          const Icon = section.icon;
          const isExpanded = expandedSections.includes(section.id);

          return (
            <div key={section.id}>
              {index > 0 && <div className="border-t border-slate-200" />}

              <button
                onClick={() => toggleSection(section.id)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                    <Icon size={24} />
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {section.title}
                  </h2>
                </div>
                {isExpanded ? (
                  <ChevronDown size={20} className="text-slate-400" />
                ) : (
                  <ChevronRight size={20} className="text-slate-400" />
                )}
              </button>

              {isExpanded && (
                <div className="px-6 pb-6 space-y-6">
                  {section.content.map((item, itemIndex) => (
                    <div key={itemIndex} className="space-y-3">
                      {item.subtitle && (
                        <h3 className="text-base font-semibold text-slate-800 mt-4">
                          {item.subtitle}
                        </h3>
                      )}

                      {item.steps && item.steps.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">
                            Steps
                          </p>
                          <ol className="space-y-2">
                            {item.steps.map((step, stepIndex) => (
                              <li key={stepIndex} className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">
                                  {stepIndex + 1}
                                </span>
                                <span className="text-slate-700 pt-0.5">{step}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {item.notes && item.notes.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
                          <p className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-2">
                            <AlertCircle size={16} />
                            Important Notes
                          </p>
                          <ul className="space-y-1.5">
                            {item.notes.map((note, noteIndex) => (
                              <li key={noteIndex} className="text-sm text-amber-800 flex gap-2">
                                <span className="text-amber-600 flex-shrink-0">•</span>
                                <span>{note}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {item.tips && item.tips.length > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
                          <p className="text-sm font-semibold text-green-900 mb-2 flex items-center gap-2">
                            <CheckSquare size={16} />
                            Tips & Best Practices
                          </p>
                          <ul className="space-y-1.5">
                            {item.tips.map((tip, tipIndex) => (
                              <li key={tipIndex} className="text-sm text-green-800 flex gap-2">
                                <span className="text-green-600 flex-shrink-0">✓</span>
                                <span>{tip}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <Mail size={24} className="text-blue-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-blue-900 mb-2">Need More Help?</h3>
            <p className="text-sm text-blue-800 mb-3">
              If you cannot find the answer to your question in this manual, please contact your
              system administrator or IT support team for assistance.
            </p>
            <p className="text-xs text-blue-700">
              For urgent issues, contact your immediate supervisor or department head.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, 
  Plus, 
  Trash2, 
  ExternalLink, 
  RefreshCw, 
  LogOut, 
  Eye, 
  CheckCircle, 
  Sparkles, 
  User, 
  Calendar, 
  Layers, 
  BarChart, 
  Copy, 
  Link2,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { googleSignIn, initAuth, logout, getAccessToken } from '../lib/googleAuth';
import type { User as FirebaseUser } from 'firebase/auth';

async function proxiedGoogleFetch(url: string, options: any = {}) {
  let parsedBody = undefined;
  if (options.body) {
    if (typeof options.body === 'string') {
      try {
        parsedBody = JSON.parse(options.body);
      } catch (e) {
        parsedBody = options.body;
      }
    } else {
      parsedBody = options.body;
    }
  }

  const response = await fetch('/api/google-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      body: parsedBody
    })
  });
  return response;
}

interface SavedForm {
  formId: string;
  title: string;
  responderUri: string;
}

interface FormItem {
  itemId: string;
  title: string;
  questionItem?: {
    question: {
      questionId: string;
      required?: boolean;
    };
  };
}

interface FormDetails {
  formId: string;
  info: {
    title: string;
    description?: string;
  };
  items?: FormItem[];
  responderUri: string;
}

interface FormResponseAnswer {
  questionId: string;
  textAnswers?: {
    answers?: { value: string }[];
  };
}

interface FormResponse {
  responseId: string;
  createTime: string;
  answers?: Record<string, FormResponseAnswer>;
}

export function GoogleFormsManager() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(true);

  // Forms configuration state
  const [savedForms, setSavedForms] = useState<SavedForm[]>([]);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  const [activeFormDetails, setActiveFormDetails] = useState<FormDetails | null>(null);
  const [activeFormResponses, setActiveFormResponses] = useState<FormResponse[]>([]);
  const [isLoadingResponses, setIsLoadingResponses] = useState(false);
  const [isLoadingFormsList, setIsLoadingFormsList] = useState(false);

  // New Form input fields
  const [importFormId, setImportFormId] = useState('');
  const [creatingForm, setCreatingForm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Tab state within Forms Manager
  const [formsTab, setFormsTab] = useState<'view' | 'analytics' | 'embed'>('view');

  // Track Auth State on Mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );
    fetchSavedForms();
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        setNeedsAuth(false);
      }
    } catch (err) {
      console.error('Google Sign-In failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setAccessToken(null);
      setNeedsAuth(true);
      setActiveFormId(null);
      setActiveFormDetails(null);
      setActiveFormResponses([]);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // Backend calls to persist Form IDs in Firestore
  const fetchSavedForms = async () => {
    setIsLoadingFormsList(true);
    try {
      const res = await fetch('/api/forms');
      if (res.ok) {
        const data = await res.json();
        setSavedForms(data);
        if (data.length > 0 && !activeFormId) {
          setActiveFormId(data[0].formId);
        }
      }
    } catch (err) {
      console.error('Error fetching saved forms:', err);
    } finally {
      setIsLoadingFormsList(false);
    }
  };

  const saveFormToBackend = async (formId: string, title: string, responderUri: string) => {
    try {
      await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formId, title, responderUri }),
      });
      await fetchSavedForms();
    } catch (err) {
      console.error('Error saving form to backend:', err);
    }
  };

  const deleteFormFromBackend = async (formId: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to disconnect this Google Form? Patients will still be able to fill it out directly on Google, but it will be removed from your hospital administration dashboard.'
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/forms/${formId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSavedForms(prev => prev.filter(f => f.formId !== formId));
        if (activeFormId === formId) {
          setActiveFormId(null);
          setActiveFormDetails(null);
          setActiveFormResponses([]);
        }
      }
    } catch (err) {
      console.error('Error deleting form:', err);
    }
  };

  // Create pre-structured Intake/Feedback form programmatically
  const handleCreateHospitalForm = async (type: 'feedback' | 'intake') => {
    if (!accessToken) return;
    setCreatingForm(true);

    const title = type === 'feedback' 
      ? 'ABC Hospital - Patient Satisfaction Survey' 
      : 'ABC Hospital - Patient Pre-Intake Questionnaire';
    
    const description = type === 'feedback'
      ? 'Thank you for choosing ABC Hospital Lagos. Please fill out this short survey to help us improve our services.'
      : 'Welcome to ABC Hospital. Please provide your clinical information prior to your medical consultation.';

    try {
      // 1. Create empty form using backend proxy
      const createResponse = await proxiedGoogleFetch('https://forms.googleapis.com/v1/forms', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          info: {
            title: title,
            documentTitle: title,
            description: description
          }
        })
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create initial Google Form');
      }

      const formObj = await createResponse.json();
      const formId = formObj.formId;
      const responderUri = formObj.responderUri;

      // 2. Add custom questions via batchUpdate using backend proxy
      const questionsBody = type === 'feedback' ? getFeedbackQuestions() : getIntakeQuestions();

      const updateResponse = await proxiedGoogleFetch(`https://forms.googleapis.com/v1/forms/${formId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: questionsBody
        })
      });

      if (!updateResponse.ok) {
        console.warn('Google Form created, but failed to populate default questions.');
      }

      // Save to backend and select as active
      await saveFormToBackend(formId, title, responderUri);
      setActiveFormId(formId);
      alert(`Success! Your Google Form "${title}" has been successfully created and linked!`);
    } catch (err: any) {
      console.error('Error creating Google Form:', err);
      alert('Error creating Google Form: ' + err.message);
    } finally {
      setCreatingForm(false);
    }
  };

  // Google Form Templates
  const getFeedbackQuestions = () => [
    {
      createItem: {
        item: {
          title: 'Patient Full Name',
          questionItem: {
            question: {
              required: true,
              textQuestion: {}
            }
          }
        },
        location: { index: 0 }
      }
    },
    {
      createItem: {
        item: {
          title: 'Which medical department did you consult today?',
          questionItem: {
            question: {
              required: true,
              choiceQuestion: {
                type: 'DROP_DOWN',
                options: [
                  { value: 'General Medicine' },
                  { value: 'Pediatrics' },
                  { value: 'Cardiology' },
                  { value: 'Orthopedics' },
                  { value: 'Dermatology' }
                ]
              }
            }
          }
        },
        location: { index: 1 }
      }
    },
    {
      createItem: {
        item: {
          title: 'How would you rate your overall experience with the hospital? (5 is Excellent)',
          questionItem: {
            question: {
              required: true,
              choiceQuestion: {
                type: 'RADIO',
                options: [
                  { value: '5 - Excellent' },
                  { value: '4 - Very Good' },
                  { value: '3 - Good' },
                  { value: '2 - Fair' },
                  { value: '1 - Poor' }
                ]
              }
            }
          }
        },
        location: { index: 2 }
      }
    },
    {
      createItem: {
        item: {
          title: 'Would you recommend ABC Hospital to friends or family?',
          questionItem: {
            question: {
              required: true,
              choiceQuestion: {
                type: 'RADIO',
                options: [
                  { value: 'Yes, definitely' },
                  { value: 'Probably' },
                  { value: 'No' }
                ]
              }
            }
          }
        },
        location: { index: 3 }
      }
    },
    {
      createItem: {
        item: {
          title: 'Any additional feedback, comments, or recommendations for our staff?',
          questionItem: {
            question: {
              textQuestion: { paragraph: true }
            }
          }
        },
        location: { index: 4 }
      }
    }
  ];

  const getIntakeQuestions = () => [
    {
      createItem: {
        item: {
          title: 'Patient Full Name',
          questionItem: {
            question: {
              required: true,
              textQuestion: {}
            }
          }
        },
        location: { index: 0 }
      }
    },
    {
      createItem: {
        item: {
          title: 'Date of Birth (DD-MM-YYYY)',
          questionItem: {
            question: {
              required: true,
              textQuestion: {}
            }
          }
        },
        location: { index: 1 }
      }
    },
    {
      createItem: {
        item: {
          title: 'Primary Symptoms or Reason for Visit',
          questionItem: {
            question: {
              required: true,
              textQuestion: { paragraph: true }
            }
          }
        },
        location: { index: 2 }
      }
    },
    {
      createItem: {
        item: {
          title: 'Do you have any existing chronic medical conditions or known drug allergies?',
          questionItem: {
            question: {
              required: true,
              textQuestion: { paragraph: true }
            }
          }
        },
        location: { index: 3 }
      }
    }
  ];

  // Import existing Form by pasting its ID
  const handleImportForm = async () => {
    if (!importFormId.trim()) return;
    if (!accessToken) {
      alert('Please connect your Google Account first.');
      return;
    }

    setIsLoading(true);
    try {
      let formId = importFormId.trim();

      // Auto-extract ID if full URL was pasted
      const urlMatch = formId.match(/\/forms\/d\/(?:e\/)?([a-zA-Z0-9-_]+)/);
      if (urlMatch && urlMatch[1]) {
        formId = urlMatch[1];
      }

      const response = await proxiedGoogleFetch(`https://forms.googleapis.com/v1/forms/${formId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        throw new Error('Google Form not found. Ensure the ID is correct and you have permission to access it.');
      }

      const data = await response.json();
      await saveFormToBackend(data.formId, data.info.title, data.responderUri);
      setActiveFormId(data.formId);
      setImportFormId('');
      alert(`Linked! "${data.info.title}" has been successfully added to your list.`);
    } catch (err: any) {
      console.error('Import error:', err);
      alert('Error importing form: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Load details and responses for the active form
  const fetchFormDetailsAndResponses = async (formId: string) => {
    if (!accessToken) return;
    setIsLoadingResponses(true);

    try {
      // 1. Fetch Form Details using proxy
      const detailsRes = await proxiedGoogleFetch(`https://forms.googleapis.com/v1/forms/${formId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      let details: FormDetails | null = null;
      if (detailsRes.ok) {
        details = await detailsRes.json();
        setActiveFormDetails(details);
      }

      // 2. Fetch Form Responses using proxy
      const responsesRes = await proxiedGoogleFetch(`https://forms.googleapis.com/v1/forms/${formId}/responses`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (responsesRes.ok) {
        const data = await responsesRes.json();
        setActiveFormResponses(data.responses || []);
      } else {
        setActiveFormResponses([]);
      }
    } catch (err) {
      console.error('Error fetching active form details:', err);
    } finally {
      setIsLoadingResponses(false);
    }
  };

  useEffect(() => {
    if (activeFormId && accessToken) {
      fetchFormDetailsAndResponses(activeFormId);
    }
  }, [activeFormId, accessToken]);

  const copyToClipboard = (text: string, type: 'id' | 'link') => {
    navigator.clipboard.writeText(text);
    if (type === 'id') {
      setCopiedId(text);
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      setCopiedLink(text);
      setTimeout(() => setCopiedLink(null), 2000);
    }
  };

  // Map questionId to title helper
  const getQuestionTitle = (questionId: string) => {
    if (!activeFormDetails?.items) return 'Question ID: ' + questionId;
    const item = activeFormDetails.items.find(
      i => i.questionItem?.question?.questionId === questionId
    );
    return item ? item.title : 'Question: ' + questionId;
  };

  return (
    <div className="space-y-6">
      {/* Google Account Connection Status Card */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-3xl p-6 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-300" />
            <h2 className="text-xl font-bold">Google Forms Administrative Portal</h2>
          </div>
          <p className="text-blue-100 text-sm max-w-xl">
            Integrate clinical pre-intake screening questionnaires and patient satisfaction loops directly using your secure Google Forms account.
          </p>
        </div>

        {needsAuth ? (
          <button
            onClick={handleLogin}
            disabled={isLoading}
            className="flex items-center gap-3 bg-white text-slate-800 font-semibold px-5 py-3 rounded-2xl shadow hover:bg-slate-50 active:scale-95 transition-all text-sm self-start md:self-auto"
          >
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5 flex-shrink-0">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
            </svg>
            Connect Google Workspace
          </button>
        ) : (
          <div className="flex items-center gap-4 bg-slate-900/20 backdrop-blur-sm p-3 rounded-2xl border border-white/10 self-start md:self-auto">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Google Profile" className="h-10 w-10 rounded-full border-2 border-white/50" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-sm">
                {user?.displayName?.charAt(0) || user?.email?.charAt(0)}
              </div>
            )}
            <div>
              <div className="font-bold text-sm leading-tight">{user?.displayName || 'Administrator'}</div>
              <div className="text-white/70 text-xs truncate max-w-[160px]">{user?.email}</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors ml-2"
              title="Disconnect Google Account"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {needsAuth ? (
        /* Prompt to Login */
        <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 shadow-sm max-w-2xl mx-auto space-y-5">
          <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
            <ClipboardList className="h-8 w-8 text-blue-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900">Google Workspace Connection Required</h3>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
              Please click the button above to authorize Google Forms. Once connected, you can deploy surveys and intake questionnaires that capture user clinical metrics in real time.
            </p>
          </div>
        </div>
      ) : (
        /* Workspace Content Panel */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Side panel: List of Linked Forms */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm tracking-wide uppercase">Linked Forms</h3>
                <button 
                  onClick={fetchSavedForms} 
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                  title="Refresh lists"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingFormsList ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Saved forms list */}
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {isLoadingFormsList ? (
                  <div className="text-center py-4 text-xs text-slate-400">Loading forms...</div>
                ) : savedForms.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400 italic">No forms linked yet.</div>
                ) : (
                  savedForms.map(form => (
                    <div
                      key={form.formId}
                      className={`group flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                        activeFormId === form.formId
                          ? 'border-blue-500 bg-blue-50/50 text-blue-900 shadow-sm font-medium'
                          : 'border-slate-100 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <button
                        onClick={() => setActiveFormId(form.formId)}
                        className="flex-1 text-xs truncate text-left"
                      >
                        {form.title}
                      </button>
                      <button
                        onClick={() => deleteFormFromBackend(form.formId)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Disconnect form"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <hr className="border-slate-100" />

              {/* Deploy / Create Templates */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Deploy New Form</h4>
                <button
                  disabled={creatingForm}
                  onClick={() => handleCreateHospitalForm('feedback')}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors font-semibold text-xs disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Patient Feedback Template
                </button>
                <button
                  disabled={creatingForm}
                  onClick={() => handleCreateHospitalForm('intake')}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors font-semibold text-xs disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Clinical Intake Template
                </button>
              </div>

              <hr className="border-slate-100" />

              {/* Import Existing Form ID */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Link Existing Google Form</h4>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={importFormId}
                    onChange={(e) => setImportFormId(e.target.value)}
                    placeholder="Enter Google Form ID"
                    className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleImportForm}
                    disabled={isLoading}
                    className="px-2.5 py-1.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    Link
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Main workspace area: Active Form details, stats and responses */}
          <div className="lg:col-span-3 space-y-6">
            {!activeFormId ? (
              <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 shadow-sm h-full flex flex-col items-center justify-center space-y-4">
                <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center">
                  <ClipboardList className="h-8 w-8 text-slate-400" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-slate-900">Select or Deploy a Form</h4>
                  <p className="text-slate-500 text-sm max-w-sm mt-1">
                    Select an existing linked form from the sidebar, or deploy a pre-configured template programmatically.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
                {/* Active Form Header */}
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-500" />
                      <h3 className="font-bold text-slate-900 text-lg leading-snug">
                        {activeFormDetails?.info?.title || 'Loading active form...'}
                      </h3>
                    </div>
                    {activeFormDetails?.info?.description && (
                      <p className="text-slate-500 text-xs">{activeFormDetails.info.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] font-mono bg-slate-200/60 text-slate-600 px-2 py-0.5 rounded-md">
                        ID: {activeFormId}
                      </span>
                      <button
                        onClick={() => copyToClipboard(activeFormId, 'id')}
                        className="text-[10px] text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {copiedId === activeFormId ? 'Copied!' : 'Copy ID'}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Copy Public Link */}
                    {activeFormDetails?.responderUri && (
                      <button
                        onClick={() => copyToClipboard(activeFormDetails.responderUri, 'link')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-all shadow-sm"
                      >
                        <Link2 className="h-3.5 w-3.5 text-slate-400" />
                        {copiedLink === activeFormDetails.responderUri ? 'Copied Form Link!' : 'Copy Form URL'}
                      </button>
                    )}

                    {/* Google Form External Link */}
                    <a
                      href={`https://docs.google.com/forms/d/${activeFormId}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all shadow-sm"
                    >
                      Open Google Forms
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>

                {/* Tab select */}
                <div className="flex border-b border-slate-100 px-6 bg-white">
                  <button
                    onClick={() => setFormsTab('view')}
                    className={`py-3 px-4 font-bold text-xs tracking-wider uppercase border-b-2 transition-all ${
                      formsTab === 'view'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Responses & Submissions
                  </button>
                  <button
                    onClick={() => setFormsTab('analytics')}
                    className={`py-3 px-4 font-bold text-xs tracking-wider uppercase border-b-2 transition-all ${
                      formsTab === 'analytics'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Form Structure
                  </button>
                  <button
                    onClick={() => setFormsTab('embed')}
                    className={`py-3 px-4 font-bold text-xs tracking-wider uppercase border-b-2 transition-all ${
                      formsTab === 'embed'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Patient View Preview
                  </button>
                </div>

                {/* Tab content area */}
                <div className="p-6 flex-1 bg-white">
                  {isLoadingResponses ? (
                    <div className="flex flex-col items-center justify-center h-64 space-y-3">
                      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs text-slate-500 font-medium">Fetching real-time responses from Google Forms...</span>
                    </div>
                  ) : (
                    <AnimatePresence mode="wait">
                      {formsTab === 'view' && (
                        <motion.div
                          key="responses-tab"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="space-y-6"
                        >
                          {/* Aggregate stats summary */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                              <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
                                <ClipboardList className="h-5 w-5" />
                              </div>
                              <div>
                                <div className="text-2xl font-black text-slate-900">{activeFormResponses.length}</div>
                                <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Total Submissions</div>
                              </div>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                              <div className="bg-green-100 p-3 rounded-xl text-green-600">
                                <CheckCircle className="h-5 w-5" />
                              </div>
                              <div>
                                <div className="text-2xl font-black text-slate-900">Active</div>
                                <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Form Status</div>
                              </div>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                              <div className="bg-indigo-100 p-3 rounded-xl text-indigo-600">
                                <Calendar className="h-5 w-5" />
                              </div>
                              <div>
                                <div className="text-2xl font-black text-slate-900">
                                  {activeFormResponses.length > 0 
                                    ? new Date(activeFormResponses[0].createTime).toLocaleDateString()
                                    : 'N/A'}
                                </div>
                                <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Latest Submission</div>
                              </div>
                            </div>
                          </div>

                          {/* Individual responses detailed logs */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-bold text-slate-900 text-sm">Response Feed</h4>
                              <button
                                onClick={() => fetchFormDetailsAndResponses(activeFormId)}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-200 transition-colors"
                              >
                                <RefreshCw className="h-3 w-3" />
                                Refresh Live Feed
                              </button>
                            </div>

                            {activeFormResponses.length === 0 ? (
                              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100">
                                <p className="text-slate-400 text-sm italic">No responses received yet for this Google Form.</p>
                                <p className="text-xs text-slate-400 mt-1">Copy and share the form public URL with patients to start collecting submissions!</p>
                              </div>
                            ) : (
                              <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                                {activeFormResponses.map((resp, index) => (
                                  <div key={resp.responseId} className="bg-slate-50/50 hover:bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3 text-left">
                                    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                      <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-slate-400" />
                                        <span className="font-bold text-slate-800 text-xs">Submission #{activeFormResponses.length - index}</span>
                                      </div>
                                      <span className="text-[10px] text-slate-400 font-medium">
                                        {new Date(resp.createTime).toLocaleString()}
                                      </span>
                                    </div>

                                    {/* Map answers list */}
                                    <div className="grid grid-cols-1 gap-2.5 text-xs">
                                      {resp.answers && Object.values(resp.answers).map((ans: any) => (
                                        <div key={ans.questionId} className="bg-white p-2.5 rounded-xl border border-slate-100">
                                          <div className="font-semibold text-slate-500 mb-0.5">{getQuestionTitle(ans.questionId)}</div>
                                          <div className="text-slate-800 font-medium">
                                            {ans.textAnswers?.answers?.[0]?.value || 'No Answer'}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}

                      {formsTab === 'analytics' && (
                        <motion.div
                          key="structure-tab"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="space-y-4 text-left"
                        >
                          <h4 className="font-bold text-slate-900 text-sm">Form Fields & Structure</h4>
                          <p className="text-slate-500 text-xs">This view lists all active questions and structural components inside your Google Form.</p>

                          <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                                <tr>
                                  <th className="p-4">Index</th>
                                  <th className="p-4">Question Title</th>
                                  <th className="p-4">Field ID</th>
                                  <th className="p-4 text-right">Required</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {activeFormDetails?.items?.map((item, index) => (
                                  <tr key={item.itemId} className="hover:bg-slate-50/50">
                                    <td className="p-4 font-mono text-slate-400">{index + 1}</td>
                                    <td className="p-4 font-bold text-slate-800">{item.title}</td>
                                    <td className="p-4 font-mono text-[10px] text-slate-500 bg-slate-100/50 px-1.5 py-0.5 rounded">
                                      {item.questionItem?.question?.questionId || 'N/A (Header/Section)'}
                                    </td>
                                    <td className="p-4 text-right font-medium text-slate-600">
                                      {item.questionItem?.question?.required ? (
                                        <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded-full font-bold">Yes</span>
                                      ) : (
                                        <span className="text-slate-400">No</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </motion.div>
                      )}

                      {formsTab === 'embed' && (
                        <motion.div
                          key="embed-tab"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="h-full flex flex-col space-y-4"
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-left">
                              <h4 className="font-bold text-slate-900 text-sm">Interactive Embed Sandbox</h4>
                              <p className="text-slate-500 text-xs">Patients can complete this form directly within your application portals.</p>
                            </div>
                          </div>

                          {activeFormDetails?.responderUri ? (
                            <div className="relative border border-slate-100 rounded-3xl overflow-hidden shadow-md bg-slate-100 w-full h-[450px]">
                              <iframe
                                src={activeFormDetails.responderUri}
                                width="100%"
                                height="100%"
                                frameBorder="0"
                                marginHeight={0}
                                marginWidth={0}
                                title="Patient Google Form Portal"
                                className="w-full h-full bg-white"
                              >
                                Loading…
                              </iframe>
                            </div>
                          ) : (
                            <div className="p-12 text-center bg-slate-50 rounded-2xl border border-slate-100 italic text-slate-400 text-xs">
                              Google Form Responder URI not available for embedding.
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

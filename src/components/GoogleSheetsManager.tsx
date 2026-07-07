import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
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
  Table, 
  ArrowRight, 
  Copy, 
  Link2,
  Check,
  Send,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { googleSignIn, initAuth, logout } from '../lib/googleAuth';
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

interface SavedSheet {
  spreadsheetId: string;
  title: string;
  url: string;
}

interface Appointment {
  id: string;
  patientName: string;
  phoneNumber: string;
  preferredDate: string;
  preferredTime: string;
  department: string;
  createdAt: string;
}

export function GoogleSheetsManager() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(true);

  // Sheets state
  const [savedSheets, setSavedSheets] = useState<SavedSheet[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const [sheetRows, setSheetRows] = useState<string[][]>([]);
  const [isLoadingSheetData, setIsLoadingSheetData] = useState(false);
  const [isLoadingSheetsList, setIsLoadingSheetsList] = useState(false);
  
  // New Spreadsheet input
  const [importSheetId, setImportSheetId] = useState('');
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [syncingData, setSyncingData] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Tab state within Sheets Manager
  const [sheetsTab, setSheetsTab] = useState<'preview' | 'sync' | 'embed'>('preview');

  // Track auth state
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
    fetchSavedSheets();
    return () => unsubscribe();
  }, []);

  // Save active Google access token to server for backend tasks
  useEffect(() => {
    if (accessToken) {
      fetch('/api/save-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken })
      }).catch(err => console.error("Error sending token to server:", err));
    }
  }, [accessToken]);

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
      setActiveSheetId(null);
      setSheetRows([]);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // Backend calls to persist linked spreadsheet IDs in Firestore
  const fetchSavedSheets = async () => {
    setIsLoadingSheetsList(true);
    try {
      const res = await fetch('/api/sheets');
      if (res.ok) {
        const data = await res.json();
        setSavedSheets(data);
        if (data.length > 0 && !activeSheetId) {
          setActiveSheetId(data[0].spreadsheetId);
        }
      }
    } catch (err) {
      console.error('Error fetching saved sheets:', err);
    } finally {
      setIsLoadingSheetsList(false);
    }
  };

  const saveSheetToBackend = async (spreadsheetId: string, title: string, url: string) => {
    try {
      await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId, title, url }),
      });
      await fetchSavedSheets();
    } catch (err) {
      console.error('Error saving sheet to backend:', err);
    }
  };

  const deleteSheetFromBackend = async (spreadsheetId: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to unlink this Google Sheet? The file will remain safely on your Google Drive, but will be disconnected from this hospital dashboard.'
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/sheets/${spreadsheetId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSavedSheets(prev => prev.filter(s => s.spreadsheetId !== spreadsheetId));
        if (activeSheetId === spreadsheetId) {
          setActiveSheetId(null);
          setSheetRows([]);
        }
      }
    } catch (err) {
      console.error('Error deleting sheet:', err);
    }
  };

  // Programmatically create a pre-structured medical log / export sheet
  const handleCreateHospitalSheet = async () => {
    if (!accessToken) return;
    setCreatingSheet(true);

    const title = 'ABC Hospital Lagos - Appointments Ledger';

    try {
      // 1. Create a brand new Google Spreadsheet using backend proxy
      const createResponse = await proxiedGoogleFetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: title
          }
        })
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create new Google Sheet on Google Drive');
      }

      const sheetObj = await createResponse.json();
      const spreadsheetId = sheetObj.spreadsheetId;
      const spreadsheetUrl = sheetObj.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

      // 2. Set beautiful table headers in Sheet1!A1:F1 using backend proxy
      const headers = [["Patient Name", "Phone Number", "Medical Department", "Preferred Date", "Preferred Time", "Sync Timestamp"]];
      
      const updateResponse = await proxiedGoogleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:F1?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: headers
        })
      });

      if (!updateResponse.ok) {
        console.warn('Sheet created, but failed to write column headers.');
      }

      // Save to Firestore and select as active
      await saveSheetToBackend(spreadsheetId, title, spreadsheetUrl);
      setActiveSheetId(spreadsheetId);
      alert(`Success! Created Google Sheet: "${title}" on your Google Drive and linked it successfully.`);
    } catch (err: any) {
      console.error('Error creating Google Sheet:', err);
      alert('Error creating Google Sheet: ' + err.message);
    } finally {
      setCreatingSheet(false);
    }
  };

  // Import existing spreadsheet
  const handleImportSheet = async () => {
    if (!importSheetId.trim()) return;
    if (!accessToken) {
      alert('Please connect your Google Account first.');
      return;
    }

    setIsLoading(true);
    try {
      let spreadsheetId = importSheetId.trim();
      
      // Auto-extract ID if full URL was pasted
      const urlMatch = spreadsheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (urlMatch && urlMatch[1]) {
        spreadsheetId = urlMatch[1];
      }

      const response = await proxiedGoogleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        throw new Error('Spreadsheet not found. Check the ID, or verify your account has permissions to access this sheet.');
      }

      const data = await response.json();
      const title = data.properties.title || 'Imported Spreadsheet';
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

      await saveSheetToBackend(spreadsheetId, title, url);
      setActiveSheetId(spreadsheetId);
      setImportSheetId('');
      alert(`Successfully linked spreadsheet: "${title}"`);
    } catch (err: any) {
      console.error('Import spreadsheet error:', err);
      alert('Error importing spreadsheet: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Sync Appointments from Local DB to active spreadsheet
  const handleSyncAppointmentsToSheet = async () => {
    if (!activeSheetId || !accessToken) return;
    setSyncingData(true);

    try {
      // 1. Get current appointments
      const apptRes = await fetch('/api/appointments');
      if (!apptRes.ok) {
        throw new Error('Could not fetch appointments from the hospital database.');
      }
      const appointments: Appointment[] = await apptRes.json();

      if (appointments.length === 0) {
        alert('There are no appointments in the database to sync.');
        setSyncingData(false);
        return;
      }

      // 2. Fetch sheet details first to determine the title or sheets using proxy
      const sheetMetadataRes = await proxiedGoogleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${activeSheetId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!sheetMetadataRes.ok) {
        throw new Error('Could not fetch sheet metadata. Please check permissions.');
      }
      const metadata = await sheetMetadataRes.json();
      const firstSheetName = metadata.sheets?.[0]?.properties?.title || 'Sheet1';

      // 3. Write column headers using proxy
      const headers = [["Patient Name", "Phone Number", "Medical Department", "Preferred Date", "Preferred Time", "Sync Timestamp"]];
      await proxiedGoogleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${activeSheetId}/values/${firstSheetName}!A1:F1?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: headers })
      });

      // 4. Map appointments to rows
      const rows = appointments.map(apt => [
        apt.patientName,
        apt.phoneNumber,
        apt.department,
        apt.preferredDate,
        apt.preferredTime,
        new Date(apt.createdAt).toLocaleString()
      ]);

      // 5. Overwrite rows starting A2 to clean sheet using proxy
      const updateRowsRes = await proxiedGoogleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${activeSheetId}/values/${firstSheetName}!A2:F${rows.length + 1}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: rows
        })
      });

      if (!updateRowsRes.ok) {
        throw new Error('Failed to update values on Google Sheet.');
      }

      alert(`Success! Successfully synced all ${appointments.length} appointment records to sheet tab: "${firstSheetName}".`);
      fetchSheetData(activeSheetId);
    } catch (err: any) {
      console.error('Sync error:', err);
      alert('Error syncing to Google Sheet: ' + err.message);
    } finally {
      setSyncingData(false);
    }
  };

  // Fetch spreadsheet cell values to preview
  const fetchSheetData = async (spreadsheetId: string) => {
    if (!accessToken) return;
    setIsLoadingSheetData(true);

    try {
      // 1. Find sheet name using proxy
      const metadataRes = await proxiedGoogleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!metadataRes.ok) {
        setSheetRows([]);
        return;
      }
      const metadata = await metadataRes.json();
      const firstSheetName = metadata.sheets?.[0]?.properties?.title || 'Sheet1';

      // 2. Fetch first 100 rows using proxy
      const dataRes = await proxiedGoogleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${firstSheetName}!A1:G100`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (dataRes.ok) {
        const data = await dataRes.json();
        setSheetRows(data.values || []);
      } else {
        setSheetRows([]);
      }
    } catch (err) {
      console.error('Error loading spreadsheet values:', err);
    } finally {
      setIsLoadingSheetData(false);
    }
  };

  useEffect(() => {
    if (activeSheetId && accessToken) {
      fetchSheetData(activeSheetId);
    }
  }, [activeSheetId, accessToken]);

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

  const activeSheet = savedSheets.find(s => s.spreadsheetId === activeSheetId);

  return (
    <div className="space-y-6">
      {/* Account connection header */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-3xl p-6 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-200" />
            <h2 className="text-xl font-bold">Google Sheets Clinical Registry</h2>
          </div>
          <p className="text-emerald-100 text-sm max-w-xl">
            Directly synchronize clinical rosters, export patient appointment logs, and read medical records stored inside your secure Google Sheets cloud drive.
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
              <div className="h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm">
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
        /* Prompt authorization */
        <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 shadow-sm max-w-2xl mx-auto space-y-5">
          <div className="bg-emerald-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
            <FileSpreadsheet className="h-8 w-8 text-emerald-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900">Google Drive & Sheets Access Required</h3>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
              Link with your Google account to enable clinical ledger logging. Sync current hospital booking statistics, view schedules, and query real-time spreadsheet updates.
            </p>
          </div>
        </div>
      ) : (
        /* Work area */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 text-left">
          {/* Side navigation */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-xs tracking-wide uppercase">Linked Spreadsheets</h3>
                <button 
                  onClick={fetchSavedSheets} 
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                  title="Refresh spreadsheet list"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingSheetsList ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Saved list */}
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {isLoadingSheetsList ? (
                  <div className="text-center py-4 text-xs text-slate-400">Loading lists...</div>
                ) : savedSheets.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400 italic">No sheets linked yet.</div>
                ) : (
                  savedSheets.map(sheet => (
                    <div
                      key={sheet.spreadsheetId}
                      className={`group flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                        activeSheetId === sheet.spreadsheetId
                          ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 shadow-sm font-medium'
                          : 'border-slate-100 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <button
                        onClick={() => setActiveSheetId(sheet.spreadsheetId)}
                        className="flex-1 text-xs truncate text-left"
                      >
                        {sheet.title}
                      </button>
                      <button
                        onClick={() => deleteSheetFromBackend(sheet.spreadsheetId)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Disconnect spreadsheet"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <hr className="border-slate-100" />

              {/* Create/Deploy Programmatic Spreadsheet */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Create New Registry</h4>
                <button
                  disabled={creatingSheet}
                  onClick={handleCreateHospitalSheet}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors font-bold text-xs disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {creatingSheet ? 'Deploying Sheet...' : 'Create Appointments Ledger'}
                </button>
              </div>

              <hr className="border-slate-100" />

              {/* Link existing sheet */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Link Spreadsheet ID</h4>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={importSheetId}
                    onChange={(e) => setImportSheetId(e.target.value)}
                    placeholder="Enter Spreadsheet ID"
                    className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={handleImportSheet}
                    disabled={isLoading}
                    className="px-2.5 py-1.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    Link
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Main Workspace area */}
          <div className="lg:col-span-3 space-y-6">
            {!activeSheetId ? (
              <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 shadow-sm h-full flex flex-col items-center justify-center space-y-4">
                <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center">
                  <FileSpreadsheet className="h-8 w-8 text-slate-400" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-slate-900">Select or Link a Sheet</h4>
                  <p className="text-slate-500 text-sm max-w-sm mt-1">
                    Select a spreadsheet from the sidebar, or click "Create Appointments Ledger" to deploy a beautiful records sheet automatically on your Google Drive.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
                {/* Header info */}
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
                      <h3 className="font-bold text-slate-900 text-lg leading-snug">
                        {activeSheet?.title || 'Active Spreadsheet'}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] font-mono bg-slate-200/60 text-slate-600 px-2 py-0.5 rounded-md">
                        ID: {activeSheetId}
                      </span>
                      <button
                        onClick={() => copyToClipboard(activeSheetId, 'id')}
                        className="text-[10px] text-emerald-600 hover:underline flex items-center gap-1"
                      >
                        {copiedId === activeSheetId ? 'Copied!' : 'Copy ID'}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {activeSheet?.url && (
                      <a
                        href={activeSheet.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all shadow-sm"
                      >
                        Open on Google Drive
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Sub Tab selection */}
                <div className="flex border-b border-slate-100 px-6 bg-white">
                  <button
                    onClick={() => setSheetsTab('preview')}
                    className={`py-3 px-4 font-bold text-xs tracking-wider uppercase border-b-2 transition-all ${
                      sheetsTab === 'preview'
                        ? 'border-emerald-600 text-emerald-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Spreadsheet Preview
                  </button>
                  <button
                    onClick={() => setSheetsTab('sync')}
                    className={`py-3 px-4 font-bold text-xs tracking-wider uppercase border-b-2 transition-all ${
                      sheetsTab === 'sync'
                        ? 'border-emerald-600 text-emerald-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Sync & Export Operations
                  </button>
                  <button
                    onClick={() => setSheetsTab('embed')}
                    className={`py-3 px-4 font-bold text-xs tracking-wider uppercase border-b-2 transition-all ${
                      sheetsTab === 'embed'
                        ? 'border-emerald-600 text-emerald-600'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Interactive Embed Grid
                  </button>
                </div>

                {/* Tab content */}
                <div className="p-6 flex-1 bg-white">
                  <AnimatePresence mode="wait">
                    {sheetsTab === 'preview' && (
                      <motion.div
                        key="preview-tab"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                              <Table className="h-4 w-4 text-emerald-500" />
                              Google Sheet Values Preview
                            </h4>
                            <p className="text-slate-500 text-xs">Viewing real-time spreadsheet records from your active sheet tab.</p>
                          </div>
                          <button
                            onClick={() => fetchSheetData(activeSheetId)}
                            disabled={isLoadingSheetData}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-semibold rounded-xl border border-slate-200 transition-colors"
                          >
                            <RefreshCw className={`h-3 w-3 ${isLoadingSheetData ? 'animate-spin' : ''}`} />
                            Fetch Latest Rows
                          </button>
                        </div>

                        {isLoadingSheetData ? (
                          <div className="flex flex-col items-center justify-center h-48 space-y-2">
                            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xs text-slate-500">Retrieving sheet values...</span>
                          </div>
                        ) : sheetRows.length === 0 ? (
                          <div className="p-12 text-center bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                            <p className="text-slate-500 text-sm italic">This Google Sheet is currently empty, or we could not read cells from Sheet1.</p>
                            <p className="text-xs text-slate-400 max-w-sm mx-auto">
                              Go to the "Sync & Export Operations" tab to export all booking databases to this sheet automatically!
                            </p>
                          </div>
                        ) : (
                          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm max-h-[380px] overflow-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200 sticky top-0">
                                <tr>
                                  {sheetRows[0].map((col, cIdx) => (
                                    <th key={cIdx} className="p-3 bg-slate-50">{col}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {sheetRows.slice(1).map((row, rIdx) => (
                                  <tr key={rIdx} className="hover:bg-slate-50/50">
                                    {row.map((cell, cIdx) => (
                                      <td key={cIdx} className="p-3 font-medium text-slate-700 whitespace-nowrap">{cell}</td>
                                    ))}
                                    {/* Fill trailing columns if uneven row cells */}
                                    {row.length < sheetRows[0].length && Array.from({ length: sheetRows[0].length - row.length }).map((_, missingIdx) => (
                                      <td key={`missing-${missingIdx}`} className="p-3"></td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </motion.div>
                    )}

                    {sheetsTab === 'sync' && (
                      <motion.div
                        key="sync-tab"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-6"
                      >
                        <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5 space-y-4">
                          <div className="flex items-center gap-3">
                            <Sparkles className="h-5 w-5 text-emerald-600" />
                            <h4 className="font-bold text-slate-900 text-sm">One-Click Appointments Ledger Synchronization</h4>
                          </div>
                          <p className="text-slate-600 text-xs leading-relaxed max-w-xl">
                            Click the button below to retrieve all active patient bookings from the ABC Hospital Firestore database, format them into column rows, and export/overwrite them cleanly onto your linked Google Sheet.
                          </p>

                          <div className="flex items-center gap-3 pt-2">
                            <button
                              disabled={syncingData}
                              onClick={handleSyncAppointmentsToSheet}
                              className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition-colors disabled:opacity-50"
                            >
                              <Send className="h-4 w-4" />
                              {syncingData ? 'Syncing Records...' : 'Execute Full Synchronisation'}
                            </button>
                            <button
                              onClick={() => fetchSheetData(activeSheetId)}
                              className="px-4 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
                            >
                              Verify Data
                            </button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Sync Specifications</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 border border-slate-150 rounded-xl space-y-1">
                              <div className="font-bold text-xs text-slate-800">Target Range</div>
                              <div className="text-slate-500 text-xs">First Tab (Default: Sheet1) • Columns A:F</div>
                            </div>
                            <div className="p-4 border border-slate-150 rounded-xl space-y-1">
                              <div className="font-bold text-xs text-slate-800">Headers Mapped</div>
                              <div className="text-slate-500 text-xs">Patient, Phone, Department, Date, Time, LoggedAt</div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {sheetsTab === 'embed' && (
                      <motion.div
                        key="embed-tab"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="h-full flex flex-col space-y-4"
                      >
                        <div className="text-left">
                          <h4 className="font-bold text-slate-900 text-sm">Full Google Sheets Frame</h4>
                          <p className="text-slate-500 text-xs">Edit and style your medical spreadsheet directly inside your hospital management workspace.</p>
                        </div>

                        <div className="relative border border-slate-200 rounded-3xl overflow-hidden shadow-md bg-slate-100 w-full h-[450px]">
                          <iframe
                            src={`https://docs.google.com/spreadsheets/d/${activeSheetId}/edit?widget=true&headers=false`}
                            width="100%"
                            height="100%"
                            frameBorder="0"
                            marginHeight={0}
                            marginWidth={0}
                            title="Interactive Sheet Portal"
                            className="w-full h-full bg-white"
                          >
                            Loading spreadsheet...
                          </iframe>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

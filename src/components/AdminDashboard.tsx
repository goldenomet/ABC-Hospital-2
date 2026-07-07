import React, { useState, useEffect } from 'react';
import { RefreshCw, Calendar as CalendarIcon, User, Phone, MapPin, Clock, ClipboardList, FileSpreadsheet, Mail } from 'lucide-react';
import { motion } from 'motion/react';
import { GoogleFormsManager } from './GoogleFormsManager';
import { GoogleSheetsManager } from './GoogleSheetsManager';

interface Appointment {
  id: string;
  patientName: string;
  phoneNumber: string;
  preferredDate: string;
  preferredTime: string;
  department: string;
  createdAt: string;
}

export function AdminDashboard({ onClose }: { onClose: () => void }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'appointments' | 'forms' | 'sheets'>('appointments');
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchAppointments = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/appointments');
      if (response.ok) {
        const data = await response.json();
        setAppointments(data);
      }
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setEmailStatus(null);
    try {
      const response = await fetch('/api/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setEmailStatus({ type: 'success', message: data.message });
      } else {
        setEmailStatus({ type: 'error', message: data.error || 'Failed to send test email.' });
      }
    } catch (error) {
      console.error('Test email error:', error);
      setEmailStatus({ type: 'error', message: 'An unexpected network error occurred while testing email.' });
    } finally {
      setTestingEmail(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Hospital Administration</h1>
            <p className="text-slate-500">Patient Appointments & Administrative Forms</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleTestEmail}
              disabled={testingEmail}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50 text-xs md:text-sm"
              title="Send a live test email using your mail transporter"
            >
              <Mail className={`h-4 w-4 ${testingEmail ? 'animate-bounce' : ''}`} />
              {testingEmail ? 'Testing...' : 'Test Email Automation'}
            </button>
            {activeTab === 'appointments' && (
              <button
                onClick={fetchAppointments}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-medium hover:bg-blue-100 transition-colors disabled:opacity-50 text-xs md:text-sm"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors text-xs md:text-sm"
            >
              Close Portal
            </button>
          </div>
        </div>

        {/* Email test feedback banner */}
        {emailStatus && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-2xl mb-6 border text-sm flex items-start justify-between gap-3 ${
              emailStatus.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-bold block">
                  {emailStatus.type === 'success' ? 'Email Sent Successfully!' : 'Email Setup Needed'}
                </span>
                <span className="text-xs">{emailStatus.message}</span>
              </div>
            </div>
            <button
              onClick={() => setEmailStatus(null)}
              className="text-xs font-bold underline opacity-80 hover:opacity-100 flex-shrink-0"
            >
              Dismiss
            </button>
          </motion.div>
        )}

        {/* Tab Selection */}
        <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm mb-6 max-w-lg">
          <button
            onClick={() => setActiveTab('appointments')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'appointments'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <CalendarIcon className="h-4 w-4" />
            Appointments
          </button>
          <button
            onClick={() => setActiveTab('forms')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'forms'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            Google Forms
          </button>
          <button
            onClick={() => setActiveTab('sheets')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'sheets'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Google Sheets
          </button>
        </div>

        {activeTab === 'appointments' ? (
          isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : appointments.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200">
              <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <CalendarIcon className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-1">No appointments yet</h3>
              <p className="text-slate-500">When patients book appointments, they will appear here.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {appointments.map((apt, index) => (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  key={apt.id}
                  className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-400" />
                        {apt.patientName}
                      </h3>
                      <p className="text-slate-500 text-sm flex items-center gap-2 mt-1">
                        <Phone className="h-4 w-4 text-slate-400" />
                        {apt.phoneNumber}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 bg-slate-50 p-4 rounded-xl">
                    <div className="flex items-center gap-3 text-sm text-slate-700">
                      <MapPin className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <span className="font-medium">{apt.department}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-700">
                      <CalendarIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <span>{apt.preferredDate}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-700">
                      <Clock className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <span>{apt.preferredTime}</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400 text-right">
                    Booked: {new Date(apt.createdAt).toLocaleString()}
                  </div>
                </motion.div>
              ))}
            </div>
          )
        ) : activeTab === 'forms' ? (
          <GoogleFormsManager />
        ) : (
          <GoogleSheetsManager />
        )}
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageCircle, 
  X, 
  Send, 
  Hospital, 
  Calendar, 
  Activity, 
  Phone, 
  MapPin, 
  ChevronRight,
  Stethoscope,
  HeartPulse,
  UserRound,
  CheckCircle,
  Volume2,
  VolumeX,
  Printer,
  CalendarPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
};

export default function App() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [chatMode, setChatMode] = useState<'chat' | 'book' | 'success'>('chat');
  const [formData, setFormData] = useState({ name: '', phone: '', date: '', time: '', department: '' });
  const [formErrors, setFormErrors] = useState({ name: '', phone: '', date: '', time: '', department: '' });
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'model', text: 'Hello! Welcome to ABC Hospital. I am your virtual assistant. How can I help you today? You can ask about our services, schedule an appointment, or describe your symptoms.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const playBeep = () => {
    if (!isSoundEnabled) return;
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const audioCtx = new AudioContext();
      
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.05); 

      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.02);
      gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.error("Audio playback failed", e);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isChatOpen]);

  const handleSendMessage = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const textToSend = customText || input.trim();
    if (!textToSend || isLoading) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', text: textToSend };
    setMessages(prev => [...prev, userMessage]);
    if (!customText) setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMessage] })
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: data.text }]);
      playBeep();
      
      if (data.appointmentBooked) {
        setTimeout(() => setChatMode('success'), 1500);
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: 'I apologize, but I am having trouble connecting right now. Please try again or call our reception directly.' }]);
      playBeep();
    } finally {
      setIsLoading(false);
    }
  };

  const availableTimes: Record<string, string[]> = {
    'General Practice': ['09:00 AM', '10:00 AM', '11:00 AM', '01:00 PM', '02:00 PM', '03:00 PM'],
    'Cardiology': ['10:00 AM', '11:30 AM', '01:00 PM', '02:30 PM'],
    'Pediatrics': ['09:00 AM', '10:30 AM', '01:00 PM', '03:30 PM'],
    'Emergency': ['Immediate (Walk-in Only)']
  };

  const departmentDoctors: Record<string, string> = {
    'General Practice': 'Dr. Sarah Smith',
    'Cardiology': 'Dr. Michael Adebayo',
    'Pediatrics': 'Dr. Emily Johnson',
    'Emergency': 'Emergency Medical Officer'
  };

  const handleBookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let valid = true;
    const errors = { name: '', phone: '', date: '', time: '', department: '' };
    if (!formData.name.trim()) { errors.name = 'Name is required'; valid = false; }
    if (!formData.phone.trim()) { errors.phone = 'Phone is required'; valid = false; }
    else if (formData.phone.length < 7) { errors.phone = 'Invalid phone number'; valid = false; }
    if (!formData.date) { errors.date = 'Date is required'; valid = false; }
    if (!formData.department) { errors.department = 'Department is required'; valid = false; }
    if (!formData.time && formData.department !== 'Emergency') { errors.time = 'Time is required'; valid = false; }
    
    setFormErrors(errors);
    if (!valid) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: formData.name,
          phoneNumber: formData.phone,
          preferredDate: formData.date,
          preferredTime: formData.time || 'Immediate',
          department: formData.department
        })
      });
      
      if (!response.ok) throw new Error('Booking failed');
      
      setChatMode('success');
    } catch (err) {
      setFormErrors(prev => ({ ...prev, name: 'Failed to submit. Please try again.' }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToCalendar = () => {
    let startDateTime = new Date(formData.date);
    if (formData.time && formData.time !== 'Immediate' && formData.time !== 'Immediate (Walk-in Only)') {
      const match = formData.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match) {
        let hours = parseInt(match[1], 10);
        const mins = parseInt(match[2], 10);
        const ampm = match[3].toUpperCase();
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        startDateTime.setHours(hours, mins, 0);
      }
    } else {
      // Default to 9 AM if no valid time
      startDateTime.setHours(9, 0, 0);
    }
    
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // 1 hour duration
    
    const formatDate = (date: Date) => {
      return date.toISOString().replace(/-|:|\.\d+/g, '');
    };

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ABC Hospital//Appointment//EN',
      'BEGIN:VEVENT',
      `DTSTART:${formatDate(startDateTime)}`,
      `DTEND:${formatDate(endDateTime)}`,
      `SUMMARY:Medical Appointment at ABC Hospital (${formData.department})`,
      `DESCRIPTION:Patient: ${formData.name}\\nPhone: ${formData.phone}\\nDepartment: ${formData.department}\\nDoctor: ${departmentDoctors[formData.department] || 'Assigned Medical Staff'}`,
      'LOCATION:ABC Hospital\\, Lagos\\, Ikeja',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'hth-appointment.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>Appointment Details - ABC Hospital</title>
          <style>
            @media print {
              body { padding: 0; margin: 0; background: #fff; }
              .card { border: none !important; box-shadow: none !important; max-width: 100% !important; padding: 0 !important; }
              @page { margin: 2cm; }
              * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            }
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #0f172a; line-height: 1.5; background: #f8fafc; }
            .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 40px; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); background: #fff; }
            h1 { color: #0f172a; margin-top: 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; font-size: 24px; }
            .detail-row { display: flex; margin: 12px 0; font-size: 16px; align-items: baseline; }
            .detail-label { color: #475569; font-weight: 600; width: 140px; flex-shrink: 0; }
            .detail-value { color: #0f172a; font-weight: 500; }
            .header { text-align: center; margin-bottom: 40px; }
            .hospital-name { font-size: 28px; font-weight: bold; color: #2563eb; margin-bottom: 4px; }
            .subtitle { color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <div class="hospital-name">ABC Hospital</div>
              <div class="subtitle">Booking Confirmation</div>
            </div>
            <h1>Appointment Details</h1>
            <div class="detail-row">
              <span class="detail-label">Patient:</span>
              <span class="detail-value">${formData.name}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Phone:</span>
              <span class="detail-value">${formData.phone}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Department:</span>
              <span class="detail-value">${formData.department}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Doctor:</span>
              <span class="detail-value">${departmentDoctors[formData.department] || 'Assigned Medical Staff'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date:</span>
              <span class="detail-value">${formData.date}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Time:</span>
              <span class="detail-value">${formData.time || 'Immediate'}</span>
            </div>
          </div>
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-blue-100">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2.5 rounded-xl shadow-sm">
                <Hospital className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 leading-tight">ABC Hospital</h1>
                <p className="text-xs text-slate-500 font-medium">Lagos, Ikeja</p>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">Services</a>
              <a href="#" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">Specialists</a>
              <a href="#" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">Patient Portal</a>
              <button 
                onClick={() => { setIsChatOpen(true); setChatMode('book'); }}
                className="inline-flex items-center justify-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Book Appointment
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="print:hidden">
        <div className="relative bg-white overflow-hidden">
          <div className="max-w-7xl mx-auto">
            <div className="relative z-10 pb-8 bg-white sm:pb-16 md:pb-20 lg:max-w-2xl lg:w-full lg:pb-28 xl:pb-32 pt-16 px-4 sm:px-6 lg:px-8">
              <div className="sm:text-center lg:text-left">
                <h2 className="text-4xl tracking-tight font-extrabold text-slate-900 sm:text-5xl md:text-6xl">
                  <span className="block xl:inline">Excellence in</span>{' '}
                  <span className="block text-blue-600 xl:inline">healthcare delivery</span>
                </h2>
                <p className="mt-3 text-base text-slate-500 sm:mt-5 sm:text-lg sm:max-w-xl sm:mx-auto md:mt-5 md:text-xl lg:mx-0">
                  Providing compassionate, comprehensive, and advanced medical care to the Ikeja community and beyond. Your health is our sacred priority.
                </p>
                <div className="mt-5 sm:mt-8 sm:flex sm:justify-center lg:justify-start gap-3">
                  <button 
                    onClick={() => { setIsChatOpen(true); setChatMode('chat'); }}
                    className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 md:py-4 md:text-lg md:px-10 transition-colors shadow-sm"
                  >
                    Consult our AI Assistant
                  </button>
                  <a href="#" className="w-full flex items-center justify-center px-8 py-3 border border-slate-200 text-base font-medium rounded-xl text-slate-700 bg-white hover:bg-slate-50 md:py-4 md:text-lg md:px-10 transition-colors">
                    Emergency: 112
                  </a>
                </div>
              </div>
            </div>
          </div>
          <div className="lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2 bg-slate-100 flex items-center justify-center p-12 hidden lg:flex">
             <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
                <div className="bg-white p-6 rounded-2xl shadow-sm flex flex-col items-center text-center gap-3">
                  <div className="bg-blue-50 p-3 rounded-full text-blue-600">
                    <Stethoscope className="h-8 w-8" />
                  </div>
                  <h3 className="font-semibold text-slate-900">General Practice</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm flex flex-col items-center text-center gap-3 mt-8">
                  <div className="bg-rose-50 p-3 rounded-full text-rose-600">
                    <HeartPulse className="h-8 w-8" />
                  </div>
                  <h3 className="font-semibold text-slate-900">Cardiology</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm flex flex-col items-center text-center gap-3">
                  <div className="bg-emerald-50 p-3 rounded-full text-emerald-600">
                    <UserRound className="h-8 w-8" />
                  </div>
                  <h3 className="font-semibold text-slate-900">Pediatrics</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm flex flex-col items-center text-center gap-3 mt-8">
                  <div className="bg-amber-50 p-3 rounded-full text-amber-600">
                    <Activity className="h-8 w-8" />
                  </div>
                  <h3 className="font-semibold text-slate-900">Emergency 24/7</h3>
                </div>
             </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-slate-900 text-white py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-8">
             <div className="flex items-start gap-4">
                <MapPin className="h-6 w-6 text-blue-400 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-lg mb-2">Location</h4>
                  <p className="text-slate-400">123 Opebi Road<br/>Ikeja, Lagos<br/>Nigeria</p>
                </div>
             </div>
             <div className="flex items-start gap-4">
                <Phone className="h-6 w-6 text-blue-400 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-lg mb-2">Contact</h4>
                  <p className="text-slate-400">Emergency: +234 800 123 4567<br/>Desk: +234 1 234 5678</p>
                </div>
             </div>
             <div className="flex items-start gap-4">
                <Calendar className="h-6 w-6 text-blue-400 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-lg mb-2">Hours</h4>
                  <p className="text-slate-400">Emergency: 24/7<br/>Outpatient: Mon-Sat, 8am-5pm</p>
                </div>
             </div>
          </div>
        </div>
      </main>

      {/* Floating Chat Button */}
      <AnimatePresence>
        {!isChatOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsChatOpen(true)}
            className="fixed bottom-6 right-6 p-4 bg-blue-600 text-white rounded-full shadow-xl hover:bg-blue-700 transition-colors z-50 flex items-center justify-center group print:hidden"
          >
            <MessageCircle className="h-7 w-7 group-hover:scale-110 transition-transform" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Widget */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 w-[380px] max-w-[calc(100vw-3rem)] bg-white rounded-2xl shadow-2xl overflow-hidden z-50 border border-slate-200 flex flex-col print:fixed print:inset-0 print:w-full print:max-w-none print:h-auto print:shadow-none print:border-none print:overflow-visible print:bg-white"
            style={{ height: '600px', maxHeight: 'calc(100vh - 6rem)' }}
          >
            {/* Chat Header */}
            <div className="bg-blue-600 p-4 flex flex-col gap-3 text-white flex-shrink-0 print:hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-full">
                    <Hospital className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold leading-tight">ABC Assistant</h3>
                    <p className="text-xs text-blue-100 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 block animate-pulse"></span>
                      Online
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsSoundEnabled(!isSoundEnabled)}
                    className="p-1 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white"
                    title={isSoundEnabled ? "Mute sounds" : "Enable sounds"}
                  >
                    {isSoundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                  </button>
                  <button 
                    onClick={() => setIsChatOpen(false)}
                    className="p-1 hover:bg-white/20 rounded-full transition-colors text-blue-100 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="flex bg-blue-700/50 rounded-lg p-1">
                <button 
                  onClick={() => setChatMode('chat')}
                  className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${chatMode === 'chat' ? 'bg-white text-blue-600 shadow-sm' : 'text-blue-100 hover:text-white'}`}
                >
                  Chat
                </button>
                <button 
                  onClick={() => setChatMode('book')}
                  className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${chatMode === 'book' || chatMode === 'success' ? 'bg-white text-blue-600 shadow-sm' : 'text-blue-100 hover:text-white'}`}
                >
                  Book Form
                </button>
              </div>
            </div>

            {/* Chat Content */}
            {chatMode === 'chat' && (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 scroll-smooth">
                  {messages.map((message) => (
                    <div 
                      key={message.id} 
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div 
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                          message.role === 'user' 
                            ? 'bg-blue-600 text-white rounded-tr-sm' 
                            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                        }`}
                      >
                        {message.text}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-4 shadow-sm flex gap-1">
                        <motion.div className="w-2 h-2 bg-slate-300 rounded-full" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} />
                        <motion.div className="w-2 h-2 bg-slate-300 rounded-full" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }} />
                        <motion.div className="w-2 h-2 bg-slate-300 rounded-full" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }} />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="p-4 bg-white border-t border-slate-100 flex-shrink-0 flex flex-col gap-3">
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-2 px-2">
                    {['Opening hours', 'How to reach us', 'Accepted Insurance'].map((q) => (
                      <button
                        key={q}
                        onClick={() => handleSendMessage(undefined, q)}
                        disabled={isLoading}
                        className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full hover:bg-blue-100 transition-colors border border-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Type your message..."
                      className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50 transition-all"
                      disabled={isLoading}
                    />
                    <button 
                      type="submit"
                      disabled={!input.trim() || isLoading}
                      className="bg-blue-600 text-white p-2.5 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 shadow-sm"
                    >
                      <Send className="h-5 w-5" />
                    </button>
                  </form>
                  <div className="text-center mt-2 flex flex-col items-center gap-2">
                    <p className="text-[10px] text-slate-400">
                      In an emergency, please call 112 or visit the ER immediately.
                    </p>
                    <a 
                      href="https://wa.me/2349075934287?text=Hello!%20I%27m%20chatting%20with%20the%20ABC%20Assistant%20but%20need%20to%20speak%20with%20live%20staff."
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 transition-colors"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Not satisfied? Speak to live staff on WhatsApp
                    </a>
                  </div>
                </div>
              </>
            )}

            {/* Booking Form View */}
            {chatMode === 'book' && (
              <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
                <h4 className="font-semibold text-slate-800 mb-4">Request an Appointment</h4>
                <form onSubmit={handleBookSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className={`w-full border ${formErrors.name ? 'border-red-500' : 'border-slate-200'} rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white`}
                      placeholder="e.g. John Doe"
                    />
                    {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                    <input 
                      type="tel" 
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className={`w-full border ${formErrors.phone ? 'border-red-500' : 'border-slate-200'} rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white`}
                      placeholder="+234 800 000 0000"
                    />
                    {formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Date</label>
                    <input 
                      type="date" 
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                      className={`w-full border ${formErrors.date ? 'border-red-500' : 'border-slate-200'} rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white`}
                    />
                    {formErrors.date && <p className="text-red-500 text-xs mt-1">{formErrors.date}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                    <select
                      value={formData.department}
                      onChange={(e) => setFormData({...formData, department: e.target.value, time: ''})}
                      className={`w-full border ${formErrors.department ? 'border-red-500' : 'border-slate-200'} rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white`}
                    >
                      <option value="">Select a department...</option>
                      <option value="General Practice">General Practice</option>
                      <option value="Cardiology">Cardiology</option>
                      <option value="Pediatrics">Pediatrics</option>
                      <option value="Emergency">Emergency</option>
                    </select>
                    {formErrors.department && <p className="text-red-500 text-xs mt-1">{formErrors.department}</p>}
                  </div>
                  {formData.department && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Time</label>
                      {formData.department === 'Emergency' ? (
                        <div className="w-full border border-orange-200 bg-orange-50 text-orange-700 rounded-xl px-4 py-2.5 text-sm font-medium">
                          Immediate (Walk-in Only)
                        </div>
                      ) : (
                        <select
                          value={formData.time}
                          onChange={(e) => setFormData({...formData, time: e.target.value})}
                          className={`w-full border ${formErrors.time ? 'border-red-500' : 'border-slate-200'} rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white`}
                        >
                          <option value="">Select an available time...</option>
                          {availableTimes[formData.department]?.map(time => (
                            <option key={time} value={time}>{time}</option>
                          ))}
                        </select>
                      )}
                      {formErrors.time && <p className="text-red-500 text-xs mt-1">{formErrors.time}</p>}
                    </motion.div>
                  )}
                  <button 
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-blue-600 text-white rounded-xl py-3 font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 mt-2"
                  >
                    {isLoading ? 'Submitting...' : 'Confirm Appointment'}
                  </button>
                </form>
              </div>
            )}

            {/* Success View */}
            {chatMode === 'success' && (
              <motion.div 
                id="print-section"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 flex flex-col items-center justify-start pt-10 p-6 text-center bg-slate-50 overflow-y-auto print:bg-white print:p-0 print:justify-start print:pt-10"
              >
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', bounce: 0.5, delay: 0.1 }}
                >
                  <CheckCircle className="h-20 w-20 text-emerald-500 mb-4" />
                </motion.div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Booking Confirmed!</h3>
                <p className="text-slate-500 mb-6 text-sm">
                  Your appointment request has been successfully recorded. Our team will contact you shortly.
                </p>
                <div className="bg-white p-4 rounded-xl border border-slate-200 w-full mb-6 text-left print:border-none print:shadow-none">
                  <h4 className="font-semibold text-slate-800 mb-3 border-b pb-2 print:text-2xl print:mb-6">Appointment Details</h4>
                  <div className="space-y-2 text-sm print:text-lg print:space-y-4">
                    <p><span className="text-slate-500 print:text-slate-700">Patient:</span> <span className="font-medium text-slate-900">{formData.name}</span></p>
                    <p><span className="text-slate-500 print:text-slate-700">Phone:</span> <span className="font-medium text-slate-900">{formData.phone}</span></p>
                    <p><span className="text-slate-500 print:text-slate-700">Department:</span> <span className="font-medium text-slate-900">{formData.department}</span></p>
                    <p><span className="text-slate-500 print:text-slate-700">Doctor:</span> <span className="font-medium text-slate-900">{departmentDoctors[formData.department] || 'Assigned Medical Staff'}</span></p>
                    <p><span className="text-slate-500 print:text-slate-700">Date:</span> <span className="font-medium text-slate-900">{formData.date}</span></p>
                    <p><span className="text-slate-500 print:text-slate-700">Time:</span> <span className="font-medium text-slate-900">{formData.time || 'Immediate'}</span></p>
                  </div>
                </div>
                <div className="flex flex-col gap-3 w-full max-w-[250px] print:hidden">
                  <button 
                    onClick={() => {
                      setFormData({ name: '', phone: '', date: '', time: '', department: '' });
                      setChatMode('chat');
                    }}
                    className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-sm text-sm"
                  >
                    Back to Chat
                  </button>
                  <div className="flex gap-3 w-full">
                    <button 
                      onClick={handleAddToCalendar}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors shadow-sm text-sm"
                    >
                      <CalendarPlus className="h-4 w-4" />
                      Calendar
                    </button>
                    <button 
                      onClick={handlePrint}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors shadow-sm text-sm"
                    >
                      <Printer className="h-4 w-4" />
                      Print
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

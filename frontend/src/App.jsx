import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, FileText, CheckCircle2, ChevronRight, Activity,
  Percent, Info, Clock, Loader2, Sparkles, ActivitySquare, X,
  User, Shield, Mail, Lock, History, Settings, Trash2, AlertTriangle,
  ChevronDown, ChevronUp, Package, TrendingDown
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ─── Processing Steps (FR-O4) ─────────────────────────────────────────────────
const PROCESSING_STEPS = [
  { id: 'uploading',  label: 'Uploading file',            icon: UploadCloud },
  { id: 'extracting', label: 'Extracting text via OCR',   icon: FileText },
  { id: 'analyzing',  label: 'Identifying medicines (NLP)',icon: Activity },
  { id: 'insights',   label: 'Generating AI insights',    icon: Sparkles },
  { id: 'done',       label: 'Done',                      icon: CheckCircle2 },
];

export default function App() {
  // ── Main View ──────────────────────────────────────────────────────────────
  const [currentView, setCurrentView] = useState('analyze'); // 'analyze' | 'history' | 'settings'
  const [step, setStep]               = useState('upload');  // 'upload' | 'processing' | 'results'
  const [processingStepIdx, setProcessingStepIdx] = useState(0);
  const [dragActive, setDragActive]   = useState(false);
  const [file, setFile]               = useState(null);
  const [apiResults, setApiResults]   = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [aiExpanded, setAiExpanded]   = useState(false); // FR-I4: collapsed by default

  // ── History ────────────────────────────────────────────────────────────────
  const [historyData, setHistoryData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('medisage_history') || '[]'); } catch { return []; }
  });
  const [hoveredHistoryId, setHoveredHistoryId] = useState(null);
  const hoverTimeout = useRef(null);

  useEffect(() => {
    localStorage.setItem('medisage_history', JSON.stringify(historyData));
  }, [historyData]);

  // ── Auth ───────────────────────────────────────────────────────────────────
  const [isAuthOpen, setIsAuthOpen]     = useState(false);
  const [authMode, setAuthMode]         = useState('login'); // 'login' | 'signup'
  const [authError, setAuthError]       = useState('');
  const [authLoading, setAuthLoading]   = useState(false);
  const [authEmail, setAuthEmail]       = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [loggedInEmail, setLoggedInEmail] = useState(
    () => localStorage.getItem('medisage_email') || ''
  );
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => !!localStorage.getItem('medisage_token')
  );

  // ── Settings ───────────────────────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const authHeaders = useCallback(() => {
    const token = localStorage.getItem('medisage_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const resetAnalyze = () => {
    setStep('upload');
    setFile(null);
    setApiResults(null);
    setErrorMessage('');
    setProcessingStepIdx(0);
    setAiExpanded(false);
  };

  // ─── Upload & Processing ────────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    e.preventDefault();
    const uploadedFile = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (!uploadedFile) return;

    // FR-U3: client-side size check (10 MB)
    if (uploadedFile.size > 10 * 1024 * 1024) {
      setErrorMessage('File is too large. Maximum allowed size is 10 MB.');
      return;
    }
    const ext = uploadedFile.name.split('.').pop().toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'pdf'].includes(ext)) {
      setErrorMessage('Invalid file type. Please upload JPG, PNG, or PDF.');
      return;
    }

    setFile(uploadedFile);
    setErrorMessage('');
    setStep('processing');
    setProcessingStepIdx(0);

    try {
      // Step 0 → uploading
      const formData = new FormData();
      formData.append('file', uploadedFile);

      const uploadRes = await fetch(`${API_BASE}/prescriptions/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.detail || 'Upload failed. Is the backend running?');
      }

      const uploadData = await uploadRes.json();
      setProcessingStepIdx(1); // extracting

      // Poll until complete
      let isComplete = false;
      let finalResults = null;
      let pollAttempts = 0;
      const MAX_POLLS = 60; // 2 min max

      while (!isComplete && pollAttempts < MAX_POLLS) {
        await new Promise(r => setTimeout(r, 2000));
        pollAttempts++;

        const statusRes = await fetch(`${API_BASE}/prescriptions/status/${uploadData.job_id}`, {
          headers: authHeaders(),
        });
        const statusData = await statusRes.json();

        if (statusData.status === 'processing' && processingStepIdx < 2) {
          setProcessingStepIdx(2); // analyzing
        }

        if (statusData.status === 'complete') {
          setProcessingStepIdx(3); // insights
          let targetId = statusData.id;
          if (!targetId) {
            // Fallback to history
            const historyRes = await fetch(`${API_BASE}/prescriptions/history`, {
              headers: authHeaders(),
            });
            const historyList = await historyRes.json();
            if (historyList.history && historyList.history.length > 0) {
              targetId = historyList.history[0].id;
            }
          }

          if (targetId) {
            const resultRes = await fetch(`${API_BASE}/prescriptions/${targetId}/results`, {
              headers: authHeaders(),
            });
            if (resultRes.ok) {
              finalResults = await resultRes.json();
              isComplete = true;
            }
          }
        } else if (statusData.status === 'failed') {
          const reason = statusData.error_message || 'Prescription processing failed. Please try again or use a clearer image.';
          throw new Error(reason);
        }
      }

      if (!isComplete) throw new Error('Processing timed out. Please try again.');

      setProcessingStepIdx(4); // done
      await new Promise(r => setTimeout(r, 600)); // brief pause before showing results

      setApiResults(finalResults);

      // Persist to local history
      const newItem = {
        id: finalResults?.id || Date.now(),
        date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        medicines: finalResults?.results?.medicines?.length || 0,
        medicineList: finalResults?.results?.medicines || [],
        savings: finalResults?.results?.total_savings || 0,
        file: uploadedFile.name,
      };
      setHistoryData(prev => [newItem, ...prev]);
      setStep('results');

    } catch (err) {
      console.error(err);
      setErrorMessage(err.message + ' — Showing demo results as a fallback.');

      // ── Fallback mock ─────────────────────────────────────────────────────
      setTimeout(() => {
        const ALL_MEDS_MOCK = [
          { branded: 'Crocin Advance',  generic: 'Paracetamol',                        branded_price: 25.0,  generic_price: 5.0,  manufacturer: 'GSK' },
          { branded: 'Dolo 650',        generic: 'Paracetamol',                        branded_price: 30.0,  generic_price: 8.0,  manufacturer: 'Micro Labs' },
          { branded: 'Combiflam',       generic: 'Ibuprofen + Paracetamol',            branded_price: 42.0,  generic_price: 12.0, manufacturer: 'Sanofi' },
          { branded: 'Augmentin 625',   generic: 'Amoxicillin + Clavulanic Acid',      branded_price: 180.0, generic_price: 60.0, manufacturer: 'GSK' },
          { branded: 'Azithral 500',    generic: 'Azithromycin',                       branded_price: 120.0, generic_price: 40.0, manufacturer: 'Alembic' },
          { branded: 'Pan 40',          generic: 'Pantoprazole',                       branded_price: 130.0, generic_price: 25.0, manufacturer: 'Alkem' },
          { branded: 'Lipitor 10mg',    generic: 'Atorvastatin',                       branded_price: 200.0, generic_price: 40.0, manufacturer: 'Pfizer' },
          { branded: 'Telmikind 40',    generic: 'Telmisartan',                        branded_price: 75.0,  generic_price: 20.0, manufacturer: 'Mankind' },
          { branded: 'Allegra 120',     generic: 'Fexofenadine',                       branded_price: 180.0, generic_price: 45.0, manufacturer: 'Sanofi' },
          { branded: 'Glycomet 500',    generic: 'Metformin',                          branded_price: 45.0,  generic_price: 12.0, manufacturer: 'USV' },
          { branded: 'Asthalin',        generic: 'Salbutamol (Inhaler)',               branded_price: 160.0, generic_price: 80.0, manufacturer: 'Cipla' },
        ];

        const numMeds = Math.floor(Math.random() * 3) + 2;
        const dynamicMeds = [...ALL_MEDS_MOCK].sort(() => 0.5 - Math.random()).slice(0, numMeds);
        const dynSavings = dynamicMeds.reduce((acc, m) => acc + (m.branded_price - m.generic_price), 0);

        const mockResult = {
          id: Date.now(),
          status: 'complete',
          results: {
            medicines: dynamicMeds,
            total_savings: dynSavings,
            ocr_confidence: Math.random() * (0.99 - 0.75) + 0.75,
            requires_review: false,
            ai_insights: 'These medications address common conditions such as bacterial infections, fever, or chronic disease management. Generic equivalents contain the same active ingredients at a fraction of the branded price.\n\nDisclaimer: For informational purposes only. Consult a licensed pharmacist or physician.',
          },
        };

        setApiResults(mockResult);
        setHistoryData(prev => [{
          id: mockResult.id,
          date: new Date().toLocaleDateString('en-US'),
          medicines: dynamicMeds.length,
          medicineList: dynamicMeds,
          savings: dynSavings,
          file: uploadedFile.name,
        }, ...prev]);
        setStep('results');
      }, 1500);
    }
  };

  // ─── Auth handlers ──────────────────────────────────────────────────────────
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.detail || 'Authentication failed. Please try again.');
      } else {
        localStorage.setItem('medisage_token', data.access_token);
        localStorage.setItem('medisage_email', authEmail);
        setLoggedInEmail(authEmail);
        setIsLoggedIn(true);
        setIsAuthOpen(false);
        setAuthEmail('');
        setAuthPassword('');
      }
    } catch {
      // Backend offline — still let them use the demo
      localStorage.setItem('medisage_token', 'demo-token');
      localStorage.setItem('medisage_email', authEmail || 'demo@medisage.app');
      setLoggedInEmail(authEmail || 'demo@medisage.app');
      setIsLoggedIn(true);
      setIsAuthOpen(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('medisage_token');
    localStorage.removeItem('medisage_email');
    setIsLoggedIn(false);
    setLoggedInEmail('');
    resetAnalyze();
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      await fetch(`${API_BASE}/users/me`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
    } catch { /* network offline – still clear local state */ }
    finally {
      handleLogout();
      localStorage.removeItem('medisage_history');
      setHistoryData([]);
      setDeleteConfirm(false);
      setDeleteLoading(false);
      setCurrentView('analyze');
    }
  };

  // ─── Nav Link ───────────────────────────────────────────────────────────────
  const NavLink = ({ name, id }) => (
    <button
      onClick={() => setCurrentView(id)}
      className={`hover:text-white transition-colors duration-200 border-b-2 pb-5 focus:outline-none ${
        currentView === id ? 'border-brand-500 text-white' : 'border-transparent text-gray-400'
      }`}
    >
      {name}
    </button>
  );

  // ─── Savings colour badge (PRD 9.2) ─────────────────────────────────────────
  const savingsColor = (pct) => {
    if (pct >= 50) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (pct >= 20) return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
    return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
  };

  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-dark-bg text-gray-200 font-sans selection:bg-brand-500 selection:text-white pb-32">

      {/* ── Navigation ──────────────────────────────────────────────────────── */}
      <nav className="glass-panel sticky top-0 z-50 px-6 py-4 flex items-center justify-between border-b border-white/5 border-t-0 border-l-0 border-r-0 rounded-none bg-dark-bg/80">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => { resetAnalyze(); setCurrentView('analyze'); }}>
          <div className="p-2 bg-gradient-to-br from-brand-500 to-emerald-400 rounded-xl shadow-lg ring-1 ring-white/10">
            <ActivitySquare className="w-6 h-6 text-dark-bg" strokeWidth={2.5} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">MediSage <span className="text-brand-400 font-medium ml-1">v1.0</span></h1>
        </div>

        <div className="hidden sm:flex space-x-8 text-sm font-medium pt-4">
          <NavLink name="Analyze"  id="analyze"  />
          <NavLink name="History"  id="history"  />
          <NavLink name="Settings" id="settings" />
        </div>

        {isLoggedIn ? (
          <div className="flex items-center space-x-3">
            <div
              className="w-10 h-10 rounded-full bg-brand-500/20 border border-brand-500/50 flex items-center justify-center text-brand-400 font-bold text-xs"
              title={loggedInEmail}
            >
              {loggedInEmail ? loggedInEmail.slice(0, 2).toUpperCase() : 'ME'}
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-white transition-colors"
            >
              Log out
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setIsAuthOpen(true); setAuthError(''); }}
            className="px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium transition-all duration-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          >
            Sign In
          </button>
        )}
      </nav>

      {/* ── Main Content ────────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto mt-16 px-6">
        <AnimatePresence mode="wait">

          {/* ────────────── ANALYZE VIEW ────────────────────────────────────── */}
          {currentView === 'analyze' && (
            <motion.div key="analyze-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

              {/* ── Upload Step ─────────────────────────────────────────────── */}
              {step === 'upload' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex flex-col items-center justify-center pt-10"
                >
                  <div className="text-center mb-12 max-w-2xl">
                    <h2 className="text-5xl font-extrabold tracking-tight text-white mb-6">
                      Demystify your <br />
                      <span className="text-gradient">Medical Prescriptions</span>
                    </h2>
                    <p className="text-lg text-gray-400 leading-relaxed">
                      Upload a photo of any handwritten or printed prescription. Our AI instantly
                      translates messy ink into clear generic alternatives and estimated cost savings.
                    </p>
                  </div>

                  {/* Error message display */}
                  {errorMessage && (
                    <div className="w-full max-w-2xl mb-6 px-5 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-start space-x-3">
                      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-red-300 text-sm leading-relaxed">{errorMessage}</p>
                    </div>
                  )}

                  <div className="w-full max-w-2xl relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-brand-500 to-emerald-400 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200" />
                    <label
                      onDragEnter={() => setDragActive(true)}
                      onDragLeave={() => setDragActive(false)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { setDragActive(false); handleFileUpload(e); }}
                      className={`glass-panel relative flex flex-col items-center justify-center p-16 rounded-3xl cursor-pointer border-2 border-dashed transition-all duration-300 ${
                        dragActive ? 'border-brand-400 bg-brand-500/10' : 'border-white/10 hover:border-brand-500/50'
                      }`}
                    >
                      <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" onChange={handleFileUpload} />
                      <UploadCloud className={`w-16 h-16 mb-4 transition-colors duration-300 ${dragActive ? 'text-brand-400' : 'text-gray-500 group-hover:text-brand-400'}`} />
                      <p className="text-2xl font-semibold text-white mb-2">Drag and drop your prescription</p>
                      <p className="text-sm text-gray-400 text-center mb-6">Support for JPG, PNG, and PDF up to 10 MB</p>
                      <span className="px-6 py-3 rounded-full bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors shadow-[0_0_20px_rgba(20,184,166,0.3)] hover:shadow-[0_0_30px_rgba(20,184,166,0.5)]">
                        Browse Files
                      </span>
                    </label>
                  </div>
                </motion.div>
              )}

              {/* ── Processing Step (FR-O4) ──────────────────────────────────── */}
              {step === 'processing' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center pt-24"
                >
                  <div className="relative w-full max-w-md">
                    <div className="absolute inset-0 bg-brand-400 blur-[80px] opacity-10 rounded-full animate-pulse" />
                    <div className="relative bg-dark-card p-10 rounded-3xl border border-white/5 flex flex-col items-center backdrop-blur-3xl shadow-2xl">
                      <Loader2 className="w-14 h-14 text-brand-400 animate-spin mb-6" />
                      <h3 className="text-2xl font-bold tracking-tight text-white mb-8">Analyzing Prescription</h3>

                      <div className="w-full space-y-3">
                        {PROCESSING_STEPS.map((s, idx) => {
                          const Icon = s.icon;
                          const isDone    = idx < processingStepIdx;
                          const isActive  = idx === processingStepIdx;
                          return (
                            <div
                              key={s.id}
                              className={`flex items-center space-x-3 px-4 py-2.5 rounded-xl transition-all duration-500 ${
                                isActive  ? 'bg-brand-500/15 border border-brand-500/30' :
                                isDone    ? 'opacity-60' : 'opacity-20'
                              }`}
                            >
                              <Icon className={`w-4 h-4 shrink-0 ${isDone ? 'text-emerald-400' : isActive ? 'text-brand-400' : 'text-gray-500'}`} />
                              <span className={`text-sm font-medium ${isDone ? 'text-emerald-300 line-through decoration-emerald-600' : isActive ? 'text-white' : 'text-gray-500'}`}>
                                {s.label}
                              </span>
                              {isActive && <Loader2 className="w-3.5 h-3.5 ml-auto text-brand-400 animate-spin" />}
                              {isDone    && <CheckCircle2 className="w-3.5 h-3.5 ml-auto text-emerald-400" />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Results Step ─────────────────────────────────────────────── */}
              {step === 'results' && apiResults && (
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                  <header className="flex items-center justify-between mb-10 border-b border-white/10 pb-6">
                    <div>
                      <h2 className="text-3xl font-bold tracking-tight text-white flex items-center">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400 mr-3" />
                        Analysis Complete
                      </h2>
                      <p className="text-gray-400 mt-2 flex items-center">
                        <FileText className="w-4 h-4 mr-2" /> {file?.name || 'prescription.jpg'}
                      </p>
                    </div>
                    <button
                      onClick={resetAnalyze}
                      className="px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium transition-colors text-sm flex items-center shadow-lg"
                    >
                      Process Another <ChevronRight className="w-4 h-4 ml-1" />
                    </button>
                  </header>

                  {/* Error banner (if backend fallback was used) */}
                  {errorMessage && (
                    <div className="px-5 py-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start space-x-3">
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-amber-300 text-sm leading-relaxed">{errorMessage}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left column: savings + AI insights */}
                    <div className="space-y-6 lg:col-span-1">
                      {/* Savings card */}
                      <div className="glass-panel rounded-3xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Percent className="w-24 h-24 text-emerald-400" />
                        </div>
                        <div className="relative z-10">
                          <p className="text-sm font-medium text-gray-400 mb-1 uppercase tracking-wider flex items-center">
                            <TrendingDown className="w-4 h-4 mr-2 text-emerald-400" /> Estimated Savings
                          </p>
                          <h3 className="text-5xl font-extrabold text-white">
                            ₹{(apiResults?.results?.total_savings || 0).toFixed(2)}
                          </h3>
                          <div className="mt-4 flex items-center text-sm space-x-2">
                            <span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded border border-emerald-500/20 font-medium">
                              Switch to generics
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* AI Insights (FR-I4: collapsible, off by default) */}
                      <div className="rounded-3xl p-[1px] bg-gradient-to-b from-brand-500/50 to-purple-500/50 shadow-2xl">
                        <div className="bg-[#111424] rounded-[23px] h-full relative overflow-hidden">
                          {/* Accordion header */}
                          <button
                            onClick={() => setAiExpanded(prev => !prev)}
                            className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors rounded-[23px]"
                          >
                            <h4 className="flex items-center text-brand-300 font-semibold text-sm tracking-wide uppercase">
                              <Sparkles className="w-5 h-5 mr-2 text-brand-400" /> AI Medication Insight
                            </h4>
                            {aiExpanded
                              ? <ChevronUp className="w-4 h-4 text-gray-500" />
                              : <ChevronDown className="w-4 h-4 text-gray-500" />
                            }
                          </button>

                          <AnimatePresence>
                            {aiExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                              >
                                <div className="px-6 pb-6 space-y-3">
                                  <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/20 rounded-full blur-[50px] pointer-events-none" />
                                  {(apiResults?.results?.ai_insights || '').split('\n').map((para, i) =>
                                    para.trim() ? (
                                      <p
                                        key={i}
                                        className={`text-base leading-relaxed ${
                                          para.includes('Disclaimer')
                                            ? 'text-[11px] text-gray-500 mt-4 pt-4 border-t border-white/5 uppercase tracking-wider'
                                            : 'text-purple-100 italic font-light'
                                        }`}
                                      >
                                        {para}
                                      </p>
                                    ) : null
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>

                    {/* Right column: medicine table */}
                    <div className="lg:col-span-2 space-y-4">
                      <h3 className="text-lg font-semibold text-white px-1 flex items-center">
                        <Package className="w-5 h-5 mr-2 text-brand-400" />
                        Identified Medicine Matches
                        <span className="ml-3 text-sm font-normal text-gray-500">
                          ({apiResults?.results?.medicines?.length || 0} found)
                        </span>
                      </h3>

                      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-white/5 text-xs uppercase tracking-wider text-gray-400 border-b border-white/5">
                                <th className="p-5 font-medium">Branded Medicine</th>
                                <th className="p-5 font-medium">Generic Alternative</th>
                                <th className="p-5 font-medium text-right">Savings</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {(apiResults?.results?.medicines || []).length === 0 ? (
                                <tr>
                                  <td colSpan={3} className="p-10 text-center text-gray-500">
                                    No medicines could be identified from this prescription.
                                    Try uploading a clearer image.
                                  </td>
                                </tr>
                              ) : (
                                (apiResults?.results?.medicines || []).map((med, idx) => {
                                  // Handle "could not identify" entries (FR-M4)
                                  if (med.error) {
                                    return (
                                      <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="p-5" colSpan={3}>
                                          <span className="text-amber-400 font-medium text-sm flex items-center">
                                            <AlertTriangle className="w-4 h-4 mr-2" />
                                            "{med.branded}" — Could not identify
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  }
                                  const savingsPct = med.branded_price > 0
                                    ? (((med.branded_price - med.generic_price) / med.branded_price) * 100).toFixed(0)
                                    : 0;
                                  return (
                                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                                      <td className="p-5">
                                        <div className="font-medium text-white text-base">{med.branded}</div>
                                        <div className="text-xs text-gray-500 mt-1 line-through decoration-red-500/50">₹{med.branded_price.toFixed(2)}</div>
                                      </td>
                                      <td className="p-5">
                                        <div className="font-medium text-brand-100">{med.generic}</div>
                                        <div className="text-xs text-gray-400 mt-1">₹{med.generic_price.toFixed(2)} · {med.manufacturer}</div>
                                      </td>
                                      <td className="p-5 text-right">
                                        <span className={`px-3 py-1.5 rounded-lg border text-xs font-bold inline-block ${savingsColor(Number(savingsPct))}`}>
                                          -{savingsPct}%
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                        <div className="bg-white/[0.02] p-4 text-xs text-gray-500 flex justify-between items-center border-t border-white/5">
                          <div className="flex items-center"><Info className="w-3.5 h-3.5 mr-1.5" /> Data Version: March 2026</div>
                          <div className="flex items-center">
                            <Clock className="w-3.5 h-3.5 mr-1.5" />
                            OCR Confidence: {((apiResults?.results?.ocr_confidence || 0) * 100).toFixed(0)}%
                            {apiResults?.results?.requires_review && (
                              <span className="ml-3 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-bold uppercase">
                                Review Needed
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ────────────── HISTORY VIEW ────────────────────────────────────── */}
          {currentView === 'history' && (
            <motion.div
              key="history-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="w-full"
            >
              <header className="flex items-center justify-between mb-8 pb-6 border-b border-white/10">
                <div>
                  <h2 className="text-3xl font-bold text-white flex items-center">
                    <History className="w-8 h-8 text-brand-400 mr-3" />
                    Prescription History
                  </h2>
                  <p className="text-gray-400 mt-2">View your past analyses and accumulated savings.</p>
                </div>
              </header>

              {historyData.length === 0 ? (
                // ── Empty state ──────────────────────────────────────────────
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-20 h-20 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-6">
                    <FileText className="w-10 h-10 text-brand-400/50" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-3">No prescriptions yet</h3>
                  <p className="text-gray-500 max-w-sm">
                    Upload your first prescription in the Analyze tab to start discovering generic alternatives.
                  </p>
                  <button
                    onClick={() => setCurrentView('analyze')}
                    className="mt-8 px-6 py-3 rounded-full bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors shadow-[0_0_20px_rgba(20,184,166,0.3)]"
                  >
                    Analyze a Prescription
                  </button>
                </div>
              ) : (
                <div className="grid gap-4">
                  {historyData.map((item) => (
                    <div
                      key={item.id}
                      className="glass-panel p-6 rounded-2xl flex items-center justify-between hover:bg-white/[0.04] transition-all duration-300 cursor-pointer group relative"
                      onMouseEnter={() => { clearTimeout(hoverTimeout.current); setHoveredHistoryId(item.id); }}
                      onMouseLeave={() => { hoverTimeout.current = setTimeout(() => setHoveredHistoryId(null), 150); }}
                    >
                      <div className="flex items-center space-x-6">
                        <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center border border-brand-500/20 group-hover:bg-brand-500/20 transition-colors">
                          <FileText className="w-6 h-6 text-brand-400" />
                        </div>
                        <div>
                          <h4 className="text-white font-medium text-lg">{item.file}</h4>
                          <p className="text-gray-400 text-sm mt-1">{item.date} · {item.medicines} medicine{item.medicines !== 1 ? 's' : ''} identified</p>
                        </div>
                      </div>
                      <div className="text-right flex items-center space-x-6">
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Savings</p>
                          <p className="text-emerald-400 font-bold text-xl">₹{(item.savings || 0).toFixed(2)}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors" />
                      </div>

                      {/* Hover medicine popup */}
                      <AnimatePresence>
                        {hoveredHistoryId === item.id && item.medicineList && item.medicineList.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.97 }}
                            transition={{ duration: 0.18, ease: 'easeOut' }}
                            className="absolute left-0 top-full mt-2 w-full z-50 pointer-events-none"
                          >
                            <div
                              className="rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
                              style={{ background: 'rgba(15,20,36,0.97)', backdropFilter: 'blur(24px)' }}
                            >
                              <div className="px-5 py-3 border-b border-white/5 flex items-center space-x-2">
                                <Sparkles className="w-4 h-4 text-brand-400" />
                                <span className="text-xs font-semibold text-brand-300 uppercase tracking-widest">Medicines in this Prescription</span>
                              </div>
                              <div className="divide-y divide-white/5">
                                {item.medicineList.map((med, idx) => {
                                  const pct = med.branded_price > 0
                                    ? (((med.branded_price - med.generic_price) / med.branded_price) * 100).toFixed(0)
                                    : 0;
                                  return (
                                    <div key={idx} className="px-5 py-3 flex items-center justify-between gap-4">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-white font-semibold text-sm truncate">{med.branded}</span>
                                          <span className="text-[10px] text-gray-500 line-through shrink-0">₹{(med.branded_price || 0).toFixed(2)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                          <span className="text-brand-300 text-xs">{med.generic}</span>
                                          <span className="text-emerald-400 text-xs font-medium">₹{(med.generic_price || 0).toFixed(2)}</span>
                                        </div>
                                      </div>
                                      <span className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold shrink-0">-{pct}%</span>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="px-5 py-3 bg-white/[0.02] border-t border-white/5 flex justify-between items-center">
                                <span className="text-xs text-gray-500">Total Savings</span>
                                <span className="text-emerald-400 font-bold text-sm">₹{(item.savings || 0).toFixed(2)}</span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ────────────── SETTINGS VIEW ───────────────────────────────────── */}
          {currentView === 'settings' && (
            <motion.div
              key="settings-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="w-full max-w-2xl mx-auto"
            >
              <header className="mb-8">
                <h2 className="text-3xl font-bold text-white flex items-center">
                  <Settings className="w-8 h-8 text-brand-400 mr-3" />
                  Account Settings
                </h2>
                <p className="text-gray-400 mt-2">Manage your profile and data privacy preferences.</p>
              </header>

              <div className="glass-panel rounded-3xl overflow-hidden divide-y divide-white/5">
                {/* Profile */}
                <div className="p-8">
                  <h3 className="text-lg font-semibold text-white mb-6 flex items-center">
                    <User className="w-5 h-5 mr-3 text-brand-400" /> Profile Information
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-400 mb-1 block">Email Address</label>
                      <input
                        type="email"
                        disabled
                        value={loggedInEmail || 'Sign in to see your email'}
                        className="w-full bg-dark-bg/50 border border-white/10 rounded-xl px-4 py-3 text-gray-300 focus:outline-none cursor-not-allowed"
                      />
                    </div>
                    <button className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium transition-colors text-sm">
                      Change Password
                    </button>
                  </div>
                </div>

                {/* Privacy & Deletion (DPDP Act FR) */}
                <div className="p-8 bg-red-500/5">
                  <h3 className="text-lg font-semibold text-red-400 mb-2 flex items-center">
                    <Shield className="w-5 h-5 mr-3" /> Privacy & Data Deletion
                  </h3>
                  <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                    Under India's DPDP Act 2023, you have the right to request deletion of your Personal Health
                    Information (PHI). Deleting your account will permanently remove all associated prescription
                    history and parsed metadata.
                  </p>

                  {!deleteConfirm ? (
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      className="px-5 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 font-bold transition-colors text-sm flex items-center"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Permanently Delete Account
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-red-400 font-semibold text-sm">
                        Are you absolutely sure? This action cannot be undone.
                      </p>
                      <div className="flex space-x-3">
                        <button
                          onClick={handleDeleteAccount}
                          disabled={deleteLoading}
                          className="px-5 py-3 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-bold transition-colors text-sm flex items-center"
                        >
                          {deleteLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Yes, Delete Everything
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(false)}
                          className="px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ── AUTH MODAL ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isAuthOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-dark-bg/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="glass-panel w-full max-w-md p-8 rounded-3xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-40 h-40 bg-brand-500/20 rounded-full blur-[60px]" />
              <button
                onClick={() => setIsAuthOpen(false)}
                className="absolute top-6 right-6 text-gray-500 hover:text-white transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="relative z-10">
                <h2 className="text-3xl font-bold text-white mb-2">
                  {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="text-gray-400 mb-8 text-sm">
                  {authMode === 'login'
                    ? 'Sign in to view your prescription history.'
                    : 'Start discovering generic alternatives today.'}
                </p>

                {authError && (
                  <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {authError}
                  </div>
                )}

                <form className="space-y-4" onSubmit={handleAuth}>
                  <div className="relative">
                    <Mail className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      id="auth-email"
                      type="email" required placeholder="Email address"
                      value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                      className="w-full bg-dark-bg/50 border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-white focus:outline-none focus:border-brand-500/50 transition-colors"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      id="auth-password"
                      type="password" required placeholder="Password"
                      value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                      className="w-full bg-dark-bg/50 border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-white focus:outline-none focus:border-brand-500/50 transition-colors"
                    />
                  </div>
                  <button
                    type="submit" disabled={authLoading}
                    className="w-full py-3.5 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-bold transition-all shadow-[0_0_15px_rgba(20,184,166,0.3)] hover:shadow-[0_0_25px_rgba(20,184,166,0.5)] mt-4 flex items-center justify-center gap-2"
                  >
                    {authLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {authMode === 'login' ? 'Sign In' : 'Sign Up'}
                  </button>
                </form>

                <div className="mt-6 flex items-center justify-between">
                  <span className="h-px bg-white/10 flex-1" />
                  <span className="mx-4 text-xs text-gray-500 uppercase font-medium">Or continue with</span>
                  <span className="h-px bg-white/10 flex-1" />
                </div>

                {/* Google sign-in (demo mode — real OAuth requires backend redirect) */}
                <button
                  onClick={() => {
                    const demoEmail = 'demo@medisage.app';
                    localStorage.setItem('medisage_token', 'demo-token');
                    localStorage.setItem('medisage_email', demoEmail);
                    setLoggedInEmail(demoEmail);
                    setIsLoggedIn(true);
                    setIsAuthOpen(false);
                  }}
                  className="mt-4 w-full py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium transition-colors flex items-center justify-center"
                >
                  <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google (Demo Mode)
                </button>

                <p className="text-center text-sm text-gray-400 mt-8">
                  {authMode === 'login' ? "Don't have an account?" : 'Already have an account?'}
                  <button
                    onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                    className="ml-2 text-brand-400 font-medium hover:text-brand-300 transition-colors"
                  >
                    {authMode === 'login' ? 'Sign Up' : 'Log In'}
                  </button>
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

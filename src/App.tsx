import React, { useState, useRef, useEffect } from 'react';
import { createWorker } from 'tesseract.js';
import { 
  FileSpreadsheet, 
  Upload, 
  Camera, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Sparkles, 
  Download, 
  Copy, 
  Check,
  Plus,
  Zap,
  HelpCircle,
  Eye
} from 'lucide-react';
import { PassportRecord, ScanStatus } from './types';
import { parsePassportData } from './utils/mrzParser';
import { exportRecordsToExcel, exportRecordsToCSV } from './utils/excelExporter';
import { preprocessForOCR } from './utils/imagePreprocessing';
import { CameraModal } from './components/CameraModal';
import { EditRecordModal } from './components/EditRecordModal';

const STORAGE_KEY = 'passport_scanner_records_v1';

export default function App() {
  const [records, setRecords] = useState<PassportRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<ScanStatus>({
    state: 'idle',
    message: 'Select or upload a passport image to begin.',
    progress: 0,
  });

  const [hasServerAi, setHasServerAi] = useState<boolean>(true);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PassportRecord | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [useBottomCropMRZ, setUseBottomCropMRZ] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Check health / AI status
  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setHasServerAi(!!data?.hasGemini);
      })
      .catch(() => {
        setHasServerAi(false);
      });
  }, []);

  // Persist records
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
      console.warn("Could not save records to localStorage", e);
    }
  }, [records]);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  // Convert File / Blob / Data URL to base64
  const getBase64FromSource = async (url: string, file: File | null): Promise<{ base64: string; mimeType: string }> => {
    if (file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result as string;
          resolve({
            base64: res,
            mimeType: file.type || 'image/jpeg'
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          base64: reader.result as string,
          mimeType: blob.type || 'image/jpeg'
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Image file handler
  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setStatus({
        state: 'error',
        message: 'Please select a valid image file (JPG, PNG, WebP).',
        progress: 0
      });
      showToast('Please select a valid image file', 'error');
      return;
    }

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setStatus({
      state: 'idle',
      message: `Selected: ${file.name}. Click "Scan Passport" below.`,
      progress: 0,
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Process passport image
  const processImage = async () => {
    if (!previewUrl) {
      alert("Please select or drop a passport image first.");
      return;
    }

    setStatus({
      state: 'loading',
      message: 'Initializing scanner engine...',
      progress: 15,
    });

    try {
      // Process uploaded image or camera capture
      setStatus({
        state: 'scanning',
        message: 'Analyzing passport document...',
        progress: 30,
      });

      let parsedData: any = null;
      let rawDetectedText = "";

      // Step A: Attempt Server-side AI Scan via /api/scan-passport
      try {
        const { base64, mimeType } = await getBase64FromSource(previewUrl, selectedFile);
        
        setStatus({
          state: 'scanning',
          message: 'Extracting ICAO MRZ and bio data with Vision AI...',
          progress: 55,
        });

        const apiRes = await fetch('/api/scan-passport', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mimeType })
        });

        if (apiRes.ok) {
          const resJson = await apiRes.json();
          if (resJson?.success && resJson?.data) {
            const d = resJson.data;
            const extractedName = d.fullName || (d.givenNames && d.surname ? `${d.givenNames} ${d.surname}` : d.givenNames || d.surname || "");
            const hasValidInfo = !!(d.passportNo || extractedName || (d.mrzLines && d.mrzLines.length > 0));
            if (hasValidInfo) {
              parsedData = {
                ...d,
                fullName: extractedName,
                issueDate: d.issueDate || ""
              };
            }
          }
        }
      } catch (apiErr) {
        console.warn("Server AI Scan not available, trying local OCR:", apiErr);
      }

      // Step B: If Server AI was unavailable or had no key, fallback to local OCR
      if (!parsedData || (!parsedData.passportNo && !parsedData.fullName)) {
        setStatus({
          state: 'scanning',
          message: 'Running browser OCR on passport document...',
          progress: 65,
        });

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = previewUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error("Failed to load image for scanning"));
        });

        const { fullCanvas, mrzCanvas } = preprocessForOCR(img);

        let ocrText = "";
        let ocrConfidence = 80;

        try {
          const worker = await createWorker('eng', 1, {
            logger: (m: any) => {
              if (m.status === 'recognizing text') {
                const p = Math.round(65 + m.progress * 30);
                setStatus(prev => ({
                  ...prev,
                  message: `Scanning passport text... ${Math.round(m.progress * 100)}%`,
                  progress: p,
                }));
              }
            }
          });

          // Prefer MRZ bottom zone if enabled
          const targetCanvas = (useBottomCropMRZ && mrzCanvas) ? mrzCanvas : fullCanvas;
          const ret = await worker.recognize(targetCanvas);
          ocrText = ret.data.text || "";
          ocrConfidence = ret.data.confidence || 80;

          // If no MRZ was found in bottom zone, scan full image
          if (!ocrText.includes('<<') && !ocrText.includes('P<')) {
            const fullRet = await worker.recognize(fullCanvas);
            ocrText = `${ocrText}\n${fullRet.data.text || ""}`;
            ocrConfidence = Math.round((ocrConfidence + (fullRet.data.confidence || 75)) / 2);
          }

          await worker.terminate();
        } catch (workerErr: any) {
          console.warn("Tesseract worker issue:", workerErr);
        }

        rawDetectedText = ocrText;
        const localParsed = parsePassportData(ocrText);
        
        const hasLocalFields = localParsed.passportNo !== 'N/A' || localParsed.fullName !== 'N/A' || localParsed.mrzDetected;
        if (hasLocalFields) {
          parsedData = {
            passportNo: localParsed.passportNo !== 'N/A' ? localParsed.passportNo : "",
            fullName: localParsed.fullName !== 'N/A' ? localParsed.fullName : "",
            nationality: localParsed.nationality !== 'N/A' ? localParsed.nationality : "",
            dob: localParsed.dob !== 'N/A' ? localParsed.dob : "",
            sex: localParsed.sex !== 'N/A' ? localParsed.sex : "Unspecified",
            issueDate: localParsed.issueDate || "",
            expiry: localParsed.expiry !== 'N/A' ? localParsed.expiry : "",
            mrzDetected: localParsed.mrzDetected,
            mrzLines: localParsed.mrzLines,
            confidence: ocrConfidence || 75,
          };
        }
      }

      // Step C: If neither AI nor OCR could extract any recognizable info
      if (!parsedData || (!parsedData.passportNo && !parsedData.fullName)) {
        setStatus({
          state: 'error',
          message: 'ছবি থেকে পাসপোর্টের কোনো তথ্য সনাক্ত করা যায়নি। অনুগ্রহ করে পরিষ্কার ও সোজা পাসপোর্ট পাতার ছবি আপলোড করুন অথবা সরাসরি ম্যানুয়াল এন্ট্রি করুন।',
          progress: 0,
        });
        showToast('পাসপোর্ট সনাক্ত করা যায়নি। অনুগ্রহ করে পরিষ্কার ছবি আপলোড করুন।', 'error');
        return;
      }

      // Step D: Create and add the valid record to Scanned Records!
      const cleanPassportNo = (parsedData.passportNo || "").trim();
      const cleanFullName = (parsedData.fullName || "").trim();
      const cleanNationality = (parsedData.nationality || "").trim();
      const cleanDob = (parsedData.dob || "").trim();
      const cleanIssueDate = (parsedData.issueDate || "").trim();
      const cleanExpiry = (parsedData.expiry || "").trim();

      const newRecord: PassportRecord = {
        id: `pass_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        passportNo: cleanPassportNo || (cleanFullName ? `P-${cleanFullName.substring(0, 3)}` : `DOC-${Date.now().toString().slice(-6)}`),
        fullName: cleanFullName,
        nationality: cleanNationality,
        dob: cleanDob,
        sex: parsedData.sex || "Unspecified",
        issueDate: cleanIssueDate,
        expiry: cleanExpiry,
        mrzDetected: !!parsedData.mrzDetected,
        mrzLines: parsedData.mrzLines || [],
        rawText: rawDetectedText || "",
        confidence: parsedData.confidence || 90,
        scannedAt: new Date().toLocaleString(),
        thumbnailUrl: previewUrl,
      };

      setRecords(prev => [newRecord, ...prev]);

      setStatus({
        state: 'complete',
        message: `স্ক্যান সম্পন্ন হয়েছে! পাসপোর্ট: ${newRecord.passportNo || newRecord.fullName} টেবিলে যোগ হয়েছে।`,
        progress: 100,
      });

      showToast(`পাসপোর্ট ${newRecord.passportNo || newRecord.fullName} সফলভাবে যোগ করা হয়েছে!`, 'success');
      tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      // If key fields are missing, open edit modal to allow quick completion
      if (!newRecord.passportNo || !newRecord.fullName) {
        setEditingRecord(newRecord);
        setIsEditModalOpen(true);
        showToast('কিছু তথ্য অসম্পূর্ণ, অনুগ্রহ করে যাচাই করুন', 'info');
      }

    } catch (error: any) {
      console.error("Scanning error:", error);
      setStatus({
        state: 'error',
        message: 'স্ক্যান করার সময় সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন বা ম্যানুয়ালি এন্ট্রি করুন।',
        progress: 0,
      });
      showToast('স্ক্যান ব্যর্থ হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।', 'error');
    }
  };

  // Add Manual Record
  const handleAddNewManual = () => {
    const emptyRecord: PassportRecord = {
      id: `pass_${Date.now()}`,
      passportNo: '',
      fullName: '',
      nationality: '',
      dob: '',
      sex: 'Male',
      issueDate: '',
      expiry: '',
      mrzDetected: false,
      confidence: 100,
      scannedAt: new Date().toLocaleString()
    };
    setEditingRecord(emptyRecord);
    setIsEditModalOpen(true);
  };

  // Export handlers
  const handleExportExcel = () => {
    if (records.length === 0) {
      alert("No records available to export! Scan or add a passport first.");
      return;
    }
    try {
      exportRecordsToExcel(records);
      showToast("Excel (.xlsx) file downloaded!", 'success');
    } catch (e: any) {
      alert(e.message || "Failed to export Excel file");
    }
  };

  const handleExportCSV = () => {
    if (records.length === 0) {
      alert("No records available to export!");
      return;
    }
    try {
      exportRecordsToCSV(records);
      showToast("CSV file downloaded!", 'success');
    } catch (e: any) {
      alert(e.message || "Failed to export CSV file");
    }
  };

  const handleClearTable = () => {
    if (records.length === 0) return;
    if (window.confirm("Are you sure you want to clear all scanned records?")) {
      setRecords([]);
      showToast("All records cleared", 'info');
    }
  };

  const handleDeleteRecord = (id: string) => {
    setRecords(prev => prev.filter(r => r.id !== id));
    showToast("Record removed", 'info');
  };

  const handleSaveEdit = (updated: PassportRecord) => {
    setRecords(prev => {
      const exists = prev.some(r => r.id === updated.id);
      if (exists) {
        return prev.map(r => r.id === updated.id ? updated : r);
      }
      return [updated, ...prev];
    });
    showToast("Record saved successfully!", 'success');
  };

  const handleCopyRecord = (r: PassportRecord) => {
    const text = `Passport: ${r.passportNo} | Name: ${r.fullName} | Nat: ${r.nationality} | DOB: ${r.dob} | Sex: ${r.sex} | Issue: ${r.issueDate || 'N/A'} | Exp: ${r.expiry}`;
    navigator.clipboard.writeText(text);
    setCopiedId(r.id);
    showToast("Record copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-slate-50 min-h-screen p-4 sm:p-6 lg:p-8 font-sans text-slate-800">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Toast Notification */}
        {notification && (
          <div className={`fixed top-5 right-5 z-50 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 border animate-in fade-in slide-in-from-top-3 ${
            notification.type === 'error' ? 'bg-rose-900 border-rose-700' :
            notification.type === 'info' ? 'bg-slate-900 border-slate-700' :
            'bg-slate-900 border-slate-700'
          }`}>
            {notification.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
        )}

        {/* Header */}
        <header id="header-card" className="bg-white p-6 rounded-xl shadow-xs border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Passport Scanner & Excel Exporter</h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Extract passport & ID details via OCR / AI Vision and export directly to Excel (.xlsx)
                  </p>
                </div>
              </div>
            </div>

            {/* Engine Status & Quick Action */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-lg text-xs font-semibold border border-emerald-200">
                <Zap className="w-3.5 h-3.5 text-emerald-600" />
                <span>{hasServerAi ? "AI Vision Engine Active" : "Dual OCR Engine Active"}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Upload & Status Card */}
        <div id="upload-card" className="bg-white p-6 rounded-xl shadow-xs border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="imageInput" className="block text-sm font-semibold text-slate-700">
                  Select Passport Image
                </label>
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Use Camera
                </button>
              </div>

              {/* Drag & Drop Box */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-200'
                    : 'border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  id="imageInput"
                  accept="image/*"
                  onChange={handleInputChange}
                  className="hidden"
                />
                <div className="flex flex-col items-center justify-center gap-2 py-1">
                  <div className="w-11 h-11 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-blue-600 hover:underline">
                      Click to browse passport file
                    </span>{' '}
                    <span className="text-sm text-slate-500">or drag & drop</span>
                  </div>
                  <p className="text-xs text-slate-400">Supports JPG, PNG, WebP (MRZ photo / bio page)</p>
                </div>
              </div>
            </div>

            {/* Scan Options */}
            <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useBottomCropMRZ}
                  onChange={(e) => setUseBottomCropMRZ(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 border-slate-300"
                />
                <span>Optimize MRZ bottom detection</span>
              </label>
              {selectedFile && (
                <span className="text-slate-500 truncate max-w-[160px] font-medium" title={selectedFile.name}>
                  {selectedFile.name}
                </span>
              )}
            </div>

            {/* Scan Action Button */}
            <button
              id="scanBtn"
              onClick={processImage}
              disabled={status.state === 'loading' || status.state === 'scanning' || !previewUrl}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-xl transition shadow-xs flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              {status.state === 'loading' || status.state === 'scanning' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>{status.message}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Scan Passport</span>
                </>
              )}
            </button>
          </div>

          {/* Preview & Status */}
          <div className="flex flex-col justify-center items-center border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50 relative min-h-[220px]">
            {previewUrl ? (
              <div className="w-full flex flex-col items-center">
                <img
                  id="imagePreview"
                  src={previewUrl}
                  className="max-h-44 rounded-lg shadow-xs object-contain mb-2.5 border border-slate-200 bg-white"
                  alt="Passport Preview"
                />
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewUrl(null);
                    setStatus({ state: 'idle', message: 'Select or upload a passport image to begin.', progress: 0 });
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium mb-1 cursor-pointer"
                >
                  Remove image
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center text-slate-400 py-6 text-center">
                <FileText className="w-12 h-12 mb-2 stroke-1 text-slate-300" />
                <span className="text-sm font-medium text-slate-500">No passport image selected</span>
                <span className="text-xs text-slate-400 mt-1">Upload a photo or take a photo using the camera above</span>
              </div>
            )}

            <p id="statusText" className="text-xs sm:text-sm font-medium text-slate-600 text-center mt-2 px-2">
              {status.message}
            </p>

            {/* Progress Bar Container */}
            <div
              id="progressBarContainer"
              className={`w-full bg-slate-200 rounded-full h-2 mt-3 overflow-hidden ${
                status.state === 'loading' || status.state === 'scanning' ? 'block' : 'hidden'
              }`}
            >
              <div
                id="progressBar"
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${status.progress}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Parsed Data Table */}
        <div id="records-card" ref={tableRef} className="bg-white p-6 rounded-xl shadow-xs border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-900">
                Scanned Records (<span id="recordCount">{records.length}</span>)
              </h2>
              {records.length > 0 && (
                <span className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Ready for Excel
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                id="exportExcelBtn"
                onClick={handleExportExcel}
                disabled={records.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2 px-3.5 rounded-lg transition text-sm shadow-xs flex items-center gap-1.5 cursor-pointer"
                title="Export all rows to Microsoft Excel (.xlsx)"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Export to Excel (.xlsx)</span>
              </button>

              <button
                onClick={handleExportCSV}
                disabled={records.length === 0}
                className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-medium py-2 px-3 rounded-lg transition text-sm flex items-center gap-1.5 cursor-pointer"
                title="Export as CSV file"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>CSV</span>
              </button>

              <button
                id="clearTableBtn"
                onClick={handleClearTable}
                disabled={records.length === 0}
                className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-medium py-2 px-3 rounded-lg transition text-sm flex items-center gap-1.5 cursor-pointer"
                title="Clear all recorded entries"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Clear All</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <th className="p-3">#</th>
                  <th className="p-3">Passport No</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Nationality</th>
                  <th className="p-3">Date of Birth</th>
                  <th className="p-3">Sex</th>
                  <th className="p-3">Issue Date</th>
                  <th className="p-3">Expiry Date</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="tableBody" className="divide-y divide-slate-100 text-slate-600 bg-white">
                {records.length === 0 ? (
                  <tr id="emptyRow">
                    <td colSpan={9} className="p-8 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FileSpreadsheet className="w-9 h-9 text-slate-300 stroke-1" />
                        <p className="font-medium text-slate-600 text-base">No scanned passport records yet.</p>
                        <p className="text-xs text-slate-400 max-w-md">
                          Select an image above or use the camera, then click "Scan Passport".
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  records.map((r, index) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-xs text-slate-400 font-mono">{index + 1}</td>
                      <td className="p-3 font-semibold font-mono text-slate-900 tracking-wide">
                        <div className="flex items-center gap-1.5">
                          <span>{r.passportNo}</span>
                          {r.mrzDetected && (
                            <span 
                              className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" 
                              title="ICAO MRZ Verified" 
                            />
                          )}
                        </div>
                      </td>
                      <td className="p-3 font-medium text-slate-800">{r.fullName}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {r.nationality}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-xs text-slate-600">{r.dob}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          r.sex === 'Female' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                        }`}>
                          {r.sex}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-xs text-slate-600">{r.issueDate || '—'}</td>
                      <td className="p-3 font-mono text-xs text-slate-600">{r.expiry}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleCopyRecord(r)}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                            title="Copy record text"
                          >
                            {copiedId === r.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => {
                              setEditingRecord(r);
                              setIsEditModalOpen(true);
                            }}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                            title="Edit record"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRecord(r.id)}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Delete record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer info */}
          {records.length > 0 && (
            <div className="mt-3 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                Green indicator represents ICAO 9303 MRZ validated document.
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleAddNewManual}
                  className="text-blue-600 hover:underline font-medium cursor-pointer"
                >
                  + Add manual record
                </button>
                <span>Total records: {records.length}</span>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Camera Capture Modal */}
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={(file) => handleFileSelect(file)}
      />

      {/* Edit Record Modal */}
      <EditRecordModal
        isOpen={isEditModalOpen}
        record={editingRecord}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingRecord(null);
        }}
        onSave={handleSaveEdit}
      />
    </div>
  );
}

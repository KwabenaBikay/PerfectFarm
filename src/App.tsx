import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Leaf, AlertTriangle, CheckCircle2, ShieldCheck, Activity, RefreshCcw, Sprout, Loader2, Camera, History, ChevronRight, Target, CloudRain, ThumbsUp, ThumbsDown, User, Download, Trash2, ArrowRight, Shield, Zap, Sparkles, Globe2, WifiOff, CalendarRange, MapPin, Share2, Thermometer, Wind, Droplet } from 'lucide-react';
import { analyzeCropImage, MultiCropAnalysisResult, CropAnalysisResult, UserProfile, generateFarmAdvisory, FarmAdvisory } from './lib/ai';
import { jsPDF } from 'jspdf';

interface ScanHistoryItem {
  id: string;
  timestamp: number;
  imageBase64: string;
  analysisResult: MultiCropAnalysisResult;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'scan' | 'history' | 'profile' | 'advisory'>('home');
  const [historyItems, setHistoryItems] = useState<ScanHistoryItem[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile>({ location: '', primaryCrops: '', soilType: '', language: 'English' });
  const [profileSaved, setProfileSaved] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'success' | 'error'>('idle');
  const [analysisResult, setAnalysisResult] = useState<MultiCropAnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [farmAdvisory, setFarmAdvisory] = useState<FarmAdvisory | null>(null);
  const [isGeneratingAdvisory, setIsGeneratingAdvisory] = useState(false);
  const [advisoryError, setAdvisoryError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const saved = localStorage.getItem('perfectFarm_history');
    if (saved) {
      try {
        const parsedHistory = JSON.parse(saved);
        // Migration: Update timestamps from before today to today
        let hasChanges = false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const updatedHistory = parsedHistory.map((item: any) => {
           const itemDate = new Date(item.timestamp);
           if (itemDate < today) {
               hasChanges = true;
               // Set to a random time today
               return { ...item, timestamp: Date.now() - Math.floor(Math.random() * 3600000) };
           }
           return item;
        });

        if (hasChanges) {
           localStorage.setItem('perfectFarm_history', JSON.stringify(updatedHistory));
        }
        setHistoryItems(updatedHistory);
      } catch (e) {
        console.error('Failed to parse history', e);
      }
    }
    
    const savedProfile = localStorage.getItem('perfectFarm_profile');
    if (savedProfile) {
        try {
            setUserProfile(JSON.parse(savedProfile));
        } catch (e) {
            console.error('Failed to parse profile', e);
        }
    }

    const onboardingDone = localStorage.getItem('perfectFarm_onboarding_completed');
    if (!onboardingDone) {
      setShowOnboarding(true);
    }
  }, []);

  const handleSaveProfile = (e: React.FormEvent) => {
      e.preventDefault();
      try {
         localStorage.setItem('perfectFarm_profile', JSON.stringify(userProfile));
         setProfileSaved(true);
         setTimeout(() => setProfileSaved(false), 3000);
      } catch(e) {
         console.error('Failed to save profile', e);
      }
  };

  const saveToHistory = (dataUrl: string, result: MultiCropAnalysisResult) => {
    const newItem: ScanHistoryItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        imageBase64: dataUrl,
        analysisResult: result,
    };
    setHistoryItems(prev => {
        const updated = [newItem, ...prev].slice(0, 15);
        try {
           localStorage.setItem('perfectFarm_history', JSON.stringify(updated));
        } catch (e) {
           console.error("Storage full?", e);
        }
        return updated;
    });
  };

  const compressImageForHistory = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const scale = Math.min(1, MAX_WIDTH / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } else {
          resolve('');
        }
      };
      img.onerror = () => reject('Failed to load image for compression');
      img.src = URL.createObjectURL(file);
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const b64 = result.split(',')[1];
        resolve(b64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleImageChange = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        setErrorMessage('Please upload a valid image file. We support JPG, PNG, and WebP.');
        setStatus('error');
        return;
    }
    
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setStatus('analyzing');
    setErrorMessage(null);
    setFeedback(null);
    setActiveTab('scan');
    
    try {
        const base64 = await fileToBase64(file);
        const result = await analyzeCropImage(base64, file.type, userProfile);
        
        if (!result || !result.results || result.results.length === 0) {
            setErrorMessage('No detectable plant was found in the image, or it was too blurry.');
            setStatus('error');
        } else if (result.results[0].possible_disease === 'Invalid Image' || result.results[0].crop_detected === 'Unknown') {
            setErrorMessage(result.results[0].detailed_explanation || 'No detectable plant was found in the image, or it was too blurry.');
            setStatus('error');
        } else {
            setAnalysisResult(result);
            setStatus('success');
            
            // Generate a compressed version for history
            compressImageForHistory(file).then(dataUrl => {
                 if (dataUrl) {
                     saveToHistory(dataUrl, result);
                 }
            }).catch(console.error);
        }
    } catch (err: any) {
        console.error(err);
        setErrorMessage(err.message || 'An error occurred during analysis. Please try again.');
        setStatus('error');
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageChange(e.dataTransfer.files[0]);
    }
  };

  const handleShare = async () => {
    if (!analysisResult || !analysisResult.results || analysisResult.results.length === 0) return;
    
    const shareText = `I just analyzed my crop using PerfectFarm!\n\n${analysisResult.results.map((r, idx) => `Crop ${idx + 1}: ${r.crop_detected}\nDiagnosis: ${r.possible_disease}\nConfidence: ${r.confidence_score}`).join('\n\n')}\n\nSummary:\n${analysisResult.results[0].detailed_explanation.slice(0, 100)}...`;
    
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'PerfectFarm Analysis Report',
                text: shareText,
                url: window.location.href, // If hosted online
            });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    } else {
        // Fallback to clipboard
        try {
            await navigator.clipboard.writeText(shareText);
            alert('Analysis summary copied to clipboard!');
        } catch (error) {
            console.error('Error copying text:', error);
        }
    }
  };

  const handleGenerateAdvisory = async () => {
    setIsGeneratingAdvisory(true);
    setAdvisoryError(null);
    try {
        const response = await generateFarmAdvisory(userProfile);
        setFarmAdvisory(response);
    } catch (err: any) {
        setAdvisoryError(err.message || "Failed to generate advisory");
    } finally {
        setIsGeneratingAdvisory(false);
    }
  };

  const downloadReport = async () => {
    if (!analysisResult || !analysisResult.results || analysisResult.results.length === 0) return;
    
    let imgBase64 = '';
    if (imageFile) {
        imgBase64 = await fileToBase64(imageFile);
    } else if (imagePreviewUrl && imagePreviewUrl.startsWith('data:')) {
        imgBase64 = imagePreviewUrl;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    analysisResult.results.forEach((result, idx) => {
        if (idx > 0) {
            doc.addPage();
        }
        const isHealthy = checkIsHealthy(result.possible_disease);
        
        // Header Bar
        doc.setFillColor(63, 175, 71); // #3FAF47
        doc.rect(0, 0, pageWidth, 25, 'F');
        
        // Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(255, 255, 255);
        doc.text(`PerfectFarm Analysis Report - Crop ${idx + 1}`, 20, 17);
        
        // Date
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(200, 200, 200);
        doc.text(new Date().toLocaleString(), pageWidth - 60, 17);
        
        // Summary Box
        doc.setFillColor(245, 247, 245);
        doc.setDrawColor(220, 225, 220);
        doc.roundedRect(20, 35, pageWidth - 40, 65, 3, 3, 'FD');

        // Image inside summary box
        if (imgBase64) {
            try {
               doc.addImage(imgBase64, "JPEG", 25, 40, 55, 55);
            } catch(e) {
                console.error('Failed to add image to PDF', e);
            }
        }
        
        // Basic Details
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(40, 40, 40);
        doc.text("Scan Summary", 90, 50);
        
        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        
        doc.setTextColor(80, 80, 80);
        doc.text("Crop Detected:", 90, 62);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(40, 40, 40);
        doc.text(result.crop_detected, 130, 62);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        doc.text("Status:", 90, 72);
        
        // Status Badge
        doc.setFont("helvetica", "bold");
        if (isHealthy) {
            doc.setTextColor(40, 140, 40);
        } else {
            doc.setTextColor(217, 56, 30);
        }
        doc.text(result.possible_disease, 130, 72);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        doc.text("Confidence:", 90, 82);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(40, 40, 40);
        doc.text(String(result.confidence_score), 130, 82);
        
        let yPos = 115;
        
        const checkPageBreak = (neededSpace: number) => {
            if (yPos + neededSpace > 280) {
                doc.addPage();
                yPos = 20;
            }
        };

        // Helper for rendering section titles
        const renderSectionTitle = (title: string, y: number) => {
            doc.setFillColor(235, 240, 235);
            doc.rect(20, y - 6, pageWidth - 40, 10, 'F');
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(50, 120, 50);
            doc.text(title, 22, y + 1);
            return y + 10;
        };

        // Detailed Explanation
        checkPageBreak(40);
        yPos = renderSectionTitle("Detailed Explanation", yPos);
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
        const splitExplanation = doc.splitTextToSize(result.detailed_explanation, 170);
        doc.text(splitExplanation, 20, yPos);
        yPos += (splitExplanation.length * 5) + 10;

        if (result.affected_areas_description) {
            checkPageBreak(25);
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(40, 40, 40);
            doc.text("Affected Areas:", 20, yPos);
            yPos += 6;
            doc.setFontSize(11);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(60, 60, 60);
            const lines = doc.splitTextToSize(result.affected_areas_description, 170);
            doc.text(lines, 20, yPos);
            yPos += lines.length * 5 + 8;
        }

        if (result.symptoms_observed && result.symptoms_observed.length > 0) {
            checkPageBreak(30);
            yPos = renderSectionTitle("Symptoms Observed", yPos);
            doc.setFontSize(11);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(60, 60, 60);
            result.symptoms_observed.forEach(s => {
                checkPageBreak(10);
                const lines = doc.splitTextToSize(`• ${s}`, 170);
                doc.text(lines, 20, yPos);
                yPos += lines.length * 5 + 2;
            });
            yPos += 8;
        }
        
        if (result.risk_assessment) {
             checkPageBreak(50);
             yPos = renderSectionTitle("Risk Assessment", yPos);
             doc.setFontSize(11);
             doc.setFont("helvetica", "normal");
             doc.setTextColor(60, 60, 60);
             const riskLines = [
                 `Severity: ${result.risk_assessment.severity}`,
                 `Spread Potential: ${result.risk_assessment.spread_potential}`,
                 `Estimated Yield Loss: ${result.risk_assessment.estimated_yield_loss}`
             ];
             riskLines.forEach(r => {
                 checkPageBreak(10);
                 const lines = doc.splitTextToSize(`• ${r}`, 170);
                 doc.text(lines, 20, yPos);
                 yPos += lines.length * 5 + 2;
             });
             yPos += 8;
        }

        if (result.treatment_recommendations?.length) {
            checkPageBreak(30);
            yPos = renderSectionTitle("Treatment Recommendations", yPos);
            doc.setFontSize(11);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(60, 60, 60);
            result.treatment_recommendations.forEach(r => {
                checkPageBreak(10);
                const lines = doc.splitTextToSize(`• ${r}`, 170);
                doc.text(lines, 20, yPos);
                yPos += lines.length * 5 + 2;
            });
            yPos += 8;
        }
        
        if (result.preventive_measures?.length) {
            checkPageBreak(30);
            yPos = renderSectionTitle("Preventive Measures", yPos);
            doc.setFontSize(11);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(60, 60, 60);
            result.preventive_measures.forEach(p => {
                checkPageBreak(10);
                const lines = doc.splitTextToSize(`• ${p}`, 170);
                doc.text(lines, 20, yPos);
                yPos += lines.length * 5 + 2;
            });
        }
    });

    doc.save(`PerfectFarm_Report_${Date.now()}.pdf`);
  };

  const resetAll = () => {
      setImageFile(null);
      setImagePreviewUrl(null);
      setAnalysisResult(null);
      setErrorMessage(null);
      setFeedback(null);
      setStatus('idle');
  };

  const startNewScan = () => {
      resetAll();
      setActiveTab('scan');
  };

  const viewHistoryItem = (item: ScanHistoryItem) => {
      resetAll(); // Clear current file state to avoid confusion
      setImagePreviewUrl(item.imageBase64);
      setAnalysisResult(item.analysisResult);
      setStatus('success');
      setActiveTab('scan');
  };

  const checkIsHealthy = (disease?: string) => {
      if (!disease) return false;
      const lower = disease.toLowerCase().trim();
      return lower.includes('none detected') || 
             lower.includes('healthy') || 
             lower === 'none' ||
             lower.includes('no disease');
  };

  const isHealthy = checkIsHealthy(analysisResult?.results?.[0]?.possible_disease);

  const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updatedHistory = historyItems.filter(item => item.id !== id);
    setHistoryItems(updatedHistory);
    localStorage.setItem('perfectFarm_history', JSON.stringify(updatedHistory));
  };

  const clearAllHistory = () => {
    setHistoryItems([]);
    localStorage.setItem('perfectFarm_history', JSON.stringify([]));
    setShowClearConfirm(false);
  };

  const renderHistory = () => {
      if (historyItems.length === 0) {
          return (
              <div className="text-center py-20 max-w-2xl mx-auto bg-white border border-gray-200 p-12 shadow-sm">
                  <History size={48} className="mx-auto text-gray-300 mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">No history yet</h3>
                  <p className="text-gray-500 mb-8 font-medium">Your past scan reports and recommendations will appear here.</p>
                  <button 
                      onClick={startNewScan}
                      className="bg-[#3FAF47] text-white px-8 py-3 font-bold uppercase tracking-widest hover:bg-[#328C38] transition-colors shadow-sm inline-flex items-center gap-2"
                  >
                      Start a New Scan
                  </button>
              </div>
          );
      }

      return (
          <div className="max-w-6xl mx-auto">
              <div className="flex sm:items-center justify-between flex-col sm:flex-row gap-4 mb-8">
                  <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                      <History className="text-[#3FAF47]" size={28} /> Past Scans
                  </h2>
                  <div className="relative">
                      <button 
                          onClick={() => setShowClearConfirm(true)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 px-4 py-2 text-sm font-bold tracking-widest uppercase transition-colors flex items-center gap-2 border border-transparent hover:border-red-200"
                      >
                          <Trash2 size={16} />
                          Clear All History
                      </button>
                      
                      {showClearConfirm && (
                          <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 shadow-xl p-4 z-50 animate-in fade-in slide-in-from-top-2">
                              <h4 className="font-bold text-gray-900 mb-2">Clear All History?</h4>
                              <p className="text-sm text-gray-600 mb-4">This action cannot be undone. All your past scan records will be permanently deleted.</p>
                              <div className="flex gap-2 justify-end">
                                  <button 
                                      onClick={() => setShowClearConfirm(false)}
                                      className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors uppercase tracking-wider"
                                  >
                                      Cancel
                                  </button>
                                  <button 
                                      onClick={clearAllHistory}
                                      className="px-3 py-1.5 text-xs font-bold text-white bg-red-500 hover:bg-red-600 transition-colors uppercase tracking-wider"
                                  >
                                      Yes, Delete All
                                  </button>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {historyItems.map(item => {
                      const firstResult = item.analysisResult.results?.[0];
                      if (!firstResult) return null;
                      const isItemHealthy = checkIsHealthy(firstResult.possible_disease);
                      return (
                      <div 
                         key={item.id} 
                         className={`bg-white border shadow-sm cursor-pointer transition-all group flex flex-col relative overflow-hidden ${isItemHealthy ? 'border-l-4 border-l-[#3FAF47] border-gray-200 hover:border-[#3FAF47] hover:shadow-md' : 'border-l-4 border-l-[#D9381E] border-gray-200 hover:border-[#D9381E] hover:shadow-md'}`}
                         onClick={() => viewHistoryItem(item)}
                      >
                          <button
                              onClick={(e) => deleteHistoryItem(e, item.id)}
                              className="absolute top-2 left-2 bg-white/90 text-gray-500 hover:text-red-500 p-1.5 opacity-0 group-hover:opacity-100 transition-all z-10 hover:bg-white shadow-sm"
                              title="Delete Scan"
                          >
                              <Trash2 size={16} />
                          </button>
                          <div className="h-44 overflow-hidden border-b border-gray-100 bg-gray-50 relative">
                              <img src={item.imageBase64} alt="Crop" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                              <div className="absolute top-2 right-2 flex gap-2">
                                {!isItemHealthy ? (
                                    <span className="bg-[#D9381E] text-white text-[10px] font-bold px-2 py-1 uppercase tracking-widest shadow-sm flex items-center gap-1">
                                        <AlertTriangle size={12} /> Issue
                                    </span>
                                ) : (
                                    <span className="bg-[#3FAF47] text-white text-[10px] font-bold px-2 py-1 uppercase tracking-widest shadow-sm flex items-center gap-1">
                                        <CheckCircle2 size={12} /> Healthy
                                    </span>
                                )}
                              </div>
                          </div>
                          <div className={`p-5 flex-1 flex flex-col ${isItemHealthy ? 'group-hover:bg-[#F0F8F1]' : 'group-hover:bg-[#FDEDEA]'} transition-colors`}>
                              <div className="text-[10px] text-gray-400 mb-2 font-bold uppercase tracking-wider">{new Date(item.timestamp).toLocaleDateString()} • {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                              <h4 className="font-bold text-gray-900 mb-1 text-lg">{firstResult.crop_detected}</h4>
                              <p className="text-sm font-medium text-gray-600 line-clamp-2 mb-4 flex-1">
                                  {firstResult.possible_disease}
                              </p>
                              <div className={`text-xs font-bold uppercase tracking-widest flex items-center justify-between mt-auto ${isItemHealthy ? 'text-[#3FAF47]' : 'text-[#D9381E]'}`}>
                                  View Details <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                              </div>
                          </div>
                      </div>
                  )})}
              </div>
          </div>
      );
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-[#F8F9F8] text-[#1a1a1a]">
      {/* 1. Header */}
      <header className="bg-[#3FAF47] text-white border-b border-[#328C38] shadow-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => { setActiveTab('home'); resetAll(); }}>
            <div className="bg-[#3FAF47] p-3 text-white border-2 border-white rounded-sm shadow-sm ring-1 ring-white/50">
              <Leaf size={28} strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white leading-none">PerfectFarm</h1>
              <p className="text-sm font-medium mt-1 text-green-100">Scan your crops. Detect issues. Get solutions.</p>
            </div>
          </div>
          <nav className="flex gap-8 text-xs font-bold text-green-50 uppercase tracking-widest overflow-auto">
            <button onClick={() => setActiveTab('home')} className={`font-bold uppercase tracking-widest transition-colors pb-1 border-b-2 whitespace-nowrap ${activeTab === 'home' ? 'text-white border-white' : 'border-transparent hover:text-white'}`}>Home</button>
            <button onClick={startNewScan} className={`font-bold uppercase tracking-widest transition-colors pb-1 border-b-2 whitespace-nowrap ${activeTab === 'scan' ? 'text-white border-white' : 'border-transparent hover:text-white'}`}>Scan</button>
            <button onClick={() => setActiveTab('advisory')} className={`font-bold uppercase tracking-widest transition-colors pb-1 border-b-2 whitespace-nowrap ${activeTab === 'advisory' ? 'text-white border-white' : 'border-transparent hover:text-white'}`}>Advisory</button>
            <button onClick={() => setActiveTab('history')} className={`font-bold uppercase tracking-widest transition-colors pb-1 border-b-2 whitespace-nowrap ${activeTab === 'history' ? 'text-white border-white' : 'border-transparent hover:text-white'}`}>History</button>
            <button onClick={() => setActiveTab('profile')} className={`font-bold uppercase tracking-widest transition-colors pb-1 border-b-2 whitespace-nowrap ${activeTab === 'profile' ? 'text-white border-white' : 'border-transparent hover:text-white'}`}>Profile</button>
          </nav>
        </div>
      </header>

      {isOffline && (
        <div className="bg-yellow-500 text-white px-6 py-2 shadow-sm">
            <div className="max-w-6xl mx-auto flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest">
                <WifiOff size={16} /> You are currently offline. AI analysis and other features may be unavailable.
            </div>
        </div>
      )}

      {/* 2. Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12">
        {activeTab === 'home' && (
           <div className="space-y-16 animate-in fade-in slide-in-from-bottom-8 duration-700">
              {/* Hero Section */}
              <section className="text-center max-w-5xl mx-auto pt-16 pb-16 relative">
                 {/* Decorative Watermarks */}
                 <div className="absolute -top-10 md:-top-4 left-0 md:left-[2%] text-[#3FAF47] opacity-[0.08] -rotate-12 pointer-events-none">
                    <Leaf size={140} strokeWidth={1} />
                 </div>
                 <div className="absolute bottom-10 md:-bottom-10 right-0 md:right-[5%] text-[#7A4F2A] opacity-[0.08] rotate-12 pointer-events-none">
                    <Sprout size={180} strokeWidth={1} />
                 </div>
                 <div className="absolute top-1/4 md:top-1/3 right-[5%] md:right-[15%] text-blue-600 opacity-[0.08] -rotate-12 pointer-events-none">
                    <CloudRain size={100} strokeWidth={1} />
                 </div>
                 <div className="absolute bottom-1/4 left-[5%] md:left-[15%] text-yellow-500 opacity-[0.08] rotate-45 pointer-events-none">
                    <Activity size={120} strokeWidth={1} />
                 </div>
                 <div className="absolute top-[10%] lg:top-[5%] right-[35%] lg:right-[40%] text-[#3FAF47] opacity-[0.06] rotate-[30deg] pointer-events-none hidden md:block">
                    <CheckCircle2 size={80} strokeWidth={1} />
                 </div>
                 <div className="absolute bottom-[10%] lg:bottom-[5%] left-[30%] lg:left-[35%] text-red-500 opacity-[0.05] -rotate-[15deg] pointer-events-none hidden md:block">
                    <AlertTriangle size={100} strokeWidth={1} />
                 </div>

                 <div className="relative z-10 max-w-4xl mx-auto">
                    <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 tracking-tight mb-6">
                      The exact science of <span className="text-[#3FAF47] block sm:inline">plant health.</span>
                    </h1>
                    <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
                      Instantly identify diseases, nutrient deficiencies, and pests with our state-of-the-art agricultural AI. Get precise treatment plans and safeguard your crops.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                      <button 
                        onClick={startNewScan} 
                        className="bg-[#3FAF47] text-white px-8 py-4 font-bold uppercase tracking-widest hover:bg-[#328C38] transition-all shadow-lg hover:shadow-xl hover:-translate-y-1 inline-flex items-center justify-center gap-3"
                      >
                        <Camera size={20} />
                        Start New Scan
                      </button>
                      <button 
                        onClick={() => setActiveTab('history')} 
                        className="bg-white border-2 border-gray-200 text-gray-800 px-8 py-4 font-bold uppercase tracking-widest hover:border-gray-500 hover:bg-gray-50 transition-all hover:shadow-lg hover:-translate-y-1 inline-flex items-center justify-center gap-3"
                      >
                        <History size={20} />
                        View History
                      </button>
                    </div>
                 </div>
              </section>

              {/* Interactive Bento Grid / Features */}
              <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-8 border border-gray-200 shadow-sm col-span-1 md:col-span-2 group hover:border-[#3FAF47] hover:shadow-lg hover:-translate-y-1 transition-all duration-300 relative overflow-hidden cursor-pointer">
                  <div className="absolute -right-10 -bottom-10 opacity-5 group-hover:scale-110 group-hover:opacity-10 text-[#3FAF47] transition-all duration-500 pointer-events-none">
                     <Shield size={220} strokeWidth={1} />
                  </div>
                  <div className="w-12 h-12 bg-[#F0F8F1] text-[#3FAF47] border border-[#3FAF47]/20 rounded-none flex items-center justify-center mb-6 relative z-10 transition-colors group-hover:bg-[#3FAF47] group-hover:text-white">
                    <ShieldCheck size={28} />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3 relative z-10">Enterprise-Grade Accuracy</h3>
                  <p className="text-gray-600 leading-relaxed max-w-md relative z-10">Our models are trained on millions of confirmed botanical textbooks and agricultural datasets to give you confidence in every diagnosis.</p>
                </div>
                
                <div className="bg-white p-8 border border-gray-200 shadow-sm group hover:border-[#7A4F2A] hover:shadow-lg hover:-translate-y-1 transition-all duration-300 relative overflow-hidden cursor-pointer">
                  <div className="absolute -right-6 -bottom-6 opacity-5 group-hover:scale-110 group-hover:opacity-10 text-[#7A4F2A] transition-all duration-500 pointer-events-none">
                     <Sparkles size={160} strokeWidth={1} />
                  </div>
                  <div className="w-12 h-12 bg-[#FFF8F0] text-[#7A4F2A] border border-[#7A4F2A]/20 rounded-none flex items-center justify-center mb-6 relative z-10 transition-colors group-hover:bg-[#7A4F2A] group-hover:text-white">
                    <Zap size={28} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3 relative z-10">Instant Action</h3>
                  <p className="text-gray-600 leading-relaxed relative z-10">Stop guessing. Get detailed treatment blueprints immediately upon scan completion.</p>
                </div>

                <div className="bg-[#1a1a1a] text-white p-8 border border-gray-800 shadow-sm col-span-1 group hover:border-gray-600 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 relative overflow-hidden sm:min-h-[250px] flex flex-col justify-end cursor-pointer">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 opacity-50 blur-2xl rounded-full pointer-events-none"></div>
                  <div className="absolute -left-6 -top-6 text-gray-800 opacity-30 group-hover:rotate-12 group-hover:scale-110 transition-all duration-700 pointer-events-none">
                     <Sprout size={120} strokeWidth={1} />
                  </div>
                  <h3 className="text-2xl font-bold mb-4 flex items-center gap-2 relative z-10">
                    <Target className="text-[#3FAF47]" /> Precision Ag
                  </h3>
                  <p className="text-gray-400 relative z-10">Transform your farming outcomes with data-driven insights tailored to your specific region and soil profile.</p>
                </div>

                <div className="bg-white p-8 border border-gray-200 shadow-sm col-span-1 md:col-span-2 group hover:border-[#3FAF47] hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col sm:flex-row items-center gap-8 cursor-pointer">
                   <div className="flex-1 relative z-10">
                     <div className="w-12 h-12 bg-[#F0F8F1] text-[#3FAF47] border border-[#3FAF47]/20 rounded-none flex items-center justify-center mb-6 transition-colors group-hover:bg-[#3FAF47] group-hover:text-white">
                        <History size={28} />
                     </div>
                     <h3 className="text-2xl font-bold text-gray-900 mb-3">Track Your Progress</h3>
                     <p className="text-gray-600 leading-relaxed max-w-sm">Save your analyses, monitor your crop's recovery over time, and generate professional PDF reports.</p>
                   </div>
                   <div className="w-full sm:w-1/2 bg-gray-50 h-full min-h-[200px] border border-gray-100 flex p-4 items-center justify-center relative group-hover:bg-green-50/50 transition-colors">
                      <div className="w-full max-w-[200px] bg-white shadow-sm border border-gray-200 p-3 flex items-center gap-4 relative z-10 group-hover:-translate-y-2 transition-transform duration-500">
                          <div className="w-12 h-12 bg-gray-200 shrink-0 flex items-center justify-center text-gray-400"><Leaf size={20}/></div>
                          <div>
                            <div className="h-2 w-24 bg-gray-300 mb-2"></div>
                            <div className="h-2 w-16 bg-[#3FAF47]"></div>
                          </div>
                      </div>
                      <div className="absolute right-4 bottom-4 w-full max-w-[200px] bg-white shadow-md border border-gray-200 p-3 flex items-center gap-4 rotate-6 group-hover:rotate-12 transition-transform duration-500 z-0">
                          <div className="w-12 h-12 bg-gray-200 shrink-0 flex items-center justify-center text-gray-400"><Leaf size={20}/></div>
                          <div>
                            <div className="h-2 w-28 bg-gray-300 mb-2"></div>
                            <div className="h-2 w-20 bg-[#D9381E]"></div>
                          </div>
                      </div>
                   </div>
                </div>
              </section>
              
              {/* How it works */}
              <section className="py-16 relative">
                 <div className="absolute top-1/4 left-10 text-green-900/5 hidden md:block -rotate-12">
                    <Leaf size={120} />
                 </div>
                 <div className="absolute bottom-0 right-10 text-yellow-900/5 hidden md:block rotate-12">
                    <Sprout size={100} />
                 </div>
                 <h2 className="text-3xl font-bold text-center text-gray-900 mb-4 relative z-10">Three steps to health.</h2>
                 <p className="text-center text-gray-500 mb-12 max-w-lg mx-auto relative z-10">It only takes a moment to understand what's wrong with your plant and how to fix it.</p>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
                    <div className="text-center group border border-transparent hover:border-gray-200 p-6 transition-all hover:bg-white hover:shadow-md cursor-pointer">
                       <div className="w-16 h-16 mx-auto bg-[#3FAF47] shadow-md text-white transition-transform duration-300 group-hover:-translate-y-2 group-hover:scale-110 flex items-center justify-center font-black text-2xl mb-6">1</div>
                       <h4 className="font-bold text-lg mb-3 flex items-center justify-center gap-2 text-gray-900 group-hover:text-[#3FAF47] transition-colors"><Camera size={18} /> Snap a Photo</h4>
                       <p className="text-gray-500">Capture a clear image of the affected plant or leaf.</p>
                    </div>
                    <div className="text-center group border border-transparent hover:border-gray-200 p-6 transition-all hover:bg-white hover:shadow-md relative cursor-pointer">
                       <div className="hidden md:block absolute top-14 -left-12 w-24 border-t-2 border-dashed border-gray-300 group-hover:border-[#3FAF47] transition-colors"></div>
                       <div className="w-16 h-16 mx-auto bg-[#3FAF47] shadow-md text-white transition-transform duration-300 group-hover:-translate-y-2 group-hover:scale-110 flex items-center justify-center font-black text-2xl mb-6">2</div>
                       <h4 className="font-bold text-lg mb-3 flex items-center justify-center gap-2 text-gray-900 group-hover:text-[#3FAF47] transition-colors"><Sparkles size={18} /> AI Analysis</h4>
                       <p className="text-gray-500">Our advanced systems detect the precise issue.</p>
                    </div>
                    <div className="text-center group border border-transparent hover:border-gray-200 p-6 transition-all hover:bg-white hover:shadow-md relative cursor-pointer">
                       <div className="hidden md:block absolute top-14 -left-12 w-24 border-t-2 border-dashed border-gray-300 group-hover:border-[#3FAF47] transition-colors"></div>
                       <div className="w-16 h-16 mx-auto bg-[#3FAF47] shadow-md text-white transition-transform duration-300 group-hover:-translate-y-2 group-hover:scale-110 flex items-center justify-center font-black text-2xl mb-6">3</div>
                       <h4 className="font-bold text-lg mb-3 flex items-center justify-center gap-2 text-gray-900 group-hover:text-[#3FAF47] transition-colors"><Zap size={18} /> Act & Resolve</h4>
                       <p className="text-gray-500">Follow targeted treatment steps to heal your crops.</p>
                    </div>
                 </div>
              </section>
           </div>
        )}
        {activeTab === 'advisory' && (
          <div className="max-w-4xl mx-auto space-y-8">
             <div className="flex sm:items-center justify-between flex-col sm:flex-row gap-4 mb-4">
                 <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                     <CalendarRange className="text-[#3FAF47]" size={28} /> Planting & Weather Advisory
                 </h2>
                 {isOffline && (
                     <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 px-3 py-1.5 font-bold uppercase tracking-widest text-xs border border-yellow-200">
                         <WifiOff size={14} /> Offline Mode Active
                     </div>
                 )}
             </div>

             {!userProfile.location || !userProfile.primaryCrops ? (
                 <div className="bg-white border border-gray-200 p-8 text-center shadow-sm">
                     <Globe2 className="mx-auto text-gray-300 mb-4" size={48} />
                     <h3 className="text-xl font-bold text-gray-900 mb-2">Location Required</h3>
                     <p className="text-gray-500 mb-6">Setup your farm profile indicating your location and primary crops to get localized climate-smart planting schedules.</p>
                     <button onClick={() => setActiveTab('profile')} className="bg-[#3FAF47] text-white px-6 py-2.5 font-bold uppercase tracking-widest hover:bg-[#328C38] transition-colors">Setup Profile</button>
                 </div>
             ) : (
                 <div className="space-y-6">
                     <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
                        <div className="text-gray-600 font-medium">Location: <span className="text-gray-900 font-bold">{userProfile.location}</span> | Crops: <span className="text-gray-900 font-bold">{userProfile.primaryCrops}</span></div>
                        <button 
                            onClick={handleGenerateAdvisory}
                            disabled={isGeneratingAdvisory}
                            className="bg-[#3FAF47] text-white px-4 py-2 font-bold uppercase tracking-widest hover:bg-[#328C38] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isGeneratingAdvisory ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                            {farmAdvisory ? "Refresh Advisory" : "Generate Local Advisory"}
                        </button>
                     </div>

                     {advisoryError && (
                        <div className="bg-red-50 text-red-700 p-4 border border-red-200 mb-6 flex gap-3 items-start">
                            <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-bold">Error generating advisory</h4>
                                <p className="text-sm">{advisoryError}</p>
                            </div>
                        </div>
                     )}

                     {isGeneratingAdvisory && !farmAdvisory && (
                         <div className="flex flex-col items-center justify-center py-20 text-center">
                             <div className="relative">
                                 <div className="w-16 h-16 border-4 border-gray-200 border-t-[#3FAF47] rounded-full animate-spin"></div>
                                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#3FAF47]">
                                    <CloudRain size={20} />
                                 </div>
                             </div>
                             <h3 className="text-xl font-bold text-gray-900 mt-6 mb-2">Analyzing Local Weather...</h3>
                             <p className="text-gray-500 max-w-sm mx-auto">Gathering climate data and adjusting protocols for {userProfile.location}...</p>
                         </div>
                     )}

                     {farmAdvisory && !isGeneratingAdvisory && (
                         <div className="space-y-8 fade-in">
                             {/* Weather Summary Card */}
                             <div className="bg-white border border-gray-200 shadow-sm p-6 lg:p-8">
                                 <h3 className="font-bold text-xl text-gray-900 mb-6 flex items-center gap-2 border-b border-gray-100 pb-4">
                                     <MapPin size={24} className="text-blue-500"/> Current Weather & Climate Info
                                 </h3>
                                 <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                     <div className="bg-blue-50 p-4 border border-blue-100 rounded-sm">
                                         <Thermometer className="text-blue-500 mb-2" size={24} />
                                         <div className="text-[10px] font-bold uppercase tracking-wider text-blue-800/70 mb-1">Temperature</div>
                                         <div className="font-bold text-blue-900 text-lg">{farmAdvisory.weatherData.temperature}</div>
                                     </div>
                                     <div className="bg-blue-50 p-4 border border-blue-100 rounded-sm">
                                         <Droplet className="text-blue-500 mb-2" size={24} />
                                         <div className="text-[10px] font-bold uppercase tracking-wider text-blue-800/70 mb-1">Humidity</div>
                                         <div className="font-bold text-blue-900 text-lg">{farmAdvisory.weatherData.humidity}</div>
                                     </div>
                                     <div className="bg-blue-50 p-4 border border-blue-100 rounded-sm">
                                         <Wind className="text-blue-500 mb-2" size={24} />
                                         <div className="text-[10px] font-bold uppercase tracking-wider text-blue-800/70 mb-1">Wind Speed</div>
                                         <div className="font-bold text-blue-900 text-lg">{farmAdvisory.weatherData.windSpeed}</div>
                                     </div>
                                     <div className="bg-blue-50 p-4 border border-blue-100 rounded-sm">
                                         <CloudRain className="text-blue-500 mb-2" size={24} />
                                         <div className="text-[10px] font-bold uppercase tracking-wider text-blue-800/70 mb-1">Rainfall History</div>
                                         <div className="font-bold text-blue-900 text-xs sm:text-sm leading-tight">{farmAdvisory.weatherData.rainfallHistory}</div>
                                     </div>
                                 </div>
                             </div>

                             <div className="grid md:grid-cols-2 gap-8">
                                 {/* Pest/Disease Warnings */}
                                 <div className="bg-white border border-gray-200 shadow-sm p-6 lg:p-8 relative overflow-hidden">
                                     <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-500"></div>
                                     <h3 className="font-bold text-lg text-gray-900 mb-6 flex items-center gap-2">
                                         <Activity size={20} className="text-orange-500"/> Outbreak & Pest Warnings
                                     </h3>
                                     <div className="space-y-4">
                                         {farmAdvisory.pestDiseaseWarnings.map((warning, idx) => (
                                             <div key={idx} className="bg-orange-50 p-4 border border-orange-100 flex gap-4 items-start">
                                                 <AlertTriangle className={warning.severity === 'High' ? 'text-red-500 shrink-0 mt-1' : 'text-orange-400 shrink-0 mt-1'} size={24} />
                                                 <div>
                                                     <div className="flex items-center gap-2 mb-1">
                                                         <h4 className="font-bold text-orange-900 text-sm uppercase tracking-wider">{warning.title}</h4>
                                                         <span className={`text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-widest ${warning.severity === 'High' ? 'bg-red-500 text-white' : 'bg-orange-200 text-orange-800'}`}>
                                                             {warning.severity}
                                                         </span>
                                                     </div>
                                                     <p className="text-orange-800 text-sm leading-relaxed">{warning.description}</p>
                                                 </div>
                                             </div>
                                         ))}
                                     </div>
                                 </div>

                                 {/* Planting Recommendations */}
                                 <div className="bg-white border border-gray-200 shadow-sm p-6 lg:p-8 relative overflow-hidden">
                                     <div className="absolute top-0 left-0 w-1.5 h-full bg-[#3FAF47]"></div>
                                     <h3 className="font-bold text-lg text-gray-900 mb-6 flex items-center gap-2">
                                         <Leaf size={20} className="text-[#3FAF47]"/> Fine-tuned Planting Guide
                                     </h3>
                                     <ul className="space-y-4">
                                         {farmAdvisory.plantingRecommendations.map((rec, idx) => (
                                             <li key={idx} className="flex items-start gap-4">
                                                 <div className="bg-green-100 text-green-800 p-2 font-bold text-xs shrink-0 whitespace-nowrap mt-0.5 text-center min-w-[70px]">
                                                     {rec.title}
                                                 </div>
                                                 <p className="text-sm text-gray-700 font-medium leading-relaxed">{rec.action}</p>
                                             </li>
                                         ))}
                                     </ul>
                                 </div>
                             </div>
                         </div>
                     )}
                     
                     {!farmAdvisory && !isGeneratingAdvisory && (
                         <div className="bg-gray-50 border border-gray-200 border-dashed p-12 text-center text-gray-500">
                             <Sprout size={48} className="mx-auto text-gray-300 mb-4" />
                             <p>Tap "Generate Local Advisory" to get weather data and localized planting protocols.</p>
                         </div>
                     )}
                 </div>
             )}
          </div>
        )}
        {activeTab === 'history' && renderHistory()}
        {activeTab === 'profile' && (
          <div className="max-w-2xl mx-auto">
             <h2 className="text-2xl font-bold text-gray-900 mb-8 flex items-center gap-3">
                 <User className="text-[#3FAF47]" size={28} /> Farm Profile
             </h2>
             <div className="bg-white border border-gray-200 shadow-sm p-8">
                <p className="text-gray-600 mb-6 font-medium">Save your farm details to get more personalized and context-aware advice from our AI.</p>
                <form onSubmit={handleSaveProfile} className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Location/Region</label>
                        <input 
                            type="text" 
                            className="w-full border-2 border-gray-200 p-3 focus:outline-none focus:border-[#3FAF47] font-medium"
                            placeholder="e.g. California, Mid-West, Mediterranean"
                            value={userProfile.location}
                            onChange={(e) => setUserProfile({...userProfile, location: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Primary Crops</label>
                        <input 
                            type="text" 
                            className="w-full border-2 border-gray-200 p-3 focus:outline-none focus:border-[#3FAF47] font-medium"
                            placeholder="e.g. Tomatoes, Wheat, Apple Orchards"
                            value={userProfile.primaryCrops}
                            onChange={(e) => setUserProfile({...userProfile, primaryCrops: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Primary Soil Type</label>
                        <select 
                            className="w-full border-2 border-gray-200 p-3 focus:outline-none focus:border-[#3FAF47] bg-white font-medium"
                            value={userProfile.soilType}
                            onChange={(e) => setUserProfile({...userProfile, soilType: e.target.value})}
                        >
                            <option value="">Select a soil type...</option>
                            <option value="clay">Clay</option>
                            <option value="sandy">Sandy</option>
                            <option value="silty">Silty</option>
                            <option value="loamy">Loamy</option>
                            <option value="peaty">Peaty</option>
                            <option value="chalky">Chalky</option>
                            <option value="mixed">Mixed/Other</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Preferred Language</label>
                        <select 
                            className="w-full border-2 border-gray-200 p-3 focus:outline-none focus:border-[#3FAF47] bg-white font-medium"
                            value={userProfile.language || 'English'}
                            onChange={(e) => setUserProfile({...userProfile, language: e.target.value})}
                        >
                            <option value="English">English</option>
                            <option value="Twi">Twi</option>
                            <option value="Ewe">Ewe</option>
                            <option value="Ga">Ga</option>
                            <option value="Dagbani">Dagbani</option>
                            <option value="Hausa">Hausa</option>
                            <option value="Fante">Fante</option>
                            <option value="Nzema">Nzema</option>
                            <option value="French">French</option>
                            <option value="Portuguese">Portuguese</option>
                        </select>
                    </div>
                    <button 
                         type="submit"
                         className="w-full bg-[#3FAF47] text-white px-8 py-4 font-bold uppercase tracking-widest hover:bg-[#328C38] transition-colors shadow-sm mt-4 flex items-center justify-center gap-2"
                    >
                        {profileSaved ? <><CheckCircle2 size={20}/> Saved successfully</> : "Save Profile Details"}
                    </button>
                </form>
             </div>
          </div>
        )}
        {activeTab === 'scan' && (
          <>
            {status === 'idle' && (
          <div className="max-w-3xl mx-auto relative group-canvas">
             <div className="absolute -left-10 md:-left-20 top-10 text-green-900/5 pointer-events-none -rotate-12 z-0 hidden sm:block">
                 <Leaf size={250} />
             </div>
             <div className="absolute -right-10 md:-right-20 -bottom-10 text-yellow-900/5 pointer-events-none rotate-12 z-0 hidden sm:block">
                 <Sprout size={300} />
             </div>
             <div 
                className="relative z-10 border-2 border-dashed border-[#7A4F2A] bg-white/90 backdrop-blur-sm overflow-hidden p-12 sm:p-16 text-center cursor-pointer hover:bg-[#F0F8F1] transition-colors group"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                  <div className="flex justify-center mb-6 text-[#3FAF47] group-hover:-translate-y-2 group-hover:scale-105 transition-transform duration-300 pointer-events-none">
                      <UploadCloud size={80} strokeWidth={1} />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">Upload a photo of your crop.</h3>
                  <p className="text-gray-500 mb-8 font-medium">Drag and drop your image here, or click to browse</p>
                  
                  <div className="flex flex-col justify-center">
                      <button className="bg-[#3FAF47] text-white px-10 py-4 font-bold uppercase tracking-widest hover:bg-[#328C38] transition-colors shadow-sm inline-flex items-center justify-center gap-3">
                          <UploadCloud size={20} />
                          Upload Image
                      </button>
                  </div>
                  <input type="file" className="hidden" ref={fileInputRef} onChange={(e) => e.target.files && handleImageChange(e.target.files[0])} accept="image/*" />
              </div>
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center text-sm font-medium text-[#7A4F2A]">
                  <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="text-[#3FAF47]" /> Clear & in-focus images work best
                  </div>
                  <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="text-[#3FAF47]" /> Show full leaf or affected area
                  </div>
                  <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="text-[#3FAF47]" /> Avoid harsh glare or shadows
                  </div>
              </div>
          </div>
        )}

        {status === 'analyzing' && (
          <div className="max-w-2xl mx-auto text-center bg-white border border-gray-200 p-12 shadow-sm">
             {imagePreviewUrl && (
                 <div className="mb-8 p-2 border border-gray-100 bg-gray-50 inline-block">
                     <img src={imagePreviewUrl} alt="Uploading..." className="h-48 w-auto object-cover max-w-full" />
                 </div>
             )}
             <Loader2 size={48} className="mx-auto text-[#3FAF47] animate-spin mb-6" />
             <h3 className="text-xl font-bold text-gray-900 mb-2">Analyzing your crop...</h3>
             <p className="text-gray-500">Our AI model is identifying the plant species and detecting potential symptoms.</p>
          </div>
        )}

        {status === 'error' && (
           <div className="max-w-2xl mx-auto bg-white border border-gray-200 p-10 shadow-sm text-center">
              <div className="flex justify-center mb-4 text-red-500">
                  <AlertTriangle size={64} strokeWidth={1.5} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Analysis Failed</h3>
              <p className="text-gray-600 mb-8 leading-relaxed max-w-md mx-auto">{errorMessage}</p>
              <button 
                  onClick={resetAll}
                  className="bg-[#7A4F2A] hover:bg-[#5E3B1C] text-white px-8 py-3 font-bold uppercase tracking-widest transition-colors shadow-sm inline-flex items-center gap-2"
              >
                  <RefreshCcw size={18} /> Try Another Image
              </button>
           </div>
        )}

        {status === 'success' && analysisResult && analysisResult.results && (
          <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8 items-start">
             {/* Left Column: Image & Baseline Info */}
             <div className="flex flex-col gap-6 lg:w-1/3">
                <div className="bg-white border border-gray-200 shadow-sm p-4 sticky top-6">
                    <div className="relative inline-block w-full">
                        <img src={imagePreviewUrl!} alt="Analyzed crop" className="w-full h-auto object-cover block" />
                        {analysisResult.results.map((result, idx) => (
                          result.affected_bounding_box && result.affected_bounding_box.length === 4 ? (
                            <div 
                                key={`bbox-${idx}`}
                                className="absolute border-2 border-red-500 bg-red-500/20 pointer-events-none transition-all duration-500"
                                style={{
                                    top: `${result.affected_bounding_box[0] / 10}%`,
                                    left: `${result.affected_bounding_box[1] / 10}%`,
                                    height: `${(result.affected_bounding_box[2] - result.affected_bounding_box[0]) / 10}%`,
                                    width: `${(result.affected_bounding_box[3] - result.affected_bounding_box[1]) / 10}%`
                                }}
                            >
                                <span className="absolute -top-6 left-[-2px] bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 whitespace-nowrap shadow-sm">
                                    Crop {idx + 1}
                                </span>
                            </div>
                          ) : null
                        ))}
                    </div>
                </div>

                <div className="bg-white border border-gray-200 shadow-sm p-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-[#3FAF47]"></div>
                    <div className="pl-4">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Crops Detected</h4>
                        <div className="flex flex-col gap-2">
                           {analysisResult.results.map((r, i) => (
                               <p key={`crop-${i}`} className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                  {r.crop_detected} <Sprout className="text-[#3FAF47]" size={20} />
                               </p>
                           ))}
                        </div>
                    </div>
                </div>

                <button 
                    onClick={resetAll}
                    className="w-full bg-white border border-[#7A4F2A] text-[#7A4F2A] hover:bg-[#7A4F2A] hover:text-white px-6 py-4 font-bold uppercase tracking-widest transition-colors flex justify-center items-center gap-3"
                >
                    <RefreshCcw size={18} /> Scan Another Image
                </button>
             </div>

             {/* Right Column: AI Analysis Output for each crop */}
             <div className="flex flex-col gap-10 lg:w-2/3">
                 {/* Overall Document Actions */}
                 <div className="flex justify-end gap-3 border-b border-gray-200 pb-4">
                     <button
                         onClick={downloadReport}
                         className="bg-white text-gray-800 hover:bg-gray-50 border border-gray-200 px-4 py-2 text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
                     >
                         <Download size={16} /> Report
                     </button>
                     <button
                         onClick={handleShare}
                         className="bg-white text-gray-800 hover:bg-gray-50 border border-gray-200 px-4 py-2 text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
                     >
                         <Share2 size={16} /> Share
                     </button>
                 </div>

                 {analysisResult.results.map((result, idx) => {
                     const isHealthy = checkIsHealthy(result.possible_disease);
                     return (
                         <div key={`result-${idx}`} className="flex flex-col gap-6" id={`crop-result-${idx}`}>
                             {/* Diagnosis Header */}
                             <div className="bg-white border border-gray-200 shadow-sm p-8">
                                 <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6 pb-6 border-b border-gray-100">
                                     <div>
                                         <h4 className="text-xs font-bold uppercase tracking-widest text-[#3FAF47] mb-2">Crop {idx + 1}: {result.crop_detected}</h4>
                                         <h2 className="text-3xl font-bold text-gray-900 leading-tight">{result.possible_disease}</h2>
                                     </div>
                                     <div className="flex flex-wrap gap-3">
                                         <div 
                                            className="bg-gray-100 text-gray-800 border border-gray-200 px-4 py-2 text-sm font-bold flex items-center gap-2 cursor-help"
                                            title="This shows how certain the AI is about its diagnosis, not the severity of the disease."
                                         >
                                            <Activity size={16} className="text-blue-500" />
                                            Confidence: {result.confidence_score}
                                         </div>
                                         {!isHealthy && (
                                            <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-2 text-sm font-bold flex items-center gap-2 uppercase tracking-wide">
                                                <AlertTriangle size={16} /> High Risk
                                            </div>
                                         )}
                                         {isHealthy && (
                                            <div className="bg-[#EAF5EC] text-[#3FAF47] border border-[#3FAF47] px-4 py-2 text-sm font-bold flex items-center gap-2 uppercase tracking-wide">
                                                <CheckCircle2 size={16} /> Healthy
                                            </div>
                                         )}
                                     </div>
                                 </div>

                                 <div className="prose prose-gray max-w-none text-gray-700">
                                     <p className="text-lg leading-relaxed">{result.detailed_explanation}</p>
                                 </div>

                                 {!isHealthy && result.risk_assessment && (
                                     <div className="mt-6 border border-gray-200 p-4 bg-gray-50 flex flex-col sm:flex-row gap-6 relative overflow-hidden">
                                         <div className={`absolute top-0 left-0 w-2 h-full ${result.risk_assessment.severity.toLowerCase().includes('high') ? 'bg-[#D9381E]' : (result.risk_assessment.severity.toLowerCase().includes('low') ? 'bg-yellow-400' : 'bg-orange-500')}`}></div>
                                         
                                         <div className="flex-1 py-1 px-2">
                                             <h4 className="text-sm font-bold uppercase tracking-widest text-[#7A4F2A] mb-4 flex items-center gap-2">
                                                 <Activity size={16} /> Risk Assessment
                                             </h4>
                                             
                                             <div className="grid sm:grid-cols-3 gap-4">
                                                 <div className="bg-white p-3 border border-gray-200 shadow-sm">
                                                     <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Severity</span>
                                                     <span className={`font-bold text-lg ${result.risk_assessment.severity.toLowerCase().includes('high') ? 'text-red-600' : 'text-orange-600'}`}>
                                                        {result.risk_assessment.severity}
                                                     </span>
                                                 </div>
                                                 <div className="bg-white p-3 border border-gray-200 shadow-sm">
                                                     <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Spread Potential</span>
                                                     <span className="font-semibold text-sm text-gray-800">
                                                        {result.risk_assessment.spread_potential}
                                                     </span>
                                                 </div>
                                                 <div className="bg-white p-3 border border-gray-200 shadow-sm">
                                                     <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Est. Yield Loss</span>
                                                     <span className="font-semibold text-sm text-gray-800">
                                                        {result.risk_assessment.estimated_yield_loss}
                                                     </span>
                                                 </div>
                                             </div>
                                         </div>
                                     </div>
                                 )}

                                 {((result.symptoms_observed && result.symptoms_observed.length > 0) || result.environmental_factors?.length || result.affected_areas_description) && !isHealthy && (
                                    <div className="mt-8 space-y-6">
                                         {result.symptoms_observed && result.symptoms_observed.length > 0 && (
                                             <div>
                                                 <h4 className="text-sm font-bold uppercase tracking-widest text-[#7A4F2A] mb-4">Symptoms Observed</h4>
                                                 <ul className="grid sm:grid-cols-2 gap-3 text-sm font-medium">
                                                     {result.symptoms_observed.map((symptom, i) => (
                                                         <li key={i} className="bg-gray-50 border border-gray-200 p-3 flex items-start gap-3">
                                                             <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={16} />
                                                             <span>{symptom}</span>
                                                         </li>
                                                     ))}
                                                 </ul>
                                             </div>
                                         )}
                                         
                                         <div className="grid sm:grid-cols-2 gap-6">
                                             {result.affected_areas_description && (
                                                 <div>
                                                     <h4 className="text-xs font-bold uppercase tracking-widest text-[#7A4F2A] mb-3 flex items-center gap-2">
                                                         <Target size={16} className="text-[#D9381E]" /> Affected Areas
                                                     </h4>
                                                     <p className="text-sm text-gray-700 bg-[#FDEDEA] p-4 border border-[#F2C5BE]">
                                                         {result.affected_areas_description}
                                                     </p>
                                                 </div>
                                             )}

                                             {result.environmental_factors && result.environmental_factors.length > 0 && (
                                                 <div>
                                                     <h4 className="text-xs font-bold uppercase tracking-widest text-[#7A4F2A] mb-3 flex items-center gap-2">
                                                         <CloudRain size={16} className="text-blue-500" /> Environmental Flags
                                                     </h4>
                                                     <ul className="text-sm text-gray-700 bg-blue-50 p-4 border border-blue-100 flex flex-col gap-2">
                                                         {result.environmental_factors.map((factor, i) => (
                                                             <li key={i} className="flex items-start gap-2">
                                                                 <span className="text-blue-500 mt-0.5 font-bold">•</span>
                                                                 <span>{factor}</span>
                                                             </li>
                                                         ))}
                                                     </ul>
                                                 </div>
                                             )}
                                         </div>
                                    </div>
                                 )}
                             </div>

                             {/* Treatment & Prevention */}
                             {!isHealthy && (
                                 <div className="grid sm:grid-cols-2 gap-6">
                                     {/* Treatment */}
                                     <div className="bg-white border border-gray-200 border-t-4 border-t-[#3FAF47] shadow-sm p-8">
                                         <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                                             <ShieldCheck className="text-[#3FAF47]" size={24} /> Treatment Actions
                                         </h3>
                                         <ul className="space-y-4">
                                             {result.treatment_recommendations.map((rec, i) => (
                                                 <li key={i} className="flex gap-4">
                                                     <div className="bg-[#3FAF47] text-white w-6 h-6 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                                                         {i + 1}
                                                     </div>
                                                     <p className="text-gray-700 leading-relaxed font-medium">{rec}</p>
                                                 </li>
                                             ))}
                                         </ul>
                                     </div>
                                     
                                     {/* Prevention */}
                                     <div className="bg-white border border-gray-200 border-t-4 border-t-[#7A4F2A] shadow-sm p-8">
                                         <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                                             <Sprout className="text-[#7A4F2A]" size={24} /> Preventive Measures
                                         </h3>
                                         <ul className="space-y-4">
                                             {result.preventive_measures.map((prev, i) => (
                                                 <li key={i} className="flex gap-4">
                                                     <div className="bg-[#7A4F2A] text-white w-6 h-6 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                                                         {i + 1}
                                                     </div>
                                                     <p className="text-gray-700 leading-relaxed font-medium">{prev}</p>
                                                 </li>
                                             ))}
                                         </ul>
                                     </div>
                                 </div>
                             )}
                             {isHealthy && result.preventive_measures && result.preventive_measures.length > 0 && (
                                 <div className="bg-white border border-gray-200 border-t-4 border-t-[#3FAF47] shadow-sm p-8">
                                     <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                                         <Sprout className="text-[#3FAF47]" size={24} /> Recommended Maintenance Tips
                                     </h3>
                                     <ul className="space-y-4">
                                         {result.preventive_measures.map((prev, i) => (
                                             <li key={i} className="flex gap-4">
                                                 <div className="bg-[#3FAF47] text-white w-6 h-6 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                                                     {i + 1}
                                                 </div>
                                                 <p className="text-gray-700 leading-relaxed font-medium">{prev}</p>
                                             </li>
                                         ))}
                                     </ul>
                                 </div>
                             )}
                         </div>
                     );
                 })}

                 {/* Feedback Section */}
                 <div className="bg-gray-50 border border-gray-200 shadow-sm p-6 flex flex-col sm:flex-row items-center justify-between gap-4 mt-2">
                     <p className="text-sm font-bold text-gray-700">Was this analysis helpful?</p>
                     {feedback ? (
                         <div className="flex items-center gap-2 text-sm font-bold text-[#3FAF47] bg-[#EAF5EC] px-4 py-2 border border-[#3FAF47]">
                             <CheckCircle2 size={16} />
                             Thank you for your feedback!
                         </div>
                     ) : (
                         <div className="flex items-center gap-3">
                             <button
                                 onClick={() => setFeedback('up')}
                                 className="flex items-center gap-2 border border-gray-300 bg-white hover:bg-gray-100 hover:text-[#3FAF47] hover:border-[#3FAF47] px-4 py-2 text-sm font-bold text-gray-600 transition-colors"
                             >
                                 <ThumbsUp size={16} /> Yes
                             </button>
                             <button
                                 onClick={() => setFeedback('down')}
                                 className="flex items-center gap-2 border border-gray-300 bg-white hover:bg-gray-100 hover:text-[#D9381E] hover:border-[#D9381E] px-4 py-2 text-sm font-bold text-gray-600 transition-colors"
                             >
                                 <ThumbsDown size={16} /> No
                             </button>
                         </div>
                     )}
                 </div>
             </div>
          </div>
        )}
          </>
        )}
      </main>

      {/* 4. Footer */}
      <footer className="w-full bg-[#1e4622] text-white py-12 mt-auto border-t-[6px] border-[#3FAF47]">
         <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-[#3FAF47] p-2 text-white border border-white rounded-sm">
                  <Leaf size={20} strokeWidth={2} />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white leading-none">PerfectFarm</h2>
              </div>
              <p className="text-green-100/70 text-sm max-w-sm leading-relaxed mb-6">
                Empowering farmers worldwide with instant, AI-driven crop analysis. Catch plant diseases early and get actionable treatment plans to protect your yield.
              </p>
              <div className="text-xs font-bold text-green-400 tracking-wider">
                 BUILT WITH GOOGLE AI
              </div>
            </div>
            
            <div>
              <h4 className="font-bold text-lg mb-4 text-white">Quick Links</h4>
              <ul className="space-y-3 text-sm text-green-100/70">
                <li><button onClick={() => setActiveTab('home')} className="hover:text-white transition-colors">Home</button></li>
                <li><button onClick={startNewScan} className="hover:text-white transition-colors">New Scan</button></li>
                <li><button onClick={() => setActiveTab('advisory')} className="hover:text-white transition-colors">Weather & Advisory</button></li>
                <li><button onClick={() => setActiveTab('history')} className="hover:text-white transition-colors">History & Reports</button></li>
                <li><button onClick={() => setActiveTab('profile')} className="hover:text-white transition-colors">Farm Profile</button></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-lg mb-4 text-white">Resources</h4>
              <ul className="space-y-3 text-sm text-green-100/70">
                <li><a href="#" className="hover:text-white transition-colors">Identify Common Pests</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Soil Health Guide</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Treatment Blueprints</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact Support</a></li>
              </ul>
            </div>
         </div>
         <div className="max-w-6xl mx-auto px-6 mt-12 pt-8 border-t border-green-800/50 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-green-100/50">
            <p>&copy; {new Date().getFullYear()} PerfectFarm. All rights reserved.</p>
            <div className="flex gap-4">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            </div>
         </div>
      </footer>

      {/* Onboarding Modal */}
      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1a1a]/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-500">
            {/* progress bar */}
            <div className="flex w-full h-1.5 bg-gray-100">
               <div className="bg-[#3FAF47] h-full transition-all duration-500" style={{ width: `${(onboardingStep / 3) * 100}%` }}></div>
            </div>
            
            <div className="p-8">
              {onboardingStep === 1 && (
                <div className="text-center animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="bg-[#EAF5EC] w-20 h-20 mx-auto flex items-center justify-center mb-6 text-[#3FAF47] rounded-full border-4 border-white shadow-sm ring-1 ring-gray-100">
                     <Leaf size={36} strokeWidth={2} />
                  </div>
                  <h2 className="text-2xl font-extrabold text-gray-900 mb-4 tracking-tight">Welcome to PerfectFarm</h2>
                  <p className="text-gray-600 mb-8 leading-relaxed">
                    Empowering farmers worldwide with instant, AI-driven crop analysis. 
                    Catch plant diseases early and get actionable treatment plans to protect your yield.
                  </p>
                  <button 
                    onClick={() => setOnboardingStep(2)}
                    className="w-full bg-[#3FAF47] text-white py-3.5 font-bold uppercase tracking-widest hover:bg-[#328C38] transition-colors shadow-md"
                  >
                     Continue
                  </button>
                </div>
              )}

              {onboardingStep === 2 && (
                <div className="text-center animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="bg-blue-50 w-20 h-20 mx-auto flex items-center justify-center mb-6 text-blue-500 rounded-full border-4 border-white shadow-sm ring-1 ring-gray-100">
                     <Camera size={36} strokeWidth={2} />
                  </div>
                  <h2 className="text-2xl font-extrabold text-gray-900 mb-4 tracking-tight">How It Works</h2>
                  <p className="text-gray-600 mb-8 leading-relaxed">
                    It's simple. Take a photo of an unhealthy leaf or crop, and our advanced AI will diagnose the problem and give you a step-by-step recovery plan in seconds.
                  </p>
                  <div className="flex gap-3">
                     <button 
                      onClick={() => setOnboardingStep(1)}
                      className="w-1/3 bg-gray-100 text-gray-600 py-3.5 font-bold uppercase tracking-widest hover:bg-gray-200 transition-colors"
                    >
                       Back
                    </button>
                    <button 
                      onClick={() => setOnboardingStep(3)}
                      className="w-2/3 bg-[#3FAF47] text-white py-3.5 font-bold uppercase tracking-widest hover:bg-[#328C38] transition-colors shadow-md"
                    >
                       Next
                    </button>
                  </div>
                </div>
              )}

              {onboardingStep === 3 && (
                <div className="text-center animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="bg-yellow-50 w-20 h-20 mx-auto flex items-center justify-center mb-6 text-yellow-600 rounded-full border-4 border-white shadow-sm ring-1 ring-gray-100">
                     <User size={36} strokeWidth={2} />
                  </div>
                  <h2 className="text-2xl font-extrabold text-gray-900 mb-4 tracking-tight">Set Up Your Profile</h2>
                  <p className="text-gray-600 mb-8 leading-relaxed">
                    Personalize your experience by adding your farm's location, soil type, and primary crops. This helps our AI give you highly contextual advice.
                  </p>
                  <div className="flex gap-3 flex-col sm:flex-row">
                     <button 
                      onClick={() => {
                         localStorage.setItem('perfectFarm_onboarding_completed', 'true');
                         setShowOnboarding(false);
                         setActiveTab('home');
                      }}
                      className="w-full bg-white border-2 border-gray-200 text-gray-600 py-3.5 font-bold uppercase tracking-widest hover:border-gray-500 transition-colors order-2 sm:order-1"
                    >
                       Skip
                    </button>
                    <button 
                      onClick={() => {
                         localStorage.setItem('perfectFarm_onboarding_completed', 'true');
                         setShowOnboarding(false);
                         setActiveTab('profile');
                      }}
                      className="w-full bg-[#3FAF47] text-white py-3.5 font-bold uppercase tracking-widest hover:bg-[#328C38] transition-colors shadow-md order-1 sm:order-2"
                    >
                       Setup Profile
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


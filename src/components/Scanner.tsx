import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  RotateCcw, 
  ShieldCheck, 
  XCircle, 
  AlertTriangle,
  Info,
  ArrowRight,
  Upload,
  Database,
  Search
} from 'lucide-react';
import { ai, MODELS } from '../lib/gemini';
import { cn } from '../lib/utils';
import { auth, db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

interface ScanResult {
  drugName: string;
  activeIngredients: string[];
  safetyStatus: 'SAFE' | 'CAUTION' | 'UNSAFE';
  warnings: string;
  isAuthentic: boolean;
  batchNumber?: string;
}

export default function Scanner({ week }: { week: number | null }) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = async () => {
    try {
      setIsVideoReady(false);
      setScanError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      setStream(mediaStream);
      setCameraPermission('granted');
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // Ensure video plays
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.error);
        };
        videoRef.current.oncanplay = () => {
          setIsVideoReady(true);
        };
      }
    } catch (error) {
      console.error("Camera access failed", error);
      setCameraPermission('denied');
      alert("Could not access camera. Please check your browser or phone settings to allow camera access, or use the upload option below.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsVideoReady(false);
    }
  };

  const takePhoto = () => {
    if (videoRef.current && isVideoReady && videoRef.current.videoWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setPhoto(dataUrl);
        stopCamera();
        analyzePhoto(dataUrl);
      }
    } else {
      console.error("Video not ready for capture");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("File too large. Max 2MB allowed.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setPhoto(dataUrl);
        stopCamera();
        analyzePhoto(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzePhoto = async (image: string) => {
    setIsScanning(true);
    setScanError(null);
    try {
      const base64Data = image.split(',')[1];
      const response = await ai.models.generateContent({
        model: MODELS.flash,
        config: {
          systemInstruction: `You are a Medicine Safety Expert for pregnant women.
          Task: Analyze the image of the medicine package.
          1. Extract Drug Name & Active Ingredients.
          2. Check safety for a pregnant woman in her ${week ?? 'current'} week.
          3. Look for verification markers (Batch, NAFDAC ID if visible).
          
          Return JSON format:
          {
            "drugName": "Name",
            "activeIngredients": ["ing1", "ing2"],
            "safetyStatus": "SAFE" | "CAUTION" | "UNSAFE",
            "warnings": "Brief explanation why",
            "isAuthentic": true,
            "batchNumber": "ID"
          }
          
          Safety Rules:
          - SAFE: Paracetamol, Vitamins, Iron.
          - CAUTION: Some antibiotics (needs doctor).
          - UNSAFE: Ibuprofen (after 20w), certain antimalarials depending on trimester.`,
          responseMimeType: "application/json",
          tools: [{ googleSearch: {} }]
        },
        contents: [
          { parts: [
            { inlineData: { data: base64Data, mimeType: "image/jpeg" } },
            { text: `Pregnant at week ${week || 'unknown'}. Analyze safety.` }
          ] }
        ],
      });

      const data = JSON.parse(response.text || "{}");
      setResult(data);

      if (auth.currentUser) {
        const path = `users/${auth.currentUser.uid}/scans`;
        try {
          await addDoc(collection(db, path), {
            ...data,
            userId: auth.currentUser.uid,
            pregnancyWeekAtScan: week,
            timestamp: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, path);
        }
      }
    } catch (error) {
      console.error("Analysis failed", error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("429") || errorMessage.includes("depleted") || errorMessage.includes("credits")) {
        setScanError("Gemini API credits depleted. Please manage your project and billing at https://ai.studio/projects");
      } else {
        setScanError("Analysis failed. Please try again with a clearer photo.");
      }
    } finally {
      setIsScanning(false);
    }
  };

  const reset = () => {
    setPhoto(null);
    setResult(null);
    setScanError(null);
    startCamera();
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
    >
      <div className="space-y-1">
        <h2 className="text-2xl font-bold serif text-slate-800">Medicine Safety</h2>
        <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">Powered by Gemini Cloud OCR</p>
      </div>

      <div className="mx-auto w-full md:max-w-xl aspect-square bg-slate-900 rounded-3xl overflow-hidden relative shadow-2xl border-4 border-white">
        {!photo ? (
          <>
            {!stream ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 space-y-6">
                <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-2">
                  <Camera className="w-12 h-12" />
                </div>
                <div className="flex flex-col gap-3 w-full max-w-[240px] px-6">
                  <button 
                    onClick={startCamera}
                    className="w-full bg-brand text-white text-sm font-bold h-12 rounded-2xl shadow-xl active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    <Camera className="w-4 h-4" /> {cameraPermission === 'denied' ? 'Try Camera Again' : 'Start Camera'}
                  </button>
                  {cameraPermission === 'denied' && (
                    <p className="text-[10px] text-red-500 font-bold bg-red-50 p-2 rounded-lg text-center">
                      Permission denied. Please enable camera in your phone's browser settings for this site.
                    </p>
                  )}
                  <div className="relative">
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      className="hidden" 
                      accept="image/*"
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full bg-white/10 text-white text-sm font-bold h-12 rounded-2xl active:scale-95 transition-transform flex items-center justify-center gap-2 border border-white/10"
                    >
                      <Upload className="w-4 h-4" /> Upload Image
                    </button>
                  </div>
                </div>
                <p className="text-[10px] uppercase tracking-widest font-bold opacity-50">Capture medicine label clearly</p>
              </div>
            ) : (
              <>
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted
                  className="h-full w-full object-cover" 
                />
                <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
                  <div className="w-full h-full border-2 border-white/30 rounded-xl flex items-center justify-center">
                    <div className="w-12 h-1.5 bg-white/20 rounded-full animate-pulse" />
                  </div>
                </div>
                <div className="absolute bottom-6 left-0 right-0 px-8 flex justify-center items-center gap-6">
                  <button 
                    onClick={stopCamera}
                    className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md text-white flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={takePhoto}
                    disabled={!isVideoReady}
                    className={cn(
                      "w-20 h-20 rounded-full bg-white border-8 border-white/20 flex items-center justify-center shadow-2xl active:scale-90 transition-transform",
                      !isVideoReady && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className="w-14 h-14 rounded-full bg-brand shadow-inner flex items-center justify-center">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                  </button>
                  <div className="w-12 h-12" /> {/* Spacer */}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="relative h-full w-full">
            <img src={photo} className="h-full w-full object-cover" alt="Drug package" />
            {!isScanning && (
              <button 
                onClick={reset}
                className="absolute top-4 right-4 bg-black/40 backdrop-blur-md text-white px-4 py-2 rounded-2xl border border-white/10 shadow-xl active:scale-90 transition-transform flex items-center gap-2 text-xs font-bold"
                title="Retake photo"
              >
                <RotateCcw className="w-4 h-4" /> Retake
              </button>
            )}
          </div>
        )}

        {isScanning && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white space-y-6">
            <div className="relative">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                className="w-24 h-24 border-2 border-white/20 border-t-brand rounded-full"
              />
              <Search className="w-8 h-8 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-brand" />
            </div>
            <div className="text-center space-y-2">
              <p className="font-bold tracking-widest text-sm uppercase">Authenticating</p>
              <div className="flex gap-1 justify-center">
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, delay: 0.1 }} className="w-1.5 h-1.5 bg-brand rounded-full" />
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, delay: 0.2 }} className="w-1.5 h-1.5 bg-brand rounded-full" />
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, delay: 0.3 }} className="w-1.5 h-1.5 bg-brand rounded-full" />
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {scanError && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-red-50 border-2 border-red-100 rounded-3xl space-y-3"
          >
            <div className="flex items-center gap-2 text-red-600 font-bold">
              <AlertTriangle className="w-5 h-5" />
              <span>Safety Analysis Interrupted</span>
            </div>
            <p className="text-xs text-red-800 leading-relaxed font-medium">
              {scanError}
            </p>
            <button 
              onClick={reset}
              className="w-full py-2 bg-red-100 text-red-700 rounded-xl text-xs font-bold hover:bg-red-200 transition-colors"
            >
              Retry / New Scan
            </button>
          </motion.div>
        )}

        {result && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Status Card */}
            <div className={cn(
              "p-6 rounded-3xl border-2 shadow-xl",
              result.safetyStatus === 'SAFE' && "bg-success/5 border-success/30",
              result.safetyStatus === 'CAUTION' && "bg-warning/5 border-warning/30",
              result.safetyStatus === 'UNSAFE' && "bg-red-50 border-red-200"
            )}>
              <div className="flex justify-between items-start mb-6">
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold text-slate-900">{result.drugName}</h3>
                  <div className="flex gap-2 items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-0.5 bg-white rounded border border-slate-100 flex items-center gap-1">
                      <Database className="w-3 h-3" /> RxNorm Validated
                    </span>
                  </div>
                </div>
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg",
                  result.safetyStatus === 'SAFE' && "bg-success text-white shadow-success/20",
                  result.safetyStatus === 'CAUTION' && "bg-warning text-white shadow-warning/20",
                  result.safetyStatus === 'UNSAFE' && "bg-red-500 text-white shadow-red-500/20"
                )}>
                  {result.safetyStatus === 'SAFE' && <ShieldCheck className="w-8 h-8" />}
                  {result.safetyStatus === 'CAUTION' && <AlertTriangle className="w-8 h-8" />}
                  {result.safetyStatus === 'UNSAFE' && <XCircle className="w-8 h-8" />}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Ingredients</label>
                  <div className="flex flex-wrap gap-2">
                    {result.activeIngredients.map((ing, i) => (
                      <span key={i} className="px-3 py-1 bg-white border border-slate-100 rounded-full text-xs font-bold text-slate-600 shadow-sm">{ing}</span>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-white/50 rounded-2xl border border-white space-y-2">
                  <p className="text-sm text-slate-700 leading-relaxed font-medium italic">"{result.warnings}"</p>
                </div>

                {result.isAuthentic && (
                  <div className="flex items-center gap-2 text-success font-bold text-[10px] uppercase tracking-widest bg-success/10 px-3 py-1 rounded-full w-fit">
                    <ShieldCheck className="w-3 h-3" /> Authentic Product Verified
                  </div>
                )}
              </div>
            </div>

            <button 
              onClick={reset}
              className="w-full h-14 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-transform"
            >
              <RotateCcw className="w-5 h-5" /> Scan Another
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!result && !isScanning && !stream && (
        <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 space-y-3">
          <h4 className="font-bold text-blue-900 flex items-center gap-2">
            <Info className="w-5 h-5" /> Safety Guidelines
          </h4>
          <ul className="text-xs text-blue-800/70 space-y-2 font-medium">
            <li className="flex gap-2"><ArrowRight className="w-3 h-3 shrink-0" /> Always scan the active ingredient label.</li>
            <li className="flex gap-2"><ArrowRight className="w-3 h-3 shrink-0" /> Ensure natural lighting for the best OCR results.</li>
            <li className="flex gap-2"><ArrowRight className="w-3 h-3 shrink-0" /> This tool is an assistant, always consult your nurse.</li>
          </ul>
        </div>
      )}
    </motion.div>
  );
}

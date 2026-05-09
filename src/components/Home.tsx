import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Play, 
  ChevronRight,
  Droplets,
  Utensils,
  Mic,
  Loader2,
  Plus,
  Stethoscope,
  RefreshCw
} from 'lucide-react';
import { cn } from '../lib/utils';
import { auth, db } from '../firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  updateDoc,
  deleteDoc,
  orderBy
} from 'firebase/firestore';
import { ai, MODELS } from '../lib/gemini';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { useSpeechRecognition, useSpeechSynthesis } from '../hooks/useSpeech';
import { useSettings } from '../hooks/useSettings';

interface Reminder {
  id: string;
  title: string;
  time: string;
  type: 'Medication' | 'Clinic' | 'Exercise' | 'General';
  isActive: boolean;
  color?: string;
  icon?: React.ComponentType<{className?: string}>;
}

interface VideoTip {
  title: string;
  channel: string;
  url: string;
  category: string;
}

const VIDEO_TIPS: VideoTip[] = [
  { title: "Healthy Pregnancy Diet & Nutrition", channel: "Global Health", url: "https://www.youtube.com/watch?v=k-a8jM9OUnY", category: "Nutrition" },
  { title: "Safe Pregnancy Exercises: 1st-3rd Trimester", channel: "Maternal Care", url: "https://www.youtube.com/watch?v=vVkaqX6m3L0", category: "Exercise" },
  { title: "Early Signs of Labor to Watch For", channel: "MamaHealth", url: "https://www.youtube.com/watch?v=S993mG3K-iY", category: "Medical" },
  { title: "Breastfeeding Basics for New African Mothers", channel: "HealthFirst", url: "https://www.youtube.com/watch?v=6PByYyFpXog", category: "Basics" },
  { title: "Newborn Daily Care & Hygiene", channel: "BabySafe", url: "https://www.youtube.com/watch?v=Xh7mOnS9-rM", category: "Newborn" }
];

export default function Home({ week, onNavigate }: { week: number | null, onNavigate?: (tab: 'home' | 'scan' | 'triage' | 'profile') => void }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newType, setNewType] = useState<Reminder['type']>('General');
  const [waterCups, setWaterCups] = useState(0);
  const [currentVideoIdx, setCurrentVideoIdx] = useState(0);
  const [learningStreak, setLearningStreak] = useState(0);
  const [activeDays, setActiveDays] = useState(0);
  const [userProfile, setUserProfile] = useState<Record<string, unknown> | null>(null);
  
  const { settings } = useSettings();
  const { speak } = useSpeechSynthesis();

  useEffect(() => {
    if (!auth.currentUser) return;

    const userRef = doc(db, 'users', auth.currentUser.uid);
    const profileUnsubscribe = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setUserProfile(data);
        const streakVal = Number(data.learningStreak) || 0;
        const activeVal = Number(data.activeStreak) || 0;
        const waterVal = Number(data.currentWaterCount) || 0;

        setLearningStreak(streakVal);
        setActiveDays(activeVal);
        
        const today = new Date().toISOString().split('T')[0];
        const lastDate = data.lastActiveDate as string | undefined;
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        const updateObj: Record<string, unknown> = {};

        // Active Days Streak
        if (!lastDate) {
          updateObj.activeStreak = 1;
          updateObj.lastActiveDate = today;
        } else if (lastDate !== today) {
          updateObj.lastActiveDate = today;
          updateObj.activeStreak = (lastDate === yesterdayStr) ? activeVal + 1 : 1;
        }

        // Learning Streak Reset
        if (data.lastLearningDate && data.lastLearningDate !== yesterdayStr && data.lastLearningDate !== today && streakVal > 0) {
          updateObj.learningStreak = 0;
        }

        // Water Streak Reset & Daily Count Reset
        if (data.lastWaterDate !== today) {
          if (waterCups !== 0) setWaterCups(0);
          updateObj.lastWaterDate = today;
          updateObj.currentWaterCount = 0;
          
          if (data.lastWaterGoalDate && data.lastWaterGoalDate !== yesterdayStr && data.lastWaterGoalDate !== today && (Number(data.waterStreak) || 0) > 0) {
            updateObj.waterStreak = 0;
          }
        } else {
          if (waterCups !== waterVal) setWaterCups(waterVal);
        }

        if (Object.keys(updateObj).length > 0) {
          updateDoc(userRef, updateObj).catch(() => {});
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}`);
    });

    const path = `users/${auth.currentUser.uid}/reminders`;
    const q = query(collection(db, path), orderBy('time', 'asc'));
    const remindersUnsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title,
          time: data.time,
          type: data.type,
          isActive: data.isActive,
          ...getTypeStyles(data.type)
        } as Reminder;
      });
      setReminders(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => {
      profileUnsubscribe();
      remindersUnsubscribe();
    };
  }, []);

  const refreshVideo = () => {
    setCurrentVideoIdx(prev => (prev + 1) % VIDEO_TIPS.length);
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newTime || !auth.currentUser) return;

    setIsProcessing(true);
    const path = `users/${auth.currentUser.uid}/reminders`;
    try {
      await addDoc(collection(db, path), {
        userId: auth.currentUser.uid,
        title: newTitle,
        time: newTime,
        type: newType,
        isActive: true,
        createdAt: serverTimestamp()
      });
      setIsAddModalOpen(false);
      setNewTitle('');
      setNewTime('');
      setNewType('General');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setIsProcessing(false);
    }
  };

  const seedDemoReminders = async () => {
    if (!auth.currentUser || isProcessing) return;
    setIsProcessing(true);
    const demoItems = [
      { title: 'Prenatal Vitamins', time: '08:00', type: 'Medication' },
      { title: 'Evening Walk', time: '17:30', type: 'Exercise' },
      { title: 'Fetal Kick Count', time: '20:00', type: 'General' }
    ];

    const path = `users/${auth.currentUser.uid}/reminders`;
    try {
      for (const item of demoItems) {
        await addDoc(collection(db, path), {
          userId: auth.currentUser.uid,
          ...item,
          isActive: true,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVideoClick = async (url: string) => {
    window.open(url, '_blank');
    if (!auth.currentUser || !userProfile) return;

    const userRef = doc(db, 'users', auth.currentUser.uid);
    const today = new Date().toISOString().split('T')[0];
    const lastLearningDate = userProfile.lastLearningDate;
    
    let newStreak = 1;
    if (lastLearningDate === today) {
      return; // Already learned today
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastLearningDate === yesterdayStr) {
      newStreak = (Number(userProfile.learningStreak) || 0) + 1;
    }

    try {
      await updateDoc(userRef, {
        learningStreak: newStreak,
        lastLearningDate: today
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    }
  };

  const handleWaterAdd = async () => {
    if (!auth.currentUser) return;
    const userRef = doc(db, 'users', auth.currentUser.uid);
    const newCount = (waterCups + 1);
    setWaterCups(newCount);

    const today = new Date().toISOString().split('T')[0];
    const updateData: Record<string, unknown> = {
      currentWaterCount: newCount,
      lastWaterDate: today
    };

    // If goal reached (e.g. 8 cups) for the first time today
    if (newCount === 8 && userProfile.lastWaterGoalDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      let newStreak = 1;
      if (userProfile.lastWaterGoalDate === yesterdayStr) {
        newStreak = (Number(userProfile.waterStreak) || 0) + 1;
      }
      
      updateData.waterStreak = newStreak;
      updateData.lastWaterGoalDate = today;
    }

    try {
      await updateDoc(userRef, updateData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    }
  };

  const deleteTask = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!auth.currentUser) return;
    const path = `users/${auth.currentUser.uid}/reminders/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const toggleTask = async (reminder: Reminder) => {
    if (!auth.currentUser) return;
    const path = `users/${auth.currentUser.uid}/reminders/${reminder.id}`;
    try {
      await updateDoc(doc(db, path), {
        isActive: !reminder.isActive,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const onVoiceResult = async (transcript: string) => {
    setIsProcessing(true);
    try {
      const response = await ai.models.generateContent({
        model: MODELS.flash,
        config: {
          systemInstruction: `Extract task details from the user's request.
          Return a JSON object with:
          {
            "title": "Short title",
            "time": "HH:mm format (24h)",
            "type": "Medication" | "Clinic" | "Exercise" | "General"
          }`,
          responseMimeType: "application/json"
        },
        contents: [{ parts: [{ text: transcript }] }]
      });

      const data = JSON.parse(response.text || "{}");
      if (data.title && data.time && auth.currentUser) {
        const path = `users/${auth.currentUser.uid}/reminders`;
        await addDoc(collection(db, path), {
          userId: auth.currentUser.uid,
          title: data.title,
          time: data.time,
          type: data.type || 'General',
          isActive: true,
          createdAt: serverTimestamp()
        });
        if (settings.enableTTS) {
          speak(`Reminder added for ${data.title} at ${formatTime(data.time)}`);
        }
      }
    } catch (error) {
      console.error("Voice Task Error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const { isRecording, startRecording, stopRecording } = useSpeechRecognition(onVoiceResult);

  const handleVoiceTask = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-8"
    >
      {/* Pregnancy Status Card */}
      <section className="relative overflow-hidden bg-brand rounded-3xl p-6 text-white shadow-xl shadow-brand/20">
        <div className="relative z-10 space-y-1">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white/70 text-xs font-bold uppercase tracking-widest">Current Progress</p>
              <h2 className="text-3xl font-bold serif leading-tight">
                {week !== null ? `Week ${week}` : 'Getting Started'}
              </h2>
            </div>
            <div className="bg-white/20 backdrop-blur-md p-3 rounded-2xl">
              <Calendar className="w-6 h-6" />
            </div>
          </div>
          <p className="text-white/80 text-sm max-w-[200px]">
            Your baby is now the size of a {week !== null ? getBabySize(week) : 'small seed'}.
          </p>
          <div className="pt-4 flex items-center gap-2">
            <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: week !== null ? `${(week/40) * 100}%` : '5%' }}
                className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
              />
            </div>
            <span className="text-[10px] font-mono">{week !== null ? Math.round((week/40) * 100) : 0}%</span>
          </div>
        </div>
        {/* Decorative circle */}
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
      </section>

      {/* Daily Reminders */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold serif text-slate-800">Daily Tasks</h3>
            {isProcessing && <Loader2 className="w-4 h-4 text-brand animate-spin" />}
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleVoiceTask}
              className={cn(
                "p-2 rounded-xl border flex items-center gap-2 transition-all active:scale-95 shadow-sm",
                isRecording ? "bg-red-500 text-white border-red-500 animate-pulse" : "bg-white text-brand border-slate-100"
              )}
            >
              <Mic className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">{isRecording ? 'Listening' : 'Voice Add'}</span>
            </button>
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="p-2 rounded-xl bg-slate-900 text-white shadow-lg active:scale-95"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {reminders.length === 0 && !isProcessing && (
            <div className="p-8 text-center bg-white rounded-3xl border border-dashed border-slate-200">
              <p className="text-sm text-slate-400 font-medium mb-4">No reminders yet.</p>
              <button 
                onClick={seedDemoReminders}
                className="text-xs font-bold text-brand border border-brand/20 px-4 py-2 rounded-xl hover:bg-brand/5 transition-colors"
              >
                Load Demo Reminders
              </button>
            </div>
          )}
          
          <AnimatePresence initial={false}>
            {reminders.map((task) => (
              <motion.div 
                layout
                key={task.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={() => toggleTask(task)}
                className={cn(
                  "group flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer active:scale-98",
                  !task.isActive 
                    ? "bg-success/5 border-success/20 opacity-60" 
                    : "bg-white border-slate-100 shadow-sm shadow-slate-200/50"
                )}
              >
                <div className={cn("p-3 rounded-xl shrink-0 transition-transform", task.color, !task.isActive && "scale-90")}>
                  {task.icon && <task.icon className="w-5 h-5" />}
                </div>
                <div className="flex-1">
                  <h4 className={cn("font-bold text-sm", !task.isActive && "line-through")}>
                    {task.title}
                  </h4>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                    <Clock className="w-3 h-3" /> {formatTime(task.time)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => deleteTask(e, task.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Plus className="w-4 h-4 rotate-45" />
                  </button>
                  <div className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                    !task.isActive ? "bg-success border-success" : "border-slate-200"
                  )}>
                    {!task.isActive && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </section>

      {/* Video Guide Section */}
      <section className="space-y-4 pt-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-sm md:text-base font-bold text-slate-800">Watch & Learn</h3>
              <p className="text-[10px] md:text-xs text-slate-400 font-medium italic">Watch these guides to stay safe and healthy</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] md:text-xs font-bold text-orange-600">🔥 {learningStreak}d streak</span>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <div 
                    key={d} 
                    className={cn(
                      "w-1.5 h-1.5 md:w-2 md:h-2 rounded-full transition-colors",
                      (learningStreak % 7 || (learningStreak > 0 ? 7 : 0)) >= d ? "bg-orange-500" : "bg-orange-200/50"
                    )} 
                  />
                ))}
              </div>
            </div>
          </div>
          <button 
            onClick={refreshVideo}
            className="p-2 md:p-3 rounded-xl bg-white border border-slate-100 text-brand shadow-sm active:rotate-180 transition-transform duration-500"
          >
            <RefreshCw className="w-3 h-3 md:w-4 md:h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-5">
          {[0, 1].map((offset) => {
            const idx = (currentVideoIdx + offset) % VIDEO_TIPS.length;
            const video = VIDEO_TIPS[idx];
            return (
              <motion.button
                key={idx}
                onClick={() => handleVideoClick(video.url)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: offset * 0.1 }}
                className="p-4 bg-white rounded-3xl border border-slate-100 flex items-center gap-3 shadow-sm hover:border-brand/30 transition-all active:scale-95 group text-left w-full"
              >
                <div className="w-10 h-10 rounded-2xl bg-brand text-white flex items-center justify-center shrink-0 shadow-lg shadow-brand/10">
                  <Play className="w-5 h-5 fill-current" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-bold text-brand uppercase tracking-widest mb-0.5">{video.category}</p>
                  <h4 className="text-xs font-bold text-slate-800 leading-tight truncate group-hover:text-brand transition-colors">
                    {video.title}
                  </h4>
                  <p className="text-[9px] text-slate-400 truncate">Tap to play</p>
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Quick Access Grid */}
      <section className="grid grid-cols-2 lg:grid-cols-2 gap-4 md:gap-6 pb-4">
        <button 
          onClick={handleWaterAdd}
          className="p-4 md:p-6 bg-white rounded-2xl md:rounded-[32px] border border-slate-100 shadow-sm space-y-3 text-left transition-all active:scale-95 group hover:border-blue-200"
        >
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
            <Droplets className="w-5 h-5 md:w-6 md:h-6 text-blue-500" />
          </div>
          <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest">Water Tracker</p>
          <div className="flex items-end justify-between">
            <span className="text-xl md:text-2xl font-bold">{waterCups} Cups</span>
            <span className="text-[10px] md:text-xs font-bold text-slate-300">/ 12</span>
          </div>
          <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
            <motion.div 
              animate={{ width: `${(Math.min(waterCups, 12) / 12) * 100}%` }}
              className="h-full bg-blue-500"
            />
          </div>
          <p className="text-[9px] md:text-[11px] text-slate-400 italic">Tap card to log 1 cup</p>
        </button>
        <button 
          onClick={() => onNavigate?.('profile')}
          className="p-4 md:p-6 bg-white rounded-2xl md:rounded-[32px] border border-slate-100 shadow-sm space-y-2 text-left transition-all active:scale-95 group hover:border-red-200 relative overflow-hidden"
        >
          <div className="flex items-center justify-between relative z-10">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-red-50 flex items-center justify-center group-hover:bg-red-100 transition-colors">
              <Calendar className="w-5 h-5 md:w-6 md:h-6 text-red-500" />
            </div>
            <div className="text-right">
              <span className="text-[10px] md:text-xs font-bold text-orange-600 block">🔥 Streak</span>
              <div className="flex gap-0.5 mt-1">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <div 
                    key={d} 
                    className={cn(
                      "w-1.5 h-1.5 md:w-2 md:h-2 rounded-full transition-colors",
                      (activeDays % 7 || (activeDays > 0 ? 7 : 0)) >= d ? "bg-orange-500" : "bg-slate-100"
                    )} 
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="pt-1 relative z-10">
            <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">Active Days</p>
            <div className="flex items-end justify-between mt-1">
              <span className="text-2xl md:text-3xl font-bold leading-none">{activeDays}</span>
              <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-slate-300 group-hover:text-red-500 transition-colors" />
            </div>
          </div>
          <p className="text-[9px] md:text-[11px] text-slate-400 italic relative z-10">Day {activeDays} of your journey</p>
        </button>
      </section>

      {/* Manual Task Add Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[40px] p-8 z-50 shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-slate-100 rounded-full mx-auto mb-8" />
              <h3 className="text-2xl font-bold serif text-slate-800 mb-6">New Reminder</h3>
              <form onSubmit={handleManualAdd} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">What to do?</label>
                  <input 
                    autoFocus
                    required
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g., Folic Acid Supplement"
                    className="w-full p-4 rounded-2xl bg-slate-50 border-none ring-1 ring-slate-100 focus:ring-2 focus:ring-brand transition-all text-sm font-medium"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">When?</label>
                    <input 
                      required
                      type="time"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="w-full p-4 rounded-2xl bg-slate-50 border-none ring-1 ring-slate-100 focus:ring-2 focus:ring-brand transition-all text-sm font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Category</label>
                    <select 
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as Reminder['type'])}
                      className="w-full p-4 rounded-2xl bg-slate-50 border-none ring-1 ring-slate-100 focus:ring-2 focus:ring-brand transition-all text-sm font-medium appearance-none"
                    >
                      <option value="Medication">Medication</option>
                      <option value="Clinic">Clinic Visit</option>
                      <option value="Exercise">Exercise</option>
                      <option value="General">General</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 p-4 rounded-2xl font-bold text-slate-400 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isProcessing}
                    className="flex-[2] p-4 bg-brand text-white rounded-2xl font-bold shadow-lg shadow-brand/20 active:scale-95 transition-transform disabled:opacity-50"
                  >
                    {isProcessing ? 'Adding...' : 'Create Reminder'}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function getTypeStyles(type: string) {
  switch (type) {
    case 'Medication':
      return { icon: Droplets, color: 'text-blue-500 bg-blue-50' };
    case 'Clinic':
      return { icon: Stethoscope, color: 'text-purple-500 bg-purple-50' };
    case 'Exercise':
      return { icon: Play, color: 'text-orange-500 bg-orange-50' };
    default:
      return { icon: Utensils, color: 'text-slate-500 bg-slate-50' };
  }
}

function formatTime(time: string) {
  if (!time) return '--:--';
  const [h, m] = time.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function getBabySize(week: number) {
  if (week < 5) return 'poppy seed';
  if (week < 10) return 'strawberry';
  if (week < 15) return 'lemon';
  if (week < 20) return 'banana';
  if (week < 25) return 'eggplant';
  if (week < 30) return 'cabbage';
  if (week < 35) return 'pineapple';
  return 'watermelon';
}


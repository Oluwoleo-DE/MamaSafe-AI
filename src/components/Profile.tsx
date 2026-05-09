import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  User, 
  Settings as SettingsIcon, 
  Calendar,
  Save,
  Check,
  Camera,
  ArrowRight,
  Droplets,
  Flame,
  Heart,
  Baby
} from 'lucide-react';
import { db, auth } from '../firebase';
import { updateProfile } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { User as FirebaseUser } from 'firebase/auth';

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export default function Profile({ user, onOpenSettings }: { user: FirebaseUser, onOpenSettings: () => void }) {
  const [pregnancyDate, setPregnancyDate] = useState('');
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [photoURL, setPhotoURL] = useState(user.photoURL || '');
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [stats, setStats] = useState({
    activeDays: 0,
    waterStreak: 0,
    healthScore: 85
  });

  const calculateWeek = () => {
    if (!pregnancyDate) return null;
    const start = new Date(pregnancyDate);
    const now = new Date();
    const diff = now.getTime() - start.getTime();
    const week = Math.floor(diff / (1000 * 60 * 60 * 24 * 7));
    return week > 0 && week <= 42 ? week : null;
  };

  const week = calculateWeek();
  const progress = week ? (week / 40) * 100 : 0;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        alert("Please pick a smaller image (max 1MB)");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setPhotoURL(base64);
        if (auth.currentUser) {
          try {
            await updateProfile(auth.currentUser, { photoURL: base64 });
            await setDoc(doc(db, 'users', auth.currentUser.uid), { photoURL: base64 }, { merge: true });
          } catch (err) {
            console.error("Failed to update profile pic:", err);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (!auth.currentUser) return;
    
    const path = `users/${auth.currentUser.uid}`;
    const userRef = doc(db, path);
    
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setPregnancyDate(data.pregnancyStartDate || '');
        setDisplayName(data.displayName || auth.currentUser?.displayName || '');
        setPhotoURL(data.photoURL || auth.currentUser?.photoURL || '');
        setStats({
          activeDays: data.activeStreak || 0,
          waterStreak: data.waterStreak || 0,
          healthScore: data.healthScore || 85
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return unsubscribe;
  }, [user]);

  const handleSave = async () => {
    setIsSaving(true);
    const path = `users/${user.uid}`;
    try {
      await setDoc(doc(db, path), {
        uid: user.uid,
        email: user.email,
        displayName,
        pregnancyStartDate: pregnancyDate,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-8"
    >
      <div className="flex flex-col items-center gap-4 py-8 relative">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-brand/5 to-transparent -z-10 rounded-b-[40px]" />
        
        <div className="relative group">
          <input 
            type="file" 
            ref={inputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept="image/*"
          />
          <div className="w-28 h-28 rounded-full border-4 border-white shadow-2xl relative overflow-hidden group-hover:scale-105 transition-transform duration-300">
            <img 
              src={photoURL || `https://ui-avatars.com/api/?name=${displayName}&background=4a6fa5&color=fff`} 
              className="w-full h-full object-cover" 
              alt="Profile" 
            />
            <div 
              onClick={() => inputRef.current?.click()}
              className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
            >
              <Camera className="text-white w-6 h-6" />
            </div>
          </div>
          <button 
            onClick={() => inputRef.current?.click()}
            className="absolute -right-1 -bottom-1 bg-brand text-white p-2.5 rounded-2xl shadow-lg active:scale-90 transition-transform z-10 border-2 border-white"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold text-slate-900 serif">{displayName || 'Mama'}</h2>
          <div className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <p className="text-sm text-slate-500 font-medium">Safe & Healthy</p>
          </div>
        </div>
      </div>

      {/* New Journey Progress Section */}
      {week !== null && (
        <section className="bg-brand/5 rounded-[32px] p-6 space-y-4 border border-brand/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Baby className="w-5 h-5 text-brand" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Your Journey</h3>
            </div>
            <span className="text-sm font-bold text-brand">Week {week}</span>
          </div>
          
          <div className="relative h-3 bg-slate-200/50 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="absolute top-0 left-0 h-full bg-brand rounded-full shadow-lg shadow-brand/20"
            />
          </div>
          
          <div className="flex justify-between text-[10px] font-bold text-slate-400">
            <span>START</span>
            <span>20 WEEKS</span>
            <span>DELIVERY</span>
          </div>
          
          <p className="text-[11px] text-slate-600 font-medium italic text-center pt-2">
            {week < 13 ? "First Trimester: Baby is developing vital organs." : 
             week < 27 ? "Second Trimester: You might start feeling baby move!" : 
             "Third Trimester: Almost there! Time to prepare for baby."}
          </p>
        </section>
      )}

      {/* Health Stats Grid */}
      <div className="grid grid-cols-3 gap-3 md:gap-6">
        {[
          { icon: Flame, label: 'Active', value: `${stats.activeDays}d`, color: 'text-orange-500', bg: 'bg-orange-50', streak: stats.activeDays },
          { icon: Droplets, label: 'Water', value: `${stats.waterStreak}d`, color: 'text-blue-500', bg: 'bg-blue-50', streak: stats.waterStreak },
          { icon: Heart, label: 'Health', value: `${stats.healthScore}%`, color: 'text-red-500', bg: 'bg-red-50', streak: 0 },
        ].map((item, i) => (
          <div key={i} className={cn("p-4 md:p-6 rounded-3xl flex flex-col items-center gap-2 border border-transparent hover:border-slate-200 transition-all cursor-default", item.bg)}>
            <item.icon className={cn("w-5 h-5 md:w-7 md:h-7", item.color)} />
            <div className="text-center">
              <p className="text-[14px] md:text-[18px] font-bold text-slate-900">{item.value}</p>
              <p className="text-[10px] md:text-[12px] font-medium text-slate-500">{item.label}</p>
            </div>
            {item.streak > 0 && (
              <div className="flex gap-0.5 mt-1 md:gap-1">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <div 
                    key={d} 
                    className={cn(
                      "w-1 h-1 md:w-1.5 md:h-1.5 rounded-full",
                      (item.streak % 7 || 7) >= d ? "bg-current opacity-70" : "bg-white opacity-40",
                      item.color
                    )} 
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-6 pt-2">
        <h3 className="text-sm font-bold text-slate-800 px-1 uppercase tracking-widest">Personal Info</h3>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-4">Full Name</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input 
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full h-14 pl-12 pr-4 bg-white border border-slate-100 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all text-sm font-medium"
                placeholder="Your Name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-4">Pregnancy Start Date</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input 
                type="date"
                value={pregnancyDate}
                onChange={(e) => setPregnancyDate(e.target.value)}
                className="w-full h-14 pl-12 pr-4 bg-white border border-slate-100 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all text-sm font-medium"
              />
            </div>
          </div>
        </div>

        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="w-full h-14 bg-brand text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-brand/20 active:scale-95 transition-all disabled:opacity-50"
        >
          {showSaved ? (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-2">
              <Check className="w-5 h-5" /> Profile Updated
            </motion.div>
          ) : (
            <>
              {isSaving ? <SettingsIcon className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Save Changes
            </>
          )}
        </button>

        <section className="pt-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 px-1 uppercase tracking-widest">Safety Milestones</h3>
          <div className="bg-white border border-slate-100 rounded-[32px] p-2 space-y-1">
            {[
              { label: 'Verified Profile', icon: Check, color: 'text-success', done: true },
              { label: 'Safety First Scan', icon: Camera, color: 'text-brand', done: true },
              { label: 'Health Goal Set', icon: Heart, color: 'text-red-500', done: false },
            ].map((milestone, i) => (
              <div key={i} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-2xl transition-colors">
                <div className="flex items-center gap-3">
                  <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-slate-100", milestone.done ? milestone.color : 'text-slate-200')}>
                    <milestone.icon className="w-4 h-4" />
                  </div>
                  <span className={cn("text-xs font-bold", milestone.done ? "text-slate-700" : "text-slate-300")}>{milestone.label}</span>
                </div>
                {milestone.done && <Check className="w-4 h-4 text-success" />}
              </div>
            ))}
          </div>
        </section>

        <section className="pt-4 space-y-3 pb-8">
          <button 
            onClick={onOpenSettings}
            className="w-full p-5 bg-white border border-slate-100 rounded-[32px] flex items-center justify-between group active:bg-slate-50 transition-all shadow-sm"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-brand/10 group-hover:text-brand transition-colors">
                <SettingsIcon className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-800">Account Preferences</p>
                <p className="text-[10px] text-slate-400 font-medium font-mono uppercase tracking-tight">Security & Language</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:translate-x-1 transition-all" />
          </button>
          
          <p className="text-[10px] text-slate-400 text-center font-medium px-8 italic">
            Your data is encrypted and stored securely to ensure your and your baby's privacy.
          </p>
        </section>
      </div>
    </motion.div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  Heart, 
  ScanLine, 
  MessageSquare, 
  User, 
  Bell, 
  ArrowRight,
  Stethoscope
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './lib/firestore-errors';
import { cn } from './lib/utils';

// Pages - defined here for simplicity in this draft, would be separate files in production
import Home from './components/Home';
import Triage from './components/Triage';
import Scanner from './components/Scanner';
import Profile from './components/Profile';
import Settings from './components/Settings';

type Tab = 'home' | 'scan' | 'triage' | 'profile' | 'settings';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [pregnancyWeek, setPregnancyWeek] = useState<number | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setLoading(false);
        return;
      }

      // Instead of getDoc, use onSnapshot for the profile to handle offline/flaky connections
      const userRef = doc(db, 'users', u.uid);
      const unsubscribeProfile = onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.pregnancyStartDate) {
            const start = new Date(data.pregnancyStartDate);
            const now = new Date();
            const diff = now.getTime() - start.getTime();
            const weeks = Math.floor(diff / (1000 * 60 * 60 * 24 * 7));
            setPregnancyWeek(weeks);
          }
        }
        setLoading(false);
      }, (error) => {
        console.error("Profile load error:", error);
        // Still set loading false so app can start in some state
        setLoading(false);
      });

      return () => unsubscribeProfile();
    });
    return unsubscribeAuth;
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(setNotificationPermission);
      }
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        new Notification("Notifications Enabled", {
          body: "You'll now receive safety alerts and health reminders.",
          icon: "/icon-192x192.png"
        });
      }
    } else {
      alert("Notifications are not supported in this browser.");
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-brand-light">
        <motion.div 
          animate={{ scale: [1, 1.2, 1] }} 
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-brand flex flex-col items-center gap-4"
        >
          <Heart className="w-12 h-12 fill-current" />
          <p className="font-medium text-slate-600">MamaSafe AI is loading...</p>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-brand-light flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm w-full space-y-8"
        >
          <div className="space-y-2">
            <div className="mx-auto w-20 h-20 bg-brand rounded-3xl flex items-center justify-center shadow-xl mb-6">
              <Heart className="w-10 h-10 text-white fill-current" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 serif">MamaSafe AI</h1>
            <p className="text-slate-600 px-4">Your pocket-sized guardian for a safe and healthy pregnancy.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 text-left py-4">
            <FeatureItem icon={Stethoscope} title="AI Symptom Triage" desc="Voice or text chat to check symptoms." />
            <FeatureItem icon={ScanLine} title="Medicine Scanner" desc="Verify drug safety for you and baby." />
            <FeatureItem icon={Bell} title="Smart Reminders" desc="Never miss a clinic visit or vitamin." />
          </div>

          <button 
            onClick={handleLogin}
            className="w-full h-14 bg-brand text-white rounded-2xl font-semibold shadow-lg shadow-brand/20 active:scale-95 transition-transform flex items-center justify-center gap-3"
          >
            Get Started <ArrowRight className="w-5 h-5" />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-50 flex flex-col w-full md:max-w-2xl lg:max-w-3xl mx-auto relative overflow-hidden shadow-2xl md:my-0 lg:my-0 border-x border-slate-100">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between bg-white border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-brand rounded-xl flex items-center justify-center transition-all">
            <Heart className="w-5 h-5 md:w-6 md:h-6 text-white fill-current" />
          </div>
          <span className="font-bold text-lg md:text-xl serif tracking-tight">MamaSafe</span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={requestNotificationPermission}
            className={cn(
              "w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all",
              notificationPermission === 'granted' ? "bg-brand/10 text-brand" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
            title="Enable Notifications"
          >
            <Bell className={cn("w-4 h-4 md:w-5 md:h-5", notificationPermission === 'granted' && "fill-current")} />
          </button>
          {pregnancyWeek !== null && (
            <div className="bg-success/10 text-success text-[10px] md:text-[11px] font-bold px-2 py-1 md:px-3 md:py-1.5 rounded-full uppercase tracking-wider">
              Week {pregnancyWeek}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-28 md:pb-32">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && <Home key="home" week={pregnancyWeek} onNavigate={setActiveTab} />}
          {activeTab === 'scan' && <Scanner key="scan" week={pregnancyWeek} />}
          {activeTab === 'triage' && <Triage key="triage" />}
          {activeTab === 'profile' && <Profile key="profile" user={user} onOpenSettings={() => setActiveTab('settings')} />}
          {activeTab === 'settings' && <Settings key="settings" onBack={() => setActiveTab('profile')} />}
        </AnimatePresence>
      </main>

      {/* Bottom Nav */}
      <div className="absolute bottom-6 left-0 right-0 px-6 pointer-events-none">
        <nav className="h-16 md:h-20 bg-white/90 backdrop-blur-md rounded-[24px] border border-slate-200 shadow-2xl flex items-center justify-around px-2 pointer-events-auto max-w-lg mx-auto">
          <NavButton active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon={Heart} label="Healthy" />
          <NavButton active={activeTab === 'triage'} onClick={() => setActiveTab('triage')} icon={MessageSquare} label="Triage" />
          <NavButton active={activeTab === 'scan'} onClick={() => setActiveTab('scan')} icon={ScanLine} label="Scan" />
          <NavButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={User} label="Me" />
        </nav>
      </div>
    </div>
  );
}

function FeatureItem({ icon: Icon, title, desc }: { icon: React.ComponentType<{className?: string}>, title: string, desc: string }) {
  return (
    <div className="flex gap-4 items-start group">
      <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
        <Icon className="w-5 h-5 text-brand" />
      </div>
      <div>
        <h3 className="font-semibold text-slate-800 leading-none mb-1">{title}</h3>
        <p className="text-xs text-slate-500 leading-tight">{desc}</p>
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: React.ComponentType<{className?: string}>, label: string }) {
  return (
    <button 
      onClick={onClick} 
      aria-label={label}
      className="flex flex-col items-center gap-1 w-12 pt-1"
    >
      <div className={cn(
        "p-2 rounded-xl transition-colors",
        active ? "bg-brand/10 text-brand" : "text-slate-400 hover:text-slate-600"
      )}>
        <Icon className={cn("w-5 h-5", active && "fill-current")} />
      </div>
      <span className={cn("text-[10px] font-bold uppercase tracking-tighter", active ? "text-brand" : "text-slate-400")}>
        {label}
      </span>
    </button>
  );
}

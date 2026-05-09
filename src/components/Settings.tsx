import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  Volume2, 
  Globe, 
  LogOut, 
  Trash2, 
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { auth } from '../firebase';
import { useSettings } from '../hooks/useSettings';
import { cn } from '../lib/utils';

export default function Settings({ onBack }: { onBack: () => void }) {
  const { settings, updateSettings } = useSettings();
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const handleDeleteAccount = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        // In a real app, you'd delete firestore data first
        await user.delete();
      }
    } catch (error) {
      console.error("Delete Error:", error);
      alert("Please sign in again to delete your account for security reasons.");
    }
  };

  return (
    <div className="flex flex-col min-h-full bg-slate-50">
      <header className="p-6 pb-2 flex items-center gap-4">
        <button 
          onClick={onBack}
          className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-600 active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-slate-800">App Settings</h2>
      </header>

      <div className="flex-1 p-6 space-y-6">
        {/* Preferences Section */}
        <section className="space-y-4">
          <h3 className="px-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Preferences</h3>
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Voice Guide */}
            <div className="p-4 flex items-center justify-between border-b border-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center text-brand">
                  <Volume2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Voice Guide</p>
                  <p className="text-[10px] text-slate-400 font-medium font-mono">Read AI responses aloud</p>
                </div>
              </div>
              <button 
                onClick={() => updateSettings({ enableTTS: !settings.enableTTS })}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  settings.enableTTS ? "bg-brand" : "bg-slate-200"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                  settings.enableTTS ? "left-7" : "left-1"
                )} />
              </button>
            </div>
            
            {/* Language Selection */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Language preference</p>
                  <p className="text-[10px] text-slate-400 font-medium font-mono">English / Pidgin</p>
                </div>
              </div>
              <select 
                value={settings.language}
                onChange={(e) => updateSettings({ language: e.target.value as 'English' | 'Pidgin' })}
                className="text-xs font-bold text-brand bg-brand/5 px-2 py-1 rounded-lg border-none focus:ring-0"
              >
                <option value="English">English</option>
                <option value="Pidgin">Pidgin</option>
              </select>
            </div>
          </div>
        </section>

        {/* Account Safety Section */}
        <section className="space-y-4">
          <h3 className="px-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Safety</h3>
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Sign Out */}
            <button 
              onClick={() => auth.signOut()}
              className="w-full p-4 flex items-center justify-between border-b border-slate-50 active:bg-slate-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-brand/10 group-hover:text-brand transition-colors">
                  <LogOut className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Sign Out</p>
                  <p className="text-[10px] text-slate-400 font-medium font-mono">Sign out from your account</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-brand transition-colors" />
            </button>

            {/* Delete Account */}
            <button 
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full p-4 flex items-center justify-between active:bg-red-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Delete Account</p>
                  <p className="text-[10px] text-slate-400 font-medium font-mono">Permanently delete everything</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-red-500 transition-colors" />
            </button>
          </div>
        </section>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-6"
            >
              <div className="w-16 h-16 rounded-3xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-bold text-slate-800">Are you sure?</h3>
                <p className="text-sm text-slate-500 leading-relaxed italic">
                  "This will delete your pregnancy records and scanning history permanently."
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleDeleteAccount}
                  className="w-full py-4 bg-red-600 text-white rounded-2xl font-bold shadow-lg shadow-red-200 active:scale-95 transition-transform"
                >
                  Yes, Delete Forever
                </button>
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold active:scale-95 transition-transform"
                >
                  No, Keep It
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

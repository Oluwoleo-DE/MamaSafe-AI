import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, 
  Send, 
  AlertTriangle, 
  CheckCircle, 
  Info,
  Loader2
} from 'lucide-react';
import { ai, MODELS } from '../lib/gemini';
import { cn } from '../lib/utils';
import { auth, db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { useSpeechRecognition, useSpeechSynthesis } from '../hooks/useSpeech';
import { useSettings } from '../hooks/useSettings';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  category?: 'Routine' | 'Urgent' | 'Emergency';
}

export default function Triage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello Mama! I'm your health guardian. How are you feeling today? You can type or send a voice message in English or Pidgin." }
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { settings } = useSettings();
  const { speak, isSupported: isTtsSupported } = useSpeechSynthesis();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    // Auto-read the latest assistant message if it's the last one
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && isTtsSupported && settings.enableTTS) {
      speak(lastMessage.content);
    }
  }, [messages, isTtsSupported, speak, settings.enableTTS]);

  const handleSend = async (text: string = input) => {
    const sanitizedText = text.trim();
    if (!sanitizedText || isProcessing) return;
    if (sanitizedText.length > 2000) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Input message is too long. Please summarize your symptoms." }]);
      return;
    }

    const userMessage: Message = { role: 'user', content: sanitizedText };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      const response = await ai.models.generateContent({
        model: MODELS.flash,
        config: {
          systemInstruction: `You are MamaSafe AI, a maternal health guardian.
          Analyze inputs which can be symptoms or reminder requests.
          
          Category: [Routine/Urgent/Emergency/Reminder]
          Response: [Warm, sensitive advice or confirmation in English or Pidgin]
          TaskDetails: [JSON object { "title": string, "time": "HH:mm", "type": "Medication" | "Clinic" | "Exercise" | "General" } IF Category is Reminder]
          
          Guidelines:
          - Symptoms: Routine (normal), Urgent (see doctor), Emergency (HOSPITAL NOW).
          - Reminders: User wanting to be reminded of meds, clinic visits, or health tasks.
          - Never give medical diagnoses.`,
          tools: [{ googleSearch: {} }]
        },
        contents: [
          ...messages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
          { role: 'user', parts: [{ text: sanitizedText }] }
        ],
      });

      const fullResponse = response.text || "I'm sorry, I couldn't process that.";
      
      let category: 'Routine' | 'Urgent' | 'Emergency' | 'Reminder' = 'Routine';
      if (fullResponse.toLowerCase().includes('emergency')) category = 'Emergency';
      else if (fullResponse.toLowerCase().includes('urgent')) category = 'Urgent';
      else if (fullResponse.toLowerCase().includes('reminder')) category = 'Reminder';

      const assistantMessage: Message = { 
        role: 'assistant', 
        content: fullResponse.split('Response:')[1]?.split('TaskDetails:')[0]?.trim() || fullResponse,
        category: category as 'Routine' | 'Urgent' | 'Emergency'
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (auth.currentUser) {
        if (category === 'Reminder') {
          const taskMatch = fullResponse.match(/TaskDetails:\s*(\{.*\})/);
          if (taskMatch) {
            try {
              const details = JSON.parse(taskMatch[1]);
              const path = `users/${auth.currentUser.uid}/reminders`;
              await addDoc(collection(db, path), {
                userId: auth.currentUser.uid,
                title: (details.title || "Health Task").slice(0, 200),
                time: details.time || "09:00",
                type: details.type || 'General',
                isActive: true,
                createdAt: serverTimestamp()
              });
            } catch (e) {
              console.error("Task Parse Error", e);
            }
          }
        } else {
          const path = `users/${auth.currentUser.uid}/triageLogs`;
          try {
            await addDoc(collection(db, path), {
              userId: auth.currentUser.uid,
              symptoms: sanitizedText.slice(0, 5000),
              category,
              advice: assistantMessage.content.slice(0, 5000),
              timestamp: serverTimestamp()
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, path);
          }
        }
      }
    } catch (error) {
      console.error("AI Triage Error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      let responseContent = "There was an error communicating with the health system. If you feel severe pain, please go to the clinic.";
      
      if (errorMessage.includes("429") || errorMessage.includes("depleted") || errorMessage.includes("credits")) {
        responseContent = "Our AI system is currently resting (credits depleted). Please manage your project billing at ai.studio/projects. In the meantime, if you have health concerns, please consult your nearest nurse or doctor.";
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: responseContent }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const { isRecording, startRecording, stopRecording } = useSpeechRecognition((text) => handleSend(text));

  const handleMicClick = () => {
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
      className="flex flex-col h-full bg-white relative"
    >
      {/* Risk Banner */}
      <AnimatePresence>
        {messages.some(m => m.category === 'Emergency') && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-500 text-white p-3 text-center text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 animate-pulse" />
            Extreme Hazard: Visit Clinic Immediately
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
              "flex flex-col max-w-[85%]",
              msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
            )}
          >
            <div className={cn(
              "p-4 rounded-2xl text-sm leading-relaxed shadow-sm",
              msg.role === 'user' 
                ? "bg-brand text-white rounded-tr-none" 
                : "bg-slate-100 text-slate-800 rounded-tl-none",
              msg.category === 'Emergency' && "bg-red-50 border-2 border-red-200 text-red-900",
              msg.category === 'Urgent' && "bg-orange-50 border-2 border-orange-200 text-orange-900"
            )}>
              {msg.content}
              {msg.category && (
                <div className="mt-3 pt-3 border-t border-black/5 flex items-center gap-2">
                  {msg.category === 'Emergency' && <AlertTriangle className="w-4 h-4" />}
                  {msg.category === 'Urgent' && <Info className="w-4 h-4" />}
                  {msg.category === 'Routine' && <CheckCircle className="w-4 h-4" />}
                  <span className="text-[10px] font-black uppercase tracking-widest">{msg.category}</span>
                </div>
              )}
            </div>
          </motion.div>
        ))}
        {isProcessing && (
          <div className="flex items-center gap-2 text-slate-400 text-xs font-medium bg-slate-50 px-3 py-2 rounded-full w-fit">
            <Loader2 className="w-3 h-3 animate-spin text-brand" />
            AI is analyzing...
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-6 bg-white border-t border-slate-100">
        <div className="flex gap-2 items-center">
          <button 
            onClick={handleMicClick}
            className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-md active:scale-90",
              isRecording ? "bg-red-500 text-white animate-pulse" : "bg-slate-100 text-slate-600"
            )}
          >
            <Mic className="w-5 h-5" />
          </button>
          <div className="flex-1 relative">
            <input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="How are you feeling?"
              className="w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand text-sm"
            />
            <button 
              onClick={() => handleSend()}
              className="absolute right-2 top-1.5 w-9 h-9 bg-brand text-white rounded-xl flex items-center justify-center shadow-lg active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-4 font-medium uppercase tracking-tighter">
          Voice support enabled for English and local dialects
        </p>
      </div>
    </motion.div>
  );
}

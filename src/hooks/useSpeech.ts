import { useState, useCallback, useRef } from 'react';

// --- Speech Recognition ---
interface UseSpeechRecognitionReturn {
  isRecording: boolean;
  transcript: string;
  startRecording: () => void;
  stopRecording: () => void;
  isSupported: boolean;
}

export function useSpeechRecognition(onResult?: (text: string) => void): UseSpeechRecognitionReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const isSupported = typeof window !== 'undefined' && (
    'SpeechRecognition' in window || 
    'webkitSpeechRecognition' in window
  );

  const startRecording = useCallback(() => {
    if (!isSupported) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionConstructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionConstructor() as SpeechRecognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const current = event.resultIndex;
      const text = event.results[current][0].transcript;
      setTranscript(text);
      if (event.results[current].isFinal && onResult) {
        onResult(text);
      }
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);

    recognition.start();
    recognitionRef.current = recognition;
  }, [isSupported, onResult]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  return { isRecording, transcript, startRecording, stopRecording, isSupported };
}

// --- Speech Synthesis ---
interface UseSpeechSynthesisReturn {
  speak: (text: string) => void;
  cancel: () => void;
  isSpeaking: boolean;
  isSupported: boolean;
}

export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSupported = typeof window !== 'undefined' && !!window.speechSynthesis;

  const speak = useCallback((text: string) => {
    if (!isSupported) return;
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Attempt to find a warm, natural voice if available
    const voices = window.speechSynthesis.getVoices();
    // Prioritize natural sounding premium/mobile voices
    const preferredVoice = voices.find(v => 
      v.name.includes('Google UK English Female') || 
      v.name.includes('en-GB-Wavenet-A') ||
      v.name.includes('Premium') ||
      v.name.includes('Samantha') ||
      (v.lang === 'en-GB' && v.name.includes('Female'))
    );
    
    if (preferredVoice) utterance.voice = preferredVoice;
    
    utterance.rate = 0.85; // Slightly slower for warm, motherly tone
    utterance.pitch = 1.05; // Gentle feminine lift
    utterance.volume = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [isSupported]);

  const cancel = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [isSupported]);

  return { speak, cancel, isSpeaking, isSupported };
}

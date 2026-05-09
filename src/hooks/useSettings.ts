import { useState, useEffect } from 'react';

interface AppSettings {
  enableTTS: boolean;
  language: 'English' | 'Pidgin';
}

const STORAGE_KEY = 'mamasafe_settings';

const defaultSettings: AppSettings = {
  enableTTS: true,
  language: 'English',
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : defaultSettings;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  return { settings, updateSettings };
}

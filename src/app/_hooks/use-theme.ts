"use client";

import { useState, useEffect } from "react";

type Theme = 'light' | 'dark' | 'system';

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  // システムのダークモード設定を取得
  const getSystemTheme = (): 'light' | 'dark' => {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  // 実際に適用されるテーマを取得
  const getEffectiveTheme = (): 'light' | 'dark' => {
    return theme === 'system' ? getSystemTheme() : theme;
  };

  // HTMLにdarkクラスを適用/削除
  const applyTheme = (effectiveTheme: 'light' | 'dark') => {
    if (typeof window === 'undefined') return;
    
    const root = window.document.documentElement;
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  };

  // ローカルストレージからテーマを読み込み
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
      setTheme(savedTheme);
    }
    setMounted(true);
  }, []);

  // テーマが変更されたときにHTMLクラスを更新
  useEffect(() => {
    if (!mounted) return;
    
    const effectiveTheme = getEffectiveTheme();
    applyTheme(effectiveTheme);
  }, [theme, mounted]);

  // システム設定の変更を監視
  useEffect(() => {
    if (typeof window === 'undefined' || theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const effectiveTheme = getEffectiveTheme();
      applyTheme(effectiveTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, mounted]);

  // テーマを変更する関数
  const changeTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', newTheme);
    }
  };

  return {
    theme,
    effectiveTheme: getEffectiveTheme(),
    changeTheme,
    mounted,
  };
};

import { useState } from 'react';

interface ToastState {
  message: string;
  type: 'success' | 'error';
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const showSuccess = (message: string) => {
    setToast({ message, type: 'success' });
  };

  const showError = (message: string) => {
    setToast({ message, type: 'error' });
  };

  const hideToast = () => {
    setToast(null);
  };

  return {
    toast,
    showToast,
    showSuccess,
    showError,
    hideToast,
  };
}

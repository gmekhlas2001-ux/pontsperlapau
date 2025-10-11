import { useEffect } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}

export function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-4 right-4 z-[60] animate-slide-in">
      <div
        className={`flex items-center gap-3 px-6 py-4 rounded-xl shadow-lg min-w-[300px] max-w-md ${
          type === 'success'
            ? 'bg-green-50 border border-green-200'
            : 'bg-red-50 border border-red-200'
        }`}
      >
        {type === 'success' ? (
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
        ) : (
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
        )}
        <p
          className={`flex-1 font-medium ${
            type === 'success' ? 'text-green-900' : 'text-red-900'
          }`}
        >
          {message}
        </p>
        <button
          onClick={onClose}
          className={`p-1 rounded-lg transition-colors ${
            type === 'success'
              ? 'hover:bg-green-100 text-green-600'
              : 'hover:bg-red-100 text-red-600'
          }`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

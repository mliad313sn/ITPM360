'use client';

// Toasts + promise-based confirm dialog: replaces alert()/confirm() with
// consistent, modern in-app feedback.

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Button, cx } from '@/components/ui';

type Toast = { id: number; kind: 'success' | 'error' | 'info'; message: string };
type ConfirmOptions = { title: string; body?: string; confirmLabel?: string; danger?: boolean };

interface FeedbackApi {
  toast: (kind: Toast['kind'], message: string) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackApi>({
  toast: () => {},
  confirm: async () => false,
});

export const useFeedback = () => useContext(FeedbackContext);

const kindStyles: Record<Toast['kind'], string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  info: 'border-slate-200 bg-white text-slate-700',
};

const kindIcon: Record<Toast['kind'], string> = { success: '✓', error: '✕', info: 'ℹ' };

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const idRef = useRef(0);

  const toast = useCallback((kind: Toast['kind'], message: string) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...opts, resolve })),
    []
  );

  const settle = (value: boolean) => {
    dialog?.resolve(value);
    setDialog(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg shadow-slate-900/5',
              kindStyles[t.kind]
            )}
          >
            <span className="mt-0.5 text-xs font-bold">{kindIcon[t.kind]}</span>
            <span className="flex-1">{t.message}</span>
          </div>
        ))}
      </div>

      {dialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => settle(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900">{dialog.title}</h2>
            {dialog.body && <p className="mt-2 text-sm text-slate-500">{dialog.body}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => settle(false)} autoFocus>
                Cancel
              </Button>
              <Button variant={dialog.danger ? 'danger' : 'primary'} onClick={() => settle(true)}>
                {dialog.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

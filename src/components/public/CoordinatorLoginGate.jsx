import { useState } from 'react';
import Button from '../ui/Button';
import { verifyCoordinatorPasscode } from '../../utils/publicPublish';

export default function CoordinatorLoginGate({ onUnlock }) {
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await verifyCoordinatorPasscode(passcode);
      onUnlock?.();
    } catch (err) {
      setError(err?.message || 'Verification failed. Please check your passcode.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-lg text-white shadow-sm">
            🔒
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
              Timetable Studio
            </p>
            <h1 className="text-lg font-bold text-slate-900">Coordinator Login</h1>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-600">
          Coordinator mode allows editing master data, regenerating schedules, and publishing to the
          live student &amp; faculty portal. Enter the coordinator passcode to continue.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="coordinator-passcode"
              className="block text-xs font-semibold text-slate-700"
            >
              Coordinator Passcode
            </label>
            <input
              id="coordinator-passcode"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={passcode}
              onChange={(e) => {
                setPasscode(e.target.value);
                if (error) setError('');
              }}
              placeholder="Enter coordinator passcode"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-1">
            <a
              href="?"
              className="text-xs font-medium text-slate-600 transition hover:text-slate-900"
            >
              ← Back to Public Portal
            </a>
            <Button type="submit" disabled={loading || !passcode.trim()}>
              {loading ? 'Verifying…' : 'Unlock Studio'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

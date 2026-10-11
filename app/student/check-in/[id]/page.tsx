'use client';

// app/student/check-in/[id]/page.tsx
//
// The check-in flow. Order of operations mirrors routes/attendance.js:
// session live → enrolled → not already checked in → mock-GPS → accuracy
// → TOTP → distance. The server remains the authority; we pre-check so the
// student sees a useful message instead of a raw 400.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { api, isApiError } from '@/lib/api';
import { RequireAuth, useAuth } from '@/lib/auth';
import {
  getCurrentFix,
  isGeolocationFailure,
  type GeolocationFailure,
} from '@/lib/geolocation';
import { Alert, AlertFromError } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { Input } from '@/components/Input';
import { Badge, LiveBadge } from '@/components/Badge';
import { Spinner, FullPageSpinner } from '@/components/Spinner';
import { EmptyState } from '@/components/EmptyState';
import type {
  ActiveSession,
  ApiError,
  CheckInResponse,
  GeolocationFix,
  QrPayload,
} from '@/lib/types';

// From config/index.js defaults — matches MAX_GPS_ACCURACY_METERS.
const MAX_ACCURACY_METERS = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Page wrapper
// ─────────────────────────────────────────────────────────────────────────────

export default function CheckInPage() {
  return (
    <RequireAuth allow="student">
      <CheckIn />
    </RequireAuth>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CheckIn() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = Number(params.id);

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return (
      <Shell>
        <EmptyState
          icon="search"
          title="Invalid session link"
          description="The session id in the URL is not valid."
          action={
            <Link href="/student" className="text-xs text-brand-600">
              ← Back to sessions
            </Link>
          }
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <CheckInFlow sessionId={sessionId} onBack={() => router.push('/student')} />
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell — shared header
// ─────────────────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Check in</p>
            <p className="truncate text-xs text-slate-500">
              {user?.full_name}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => logout()}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The actual flow
// ─────────────────────────────────────────────────────────────────────────────

function CheckInFlow({
  sessionId,
  onBack,
}: {
  sessionId: number;
  onBack: () => void;
}) {
  // ── Session info (verified against /sessions/active) ──────────────────────
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [sessionErr, setSessionErr] = useState<ApiError | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  // ── GPS ──────────────────────────────────────────────────────────────────
  const [fix, setFix] = useState<GeolocationFix | null>(null);
  const [gpsErr, setGpsErr] = useState<GeolocationFailure | null>(null);
  const [gpsLoading, setGpsLoading] = useState(true);

  // ── Code ─────────────────────────────────────────────────────────────────
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMismatch, setScanMismatch] = useState<number | null>(null);
  const [manualMode, setManualMode] = useState(false);

  // ── Submit ───────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CheckInResponse | null>(null);
  const [submitErr, setSubmitErr] = useState<ApiError | null>(null);

  // ── Verify the session is live + student is enrolled ─────────────────────
  useEffect(() => {
    const controller = new AbortController();
    setSessionLoading(true);
    api.sessions
      .active({ signal: controller.signal })
      .then((res) => {
        const found = res.sessions.find((s) => s.session_id === sessionId);
        if (!found) {
          setSessionErr({
            status: 404,
            error:
              'This session is not active, or you are not enrolled in its course.',
          });
        } else {
          setSession(found);
        }
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (isApiError(e)) setSessionErr(e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSessionLoading(false);
      });
    return () => controller.abort();
  }, [sessionId]);

  // ── GPS fetch ────────────────────────────────────────────────────────────
  const fetchFix = useCallback(async () => {
    setGpsLoading(true);
    setGpsErr(null);
    try {
      const f = await getCurrentFix();
      setFix(f);
    } catch (e) {
      if (isGeolocationFailure(e)) setGpsErr(e);
      else setGpsErr({ code: 'POSITION_UNAVAILABLE', message: 'Unknown GPS error.' });
    } finally {
      setGpsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFix();
  }, [fetchFix]);

  // ── Derived state ────────────────────────────────────────────────────────
  const accuracyTooWeak =
    fix !== null && fix.accuracy > MAX_ACCURACY_METERS;

  const codeValid = /^\d{6}$/.test(code);

  const canSubmit = useMemo(() => {
    if (!session || session.already_checked_in) return false;
    if (!fix) return false;
    if (fix.is_mock_location) return false;
    if (accuracyTooWeak) return false;
    if (!codeValid) return false;
    if (scanMismatch !== null) return false;
    return true;
  }, [session, fix, accuracyTooWeak, codeValid, scanMismatch]);

  // ── Submit ───────────────────────────────────────────────────────────────
  async function onSubmit() {
    if (!canSubmit || !fix || submitting) return;
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const res = await api.attendance.checkIn({
        session_id: sessionId,
        totp_code: code,
        student_lat: fix.latitude,
        student_lon: fix.longitude,
        accuracy: fix.accuracy,
        is_mock_location: fix.is_mock_location,
      });
      setResult(res);
    } catch (e) {
      if (isApiError(e)) setSubmitErr(e);
      else setSubmitErr({ status: 0, error: 'Unexpected error. Try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render states ────────────────────────────────────────────────────────
  if (sessionLoading) return <FullPageSpinner label="Verifying session…" />;

  if (sessionErr) {
    return (
      <>
        <AlertFromError error={sessionErr} className="mb-4" />
        <Button variant="secondary" onClick={onBack} fullWidth>
          ← Back to sessions
        </Button>
      </>
    );
  }

  if (!session) return null;

  // ── Already checked in ───────────────────────────────────────────────────
  if (session.already_checked_in && !result) {
    return (
      <>
        <Alert tone="success" title="You're already checked in." />
        <div className="mt-4">
          <Link href="/student/history">
            <Button variant="secondary" fullWidth>
              View my history
            </Button>
          </Link>
        </div>
        <div className="mt-2">
          <Button variant="ghost" fullWidth onClick={onBack}>
            ← Back to sessions
          </Button>
        </div>
      </>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (result) {
    const isLate = result.attendance_status === 'Late';
    return (
      <>
        <Alert
          tone={isLate ? 'warning' : 'success'}
          title={result.message}
          details={[
            `Distance from lecturer: ${result.distance_meters.toFixed(1)}m`,
            `Recorded at ${new Date(result.check_in_time).toLocaleTimeString()}`,
          ]}
        />
        <div className="mt-4 space-y-2">
          <Link href="/student/history">
            <Button fullWidth>View my history</Button>
          </Link>
          <Button variant="secondary" fullWidth onClick={onBack}>
            ← Back to sessions
          </Button>
        </div>
      </>
    );
  }

  // ── Main form ────────────────────────────────────────────────────────────
  return (
    <>
      <SessionHeader session={session} />

      {/* ─── GPS ─── */}
      <Card className="mt-4">
        <CardHeader
          title="Step 1 · Your location"
          right={
            gpsLoading ? (
              <Spinner size="sm" />
            ) : gpsErr ? (
              <Badge tone="red">Error</Badge>
            ) : fix?.is_mock_location ? (
              <Badge tone="red">Mock detected</Badge>
            ) : accuracyTooWeak ? (
              <Badge tone="amber">Weak signal</Badge>
            ) : (
              <Badge tone="green">Ready</Badge>
            )
          }
        />
        <CardBody>
          {gpsLoading && (
            <p className="text-sm text-slate-500">Getting your location…</p>
          )}

          {!gpsLoading && gpsErr && (
            <>
              <Alert tone="error" title={gpsErr.message} />
              <div className="mt-3">
                <Button variant="secondary" onClick={() => void fetchFix()}>
                  Try again
                </Button>
              </div>
            </>
          )}

          {!gpsLoading && fix && (
            <>
              <dl className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div>
                  <dt className="text-slate-500">Latitude</dt>
                  <dd className="font-mono">{fix.latitude.toFixed(6)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Longitude</dt>
                  <dd className="font-mono">{fix.longitude.toFixed(6)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Accuracy</dt>
                  <dd className="font-mono">±{Math.round(fix.accuracy)}m</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Mock GPS</dt>
                  <dd>{fix.is_mock_location ? 'Detected' : 'No'}</dd>
                </div>
              </dl>

              {fix.is_mock_location && (
                <Alert
                  tone="error"
                  className="mt-3"
                  title="Mock location detected."
                >
                  Turn off fake-GPS apps and disable developer-location override
                  in your phone settings, then refresh.
                </Alert>
              )}

              {!fix.is_mock_location && accuracyTooWeak && (
                <Alert tone="warning" className="mt-3" title="GPS signal too weak.">
                  Your device reports ±{Math.round(fix.accuracy)}m accuracy,
                  above the {MAX_ACCURACY_METERS}m limit. Step outside or near a
                  window and retry.
                </Alert>
              )}

              <div className="mt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void fetchFix()}
                >
                  Refresh location
                </Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* ─── Code ─── */}
      <Card className="mt-4">
        <CardHeader
          title="Step 2 · Session code"
          right={codeValid ? <Badge tone="green">Code set</Badge> : undefined}
        />
        <CardBody>
          {!scanning && (
            <>
              <p className="text-sm text-slate-600">
                The code rotates every few seconds. Scanning the lecturer's QR
                is fastest.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => setScanning(true)} disabled={submitting}>
                  Scan QR code
                </Button>
                {!manualMode && (
                  <Button
                    variant="secondary"
                    onClick={() => setManualMode(true)}
                    disabled={submitting}
                  >
                    Enter manually
                  </Button>
                )}
              </div>
            </>
          )}

          {scanning && (
            <QrScanner
              expectedSessionId={sessionId}
              onResult={(payload) => {
                setCode(payload.c);
                setScanMismatch(
                  payload.s !== sessionId ? payload.s : null,
                );
                setScanning(false);
              }}
              onClose={() => setScanning(false)}
            />
          )}

          {manualMode && !scanning && (
            <div className="mt-3">
              <Input
                label="6-digit code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setCode(v);
                  setScanMismatch(null);
                }}
                className="!font-mono !text-center !text-lg !tracking-[0.5em]"
                disabled={submitting}
              />
            </div>
          )}

          {codeValid && !scanning && (
            <div className="mt-3 rounded-md bg-slate-50 p-3 text-center">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Code
              </p>
              <p className="mt-0.5 font-mono text-2xl tracking-[0.4em] text-slate-900">
                {code}
              </p>
            </div>
          )}

          {scanMismatch !== null && (
            <Alert
              tone="warning"
              className="mt-3"
              title="Scanned QR is for a different session."
            >
              The code belongs to session #{scanMismatch}, but you're checking
              into #{sessionId}. Make sure you scan the QR your lecturer is
              showing right now.
            </Alert>
          )}
        </CardBody>
      </Card>

      {/* ─── Submit ─── */}
      <div className="mt-6 space-y-3">
        {submitErr && <AlertFromError error={submitErr} />}

        <Button
          fullWidth
          size="lg"
          loading={submitting}
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          {submitting ? 'Checking in…' : 'Check in'}
        </Button>

        {!canSubmit && !submitting && (
          <p className="text-center text-xs text-slate-500">
            {!fix && !gpsErr && 'Waiting for your location…'}
            {fix?.is_mock_location && 'Mock GPS detected — cannot check in.'}
            {fix && !fix.is_mock_location && accuracyTooWeak &&
              'GPS accuracy too weak to check in.'}
            {fix && !fix.is_mock_location && !accuracyTooWeak && !codeValid &&
              'Enter or scan the 6-digit code.'}
            {scanMismatch !== null && 'Wrong session QR scanned.'}
          </p>
        )}

        <Button variant="ghost" fullWidth onClick={onBack}>
          ← Back to sessions
        </Button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Session header
// ─────────────────────────────────────────────────────────────────────────────

function SessionHeader({ session }: { session: ActiveSession }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const expires = new Date(session.expires_at).getTime();
  const msLeft = Math.max(0, expires - now);
  const minutes = Math.floor(msLeft / 60_000);
  const seconds = Math.floor((msLeft % 60_000) / 1000);

  return (
    <Card>
      <CardHeader
        title={`${session.course_code} · ${session.course_name}`}
        subtitle={session.room_name}
        right={<LiveBadge />}
      />
      <CardBody className="!py-3">
        <p className="text-xs text-slate-500">
          Session ends in{' '}
          <span className="font-medium text-slate-700">
            {minutes}m {String(seconds).padStart(2, '0')}s
          </span>
        </p>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QR scanner — dynamically imports html5-qrcode
// ─────────────────────────────────────────────────────────────────────────────

type ScannerHandle = {
  stop: () => Promise<void>;
  clear: () => void;
};

function QrScanner({
  expectedSessionId,
  onResult,
  onClose,
}: {
  expectedSessionId: number;
  onResult: (payload: QrPayload) => void;
  onClose: () => void;
}) {
  // Stable element id per mount — Html5Qrcode wants an id string.
  const reactId = useId();
  const containerId = useMemo(
    () => `qr-${reactId.replace(/[^a-z0-9]/gi, '')}`,
    [reactId],
  );

  const scannerRef = useRef<ScannerHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mod = await import('html5-qrcode');
        if (cancelled) return;

        const scanner = new mod.Html5Qrcode(containerId);
        scannerRef.current = scanner as unknown as ScannerHandle;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            try {
              const parsed = JSON.parse(decoded) as Partial<QrPayload>;
              if (
                typeof parsed.s === 'number' &&
                typeof parsed.c === 'string' &&
                /^\d{6}$/.test(parsed.c)
              ) {
                onResult({ s: parsed.s, c: parsed.c });
              } else {
                setError(
                  'That QR code is not an attendance code. Scan the one on your lecturer\'s screen.',
                );
              }
            } catch {
              setError('QR code could not be read. Try again.');
            }
          },
          () => {
            /* per-frame decode errors — silently ignore */
          },
        );
      } catch (e) {
        if (!cancelled) {
          setError(
            'Could not access the camera. Check your browser permissions and that no other app is using the camera.',
          );
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop()
          .catch(() => {
            /* ignore stop errors (already stopped) */
          })
          .finally(() => {
            try {
              s.clear();
            } catch {
              /* ignore */
            }
          });
      }
    };
  }, [containerId, onResult]);

  return (
    <div className="mt-3">
      <div className="overflow-hidden rounded-md bg-black">
        {starting && (
          <div className="flex h-64 items-center justify-center">
            <Spinner size="md" label="Starting camera…" />
          </div>
        )}
        <div id={containerId} className="mx-auto max-w-sm" />
      </div>

      {error && <Alert tone="error" title={error} className="mt-3" />}

      <p className="mt-3 text-xs text-slate-500">
        Point the camera at the QR code on your lecturer's screen. Codes rotate
        every few seconds, so scan when you see it.
      </p>

      <div className="mt-3">
        <Button variant="secondary" onClick={onClose} fullWidth>
          Cancel scan
        </Button>
      </div>
    </div>
  );
}
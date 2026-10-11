// lib/geolocation.ts
//
// Promise wrapper around navigator.geolocation + a best-effort mock-GPS
// heuristic. Feeds the `is_mock_location` and `accuracy` fields that
// routes/attendance.js expects.
//
// IMPORTANT: browser-side mock detection is inherently limited. The backend
// is the authority — this file only produces an honest signal.

import type { GeolocationFix } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type GeolocationFailure = {
  code:
    | 'PERMISSION_DENIED'
    | 'POSITION_UNAVAILABLE'
    | 'TIMEOUT'
    | 'NOT_SUPPORTED'
    | 'INSECURE_CONTEXT';
  message: string;
};

export type GetFixOptions = {
  /** Abort the GPS read after N ms. Defaults to 15s. */
  timeoutMs?: number;
  /** Allow cached fixes up to N ms old. Defaults to 0 — always fresh. */
  maximumAgeMs?: number;
  /** Use GPS (vs. coarse network location). Defaults to true. */
  enableHighAccuracy?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_AGE_MS = 0;

/**
 * Module-scoped memory of the last fix, so repeated calls can detect a
 * frozen / injected location that returns bit-identical coordinates.
 */
let previousFix: { lat: number; lon: number; at: number } | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Availability helpers — call these before getCurrentFix() to render a
// helpful UI instead of throwing on the first attempt.
// ─────────────────────────────────────────────────────────────────────────────

export function isGeolocationAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    'geolocation' in navigator &&
    window.isSecureContext !== false
  );
}

export function geolocationUnavailableReason(): GeolocationFailure | null {
  if (typeof window === 'undefined') {
    return { code: 'NOT_SUPPORTED', message: 'Server-side rendering context.' };
  }
  if (!('geolocation' in navigator)) {
    return {
      code: 'NOT_SUPPORTED',
      message:
        'This browser does not support geolocation. Try Chrome, Edge, or Safari on a phone.',
    };
  }
  if (window.isSecureContext === false) {
    return {
      code: 'INSECURE_CONTEXT',
      message:
        'Geolocation requires HTTPS (localhost counts as secure). Ask your admin to serve the app over TLS.',
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: getCurrentFix
// ─────────────────────────────────────────────────────────────────────────────

export async function getCurrentFix(
  opts: GetFixOptions = {},
): Promise<GeolocationFix> {
  const unavailable = geolocationUnavailableReason();
  if (unavailable) throw unavailable;

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maximumAge = opts.maximumAgeMs ?? DEFAULT_MAX_AGE_MS;
  const enableHighAccuracy = opts.enableHighAccuracy ?? true;

  const startedAt = performance.now();

  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, (err) =>
      reject(mapGeolocationError(err)),
    { enableHighAccuracy, timeout: timeoutMs, maximumAge },
    );
  });

  const elapsedMs = performance.now() - startedAt;
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  const accuracy = position.coords.accuracy;

  const isMock = detectMockLocation({
    coords: position.coords as GeolocationCoordinates & { isMock?: boolean },
    lat,
    lon,
    accuracy,
    elapsedMs,
  });

  previousFix = { lat, lon, at: Date.now() };

  return {
    latitude: lat,
    longitude: lon,
    accuracy,
    is_mock_location: isMock,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock-GPS heuristic
// ─────────────────────────────────────────────────────────────────────────────

type DetectInput = {
  coords: GeolocationCoordinates & { isMock?: boolean };
  lat: number;
  lon: number;
  accuracy: number;
  elapsedMs: number;
};

function detectMockLocation(input: DetectInput): boolean {
  const { coords, lat, lon, accuracy, elapsedMs } = input;

  // ── Layer 1: explicit signals ─────────────────────────────────────────────
  if (typeof coords.isMock === 'boolean' && coords.isMock) return true;
  if (!Number.isFinite(accuracy) || accuracy <= 0) return true;

  // ── Layer 2: physically implausible precision ────────────────────────────
  // A consumer phone cannot resolve below ~1m without RTK hardware. Sub-meter
  // accuracy in a web browser is the classic signature of an injected fix.
  if (accuracy < 1) return true;

  // ── Layer 3: frozen coordinates ──────────────────────────────────────────
  // Real GPS always jitters. Bit-identical coordinates (Δ < 1e-9 ≈ 0.1 mm)
  // inside 500 ms means the value is being replayed verbatim.
  if (previousFix) {
    const sameLat = Math.abs(previousFix.lat - lat) < 1e-9;
    const sameLon = Math.abs(previousFix.lon - lon) < 1e-9;
    const deltaMs = Date.now() - previousFix.at;
    if (sameLat && sameLon && deltaMs < 500) return true;
  }

  // ── Layer 4: implausible timing ──────────────────────────────────────────
  // A cold GPS lock takes seconds. A first read returning in under 100 ms
  // with sub-5 m accuracy is almost certainly injected.
  if (previousFix === null && elapsedMs < 100 && accuracy < 5) return true;

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error mapping
// ─────────────────────────────────────────────────────────────────────────────

function mapGeolocationError(
  err: GeolocationPositionError,
): GeolocationFailure {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return {
        code: 'PERMISSION_DENIED',
        message:
          'Location permission was denied. Enable it in your browser settings and try again.',
      };
    case err.POSITION_UNAVAILABLE:
      return {
        code: 'POSITION_UNAVAILABLE',
        message:
          'Your device could not determine a location. Move outdoors or near a window and try again.',
      };
    case err.TIMEOUT:
      return {
        code: 'TIMEOUT',
        message:
          'Timed out waiting for a GPS fix. Find a spot with a clearer sky view and try again.',
      };
    default:
      return {
        code: 'POSITION_UNAVAILABLE',
        message: err.message || 'Location unavailable.',
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Type guard — for `catch (e) { if (isGeolocationFailure(e)) ... }`
// ─────────────────────────────────────────────────────────────────────────────

export function isGeolocationFailure(
  value: unknown,
): value is GeolocationFailure {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value
  );
}
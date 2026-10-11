// lib/api.ts
//
// Single entry point for every backend call. No component should ever call
// fetch() directly — go through `api.*` so auth headers, error handling,
// and DECIMAL normalization stay consistent everywhere.

import type {
  ActiveSessionsResponse,
  AdminCreateCourseRequest,
  AdminCreateCourseResponse,
  AdminCreateTimetableRequest,
  AdminCreateTimetableResponse,
  AdminCreateUserRequest,
  AdminCreateUserResponse,
  AdminEnrollRequest,
  AdminEnrollResponse,
  AdminReportResponse,
  ApiError,
  AuthResponse,
  CheckInRequest,
  CheckInResponse,
  LaunchSessionRequest,
  LaunchSessionResponse,
  LecturerSessionsResponse,
  LoginRequest,
  MeResponse,
  MyAttendanceResponse,
  RegisterRequest,
  SessionAttendanceResponse,
  SessionCodeResponse,
  TimetablesResponse,
} from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

// ─────────────────────────────────────────────────────────────────────────────
// Token storage
//
// The backend is bearer-token only (see middleware/auth.js) — no cookies —
// so the frontend owns persistence. We keep the token under a single
// localStorage key so auth.tsx and api.ts agree on where to look.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'attendance.token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
// DECIMAL normalization
//
// `pg` returns DECIMAL columns as strings. The UI types (lib/types.ts) declare
// these as `number | null`. This walker converts only known DECIMAL keys so
// TIME / TIMESTAMP columns (which are strings on purpose) are never touched.
// ─────────────────────────────────────────────────────────────────────────────

const DECIMAL_KEYS = new Set<string>([
  'distance_meters',
  'room_latitude',
  'room_longitude',
  'anchor_latitude',
  'anchor_longitude',
  'lecturer_to_room',
]);

function normalizeDecimals<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => normalizeDecimals(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (DECIMAL_KEYS.has(k)) {
        out[k] = v === null || v === '' ? null : Number(v);
      } else {
        out[k] = normalizeDecimals(v);
      }
    }
    return out as T;
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core request function
// ─────────────────────────────────────────────────────────────────────────────

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Attach Authorization: Bearer <token>. Defaults to true. */
  auth?: boolean;
  /** AbortController signal — used by polling loops on unmount. */
  signal?: AbortSignal;
};

async function request<T>(
  path: string,
  { method = 'GET', body, auth = true, signal }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};

  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    // Network failure / CORS / abort
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    const fallback: ApiError = {
      status: 0,
      error: 'Network error. Check your connection and that the API is running.',
    };
    throw fallback;
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  // Try to parse JSON; on failure (e.g. express-rate-limit plain-text 429),
  // synthesize a friendly error message.
  let payload: unknown;
  const text = await res.text();
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || 'Unexpected server response.' };
  }

  if (res.ok) {
    return normalizeDecimals(payload) as T;
  }

  // ── Error path ─────────────────────────────────────────────────────────────
  const raw = payload as Partial<ApiError>;

  // 429 from express-rate-limit is not our error shape.
  if (res.status === 429) {
    const apiError: ApiError = {
      status: 429,
      error:
        typeof raw.error === 'string' && raw.error.length > 0
          ? raw.error
          : 'Too many requests. Please wait a moment.',
    };
    throw apiError;
  }

  // 401 — emit an event so lib/auth.tsx can log out and redirect. We do not
  // call router here because api.ts must stay free of Next-specific imports.
  if (res.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('auth:unauthorized'));
  }

  const apiError: ApiError = {
    status: res.status,
    error: typeof raw.error === 'string' ? raw.error : 'Request failed.',
    ...(raw.details ? { details: raw.details } : {}),
  };
  throw apiError;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thin verb helpers
// ─────────────────────────────────────────────────────────────────────────────

const get = <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
  request<T>(path, { ...opts, method: 'GET' });

const post = <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
  request<T>(path, { ...opts, method: 'POST', body });

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint map
//
// One function per backend route. If a route ever changes shape, update
// lib/types.ts and the corresponding function here — every call site
// re-checks automatically.
// ─────────────────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    // Public — no Bearer header attached.
    register: (body: RegisterRequest) =>
      post<AuthResponse>('/auth/register', body, { auth: false }),

    login: (body: LoginRequest) =>
      post<AuthResponse>('/auth/login', body, { auth: false }),

    me: (opts?: { signal?: AbortSignal }) =>
      get<MeResponse>('/auth/me', opts),
  },

  timetables: {
    mine: () => get<TimetablesResponse>('/timetables/mine'),
  },

  sessions: {
    launch: (body: LaunchSessionRequest) =>
      post<LaunchSessionResponse>('/sessions/launch', body),

    code: (sessionId: number, opts?: { signal?: AbortSignal }) =>
      get<SessionCodeResponse>(`/sessions/${sessionId}/code`, opts),

    end: (sessionId: number) =>
      post<{ status: 'success'; message: string }>(`/sessions/${sessionId}/end`),

    attendance: (sessionId: number, opts?: { signal?: AbortSignal }) =>
      get<SessionAttendanceResponse>(`/sessions/${sessionId}/attendance`, opts),

    mine: () => get<LecturerSessionsResponse>('/sessions/mine'),

    active: (opts?: { signal?: AbortSignal }) =>
      get<ActiveSessionsResponse>('/sessions/active', opts),
  },

  attendance: {
    checkIn: (body: CheckInRequest) =>
      post<CheckInResponse>('/attendance/check-in', body),

    me: () => get<MyAttendanceResponse>('/attendance/me'),
  },

  admin: {
    createUser: (body: AdminCreateUserRequest) =>
      post<AdminCreateUserResponse>('/admin/users', body),

    createCourse: (body: AdminCreateCourseRequest) =>
      post<AdminCreateCourseResponse>('/admin/courses', body),

    createTimetable: (body: AdminCreateTimetableRequest) =>
      post<AdminCreateTimetableResponse>('/admin/timetables', body),

    enroll: (body: AdminEnrollRequest) =>
      post<AdminEnrollResponse>('/admin/enrollments', body),

    report: (courseId: number) =>
      get<AdminReportResponse>(`/admin/reports/course/${courseId}`),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Error guard — handy for `catch (e) { if (isApiError(e)) ... }`
// ─────────────────────────────────────────────────────────────────────────────

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'error' in value
  );
}
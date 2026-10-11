// lib/types.ts
//
// Every type here is derived 1:1 from the backend routes. If the backend
// changes, update this file first — TypeScript will then flag every call site
// that drifts out of sync.
//
// Convention:
//   - Backend field names are preserved exactly (snake_case).
//   - DECIMAL columns (distance, lat, lon) are normalized to `number` by
//     lib/api.ts because `pg` returns them as strings.
//   - TIMESTAMP columns arrive as ISO strings over the wire.

// ─────────────────────────────────────────────────────────────────────────────
// Enums — mirror DB CHECK constraints and Zod schemas exactly
// ─────────────────────────────────────────────────────────────────────────────

export type Role = 'student' | 'lecturer' | 'admin';

export type DayOfWeek =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

/** attendance_records.status CHECK constraint */
export type AttendanceStatus = 'Present' | 'Late';

/** attendance_attempts.outcome CHECK constraint */
export type AttemptOutcome =
  | 'Accepted'
  | 'Rejected_Distance'
  | 'Rejected_MockGPS'
  | 'Rejected_Code'
  | 'Rejected_Accuracy'
  | 'Rejected_NotEnrolled';

// ─────────────────────────────────────────────────────────────────────────────
// Error shape — from middleware/errorHandler.js
//
// All API errors are `{ error: string, ...extra }`. `details` is populated
// by middleware/validate.js when Zod validation fails.
// `status` is NOT sent by the server; lib/api.ts attaches it from the HTTP
// response so error handlers can branch on it uniformly.
// ─────────────────────────────────────────────────────────────────────────────

export type ApiError = {
  status: number;
  error: string;
  details?: string[];
  [key: string]: unknown;
};

// ─────────────────────────────────────────────────────────────────────────────
// Auth — routes/auth.js
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shape returned by `publicUser()` in routes/auth.js.
 * NOTE: field is `id`, not `user_id`. Admin user creation returns `user_id`
 * — see `AdminUser`.
 */
export type User = {
  id: number;
  email: string;
  full_name: string;
  role: Role;
};

/** POST /api/auth/register and POST /api/auth/login */
export type AuthResponse = {
  user: User;
  token: string;
};

/** GET /api/auth/me */
export type MeResponse = {
  user: User;
};

export type LoginRequest = {
  email: string;
  password: string;
  /**
   * Optional UI hint. Backend logic in routes/auth.js treats this as:
   *   - 'student'  -> user.role === 'student'
   *   - 'lecturer' -> user.role !== 'student'  (i.e. lecturer OR admin)
   * Omitting it skips the check entirely.
   */
  role?: 'student' | 'lecturer';
};

export type RegisterRequest = {
  email: string;   // must be @mulungushi.edu.zm
  password: string;   // 8..100 chars
  full_name: string;  // 2..150 chars
};

// ─────────────────────────────────────────────────────────────────────────────
// Timetables — routes/timetables.js (GET /api/timetables/mine)
// ─────────────────────────────────────────────────────────────────────────────

export type Timetable = {
  timetable_id: number;
  course_code: string;
  course_name: string;
  day_of_week: DayOfWeek;
  /** Postgres TIME -> "HH:MM:SS" */
  start_time: string;
  /** Postgres TIME -> "HH:MM:SS" */
  end_time: string;
  room_name: string;
  allowed_radius_meters: number;
  /**
   * Computed server-side using config.attendance.timezone and
   * config.attendance.earlyMinutes. Hint only: POST /sessions/launch re-checks
   * the schedule and can still 400 with "Outside the scheduled slot...".
   */
  open_now: boolean;
};

export type TimetablesResponse = {
  timetables: Timetable[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Sessions — routes/sessions.js
// ─────────────────────────────────────────────────────────────────────────────

export type LaunchSessionRequest = {
  timetable_id: number;
  latitude: number;
  longitude: number;
};

/** POST /api/sessions/launch — 201 */
export type LaunchSessionResponse = {
  status: 'success';
  session_id: number;
  radius_meters: number;
  expires_at: string;         // ISO
  current_code: string;       // 6 digits
  code_step_seconds: number;  // TOTP_STEP (defaults to 5 in this project)
};

/** GET /api/sessions/:id/code — polled every 1–2s */
export type SessionCodeResponse = {
  session_id: number;
  code: string;               // 6 digits
  seconds_remaining: number;
  step_seconds: number;       // mirrors config.totp.step
  /** JSON string: `{"s":<session_id>,"c":"<6-digit code>"}` */
  qr_payload: string;
};

/** One row in GET /api/sessions/:id/attendance */
export type SessionAttendanceRecord = {
  student_id: number;
  full_name: string;
  email: string;
  status: AttendanceStatus;
  check_in_time: string;      // ISO
  distance_meters: number | null;  // DECIMAL -> normalized by lib/api.ts
};

export type SessionAttendanceResponse = {
  session_id: number;
  live: boolean;
  present: number;
  enrolled: number;
  records: SessionAttendanceRecord[];
};

/** One row in GET /api/sessions/mine */
export type LecturerSession = {
  session_id: number;
  timetable_id: number;
  course_code: string;
  room_name: string;
  launched_at: string;   // ISO
  expires_at: string;    // ISO
  live: boolean;
  present: number;
};

export type LecturerSessionsResponse = {
  sessions: LecturerSession[];
};

/** One row in GET /api/sessions/active (student view) */
export type ActiveSession = {
  session_id: number;
  course_code: string;
  course_name: string;
  room_name: string;
  launched_at: string;      // ISO
  expires_at: string;       // ISO
  already_checked_in: boolean;
};

export type ActiveSessionsResponse = {
  sessions: ActiveSession[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Attendance — routes/attendance.js
// ─────────────────────────────────────────────────────────────────────────────

export type CheckInRequest = {
  session_id: number;
  /** Exactly 6 digits (Zod: /^\d{6}$/) */
  totp_code: string;
  student_lat: number;
  student_lon: number;
  /** GeolocationCoordinates.accuracy in meters. Compared to MAX_GPS_ACCURACY_METERS (50). */
  accuracy?: number;
  /** Client-side heuristic flag. Backend logs & rejects with Rejected_MockGPS when true. */
  is_mock_location?: boolean;
};

/** POST /api/attendance/check-in — 201 */
export type CheckInResponse = {
  status: 'success';
  message: string;              // e.g. "Attendance recorded (Present)."
  attendance_status: AttendanceStatus;
  distance_meters: number;
  check_in_time: string;        // ISO
};

/** One row in GET /api/attendance/me */
export type MyAttendanceRecord = {
  record_id: number;
  course_code: string;
  course_name: string;
  status: AttendanceStatus;
  check_in_time: string;        // ISO
  distance_meters: number | null;  // DECIMAL -> normalized by lib/api.ts
};

export type MyAttendanceResponse = {
  records: MyAttendanceRecord[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin — routes/admin.js
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/users returns `user_id`, unlike routes/auth.js which
 * returns `id`. Two different shapes on purpose — kept distinct here so
 * the compiler catches any accidental mix-up.
 */
export type AdminUser = {
  user_id: number;
  email: string;
  full_name: string;
  role: Role;
};

export type AdminCreateUserRequest = {
  email: string;
  password: string;   // 8..100 chars
  full_name: string;  // 2..150 chars
  role: Role;
};

export type AdminCreateUserResponse = {
  user: AdminUser;
};

export type Course = {
  course_id: number;
  course_code: string;
  course_name: string;
};

export type AdminCreateCourseRequest = {
  course_code: string;   // 2..50, server uppercases
  course_name: string;   // 2..150
};

export type AdminCreateCourseResponse = {
  course: Course;
};

export type AdminCreateTimetableRequest = {
  course_id: number;
  lecturer_id: number;
  day_of_week: DayOfWeek;
  /** "HH:MM" — Zod regex /^\d{2}:\d{2}$/ */
  start_time: string;
  /** "HH:MM" */
  end_time: string;
  room_name: string;
  room_latitude: number;   // -90..90
  room_longitude: number;  // -180..180
  /** 5..200, defaults to 20 server-side */
  allowed_radius_meters?: number;
};

/** Raw row from `INSERT ... RETURNING *` — DECIMALs normalized by api.ts */
export type AdminTimetable = {
  timetable_id: number;
  course_id: number;
  lecturer_id: number;
  day_of_week: DayOfWeek;
  start_time: string;      // "HH:MM:SS" (Postgres TIME)
  end_time: string;        // "HH:MM:SS"
  room_name: string;
  room_latitude: number;   // DECIMAL -> normalized
  room_longitude: number;  // DECIMAL -> normalized
  allowed_radius_meters: number;
};

export type AdminCreateTimetableResponse = {
  timetable: AdminTimetable;
};

export type AdminEnrollRequest = {
  course_id: number;
  /** 1..1000 institutional email addresses */
  student_emails: string[];
};

export type AdminEnrollResponse = {
  /**
   * Count of NEWLY inserted rows. Already-enrolled students are silently
   * skipped by the SQL `ON CONFLICT DO NOTHING`, so this can be less than
   * `student_emails.length`.
   */
  enrolled: number;
};

/** One row in GET /api/admin/reports/course/:courseId */
export type AdminReportRow = {
  full_name: string;
  email: string;
  present: number;
  late: number;
  total_sessions: number;
};

export type AdminReportResponse = {
  report: AdminReportRow[];
};

// ─────────────────────────────────────────────────────────────────────────────
// QR payload — parsed shape of `SessionCodeResponse.qr_payload`
// ─────────────────────────────────────────────────────────────────────────────

export type QrPayload = {
  s: number;   // session_id
  c: string;   // 6-digit code
};

// ─────────────────────────────────────────────────────────────────────────────
// Geolocation — client-side only, produced by lib/geolocation.ts
// ─────────────────────────────────────────────────────────────────────────────

export type GeolocationFix = {
  latitude: number;
  longitude: number;
  /** Meters — from GeolocationCoordinates.accuracy */
  accuracy: number;
  /** Client-side mock-GPS heuristic result */
  is_mock_location: boolean;
};
/**
 * SmartFlow API Client
 * Centralized API communication with caching, retry, and error handling.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message: string | null;
  request_id: string;
  error_code?: string;
  meta?: Record<string, unknown>;
}

export interface PaginationMeta {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
  cursor?: string;
  next_cursor?: string;
}

class ApiError extends Error {
  constructor(
    public message: string,
    public errorCode: string,
    public status: number,
    public requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  retries = 2
): Promise<ApiResponse<T>> {
  const token = getAuthToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE}${path}`;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const json = await response.json() as ApiResponse<T>;

      if (!response.ok) {
        throw new ApiError(
          json.message || 'Request failed',
          json.error_code || 'UNKNOWN_ERROR',
          response.status,
          json.request_id
        );
      }

      return json;
    } catch (error) {
      if (error instanceof ApiError) {
        // Don't retry auth errors or validation errors
        if (error.status === 401 || error.status === 400 || error.status === 403 || error.status === 404) {
          throw error;
        }
      }
      
      if (attempt === retries) {
        if (error instanceof ApiError) throw error;
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new ApiError('Request timed out. Please try again.', 'TIMEOUT', 408);
        }
        throw new ApiError('Network error. Please check your connection.', 'NETWORK_ERROR', 0);
      }

      // Exponential backoff: 500ms, 1000ms
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }

  throw new ApiError('Request failed after retries.', 'RETRY_EXHAUSTED', 500);
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { email: string; username: string; password: string; full_name?: string }) =>
    apiRequest('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  login: (data: { email?: string; username?: string; password: string }) =>
    apiRequest<{ access_token: string; refresh_token: string; user: User }>(
      '/api/v1/auth/login', { method: 'POST', body: JSON.stringify(data) }
    ),

  logout: (refreshToken?: string) =>
    apiRequest('/api/v1/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),

  me: () => apiRequest<User>('/api/v1/auth/me'),

  refresh: (refreshToken: string) =>
    apiRequest<{ access_token: string }>('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),
};

// ─── Content ─────────────────────────────────────────────────────────────────
export const contentApi = {
  list: (params?: { page?: number; per_page?: number; type?: string; q?: string }) => {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.per_page) search.set('per_page', String(params.per_page));
    if (params?.type) search.set('type', params.type);
    if (params?.q) search.set('q', params.q);
    return apiRequest<ContentItem[]>(`/api/v1/content?${search}`);
  },

  get: (id: string) => apiRequest<ContentItem>(`/api/v1/content/${id}`),

  upload: async (file: File, metadata: { title?: string; description?: string; is_public?: boolean }) => {
    const token = getAuthToken();
    const form = new FormData();
    form.append('file', file);
    if (metadata.title) form.append('title', metadata.title);
    if (metadata.description) form.append('description', metadata.description);
    if (metadata.is_public !== undefined) form.append('is_public', String(metadata.is_public));

    const response = await fetch(`${API_BASE}/api/v1/content/upload`, {
      method: 'POST',
      body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const json = await response.json();
    if (!response.ok) throw new ApiError(json.message, json.error_code, response.status);
    return json as ApiResponse<ContentItem>;
  },

  update: (id: string, data: Partial<ContentItem>) =>
    apiRequest<ContentItem>(`/api/v1/content/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) =>
    apiRequest(`/api/v1/content/${id}`, { method: 'DELETE' }),

  streamUrl: (id: string) => `${API_BASE}/api/v1/content/${id}/stream`,
};

// ─── Feed ─────────────────────────────────────────────────────────────────────
export const feedApi = {
  get: (params?: { cursor?: string; limit?: number; type?: string }) => {
    const search = new URLSearchParams();
    if (params?.cursor) search.set('cursor', params.cursor);
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.type) search.set('type', params.type);
    return apiRequest<ContentItem[]>(`/api/v1/feed?${search}`);
  },
};

// ─── Search ───────────────────────────────────────────────────────────────────
export const searchApi = {
  search: (q: string, params?: { type?: string; page?: number; per_page?: number }) => {
    const search = new URLSearchParams({ q });
    if (params?.type) search.set('type', params.type);
    if (params?.page) search.set('page', String(params.page));
    if (params?.per_page) search.set('per_page', String(params.per_page));
    return apiRequest<ContentItem[]>(`/api/v1/search?${search}`);
  },
};

// ─── Analytics ───────────────────────────────────────────────────────────────
export const analyticsApi = {
  latency: (hours = 24) => apiRequest<LatencyStats>(`/api/v1/analytics/latency?hours=${hours}`),
  cache: () => apiRequest<CacheStats>(`/api/v1/analytics/cache`),
  prefetch: () => apiRequest<PrefetchStats>(`/api/v1/analytics/prefetch`),
  jobs: () => apiRequest<JobStats>(`/api/v1/analytics/jobs`),
  overview: () => apiRequest<OverviewStats>(`/api/v1/analytics/overview`),
};

// ─── Sources ─────────────────────────────────────────────────────────────────
export const sourcesApi = {
  list: () => apiRequest<ContentSource[]>('/api/v1/sources'),
  create: (data: { name: string; adapter_type: string; config: Record<string, unknown> }) =>
    apiRequest<ContentSource>('/api/v1/sources', { method: 'POST', body: JSON.stringify(data) }),
  sync: (id: string, force = false) =>
    apiRequest(`/api/v1/sources/${id}/sync`, { method: 'POST', body: JSON.stringify({ force }) }),
  delete: (id: string) =>
    apiRequest(`/api/v1/sources/${id}`, { method: 'DELETE' }),
};

// ─── Jobs ────────────────────────────────────────────────────────────────────
export const jobsApi = {
  list: (params?: { status?: string; page?: number }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.page) search.set('page', String(params.page));
    return apiRequest<ProcessingJob[]>(`/api/v1/jobs?${search}`);
  },
  get: (id: string) => apiRequest<ProcessingJob>(`/api/v1/jobs/${id}`),
  cancel: (id: string) => apiRequest(`/api/v1/jobs/${id}/cancel`, { method: 'POST' }),
  retry: (id: string) => apiRequest(`/api/v1/jobs/${id}/retry`, { method: 'POST' }),
};

// ─── Cache ───────────────────────────────────────────────────────────────────
export const cacheApi = {
  status: () => apiRequest('/api/v1/cache/status'),
  invalidate: (contentId: string) => apiRequest(`/api/v1/cache/invalidate/${contentId}`, { method: 'POST' }),
  warm: (contentId: string) => apiRequest(`/api/v1/cache/warm/${contentId}`, { method: 'POST' }),
};

// ─── Prefetch ─────────────────────────────────────────────────────────────────
export const prefetchApi = {
  request: (contentIds: string[], networkQuality = 'medium') =>
    apiRequest('/api/v1/prefetch', {
      method: 'POST',
      body: JSON.stringify({ content_ids: contentIds, network_quality: networkQuality }),
    }),
  status: (ids: string[]) =>
    apiRequest(`/api/v1/prefetch/status?${ids.map(id => `ids=${id}`).join('&')}`),
};

// ─── Network ─────────────────────────────────────────────────────────────────
export const networkApi = {
  report: (data: { rtt_ms?: number; bandwidth_mbps?: number; quality?: string; is_online: boolean }) =>
    apiRequest('/api/v1/network/report', { method: 'POST', body: JSON.stringify(data) }),
  stats: () => apiRequest('/api/v1/network/stats'),
};

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminApi = {
  dashboard: () => apiRequest('/api/v1/admin/dashboard'),
  auditLogs: (page = 1) => apiRequest(`/api/v1/admin/audit-logs?page=${page}`),
};

// ─── Health ───────────────────────────────────────────────────────────────────
export const healthApi = {
  check: () => apiRequest('/api/v1/health'),
};

// ─── Storage ──────────────────────────────────────────────────────────────────
export const storageApi = {
  stats: () => apiRequest('/api/v1/storage/stats'),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersApi = {
  list: (page = 1) => apiRequest<User[]>(`/api/v1/users?page=${page}`),
  get: (id: string) => apiRequest<User>(`/api/v1/users/${id}`),
  update: (id: string, data: Partial<User>) =>
    apiRequest<User>(`/api/v1/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

// ─── Types ────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  username: string;
  email?: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface ContentItem {
  id: string;
  title: string;
  description: string | null;
  content_type: 'video' | 'image' | 'document' | 'audio' | 'archive' | 'data' | 'other';
  mime_type: string | null;
  size_bytes: number | null;
  file_size?: number;
  original_filename?: string;
  is_optimized?: boolean;
  storage_path?: string;
  bitrate?: number;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  thumbnail_url: string | null;
  slug: string;
  tags: string[];
  is_public: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
  stream_url: string;
  versions?: ContentVersion[];
}

export interface ContentVersion {
  id: string;
  quality_label: string;
  storage_key: string;
  is_hls: boolean;
  size_bytes: number | null;
}

export interface ContentSource {
  id: string;
  name: string;
  adapter_type: string;
  is_active: boolean;
  last_synced_at: string | null;
  config: Record<string, unknown>;
  created_at: string;
}

export interface ProcessingJob {
  id: string;
  job_type: string;
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  progress_pct?: number;
  priority: number;
  content_id: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  events?: Array<{ type: string; message: string; created_at: string }>;
}

export interface LatencyStats {
  period_hours: number;
  total_requests: number;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  cache_hits: number;
  prefetch_hits: number;
  offline_hits: number;
  cache_misses: number;
  cache_hit_rate: number;
  prefetch_hit_rate: number;
  error_count: number;
  error_rate: number;
  percentiles?: { p50: number; p95: number; p99: number };
  summary?: { avg_ms: number };
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  total_requests: number;
  hit_rate_percent: number;
  hit_rate_pct?: number;
  db_cache_entries: number;
  stale_entries: number;
  cache_health: { status: string; backend: string };
}

export interface PrefetchStats {
  total_prefetch_jobs: number;
  total_prefetched?: number;
  prefetch_hits: number;
  ready: number;
  failed: number;
  prefetch_hit_rate: number;
  hit_rate_pct?: number;
}

export interface JobStats {
  by_status: Record<string, number>;
  total: number;
}

export interface OverviewStats {
  latency: LatencyStats;
  cache: CacheStats;
  content: { total: number; total_items?: number };
  jobs: { active: number; active_jobs?: number; completed_jobs?: number };
  prefetch?: { hit_rate_pct?: number; total_prefetched?: number };
  storage?: { total_bytes: number };
}

export { ApiError };
export default { authApi, contentApi, feedApi, searchApi, analyticsApi, sourcesApi, jobsApi, cacheApi, prefetchApi, networkApi, adminApi, healthApi, storageApi, usersApi };

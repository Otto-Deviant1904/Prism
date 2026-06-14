'use client';

import { useQuery } from '@tanstack/react-query';

type StoreHealthEntry = {
  store: string;
  lastStatus: string;
  successRate: number;
  blockedRate: number;
  zeroResultRate: number;
  averageExtractionMs: number;
};

type MetricsResponse = {
  storeHealth?: StoreHealthEntry[];
  [key: string]: unknown;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="text-xs text-red-500 italic">Failed to load: {message}</p>
  );
}

function LoadingPulse() {
  return <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />;
}

export default function AdminPage() {
  if (process.env.NEXT_PUBLIC_ADMIN_ENABLED === 'false') {
    return <main className="mx-auto max-w-3xl px-4 py-8"><p className="text-sm text-gray-700">Admin dashboard disabled.</p></main>;
  }

  const queue = useQuery({
    queryKey: ['queue'],
    queryFn: () => fetchJson<{ waiting: number; active: number; completed: number; failed: number }>('/api/ops/queue'),
    refetchInterval: 5000,
  });
  const rejected = useQuery({
    queryKey: ['rejected'],
    queryFn: () => fetchJson<{ count: number; rows: Array<{ id: string; rawTitle: string; confidence: number; reasons: string[] }> }>('/api/ops/rejected'),
  });
  const metrics = useQuery({
    queryKey: ['metrics'],
    queryFn: () => fetchJson<MetricsResponse>('/api/ops/metrics'),
    refetchInterval: 10000,
  });
  const feedback = useQuery({
    queryKey: ['feedback'],
    queryFn: () => fetchJson<{ rows: Array<{ id: string; feedbackType: string; query: string | null; createdAt: string }> }>('/api/feedback'),
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Internal Ops Dashboard</h1>

      {/* Queue stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {queue.isError ? (
          <div className="col-span-4 rounded-xl border bg-red-50 p-4">
            <ErrorBanner message={(queue.error as Error).message} />
          </div>
        ) : (
          <>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-gray-500">Queue waiting</p>
              {queue.isLoading ? <LoadingPulse /> : <p className="text-2xl font-bold">{queue.data?.waiting ?? '-'}</p>}
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-gray-500">Queue active</p>
              {queue.isLoading ? <LoadingPulse /> : <p className="text-2xl font-bold">{queue.data?.active ?? '-'}</p>}
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-gray-500">Queue failed</p>
              {queue.isLoading ? <LoadingPulse /> : <p className="text-2xl font-bold text-red-600">{queue.data?.failed ?? '-'}</p>}
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-gray-500">Rejected matches</p>
              {rejected.isLoading ? <LoadingPulse /> : rejected.isError
                ? <ErrorBanner message={(rejected.error as Error).message} />
                : <p className="text-2xl font-bold text-amber-600">{rejected.data?.count ?? '-'}</p>}
            </div>
          </>
        )}
      </div>

      {/* Search Metrics */}
      <section className="mt-6 rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Search Metrics</h2>
        {metrics.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-3 w-full animate-pulse rounded bg-gray-100" />)}</div>
        ) : metrics.isError ? (
          <ErrorBanner message={(metrics.error as Error).message} />
        ) : (
          <pre className="overflow-x-auto text-xs">{JSON.stringify(metrics.data ?? {}, null, 2)}</pre>
        )}
      </section>

      {/* Store Health */}
      <section className="mt-6 rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Store Health Summary</h2>
        {metrics.isError ? (
          <ErrorBanner message={(metrics.error as Error).message} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {(metrics.data?.storeHealth ?? []).map((s) => (
              <div key={s.store} className="rounded border p-3 text-sm">
                <p className="font-semibold">{s.store}</p>
                <p>status: {s.lastStatus}</p>
                <p>success: {(s.successRate * 100).toFixed(1)}%</p>
                <p>blocked: {(s.blockedRate * 100).toFixed(1)}%</p>
                <p>zero-result: {(s.zeroResultRate * 100).toFixed(1)}%</p>
                <p>avg ms: {s.averageExtractionMs}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Rejected Matches */}
      <section className="mt-6 rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Rejected Matches</h2>
        {rejected.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />)}</div>
        ) : rejected.isError ? (
          <ErrorBanner message={(rejected.error as Error).message} />
        ) : (
          <div className="space-y-2">
            {rejected.data?.rows.slice(0, 20).map((r) => (
              <div key={r.id} className="rounded border p-2 text-sm">
                <p className="font-medium">{r.rawTitle}</p>
                <p className="text-xs text-gray-600">confidence: {r.confidence.toFixed(2)} · reasons: {r.reasons.join(', ')}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* User Feedback */}
      <section className="mt-6 rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">User Feedback</h2>
        {feedback.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-gray-100" />)}</div>
        ) : feedback.isError ? (
          <ErrorBanner message={(feedback.error as Error).message} />
        ) : (
          <div className="space-y-2 text-sm">
            {feedback.data?.rows.slice(0, 30).map((f) => (
              <div key={f.id} className="rounded border p-2">
                <p>{f.feedbackType} {f.query ? `· ${f.query}` : ''}</p>
                <p className="text-xs text-gray-500">{new Date(f.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

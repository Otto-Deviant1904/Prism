'use client';

import { useQuery } from '@tanstack/react-query';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return (await res.json()) as T;
}

export default function AdminPage() {
  if (process.env.NEXT_PUBLIC_ADMIN_ENABLED === 'false') {
    return <main className="mx-auto max-w-3xl px-4 py-8"><p className="text-sm text-gray-700">Admin dashboard disabled.</p></main>;
  }
  const queue = useQuery({ queryKey: ['queue'], queryFn: () => fetchJson<{ waiting: number; active: number; completed: number; failed: number }>('/api/ops/queue'), refetchInterval: 5000 });
  const rejected = useQuery({ queryKey: ['rejected'], queryFn: () => fetchJson<{ count: number; rows: Array<{ id: string; rawTitle: string; confidence: number; reasons: string[] }> }>('/api/ops/rejected') });
  const metrics = useQuery({ queryKey: ['metrics'], queryFn: () => fetchJson<any>('/api/ops/metrics'), refetchInterval: 10000 });
  const feedback = useQuery({ queryKey: ['feedback'], queryFn: () => fetchJson<{ rows: Array<{ id: string; feedbackType: string; query: string | null; createdAt: string }> }>('/api/feedback') });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Internal Ops Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-4"><p className="text-xs text-gray-500">Queue waiting</p><p className="text-2xl font-bold">{queue.data?.waiting ?? '-'}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs text-gray-500">Queue active</p><p className="text-2xl font-bold">{queue.data?.active ?? '-'}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs text-gray-500">Queue failed</p><p className="text-2xl font-bold text-red-600">{queue.data?.failed ?? '-'}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs text-gray-500">Rejected matches</p><p className="text-2xl font-bold text-amber-600">{rejected.data?.count ?? '-'}</p></div>
      </div>

      <section className="mt-6 rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Search Metrics</h2>
        <pre className="overflow-x-auto text-xs">{JSON.stringify(metrics.data ?? {}, null, 2)}</pre>
      </section>

      <section className="mt-6 rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Store Health Summary</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(metrics.data?.storeHealth ?? []).map((s: any) => (
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
      </section>

      <section className="mt-6 rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Rejected Matches</h2>
        <div className="space-y-2">
          {rejected.data?.rows.slice(0, 20).map((r) => (
            <div key={r.id} className="rounded border p-2 text-sm">
              <p className="font-medium">{r.rawTitle}</p>
              <p className="text-xs text-gray-600">confidence: {r.confidence.toFixed(2)} · reasons: {r.reasons.join(', ')}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">User Feedback</h2>
        <div className="space-y-2 text-sm">
          {feedback.data?.rows.slice(0, 30).map((f) => (
            <div key={f.id} className="rounded border p-2">
              <p>{f.feedbackType} {f.query ? `· ${f.query}` : ''}</p>
              <p className="text-xs text-gray-500">{new Date(f.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

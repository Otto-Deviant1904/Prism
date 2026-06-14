'use client';

export default function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl bg-[#1A1A24] p-3">
      <div className="mb-3 aspect-square w-full rounded-lg bg-[#2A2A36]" />
      <div className="mb-2 h-3 w-16 rounded bg-[#2A2A36]" />
      <div className="mb-3 h-4 w-full rounded bg-[#2A2A36]" />
      <div className="mb-3 h-4 w-3/4 rounded bg-[#2A2A36]" />
      <div className="mb-3 h-6 w-20 rounded bg-[#2A2A36]" />
      <div className="h-9 w-full rounded-lg bg-[#2A2A36]" />
    </div>
  );
}

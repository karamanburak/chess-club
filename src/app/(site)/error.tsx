"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card max-w-xl mx-auto mt-10 border-loss/40">
      <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
      <p className="text-sm text-muted mb-4">{error.message}</p>
      <button className="btn" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}

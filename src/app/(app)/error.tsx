"use client";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="font-serif text-2xl">This page could not be loaded.</h1>
      <p className="mt-3 text-sm text-muted">{error.message}</p>
      <button type="button" className="mt-5 rounded-md bg-accent px-3.5 py-2 text-sm text-white" onClick={reset}>
        Try again
      </button>
    </div>
  );
}

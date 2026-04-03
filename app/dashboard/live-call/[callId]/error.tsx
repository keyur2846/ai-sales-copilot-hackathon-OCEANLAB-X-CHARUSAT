"use client";

export default function LiveCallError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // AbortError is non-fatal — just retry
  if (error.name === "AbortError") {
    reset();
    return null;
  }

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white gap-4">
      <p className="text-red-400 font-mono text-sm">
        Something went wrong: {error.message}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-[#00ff88] text-black font-mono text-sm"
      >
        Try Again
      </button>
    </div>
  );
}

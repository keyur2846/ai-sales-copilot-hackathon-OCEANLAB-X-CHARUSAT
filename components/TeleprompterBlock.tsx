"use client";

interface TeleprompterBlockProps {
  line: string;
  isGenerating: boolean;
}

export function TeleprompterBlock({ line, isGenerating }: TeleprompterBlockProps) {
  const isEmpty = line.trim().length === 0;

  return (
    <div
      className={`relative flex items-start p-6 md:p-8 border-t transition-colors ${
        isGenerating
          ? "border-[#00ff88]/40 animate-pulse-border"
          : "border-[#333]"
      }`}
    >
      {/* Generating indicator bar */}
      {isGenerating && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#00ff88] to-transparent animate-pulse" />
      )}

      <div className="w-full">
        {/* Section label */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] uppercase tracking-[0.2em] text-[#555] font-mono">
            Teleprompter
          </span>
          {isGenerating && (
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#00ff88] font-mono">
              generating
            </span>
          )}
        </div>

        {/* Main teleprompter text */}
        {isEmpty && !isGenerating ? (
          <p className="text-xl md:text-2xl font-sans text-[#444] leading-relaxed">
            Waiting for customer to speak...
          </p>
        ) : (
          <p className="text-2xl md:text-3xl font-semibold font-sans text-white leading-snug tracking-tight">
            {line}
            {isGenerating && (
              <span className="inline-block ml-1 w-[3px] h-[1em] bg-[#00ff88] align-middle animate-blink" />
            )}
          </p>
        )}
      </div>
    </div>
  );
}

import React from "react";

type ResultPreviewProps = {
  result: string;
  error?: string;
  isGenerating: boolean;
};

export function ResultPreview({
  result,
  error,
  isGenerating,
}: ResultPreviewProps) {
  return (
    <section className="orca-ai-panel__result">
      <div className="orca-ai-panel__section-heading">
        <span>Result</span>
        {isGenerating ? <span>streaming</span> : null}
      </div>
      {error ? <div className="orca-ai-panel__error">{error}</div> : null}
      <pre className="orca-ai-panel__preview">
        {result || "AI 结果会显示在这里。"}
      </pre>
    </section>
  );
}

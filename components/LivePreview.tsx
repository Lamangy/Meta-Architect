
import React from 'react';

interface LivePreviewProps {
  code: string;
}

export const LivePreview: React.FC<LivePreviewProps> = ({ code }) => {
  if (!code) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 italic">
        Warte auf Code-Generierung durch den Engineer...
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-white rounded-xl overflow-hidden shadow-2xl border border-slate-800">
      <iframe
        title="Prototype Preview"
        srcDoc={code}
        className="w-full h-full border-none"
        sandbox="allow-scripts allow-forms allow-modals"
      />
    </div>
  );
};

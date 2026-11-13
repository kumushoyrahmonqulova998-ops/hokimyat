import { useState } from 'react';
import { Shield } from 'lucide-react';

interface EmblemMarkProps {
  size?: 'sm' | 'md' | 'lg';
}

export function EmblemMark({ size = 'md' }: EmblemMarkProps) {
  const [failed, setFailed] = useState(false);

  const dims =
    size === 'sm' ? 'w-9 h-9' : size === 'lg' ? 'w-16 h-16' : 'w-11 h-11';

  if (failed) {
    return (
      <div
        className={`${dims} rounded-lg bg-[#0B1E3B] border border-[#C59B27]/60 flex items-center justify-center shrink-0`}
        aria-label="Mirzaobod tumani hokimligi gerbi"
      >
        <Shield className="w-5 h-5 text-[#C59B27]" />
      </div>
    );
  }

  return (
    <img
      src="/src/assets/images/mirzaobod_emblem_1794569457460.jpg"
      alt="Mirzaobod tumani hokimligi rasmiy gerbi"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${dims} rounded-lg object-cover border border-[#C59B27]/40 bg-white shrink-0`}
    />
  );
}

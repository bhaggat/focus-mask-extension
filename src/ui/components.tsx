import {
  Activity,
  AudioLines,
  AudioWaveform,
  CloudRain,
  Droplets,
  Flame,
  Music,
  Trees,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

const ICONS: Record<string, LucideIcon> = {
  brown: AudioLines,
  pink: AudioWaveform,
  white: Activity,
  rain: CloudRain,
  ocean: Waves,
  stream: Droplets,
  fireplace: Flame,
  forest: Trees,
};

export function SoundIcon({ id, size = 20 }: { id: string; size?: number }) {
  const Icon = ICONS[id] ?? Music;
  return <Icon size={size} strokeWidth={1.75} aria-hidden />;
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden>
      <defs>
        <linearGradient id="fm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6D5DF6" />
          <stop offset="1" stopColor="#2BB5A8" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="120" height="120" rx="30" fill="url(#fm-g)" />
      <path
        d="M30 74v-8a34 34 0 0 1 68 0v8"
        fill="none"
        stroke="#fff"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <rect x="22" y="68" width="18" height="30" rx="8" fill="#fff" />
      <rect x="88" y="68" width="18" height="30" rx="8" fill="#fff" />
      <path d="M52 83v-8M60 89v-20M68 86v-14M76 81v-4" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      data-on={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

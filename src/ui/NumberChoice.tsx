import { useEffect, useRef, useState } from 'react';

/** Preset chips plus a clamped "Custom" number input. Follows external value changes unless the user is typing. */
export function NumberChoice({
  value,
  options,
  limits,
  unit,
  onChange,
  label,
  variant = 'options',
}: {
  value: number;
  options: number[];
  limits: { min: number; max: number };
  unit: string;
  onChange: (v: number) => void;
  label: string;
  /** Styling only: the options page's pill chips, or the popup's compact chips. */
  variant?: 'options' | 'popup';
}) {
  const cls =
    variant === 'popup'
      ? { group: 'p-chips p-choice', chip: 'p-chip', num: 'p-custom-num' }
      : { group: 'o-choice', chip: 'o-chip', num: 'o-custom-num' };
  const [custom, setCustom] = useState(!options.includes(value));
  const [draft, setDraft] = useState(String(value));
  const editing = useRef(false);
  // Follow changes made elsewhere (popup, another window, Chrome Sync) unless the user is typing.
  useEffect(() => {
    if (editing.current) return;
    setDraft(String(value));
    setCustom(!options.includes(value));
  }, [value]);
  const commit = () => {
    editing.current = false;
    const n = Math.min(limits.max, Math.max(limits.min, Math.round(Number(draft) || value)));
    setDraft(String(n));
    if (n !== value) onChange(n);
  };
  return (
    <div className={cls.group} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          className={cls.chip}
          aria-pressed={!custom && value === o}
          onClick={() => {
            setCustom(false);
            onChange(o);
          }}
        >
          {o} {unit}
        </button>
      ))}
      <button className={cls.chip} aria-pressed={custom} onClick={() => setCustom(true)}>
        Custom
      </button>
      {custom && (
        <label className={cls.num}>
          <input
            type="number"
            min={limits.min}
            max={limits.max}
            value={draft}
            aria-label={`${label} (custom)`}
            onChange={(e) => {
              editing.current = true;
              setDraft(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
            onBlur={commit}
          />
          {unit}
        </label>
      )}
    </div>
  );
}

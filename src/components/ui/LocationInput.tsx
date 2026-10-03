import { useId, useMemo, useRef, useState, type InputHTMLAttributes } from 'react';
import { MapPin } from 'lucide-react';
import { matchLocations } from '@/utils/locations';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> { value: string; onChange: (v: string) => void }

/** Text input with keyboard-navigable place suggestions (WAI-ARIA combobox). Free text is always allowed. */
export function LocationInput({ value, onChange, className = '', ...rest }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<number>();
  const matches = useMemo(() => (open ? matchLocations(value) : []), [open, value]);
  const show = open && matches.length > 0;

  const choose = (v: string) => { onChange(v); setOpen(false); setActive(-1); };

  return (
    <div className="relative">
      <input {...rest} type="text" value={value} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={show}
        aria-controls={listId} aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className={`input ${className}`} maxLength={160}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 120); }}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % matches.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? matches.length - 1 : i - 1)); }
          else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(matches[active]); }
          else if (e.key === 'Escape') { setOpen(false); }
        }} />
      {show && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-md border border-line bg-card py-1 shadow-lift">
          {matches.map((m, i) => (
            <li key={m} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); window.clearTimeout(blurTimer.current); choose(m); }}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-11 cursor-pointer items-center gap-2.5 px-3.5 text-sm ${i === active ? 'bg-accent-soft text-ink' : 'text-ink'}`}>
              <MapPin className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />{m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

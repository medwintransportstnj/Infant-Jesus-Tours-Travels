import { Check } from 'lucide-react';

export const BOOKING_STEPS = ['Journey', 'Details', 'Vehicle', 'Review', 'Confirmed'] as const;

/** Journey → Details → Vehicle → Review → Confirmed. `current` is 1-based. */
export function Stepper({ current }: { current: number }) {
  return (
    <nav aria-label="Booking progress" className="mb-6 sm:mb-8">
      <ol className="flex items-center">
        {BOOKING_STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          return (
            <li key={label} className={`flex items-center ${i < BOOKING_STEPS.length - 1 ? 'flex-1' : ''}`} aria-current={active ? 'step' : undefined}>
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold ${done || active ? 'border-accent bg-accent text-white' : 'border-line bg-card text-muted'}`}>
                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : n}
              </span>
              <span className={`ml-2 text-xs ${active ? 'font-semibold text-ink' : 'text-muted'} ${active ? '' : 'hidden sm:inline'}`}>
                <span className="sr-only">Step {n} of {BOOKING_STEPS.length}: </span>{label}{done && <span className="sr-only"> (completed)</span>}
              </span>
              {i < BOOKING_STEPS.length - 1 && <span aria-hidden className={`mx-2 h-px flex-1 sm:mx-3 ${n < current ? 'bg-accent' : 'bg-line'}`} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

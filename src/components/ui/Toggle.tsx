interface Props { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; description?: string }

export function Toggle({ checked, onChange, label, disabled, description }: Props) {
  return (
    <label className={`inline-flex min-h-11 cursor-pointer items-center gap-3 ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 ${checked ? 'bg-accent' : 'bg-muted/40'}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${checked ? 'translate-x-5' : ''}`} />
      </button>
      <span className="text-sm text-ink" aria-hidden>
        {label}{description && <span className="block text-[13px] text-muted">{description}</span>}
      </span>
    </label>
  );
}

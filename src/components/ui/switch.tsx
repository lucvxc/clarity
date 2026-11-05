type Props = {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};

function Switch({ checked, label, onChange }: Props) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${checked ? "bg-white/75" : "bg-white/15"}`}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={`absolute left-0.5 top-0.5 size-4 rounded-full bg-zinc-900 transition-transform duration-150 ${checked ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  );
}

export default Switch;

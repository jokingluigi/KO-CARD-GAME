export function ImageDisplaySlider({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
  testId: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between text-[11px] font-bold text-neutral-400">
        <span>{label}</span>
        <span className="text-primary">{displayValue}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-primary"
        data-testid={testId}
      />
    </label>
  );
}

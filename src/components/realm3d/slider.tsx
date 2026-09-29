/** A timber slider for the pause menu, in percent: the sound's levels, and the mouse's look speed. */
export function Slider({
  label,
  value,
  disabled,
  onChange,
  min = 0,
  max = 100,
  step = 5,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className={`r3-slider${disabled ? " r3-slider--off" : ""}`}>
      <span className="r3-slider-name">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={`${value} percent`}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--r3-fill" as string]: `${((value - min) / (max - min)) * 100}%` }}
      />
      <span className="r3-slider-value" aria-hidden="true">
        {value}
      </span>
    </label>
  );
}

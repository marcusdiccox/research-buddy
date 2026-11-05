import type { RepeatRule } from '../shared/contracts';

export function RepeatField({
  value,
  onChange,
  disabled = false,
}: {
  value: RepeatRule;
  onChange: (rule: RepeatRule) => void;
  disabled?: boolean;
}) {
  return (
    <label className="repeat-field">
      Repeat
      <select
        aria-label="Repeat"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as RepeatRule)}
      >
        <option value="none">None</option>
        <option value="daily">Daily</option>
        <option value="weekdays">Weekdays</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
    </label>
  );
}

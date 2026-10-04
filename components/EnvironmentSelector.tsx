type EnvironmentSelectorProps = {
  environments: string[];
  value: string;
  disabled?: boolean;
  onChange: (environment: string) => void;
};

export function EnvironmentSelector({
  environments,
  value,
  disabled,
  onChange,
}: EnvironmentSelectorProps) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="text-muted">Environment</span>
      <select
        aria-label="Environment"
        className="min-w-36 rounded-md border border-line bg-panel-2 px-3 py-2 font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
        value={value}
        disabled={disabled || environments.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        {environments.length === 0 ? <option value="">None configured</option> : null}
        {environments.map((environment) => (
          <option key={environment} value={environment}>
            {environment}
          </option>
        ))}
      </select>
    </label>
  );
}

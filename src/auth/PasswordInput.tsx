import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = {
  id: string;
  /** Stable browser-password-manager field identifier; default is the input id. */
  name?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  label: string;
  required?: boolean;
  minLength?: number;
};

/** An ordinary labelled password input with an optional, user-controlled reveal.
 * The reveal button never submits the enclosing form or changes its password. */
export function PasswordInput({
  id, name, value, onChange, autoComplete, label, required = true, minLength,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-password-field">
    <input id={id} name={name ?? id} type={visible ? 'text' : 'password'} required={required}
      minLength={minLength} autoComplete={autoComplete}
      autoCapitalize="off" spellCheck={false} value={value}
      onChange={event => onChange(event.target.value)}
      onInput={event => onChange(event.currentTarget.value)} />
    <button type="button" className="auth-password-toggle"
      aria-label={visible ? `Hide ${label}` : `Show ${label}`}
      title={visible ? `Hide ${label}` : `Show ${label}`}
      aria-pressed={visible} onClick={() => setVisible(current => !current)}>
      {visible ? <EyeOff size={20} aria-hidden="true"/> : <Eye size={20} aria-hidden="true"/>}
    </button>
  </div>;
}

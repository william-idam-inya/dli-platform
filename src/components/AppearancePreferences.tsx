import { useEffect, useState } from 'react';
import { Check, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  defaultAppearance, readAppearance, saveAppearance,
  type AppearanceSettings,
} from '../lib/appearancePreferences';
import './AppearancePreferences.css';

const ACCENTS = [
  { value: 'blue', label: 'DLI Blue', swatch: '#184b91' },
  { value: 'gold', label: 'Warm Gold', swatch: '#aa761a' },
  { value: 'teal', label: 'Academic Teal', swatch: '#087d78' },
] as const;

export default function AppearancePreferences() {
  const [preferences, setPreferences] = useState<AppearanceSettings>(readAppearance);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const sync = () => setPreferences(readAppearance());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function change<K extends keyof AppearanceSettings>(
    field: K, value: AppearanceSettings[K],
  ) {
    const next = { ...preferences, [field]: value };
    setPreferences(next);
    const stored = saveAppearance(next);
    setStatus(stored
      ? 'Appearance saved for this browser.'
      : 'Appearance applied for this session. This browser did not save the change.');
  }

  function reset() {
    const next = { ...defaultAppearance };
    setPreferences(next);
    const stored = saveAppearance(next);
    setStatus(stored
      ? 'Default appearance restored on this browser.'
      : 'Default appearance applied for this session.');
  }

  return (
    <section className="panel dli-appearance-panel" aria-labelledby="dli-appearance-title">
      <header className="dli-appearance-header">
        <span className="dli-appearance-symbol" aria-hidden="true">
          <SlidersHorizontal size={21} />
        </span>
        <div>
          <p className="section-kicker">MAKE DLI YOURS</p>
          <h2 id="dli-appearance-title">Appearance &amp; accessibility</h2>
          <p>Personalise how DLI looks on this device. Your institutional role,
            learning access, and official logo never change.</p>
        </div>
      </header>

      <fieldset className="dli-appearance-fieldset">
        <legend>Accent colour</legend>
        <div className="dli-appearance-accents">
          {ACCENTS.map(option => (
            <button key={option.value} type="button"
              className="dli-appearance-accent"
              aria-pressed={preferences.accent === option.value}
              onClick={() => change('accent', option.value)}>
              <span className="dli-appearance-swatch"
                style={{ backgroundColor: option.swatch }}>
                {preferences.accent === option.value && <Check size={19} aria-hidden="true"/>}
              </span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="dli-appearance-fieldset">
        <legend>Layout spacing</legend>
        <div className="dli-appearance-choices">
          <button type="button" aria-pressed={preferences.density === 'comfortable'}
            onClick={() => change('density', 'comfortable')}>Comfortable</button>
          <button type="button" aria-pressed={preferences.density === 'compact'}
            onClick={() => change('density', 'compact')}>Compact</button>
        </div>
      </fieldset>

      <fieldset className="dli-appearance-fieldset">
        <legend>Reading size</legend>
        <div className="dli-appearance-choices">
          <button type="button" aria-pressed={preferences.textSize === 'standard'}
            onClick={() => change('textSize', 'standard')}>Standard text</button>
          <button type="button" aria-pressed={preferences.textSize === 'large'}
            onClick={() => change('textSize', 'large')}>Larger text</button>
        </div>
      </fieldset>

      <fieldset className="dli-appearance-fieldset">
        <legend>Motion preferences</legend>
        <div className="dli-appearance-choices">
          <button type="button" aria-pressed={preferences.motion === 'system'}
            onClick={() => change('motion', 'system')}>Follow device</button>
          <button type="button" aria-pressed={preferences.motion === 'reduced'}
            onClick={() => change('motion', 'reduced')}>Reduce motion</button>
        </div>
      </fieldset>

      <div className="dli-appearance-preview" aria-label="Example class card using your preferences">
        <div className="dli-appearance-preview-icon" aria-hidden="true">
          <span>📘</span>
        </div>
        <div>
          <strong>Learning made clearer</strong>
          <p>Readable lessons, simple navigation, and space to focus.</p>
        </div>
        <span className="dli-appearance-preview-tag">Preview</span>
      </div>

      <div className="dli-appearance-footer">
        <p>These preferences are saved on this browser only. Light and dark
          theme preferences are managed separately above and can sync to your account.</p>
        <button type="button" className="user-outline-button" onClick={reset}>
          <RotateCcw size={16}/> Reset appearance
        </button>
      </div>
      <p className="dli-appearance-status" role="status" aria-live="polite">{status}</p>
    </section>
  );
}

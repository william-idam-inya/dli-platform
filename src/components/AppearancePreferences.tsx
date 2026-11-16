import { useEffect, useState } from 'react';
import { Check, RotateCcw, SlidersHorizontal, Sun, Moon, Laptop } from 'lucide-react';
import {
  defaultAppearance, readAppearance, saveAppearance,
  type AppearanceSettings,
} from '../lib/appearancePreferences';
import './AppearancePreferences.css';

const ACCENTS = [
  { value: 'blue', label: 'Royal Blue', swatch: '#1b4b91' },
  { value: 'teal', label: 'Academic Teal', swatch: '#0d9278' },
  { value: 'purple', label: 'Purple Focus', swatch: '#7c3aed' },
  { value: 'emerald', label: 'Emerald Green', swatch: '#10b981' },
  { value: 'gold', label: 'DLI Gold', swatch: '#e2b64f' },
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
          <p className="section-kicker">PERSONALIZATION &amp; CUSTOMIZATION</p>
          <h2 id="dli-appearance-title">Appearance &amp; display settings</h2>
          <p>Personalise how DLI looks on this device with modern themes, accent palettes, comfortable density and scalable typography.</p>
        </div>
      </header>

      <fieldset className="dli-appearance-fieldset">
        <legend>Theme</legend>
        <div className="dli-appearance-choices">
          <button type="button" aria-pressed={preferences.theme === 'light'}
            onClick={() => change('theme', 'light')}>
            <Sun size={15} aria-hidden="true" style={{marginRight: 6}}/> Light
          </button>
          <button type="button" aria-pressed={preferences.theme === 'dark'}
            onClick={() => change('theme', 'dark')}>
            <Moon size={15} aria-hidden="true" style={{marginRight: 6}}/> Dark
          </button>
          <button type="button" aria-pressed={preferences.theme === 'system'}
            onClick={() => change('theme', 'system')}>
            <Laptop size={15} aria-hidden="true" style={{marginRight: 6}}/> System
          </button>
        </div>
      </fieldset>

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
        <legend>Interface density</legend>
        <div className="dli-appearance-choices">
          <button type="button" aria-pressed={preferences.density === 'compact'}
            onClick={() => change('density', 'compact')}>Compact</button>
          <button type="button" aria-pressed={preferences.density === 'comfortable'}
            onClick={() => change('density', 'comfortable')}>Comfortable</button>
        </div>
      </fieldset>

      <fieldset className="dli-appearance-fieldset">
        <legend>Font size</legend>
        <div className="dli-appearance-choices">
          <button type="button" aria-pressed={preferences.textSize === 'smaller'}
            onClick={() => change('textSize', 'smaller')}>A Smaller</button>
          <button type="button" aria-pressed={preferences.textSize === 'standard'}
            onClick={() => change('textSize', 'standard')}>A Normal</button>
          <button type="button" aria-pressed={preferences.textSize === 'large'}
            onClick={() => change('textSize', 'large')}>A Larger</button>
        </div>
      </fieldset>

      <fieldset className="dli-appearance-fieldset">
        <legend>Motion preferences</legend>
        <div className="dli-appearance-choices">
          <button type="button" aria-pressed={preferences.motion === 'system'}
            onClick={() => change('motion', 'system')}>System default</button>
          <button type="button" aria-pressed={preferences.motion === 'reduced'}
            onClick={() => change('motion', 'reduced')}>Reduced motion</button>
        </div>
      </fieldset>

      <div className="dli-appearance-preview">
        <span className="dli-appearance-preview-icon" aria-hidden="true">🎓</span>
        <div>
          <strong>DLI Academic Pro v2.0</strong>
          <p>Modern • Engaging • Role-Focused • Fully Customizable</p>
        </div>
        <span className="dli-appearance-preview-tag">Preview</span>
      </div>

      <div className="dli-appearance-footer">
        <p className="dli-appearance-status" role="status">{status}</p>
        <button type="button" className="user-outline-button" onClick={reset}>
          <RotateCcw size={15} aria-hidden="true"/> Reset to default
        </button>
      </div>
    </section>
  );
}

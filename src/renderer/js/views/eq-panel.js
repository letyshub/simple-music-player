import { $, el } from '../util/dom.js';
import { formatDecibels } from '../util/format.js';
import {
  EQ_BANDS, EQ_PRESETS, EQ_MIN_GAIN, EQ_MAX_GAIN,
  gainsForPreset, matchPreset, formatFrequency,
} from '../../../shared/eq-presets.js';
import { state, saveSettings } from '../state.js';

/** The equaliser drawer: ten faders, a preamp trim, presets and a bypass. */

export function createEqPanel({ equalizer, onFlagsChanged }) {
  const panel = $('#eq-panel');
  const bandsHost = $('#eq-bands');
  const presetSelect = $('#eq-preset');
  const powerButton = $('#btn-eq-power');
  const toggleButton = $('#btn-eq-toggle');
  const preampSlider = $('#preamp');
  const preampValue = $('#preamp-value');

  const sliders = [];
  const valueLabels = [];

  function paintValue(label, decibels) {
    label.textContent = formatDecibels(decibels);
    label.classList.toggle('is-boost', decibels > 0.05);
    label.classList.toggle('is-cut', decibels < -0.05);
  }

  function syncPresetSelect() {
    presetSelect.value = matchPreset(state.store.settings.eqGains) ?? 'custom';
  }

  /** Push the stored curve into both the audio graph and the faders. */
  function applyGains(gains, { persist = true } = {}) {
    equalizer.setGains(gains);
    gains.forEach((gain, i) => {
      sliders[i].value = String(gain);
      paintValue(valueLabels[i], gain);
    });
    if (persist) saveSettings({ eqGains: gains, eqPreset: matchPreset(gains) });
    syncPresetSelect();
  }

  function setEnabled(enabled) {
    equalizer.setEnabled(enabled);
    powerButton.classList.toggle('is-on', enabled);
    powerButton.textContent = enabled ? 'ON' : 'OFF';
    for (const slider of sliders) slider.disabled = !enabled;
    preampSlider.disabled = !enabled;
    onFlagsChanged?.();
  }

  function buildBands() {
    const nodes = EQ_BANDS.map((band, index) => {
      const label = el('span', { class: 'eq-band-value', text: '0' });

      const slider = el('input', {
        class: 'eq-slider',
        type: 'range',
        min: String(EQ_MIN_GAIN),
        max: String(EQ_MAX_GAIN),
        step: '0.5',
        value: '0',
        orient: 'vertical',
        'aria-label': `Pasmo ${formatFrequency(band.freq)} Hz`,
        onInput: () => {
          const gain = Number(slider.value);
          equalizer.setGain(index, gain);
          paintValue(label, gain);
          const gains = equalizer.getGains();
          saveSettings({ eqGains: gains, eqPreset: matchPreset(gains) });
          syncPresetSelect();
        },
        // Double-clicking a fader returns that band to flat.
        onDblclick: () => {
          slider.value = '0';
          slider.dispatchEvent(new Event('input'));
        },
      });

      sliders.push(slider);
      valueLabels.push(label);

      return el('div', { class: 'eq-band' }, [
        label,
        slider,
        el('span', { class: 'eq-band-freq', text: formatFrequency(band.freq) }),
      ]);
    });

    bandsHost.replaceChildren(...nodes);
  }

  function buildPresets() {
    const options = Object.entries(EQ_PRESETS).map(
      ([name, preset]) => el('option', { value: name, text: preset.label }),
    );
    options.push(el('option', { value: 'custom', text: 'Custom' }));
    presetSelect.replaceChildren(...options);

    presetSelect.addEventListener('change', () => {
      if (presetSelect.value === 'custom') return;
      applyGains(gainsForPreset(presetSelect.value));
    });
  }

  buildBands();
  buildPresets();

  powerButton.addEventListener('click', () => {
    const next = !state.store.settings.eqEnabled;
    saveSettings({ eqEnabled: next });
    setEnabled(next);
  });

  $('#btn-eq-reset').addEventListener('click', () => {
    applyGains(gainsForPreset('flat'));
    preampSlider.value = '0';
    preampValue.textContent = '0';
    equalizer.setPreamp(0);
    saveSettings({ preamp: 0 });
  });

  preampSlider.addEventListener('input', () => {
    const value = Number(preampSlider.value);
    equalizer.setPreamp(value);
    paintValue(preampValue, value);
    saveSettings({ preamp: value });
  });

  toggleButton.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggleButton.classList.toggle('is-on', !panel.hidden);
    toggleButton.title = panel.hidden ? 'Pokaż korektor' : 'Ukryj korektor';
  });

  return {
    /** Load the stored curve on startup. */
    render() {
      const { eqGains, eqEnabled, preamp } = state.store.settings;
      applyGains(eqGains, { persist: false });
      preampSlider.value = String(preamp);
      paintValue(preampValue, preamp);
      equalizer.setPreamp(preamp);
      setEnabled(eqEnabled);
    },

    open() {
      panel.hidden = false;
      toggleButton.classList.add('is-on');
    },
  };
}

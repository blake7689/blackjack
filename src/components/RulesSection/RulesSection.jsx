import { RULE_PRESETS, CUSTOM, rulePresetOf } from "../../utils/rulePresets";
import { houseEdge, formatEdge, formatDelta } from "../../utils/houseEdge";
import {
  GROUPS, RULES_TITLE, CUSTOMIZE_TITLE, VARIATIONS_TITLE, ADVANCED_TITLE, EDGE_NOTE, VARIATIONS_NOTE, ADVANCED_NOTE,
  visibleIn, togglesIn, choicesFor, selectedValue, patchFor, ruleSummary,
} from "../../utils/ruleCatalog";

// The rules section of the Settings Game tab (#91): preset tiles with their house edge, the Customize groups, House variations and
// Advanced. Everything here applies at once through `onApply(patch)`; Settings decides about the reset confirmation. It reads only the
// applied settings, so a tile and the table can never disagree.

const EdgeText = ({ edge }) => <span className="rule-edge"><span aria-hidden="true">{"≈ "}</span><span className="sr-only">about </span>{formatEdge(edge)} house edge</span>;

function Summary({ settings }) {
  return ruleSummary(settings).map((line, i) => <span key={i} className="rule-line">{line}</span>);
}

function Segmented({ rule, settings, onApply }) {
  const id = `rule-${rule.key}`;
  const choices = choicesFor(rule, settings);
  const hint = choices.find((c) => c.selected)?.hint ?? rule.hint;
  return (
    <div className="rule-row">
      <div id={id} className="rule-label">{rule.label(selectedValue(rule, settings))}</div>
      <div role="group" aria-labelledby={id} className="seg">
        {choices.map((c) => {
          const delta = formatDelta(c.delta);
          return (
            <button key={String(c.value)} type="button" aria-pressed={c.selected} className={`seg-btn${c.selected ? " selected" : ""}`}
              onClick={() => { if (!c.selected) onApply(c.patch); }}>
              {c.label}
              {delta && <small className="rule-delta"> {delta}<span className="sr-only"> house edge</span></small>}
            </button>
          );
        })}
      </div>
      {hint && <p className="chip-hint">{hint}</p>}
    </div>
  );
}

function Toggles({ title, note, section, settings, onApply }) {
  return (
    <details className="rule-details">
      <summary>{title}</summary>
      <p className="chip-hint">{note}</p>
      {togglesIn(section, settings).map((rule) => {
        const disabled = rule.disabledWhen?.(settings) ?? false;
        const forced = rule.forcedOn?.(settings) ?? false;
        return (
          <label key={rule.id ?? rule.key} className="toggle-row">
            <input type="checkbox" className="checkbox-input" disabled={disabled || forced}
              checked={(selectedValue(rule, settings) && !disabled) || forced}
              onChange={(e) => onApply(patchFor(rule, e.target.checked, settings))} />
            {rule.label()}
          </label>
        );
      })}
    </details>
  );
}

export default function RulesSection({ settings, onApply }) {
  const current = rulePresetOf(settings);
  const edge = houseEdge(settings);
  const rules = visibleIn(settings);
  return (
    <section aria-labelledby="rules-heading" className="rules-section">
      <h3 id="rules-heading">{RULES_TITLE}</h3>
      <div role="group" aria-labelledby="rules-heading" className="rule-tiles">
        {Object.entries(RULE_PRESETS).map(([name, preset]) => (
          <button key={name} type="button" aria-pressed={current === name} className={`rule-tile${current === name ? " selected" : ""}`}
            onClick={() => { if (current !== name) onApply(preset); }}>
            <strong>{name}</strong>
            <Summary settings={preset} />
            <EdgeText edge={houseEdge(preset)} />
          </button>
        ))}
        {current === CUSTOM && (
          <div className="rule-tile selected" aria-current="true">
            <strong>{CUSTOM}</strong>
            <Summary settings={settings} />
            <EdgeText edge={edge} />
          </div>
        )}
      </div>
      <p className="chip-hint">{EDGE_NOTE}</p>
      <p aria-live="polite" className="chip-hint">This table: <EdgeText edge={edge} /> (estimate)</p>
      <details className="rule-details">
        <summary>{CUSTOMIZE_TITLE}</summary>
        {GROUPS.map((group) => (
          <div key={group} className="rule-group">
            <h4>{group}</h4>
            {rules.filter((rule) => rule.group === group).map((rule) => <Segmented key={rule.key} rule={rule} settings={settings} onApply={onApply} />)}
          </div>
        ))}
      </details>
      <Toggles title={VARIATIONS_TITLE} note={VARIATIONS_NOTE} section="variations" settings={settings} onApply={onApply} />
      <Toggles title={ADVANCED_TITLE} note={ADVANCED_NOTE} section="advanced" settings={settings} onApply={onApply} />
    </section>
  );
}

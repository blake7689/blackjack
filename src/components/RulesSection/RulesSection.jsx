import PresetDropdown from "../SettingsControls/PresetDropdown";
import { Group, Row, Radio, Switch } from "../SettingsControls/Controls";
import { formatDelta } from "../../utils/houseEdge";
import { GROUPS, VARIATIONS_TITLE, ADVANCED_TITLE, EDGE_NOTE, visibleIn, togglesIn, choicesFor, patchFor } from "../../utils/ruleCatalog";

// The body of Settings' Table rules section (#91, #84): the preset dropdown with its house edge, then flat groups (Shoe, Dealer, Payouts,
// Doubling, Splitting, Surrender, House variations, Advanced). It edits the draft through `onApply(patch)` (Settings decides what a patch
// does) and reads only `settings`, the draft, so the dropdown, the edge and the controls can never disagree. A rule the current mode hides
// is not shown (ruleCatalog's `showWhen`), and a group with nothing to show has no heading. //

function Rule({ rule, settings, onApply }) {
  return (
    <Row id={rule.key} label={rule.label()} hint={rule.hint}>
      {choicesFor(rule, settings).map((c) => {
        const delta = formatDelta(c.delta);
        return (
          <Radio key={String(c.value)} checked={c.selected} data-rule={rule.key} data-v={String(c.value)} title={c.hint}
            onClick={() => { if (!c.selected) onApply(c.patch); }}>
            <span>{c.label}</span>
            {delta && <span className="d">{delta}<span className="sr-only"> house edge</span></span>}
          </Radio>
        );
      })}
    </Row>
  );
}

function Toggle({ toggle, settings, onApply }) {
  const disabled = toggle.disabledWhen?.(settings) ?? false;
  const forced = toggle.forcedOn?.(settings) ?? false;
  return (
    <Switch id={toggle.key} label={toggle.label()} hint={toggle.hint} disabled={disabled || forced} checked={forced || (settings[toggle.key] && !disabled)}
      onChange={(on) => onApply(patchFor(toggle, on, settings))} />
  );
}

export default function RulesSection({ settings, onApply }) {
  const rules = visibleIn(settings);
  const toggles = (section) => togglesIn(section, settings).map((t) => <Toggle key={t.key} toggle={t} settings={settings} onApply={onApply} />);
  return (
    <>
      <PresetDropdown settings={settings} onPick={onApply} />
      <p className="note">{EDGE_NOTE}</p>
      {GROUPS.map((group) => (
        <Group key={group} title={group}>
          {rules.filter((rule) => rule.group === group).map((rule) => <Rule key={rule.key} rule={rule} settings={settings} onApply={onApply} />)}
        </Group>
      ))}
      <Group title={VARIATIONS_TITLE}>{toggles("variations")}</Group>
      <Group title={ADVANCED_TITLE}>{toggles("advanced")}</Group>
    </>
  );
}

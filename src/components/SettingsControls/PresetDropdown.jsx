import { useEffect, useId, useRef, useState } from "react";
import { RULE_PRESETS, CUSTOM, rulePresetOf } from "../../utils/rulePresets";
import { houseEdge, formatEdge } from "../../utils/houseEdge";
import { ruleSummary } from "../../utils/ruleCatalog";

// The preset dropdown (#84): a button showing the preset and its house edge, and a listbox of the five presets with theirs. "Custom" heads the
// list while a rule is edited: it is a state, not a choice. A select-only combobox: arrows, Home / End, Enter or Space picks, Escape closes, a
// letter jumps. `onPick(preset)` gets the preset's rules; picking the one already chosen does nothing. //
export default function PresetDropdown({ settings, onPick }) {
  const current = rulePresetOf(settings);
  const names = [...(current === CUSTOM ? [CUSTOM] : []), ...Object.keys(RULE_PRESETS)];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(current);
  const wrap = useRef(null);
  const button = useRef(null);
  const list = useRef(null);
  const labelId = useId();
  const listId = useId();
  const optionId = (name) => `${listId}-${name.replace(/ /g, "-")}`;
  const edge = (name) => formatEdge(houseEdge(name === CUSTOM ? settings : RULE_PRESETS[name]));

  useEffect(() => { if (open) list.current.focus(); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = (focus) => { setOpen(false); if (focus) button.current.focus(); };
  const pick = (name) => { close(true); if (name !== CUSTOM && name !== current) onPick(RULE_PRESETS[name]); };
  const openList = () => { setActive(current); setOpen(true); };

  const onListKey = (e) => {
    const choices = names.filter((n) => n !== CUSTOM);
    const at = choices.indexOf(active);
    let next = at;
    if (e.key === "ArrowDown") next = Math.min(choices.length - 1, at + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, at - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = choices.length - 1;
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); return pick(active); }
    else if (e.key === "Escape") { e.preventDefault(); return close(true); }
    else if (e.key === "Tab") return close(false);
    else if (/^[a-z]$/i.test(e.key)) next = Math.max(0, choices.findIndex((n) => n.toLowerCase().startsWith(e.key.toLowerCase())));
    else return undefined;
    e.preventDefault();
    return setActive(choices[Math.max(0, next)]);
  };

  return (
    <div className="pdd" ref={wrap}>
      <span className="pdd-l" id={labelId}>Preset</span>
      <button type="button" className="pdd-b" ref={button} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} id={`${listId}-btn`} aria-labelledby={`${labelId} ${listId}-btn`}
        onClick={() => (open ? close(true) : openList())}
        onKeyDown={(e) => { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openList(); } }}>
        <span className="pdd-n">{current}</span>
        <span className="pdd-e"><b className="num">{edge(current)}</b> house edge</span>
        <svg className="chev" aria-hidden="true" focusable="false"><use href="#i-chevron" /></svg>
      </button>
      {open && (
        <ul className="pdd-list" id={listId} ref={list} role="listbox" tabIndex={-1} aria-labelledby={labelId} aria-activedescendant={optionId(active)} onKeyDown={onListKey}>
          {names.map((name) => {
            const custom = name === CUSTOM;
            return (
              <li key={name} id={optionId(name)} role="option" aria-selected={name === current} aria-disabled={custom || undefined} data-preset={custom ? undefined : name}
                className={`${custom ? "custom " : ""}${name === active ? "active" : ""}`} title={ruleSummary(custom ? settings : RULE_PRESETS[name]).join(" · ")}
                onMouseMove={() => !custom && setActive(name)} onClick={() => pick(name)}>
                <span className="po-n">{name}</span>
                <span className="po-e num">{edge(name)}</span>
                <svg className="tick" aria-hidden="true" focusable="false"><use href="#i-check" /></svg>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

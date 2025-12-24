import { Caption1, Combobox, Option } from "@fluentui/react-components";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import builtinMappings from "../assets/builtin_mappings.json";
import { buildIndex, searchMappings, MappingEntry, SearchHit } from "../lib/search";
import { getSettings, listUserMappings } from "../lib/db";

type SelectionState = {
  hits: SearchHit[];
  selectedIndex: number;
};

const INITIAL_SELECTION: SelectionState = { hits: [], selectedIndex: 0 };

export default function QuickInput() {
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<SelectionState>(INITIAL_SELECTION);
  const [userMappings, setUserMappings] = useState<MappingEntry[]>([]);
  const [hotkeyHint, setHotkeyHint] = useState("Alt+S");
  const committingRef = useRef(false);
  const refreshingRef = useRef(false);

  const mergedMappings = useMemo(() => {
    const map = new Map<string, MappingEntry>();
    (builtinMappings as MappingEntry[]).forEach((e) => map.set(e.key, e));
    userMappings.forEach((e) => map.set(e.key, e)); // user overrides exact key
    return Array.from(map.values());
  }, [userMappings]);

  const indexed = useMemo(() => buildIndex(mergedMappings), [mergedMappings]);

  useEffect(() => {
    const hits = searchMappings(indexed, query);
    setSelection({
      hits,
      selectedIndex: hits.length ? 0 : -1,
    });
  }, [indexed, query]);

  const refreshData = async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      setUserMappings(await listUserMappings());
      const s = await getSettings();
      setHotkeyHint(s.hotkey);
      if (s.hotkey) {
        await invoke("update_hotkey", { hotkey: s.hotkey });
      }
    } finally {
      refreshingRef.current = false;
    }
  };

  useEffect(() => {
    void refreshData();
  }, []);

  useEffect(() => {
    const onFocus = () => {
      void refreshData();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

useEffect(() => {
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      void invoke("hide_quick_input");
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);

const selected = selection.selectedIndex >= 0 ? selection.hits[selection.selectedIndex] : null;

const handleComboChange = (event: ChangeEvent<HTMLInputElement>) => {
  setQuery(event.target.value);
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const handleCommit = async (value?: string) => {
  if (!value || committingRef.current) return;
  committingRef.current = true;
  try {
    await invoke("hide_quick_input");
    await wait(30);
    await invoke("insert_text", { text: value });
    setQuery("");
  } finally {
    committingRef.current = false;
  }
};

  const handleKeyDown = (ev: ReactKeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      const target = selected?.entry.value ?? selection.hits[0]?.entry.value;
      void handleCommit(target);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      void invoke("hide_quick_input");
    }
  };

  return (
    <div className="quick-shell combobox-only">
      <Combobox
        appearance="underline"
        freeform
        autoFocus
        value={query}
        placeholder={`Type a key, e.g. sigma (${hotkeyHint})`}
        onChange={handleComboChange as any}
        onKeyDown={handleKeyDown}
        onOptionSelect={(_, data) => {
          if (!data.optionValue) return;
          const idx = selection.hits.findIndex((h) => h.entry.value === data.optionValue);
          setSelection((prev) => ({ ...prev, selectedIndex: idx }));
          void handleCommit(data.optionValue);
        }}
      >
        {selection.hits.map((hit, index) => (
          <Option key={`${hit.entry.key}-${index}`} value={hit.entry.value} text={hit.entry.key}>
            <span className="combo-value">{hit.entry.value}</span>
            <span className="combo-key">{hit.entry.key}</span>
            {hit.entry.note ? <Caption1 className="combo-note">{hit.entry.note}</Caption1> : null}
          </Option>
        ))}
      </Combobox>
    </div>
  );
}


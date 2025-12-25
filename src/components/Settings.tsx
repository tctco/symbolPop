import {
  Body1,
  Button,
  Badge,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  Table,
  TableBody,
  TableCell,
  TableCellLayout,
  TableColumnDefinition,
  TableHeader,
  TableHeaderCell,
  TableRow,
  createTableColumn,
  Title2,
  Toaster,
  Toast,
  ToastTitle,
  Tooltip,
  useToastController,
} from "@fluentui/react-components";
import {
  EditRegular,
  DeleteRegular,
  AddRegular,
  ArrowClockwiseRegular,
  OpenRegular,
  SaveRegular,
  DismissRegular,
  ArrowLeftRegular,
  ArrowRightRegular,
} from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useMemo, useState, useRef } from "react";
import { deleteUserMapping, getSettings, listUserMappings, saveSettings, upsertUserMapping } from "../lib/db";

type MappingRow = {
  key: string;
  value: string;
  note?: string;
};

function HotKeyRecorder({ initialHotkey, onSave }: { initialHotkey: string; onSave: (h: string) => Promise<void> }) {
  const [isEditing, setIsEditing] = useState(false);
  const [hotkey, setHotkey] = useState(initialHotkey);
  const [hint, setHint] = useState("Click Edit to change");
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setHotkey(initialHotkey);
  }, [initialHotkey]);

  useEffect(() => {
    if (isEditing && buttonRef.current) {
      buttonRef.current.focus();
    }
  }, [isEditing]);

  const handleCapture = (ev: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!isEditing) return;
    ev.preventDefault();
    ev.stopPropagation();

    const parts: string[] = [];
    if (ev.ctrlKey) parts.push("Ctrl");
    if (ev.shiftKey) parts.push("Shift");
    if (ev.altKey) parts.push("Alt");
    if (ev.metaKey) parts.push("Win");

    const key = ev.key;
    const isModifierOnly = key === "Control" || key === "Shift" || key === "Alt" || key === "Meta";
    if (!isModifierOnly) {
      if (key.length === 1) {
        parts.push(key.toUpperCase());
      } else {
        parts.push(key);
      }
    }

    const hasModifier = ev.ctrlKey || ev.shiftKey || ev.altKey || ev.metaKey;
    if (!hasModifier) {
      setHint("Need a modifier (Ctrl/Alt/Shift/Win)");
      return;
    }

    if (parts.length === 0) {
      setHint("Press a key combo");
      return;
    }

    const combo = parts.join("+");
    setHotkey(combo);
    setHint("Captured");
  };

  const renderKeycaps = (combo: string) => {
    if (!combo) return null;
    const tokens = combo.split("+");
    return tokens.map((token, idx) => (
      <span key={token + idx} style={{ display: "inline-flex", alignItems: "center" }}>
        <Badge appearance="tint" size="small" className="keycap">
          {token}
        </Badge>
        {idx < tokens.length - 1 && <span style={{ margin: "0 1px" }}>+</span>}
      </span>
    ));
  };

  const startEdit = () => {
    setIsEditing(true);
    setHint("Press keys...");
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setHotkey(initialHotkey);
    setHint("Click Edit to change");
  };

  const saveEdit = async () => {
    await onSave(hotkey);
    setIsEditing(false);
    setHint("Saved");
  };

  return (
    <div className="settings-row">
      <Button
        ref={buttonRef}
        appearance="secondary"
        onKeyDown={handleCapture}
        className="hotkey-capture"
        disabled={!isEditing}
        tabIndex={0}
      >
        {renderKeycaps(hotkey) ?? hotkey}
      </Button>
      <Caption1 className="capture-hint">{hint}</Caption1>
      <div className="hotkey-recorder-actions">
        {isEditing ? (
          <>
            <Tooltip content="Save" relationship="label">
              <Button icon={<SaveRegular />} appearance="primary" onClick={saveEdit} />
            </Tooltip>
            <Tooltip content="Cancel" relationship="label">
              <Button icon={<DismissRegular />} appearance="subtle" onClick={cancelEdit} />
            </Tooltip>
          </>
        ) : (
          <Tooltip content="Edit hotkey" relationship="label">
            <Button icon={<EditRegular />} appearance="subtle" onClick={startEdit} />
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const [hotkey, setHotkey] = useState("Alt+S");
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MappingRow | null>(null);
  const [form, setForm] = useState<MappingRow>({ key: "", value: "", note: "" });
  const { dispatchToast } = useToastController();
  const [version, setVersion] = useState("");

  const columns: TableColumnDefinition<MappingRow>[] = useMemo(
    () => [
      createTableColumn<MappingRow>({ columnId: "key", renderCell: (item) => item.key }),
      createTableColumn<MappingRow>({ columnId: "value", renderCell: (item) => item.value }),
      createTableColumn<MappingRow>({ columnId: "note", renderCell: (item) => item.note ?? "" }),
      createTableColumn<MappingRow>({
        columnId: "actions",
        renderCell: (item) => (
          <div className="table-actions">
            <Tooltip content="Edit" relationship="label">
              <Button
                size="small"
                appearance="subtle"
                icon={<EditRegular />}
                onClick={() => {
                  setEditing(item);
                  setForm(item);
                  setDialogOpen(true);
                }}
              />
            </Tooltip>
            <Tooltip content="Delete" relationship="label">
              <Button
                size="small"
                appearance="subtle"
                icon={<DeleteRegular />}
                onClick={async () => {
                  await deleteUserMapping(item.key);
                  void refreshMappings();
                }}
              />
            </Tooltip>
          </div>
        ),
      }),
    ],
    [],
  );

  useEffect(() => {
    void refreshAll();
    void getVersion()
      .then((v) => setVersion(v))
      .catch(() => setVersion(""));
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return mappings;
    return mappings.filter((m) => {
      const haystack = [m.key, m.value, m.note ?? ""].map((v) => v.toLowerCase());
      return haystack.some((text) => text.includes(term));
    });
  }, [mappings, search]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);

  useEffect(() => {
    setPage(0);
  }, [search]);

  const paged = useMemo(
    () => filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize),
    [filtered, currentPage],
  );

  const refreshMappings = async () => {
    const rows = await listUserMappings();
    setMappings(rows.sort((a, b) => a.key.localeCompare(b.key)));
  };

  const refreshSettings = async () => {
    const s = await getSettings();
    setHotkey(s.hotkey);
  };

  const refreshAll = async () => {
    await Promise.all([refreshMappings(), refreshSettings()]);
  };

  const resetForm = () => {
    setEditing(null);
    setForm({ key: "", value: "", note: "" });
  };

  const submitForm = async () => {
    if (!form.key.trim() || !form.value.trim()) return;
    await upsertUserMapping({ key: form.key.trim(), value: form.value, note: form.note ?? "" });
    await refreshMappings();
    setDialogOpen(false);
    resetForm();
  };

  const notify = (message: string) =>
    dispatchToast(
      <Toast>
        <ToastTitle>{message}</ToastTitle>
      </Toast>,
    );

  const saveHotkey = async (newHotkey: string) => {
    const trimmed = newHotkey.trim();
    if (!trimmed) return;
    try {
      await saveSettings({ id: "global", hotkey: trimmed });
      await invoke("update_hotkey", { hotkey: trimmed });
      setHotkey(trimmed);
      notify("Hotkey saved");
    } catch (err: any) {
      notify(err?.toString() ?? "Failed to save hotkey");
    }
  };

  return (
    <div className="manager-shell">
      <Toaster position="bottom-end" />
      <Title2>Settings</Title2>

      <section className="settings-block">
        <Body1>Hotkey</Body1>
        <Caption1>Set the global shortcut (e.g., Alt+S, Ctrl+Shift+Space).</Caption1>
        <HotKeyRecorder initialHotkey={hotkey} onSave={saveHotkey} />
      </section>

      <section className="settings-block">
        <div className="settings-header">
          <Body1>User mappings</Body1>
          <Dialog open={dialogOpen} onOpenChange={(_, data) => setDialogOpen(data.open)}>
            <DialogTrigger disableButtonEnhancement>
              <Tooltip content="Add new mapping" relationship="label">
                <Button size="small" icon={<AddRegular />} appearance="primary" onClick={resetForm}>
                </Button>
              </Tooltip>
            </DialogTrigger>
            <DialogSurface style={{ maxWidth: "400px" }}>
              <DialogBody>
                <DialogTitle>
                  <Body1 block>{editing ? "Edit mapping" : "Add mapping"}</Body1>
                </DialogTitle>
                <DialogContent>
                  <Field label="Key" size="small">
                    <Input size="small" value={form.key} onChange={(_, d) => setForm((f) => ({ ...f, key: d.value }))} />
                  </Field>
                  <Field label="Value" size="small">
                    <Input size="small" value={form.value} onChange={(_, d) => setForm((f) => ({ ...f, value: d.value }))} />
                  </Field>
                  <Field label="Note (optional)" size="small">
                    <Input size="small" value={form.note ?? ""} onChange={(_, d) => setForm((f) => ({ ...f, note: d.value }))} />
                  </Field>
                </DialogContent>
                <DialogActions>
                  <DialogTrigger disableButtonEnhancement>
                    <Button size="small" icon={<DismissRegular />} appearance="secondary" onClick={resetForm}>
                      Cancel
                    </Button>
                  </DialogTrigger>
                  <Button size="small" icon={<SaveRegular />} appearance="primary" onClick={submitForm}>
                    Save
                  </Button>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>
        </div>

        <div className="table-toolbar">
          <Caption1>{filtered.length} items</Caption1>
          <Input
            size="small"
            appearance="outline"
            placeholder="Search mappings"
            value={search}
            onChange={(_, d) => setSearch(d.value)}
            className="table-search"
          />
        </div>

        <Table aria-label="User mappings" size="extra-small">
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHeaderCell key={col.columnId}>{col.columnId}</TableHeaderCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((item) => (
              <TableRow key={item.key}>
                {columns.map((col) => (
                  <TableCell key={col.columnId}>
                    <TableCellLayout>{col.renderCell(item)}</TableCellLayout>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="table-footer">
          <div className="pager">
            <Tooltip content="Previous page" relationship="label">
              <Button
                size="small"
                appearance="subtle"
                icon={<ArrowLeftRegular />}
                disabled={currentPage <= 0}
                onClick={() => setPage((prev) => Math.max(0, prev - 1))}
              />
            </Tooltip>
            <Caption1>
              Page {pageCount === 0 ? 0 : currentPage + 1} / {pageCount}
            </Caption1>
            <Tooltip content="Next page" relationship="label">
              <Button
                size="small"
                appearance="subtle"
                icon={<ArrowRightRegular />}
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage((prev) => Math.min(pageCount - 1, prev + 1))}
              />
            </Tooltip>
          </div>
        </div>
      </section>

      <div className="settings-footer">
        <Caption1>{version ? `Version ${version}` : "Version unknown"}</Caption1>
        <div className="manager-actions">
          <Tooltip content="Launch Quick Input" relationship="label">
            <Button size="small" icon={<OpenRegular />} appearance="secondary" onClick={() => invoke("toggle_quick_input")}>
              Open Quick Input
            </Button>
          </Tooltip>
          <Tooltip content="Refresh all data" relationship="label">
            <Button size="small" icon={<ArrowClockwiseRegular />} appearance="secondary" onClick={refreshAll}>
              Refresh
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}


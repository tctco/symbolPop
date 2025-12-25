import { openDB, DBSchema, IDBPDatabase } from "idb";

type UserMapping = {
  key: string;
  value: string;
  note?: string;
  tags?: string[];
  created_at: number;
  updated_at: number;
};

type Settings = {
  id: "global";
  hotkey: string;
  recentKeys?: string[];
};

interface SymbolPopDB extends DBSchema {
  user_mappings: {
    key: string;
    value: UserMapping;
    indexes: { key_lower: string; updated_at: number };
  };
  settings: {
    key: string;
    value: Settings;
  };
}

const DB_NAME = "unicode_quick_input";
const DB_VERSION = 1;
const RECENT_LIMIT = 30;

async function getDB(): Promise<IDBPDatabase<SymbolPopDB>> {
  return openDB<SymbolPopDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("user_mappings")) {
        const store = db.createObjectStore("user_mappings", { keyPath: "key" });
        store.createIndex("key_lower", "key_lower", { unique: false });
        store.createIndex("updated_at", "updated_at", { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }
    },
  });
}

export async function upsertUserMapping(entry: Omit<UserMapping, "created_at" | "updated_at">) {
  const db = await getDB();
  const now = Date.now();
  const existing = await db.get("user_mappings", entry.key);
  const record: UserMapping = {
    ...entry,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  await db.put("user_mappings", { ...record, key_lower: entry.key.toLowerCase() } as any);
}

export async function deleteUserMapping(key: string) {
  const db = await getDB();
  await db.delete("user_mappings", key);
}

export async function listUserMappings(): Promise<UserMapping[]> {
  const db = await getDB();
  const tx = db.transaction("user_mappings", "readonly");
  const store = tx.objectStore("user_mappings");
  const values = await store.getAll();
  await tx.done;
  return values as any;
}

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const settings = await db.get("settings", "global");
  return settings ?? { id: "global", hotkey: "Alt+S", recentKeys: [] };
}

export async function saveSettings(settings: Settings) {
  const db = await getDB();
  await db.put("settings", settings);
}

export async function recordRecentKey(key: string) {
  const settings = await getSettings();
  const current = settings.recentKeys ?? [];
  const next = [key, ...current.filter((k) => k !== key)].slice(0, RECENT_LIMIT);
  await saveSettings({ ...settings, recentKeys: next });
}

export async function getRecentKeys(): Promise<string[]> {
  const settings = await getSettings();
  return settings.recentKeys ?? [];
}


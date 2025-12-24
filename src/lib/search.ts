export type MappingEntry = {
  key: string;
  value: string;
  note?: string;
};

type IndexedEntry = {
  entry: MappingEntry;
  keyLower: string;
  noteLower: string;
};

export type SearchHit = {
  entry: MappingEntry;
  matchType: "exact" | "prefix" | "substring";
  caseSensitive: boolean;
};

export function buildIndex(entries: MappingEntry[]): IndexedEntry[] {
  return entries.map((entry) => ({
    entry,
    keyLower: entry.key.toLowerCase(),
    noteLower: entry.note ? entry.note.toLowerCase() : "",
  }));
}

export function searchMappings(indexed: IndexedEntry[], query: string): SearchHit[] {
  const raw = query.trim();
  const q = raw.toLowerCase();
  if (!q) {
    return indexed.map((item) => ({ entry: item.entry, matchType: "substring", caseSensitive: false }));
  }

  const hits: SearchHit[] = [];
  indexed.forEach((item) => {
    const noteMatch = item.noteLower && item.noteLower.includes(q);

    if (item.entry.key === raw) {
      hits.push({
        entry: item.entry,
        matchType: "exact",
        caseSensitive: true,
      });
    } else if (item.entry.key.startsWith(raw)) {
      hits.push({ entry: item.entry, matchType: "prefix", caseSensitive: true });
    } else if (item.keyLower === q) {
      hits.push({
        entry: item.entry,
        matchType: "exact",
        caseSensitive: false,
      });
    } else if (item.keyLower.startsWith(q)) {
      hits.push({ entry: item.entry, matchType: "prefix", caseSensitive: false });
    } else if (item.keyLower.includes(q) || noteMatch) {
      hits.push({ entry: item.entry, matchType: "substring", caseSensitive: false });
    }
  });

  const weight = (hit: SearchHit): number => {
    if (hit.matchType === "exact" && hit.caseSensitive) return 0;
    if (hit.matchType === "prefix" && hit.caseSensitive) return 1;
    switch (hit.matchType) {
      case "exact":
        return 2;
      case "prefix":
        return 3;
      default:
        return 4;
    }
  };

  return hits.sort((a, b) => {
    const diff = weight(a) - weight(b);
    if (diff !== 0) return diff;
    return a.entry.key.localeCompare(b.entry.key);
  });
}


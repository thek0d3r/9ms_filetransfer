export function safeFilename(input: string) {
  const cleaned = input
    .normalize("NFKC")
    .replace(/[\\/\0-\x1f\x7f]+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return (cleaned || "file").slice(0, 180);
}

export function contentDisposition(filename: string) {
  const safe = safeFilename(filename);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export function uniqueArchiveNames(names: string[]) {
  const used = new Set<string>();
  return names.map((name) => {
    const safe = safeFilename(name);
    let candidate = safe;
    let counter = 2;
    const dot = safe.lastIndexOf(".");
    const base = dot > 0 ? safe.slice(0, dot) : safe;
    const ext = dot > 0 ? safe.slice(dot) : "";
    while (used.has(candidate.toLowerCase())) candidate = `${base} (${counter++})${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

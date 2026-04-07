export interface BoardStorageOptions {
  namespace?: string;
  dbName?: string;
  dbVersion?: number;
  blobStoreName?: string;
}

export interface BoardNodeMeta {
  id: string;
  x: number;
  y: number;
  text?: unknown;
  blobKey?: string;
  [key: string]: unknown;
}

export interface BoardStorageSnapshot {
  version: 1;
  exportedAt: string;
  namespace: string;
  dbName: string;
  dbVersion: number;
  blobStoreName: string;
  localStorageEntries: Record<string, unknown>;
  blobs: Record<string, string>;
}

export interface BoardStorageExportSnapshotOptions {
  includeBlobs?: boolean;
}

export interface BoardStorageImportSnapshotOptions {
  applyBlobs?: boolean;
}

export interface BoardStorageChangeEvent {
  scope: "node" | "board-meta" | "blob" | "snapshot";
  key: string;
  operation: "set" | "remove" | "clear" | "import";
}

export type BoardStorageChangeListener = (
  event: BoardStorageChangeEvent
) => void;

function resolveOriginScopeToken(): string {
  if (typeof window === "undefined") {
    return "origin-unknown";
  }

  const rawOrigin = window.location.origin === "null"
    ? "local-file"
    : window.location.origin;
  const normalized = rawOrigin
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? `origin-${normalized}` : "origin-unknown";
}

function hasOriginScopedNamespace(namespace: string): boolean {
  return /@origin-[a-z0-9-]+$/.test(namespace);
}

function assertBrowserApi(apiName: "indexedDB" | "localStorage"): void {
  if (typeof window === "undefined" || !(apiName in window)) {
    throw new Error(`${apiName} is not available in the current runtime.`);
  }
}

function canUseLocalStorage(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const probeKey = "__board_storage_probe__";
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error("IndexedDB transaction was aborted.")
      );
  });
}

function toBlob(value: Blob | ArrayBuffer | Uint8Array): Blob {
  if (value instanceof Blob) {
    return value;
  }

  if (value instanceof Uint8Array) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    return new Blob([copy.buffer]);
  }

  return new Blob([value]);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to convert blob to data URL."));
        return;
      }

      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed."));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  if (!dataUrl.startsWith("data:")) {
    throw new Error("Invalid data URL.");
  }

  const separatorIndex = dataUrl.indexOf(",");
  if (separatorIndex < 0) {
    throw new Error("Invalid data URL payload.");
  }

  const metadata = dataUrl.slice(5, separatorIndex);
  const payload = dataUrl.slice(separatorIndex + 1);
  const metadataParts = metadata.split(";").filter(Boolean);
  const mimeType = metadataParts[0] || "application/octet-stream";
  const isBase64Payload = metadataParts.includes("base64");

  if (!isBase64Payload) {
    return new Blob([decodeURIComponent(payload)], { type: mimeType });
  }

  const binaryPayload = atob(payload.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binaryPayload.length);

  for (let index = 0; index < binaryPayload.length; index += 1) {
    bytes[index] = binaryPayload.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

export class BoardStorage {
  private readonly namespace: string;
  private readonly legacyNamespace: string | null;
  private readonly dbName: string;
  private readonly dbVersion: number;
  private readonly blobStoreName: string;
  private readonly blobKeyPrefix: string;
  private readonly legacyBlobKeyPrefix: string | null;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly changeListeners = new Set<BoardStorageChangeListener>();

  constructor(options: BoardStorageOptions = {}) {
    const baseNamespace = options.namespace ?? "board";
    const scopedNamespace = hasOriginScopedNamespace(baseNamespace)
      ? baseNamespace
      : `${baseNamespace}@${resolveOriginScopeToken()}`;

    this.namespace = scopedNamespace;
    this.legacyNamespace = scopedNamespace === baseNamespace ? null : baseNamespace;
    this.dbName = options.dbName ?? `${baseNamespace}-assets`;
    this.dbVersion = options.dbVersion ?? 1;
    this.blobStoreName = options.blobStoreName ?? "blobs";
    this.blobKeyPrefix = `${this.namespace}:blob:`;
    this.legacyBlobKeyPrefix = this.legacyNamespace
      ? `${this.legacyNamespace}:blob:`
      : null;

    this.migrateLegacyLocalStorageKeys();
  }

  async setBlob(
    key: string,
    value: Blob | ArrayBuffer | Uint8Array
  ): Promise<void> {
    const blob = toBlob(value);
    const db = await this.openDb();
    const transaction = db.transaction(this.blobStoreName, "readwrite");

    transaction
      .objectStore(this.blobStoreName)
      .put(blob, this.toScopedBlobKey(key));
    await transactionDone(transaction);
    this.emitChange({ scope: "blob", key, operation: "set" });
  }

  async getBlob(key: string): Promise<Blob | null> {
    const db = await this.openDb();
    const transaction = db.transaction(this.blobStoreName, "readonly");
    const store = transaction.objectStore(this.blobStoreName);

    let blob = await requestToPromise<Blob | undefined>(
      store.get(this.toScopedBlobKey(key))
    );
    let migratedFromLegacy = false;

    if (!blob) {
      const legacyKey = this.toLegacyBlobKey(key);
      if (legacyKey) {
        blob = await requestToPromise<Blob | undefined>(store.get(legacyKey));
        migratedFromLegacy = !!blob;
      }
    }

    await transactionDone(transaction);

    if (blob && migratedFromLegacy) {
      void this.setBlob(key, blob).catch(() => undefined);
    }

    return blob ?? null;
  }

  async removeBlob(key: string): Promise<void> {
    const db = await this.openDb();
    const transaction = db.transaction(this.blobStoreName, "readwrite");
    const store = transaction.objectStore(this.blobStoreName);
    const legacyKey = this.toLegacyBlobKey(key);

    store.delete(this.toScopedBlobKey(key));
    if (legacyKey) {
      store.delete(legacyKey);
    }

    await transactionDone(transaction);
    this.emitChange({ scope: "blob", key, operation: "remove" });
  }

  async clearBlobs(): Promise<void> {
    const db = await this.openDb();
    const transaction = db.transaction(this.blobStoreName, "readwrite");
    const store = transaction.objectStore(this.blobStoreName);
    const prefixes = [this.blobKeyPrefix];

    if (this.legacyBlobKeyPrefix) {
      prefixes.push(this.legacyBlobKeyPrefix);
    }

    const keys = await requestToPromise<IDBValidKey[]>(store.getAllKeys());

    for (const key of keys) {
      const keyString = String(key);
      if (prefixes.some((prefix) => keyString.startsWith(prefix))) {
        store.delete(key);
      }
    }

    await transactionDone(transaction);
    this.emitChange({ scope: "blob", key: "*", operation: "clear" });
  }

  setNodeMeta(nodeMeta: BoardNodeMeta): void {
    if (this.writeLocal(this.nodeMetaKey(nodeMeta.id), nodeMeta)) {
      this.emitChange({ scope: "node", key: nodeMeta.id, operation: "set" });
    }
  }

  setNodeMetaBatch(nodes: readonly BoardNodeMeta[]): void {
    for (const nodeMeta of nodes) {
      this.setNodeMeta(nodeMeta);
    }
  }

  getNodeMeta(nodeId: string): BoardNodeMeta | null {
    return this.readLocal<BoardNodeMeta>(this.nodeMetaKey(nodeId));
  }

  getAllNodeMeta(): BoardNodeMeta[] {
    if (!canUseLocalStorage()) {
      return [];
    }

    const prefix = this.nodeMetaPrefix();
    const results: BoardNodeMeta[] = [];

    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || !key.startsWith(prefix)) {
          continue;
        }

        const parsed = this.readLocal<BoardNodeMeta>(key);
        if (parsed) {
          results.push(parsed);
        }
      }
    } catch {
      return [];
    }

    return results;
  }

  removeNodeMeta(nodeId: string): void {
    if (!canUseLocalStorage()) {
      return;
    }

    try {
      const key = this.nodeMetaKey(nodeId);
      if (localStorage.getItem(key) === null) {
        return;
      }

      localStorage.removeItem(key);
      this.emitChange({ scope: "node", key: nodeId, operation: "remove" });
    } catch {
      // Ignore storage failures to keep UI functional.
    }
  }

  clearAllNodeMeta(): void {
    if (!canUseLocalStorage()) {
      return;
    }

    const prefix = this.nodeMetaPrefix();
    const keysToDelete: string[] = [];

    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && key.startsWith(prefix)) {
          keysToDelete.push(key);
        }
      }

      if (keysToDelete.length === 0) {
        return;
      }

      keysToDelete.forEach((key) => localStorage.removeItem(key));
      this.emitChange({ scope: "node", key: "*", operation: "clear" });
    } catch {
      // Ignore storage failures to keep UI functional.
    }
  }

  setBoardMeta<T>(key: string, value: T): void {
    if (this.writeLocal(this.boardMetaKey(key), value)) {
      this.emitChange({ scope: "board-meta", key, operation: "set" });
    }
  }

  getBoardMeta<T>(key: string): T | null {
    return this.readLocal<T>(this.boardMetaKey(key));
  }

  removeBoardMeta(key: string): void {
    if (!canUseLocalStorage()) {
      return;
    }

    try {
      const storageKey = this.boardMetaKey(key);
      if (localStorage.getItem(storageKey) === null) {
        return;
      }

      localStorage.removeItem(storageKey);
      this.emitChange({ scope: "board-meta", key, operation: "remove" });
    } catch {
      // Ignore storage failures to keep UI functional.
    }
  }

  async exportSnapshot(
    options: BoardStorageExportSnapshotOptions = {}
  ): Promise<BoardStorageSnapshot> {
    assertBrowserApi("localStorage");

    const localStorageEntries: Record<string, unknown> = {};
    const prefix = `${this.namespace}:`;

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(prefix)) {
        continue;
      }

      const rawValue = localStorage.getItem(key);
      if (rawValue === null) {
        continue;
      }

      try {
        localStorageEntries[key] = JSON.parse(rawValue);
      } catch {
        localStorageEntries[key] = rawValue;
      }
    }

    const blobs =
      options.includeBlobs === false ? {} : await this.exportBlobsAsDataUrls();

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      namespace: this.namespace,
      dbName: this.dbName,
      dbVersion: this.dbVersion,
      blobStoreName: this.blobStoreName,
      localStorageEntries,
      blobs,
    };
  }

  async importSnapshot(
    snapshot: unknown,
    options: BoardStorageImportSnapshotOptions = {}
  ): Promise<void> {
    if (!isObjectRecord(snapshot)) {
      throw new Error("Invalid board snapshot format.");
    }

    const localStorageEntriesRaw = snapshot.localStorageEntries;
    const blobsRaw = isObjectRecord(snapshot.blobs) ? snapshot.blobs : {};
    const applyBlobs = options.applyBlobs ?? true;

    if (!isObjectRecord(localStorageEntriesRaw)) {
      throw new Error("Snapshot payload is missing required fields.");
    }

    assertBrowserApi("localStorage");

    const prefix = `${this.namespace}:`;
    const legacyPrefix = this.legacyNamespace ? `${this.legacyNamespace}:` : null;
    const keysToDelete: string[] = [];

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (
        key &&
        (key.startsWith(prefix) ||
          (legacyPrefix !== null && key.startsWith(legacyPrefix)))
      ) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      localStorage.removeItem(key);
    }

    for (const [key, value] of Object.entries(localStorageEntriesRaw)) {
      let targetKey: string | null = null;

      if (key.startsWith(prefix)) {
        targetKey = key;
      } else if (legacyPrefix !== null && key.startsWith(legacyPrefix)) {
        targetKey = `${prefix}${key.slice(legacyPrefix.length)}`;
      }

      if (!targetKey) {
        continue;
      }

      localStorage.setItem(targetKey, JSON.stringify(value));
    }

    if (applyBlobs) {
      await this.clearBlobs();

      for (const [blobKey, dataUrl] of Object.entries(blobsRaw)) {
        if (typeof dataUrl !== "string") {
          continue;
        }

        const blob = await dataUrlToBlob(dataUrl);
        await this.setBlob(blobKey, blob);
      }
    }

    this.emitChange({ scope: "snapshot", key: "*", operation: "import" });
  }

  subscribe(listener: BoardStorageChangeListener): () => void {
    this.changeListeners.add(listener);

    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private async exportBlobsAsDataUrls(): Promise<Record<string, string>> {
    const db = await this.openDb();
    const transaction = db.transaction(this.blobStoreName, "readonly");
    const store = transaction.objectStore(this.blobStoreName);
    const queuedEntries: Array<{
      key: string;
      value: Blob | ArrayBuffer | Uint8Array;
    }> = [];
    const blobs: Record<string, string> = {};

    await new Promise<void>((resolve, reject) => {
      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }

        const publicKey = this.fromStorageBlobKey(String(cursor.key));

        if (!publicKey) {
          cursor.continue();
          return;
        }

        queuedEntries.push({
          key: publicKey,
          value: cursor.value as Blob | ArrayBuffer | Uint8Array,
        });

        cursor.continue();
      };

      request.onerror = () => {
        reject(request.error ?? new Error("Unable to read blobs from IndexedDB."));
      };
    });

    await transactionDone(transaction);

    for (const entry of queuedEntries) {
      try {
        blobs[entry.key] = await blobToDataUrl(toBlob(entry.value));
      } catch {
        // Skip unreadable blob entries instead of failing the whole export.
      }
    }

    return blobs;
  }

  private async openDb(): Promise<IDBDatabase> {
    assertBrowserApi("indexedDB");

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(this.blobStoreName)) {
          db.createObjectStore(this.blobStoreName);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Unable to open IndexedDB."));
    });

    return this.dbPromise;
  }

  private nodeMetaPrefix(): string {
    return `${this.namespace}:node:`;
  }

  private toScopedBlobKey(key: string): string {
    return `${this.blobKeyPrefix}${key}`;
  }

  private toLegacyBlobKey(key: string): string | null {
    if (!this.legacyBlobKeyPrefix) {
      return null;
    }

    return `${this.legacyBlobKeyPrefix}${key}`;
  }

  private fromStorageBlobKey(storedKey: string): string | null {
    if (storedKey.startsWith(this.blobKeyPrefix)) {
      return storedKey.slice(this.blobKeyPrefix.length);
    }

    if (this.legacyBlobKeyPrefix && storedKey.startsWith(this.legacyBlobKeyPrefix)) {
      return storedKey.slice(this.legacyBlobKeyPrefix.length);
    }

    return null;
  }

  private nodeMetaKey(nodeId: string): string {
    return `${this.nodeMetaPrefix()}${nodeId}`;
  }

  private boardMetaKey(key: string): string {
    return `${this.namespace}:meta:${key}`;
  }

  private migrateLegacyLocalStorageKeys(): void {
    if (!this.legacyNamespace || !canUseLocalStorage()) {
      return;
    }

    const prefix = `${this.namespace}:`;
    const legacyPrefix = `${this.legacyNamespace}:`;

    if (prefix === legacyPrefix) {
      return;
    }

    try {
      const legacyEntries: Array<{ key: string; value: string }> = [];
      let hasScopedEntries = false;

      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);

        if (!key) {
          continue;
        }

        if (key.startsWith(prefix)) {
          hasScopedEntries = true;
          break;
        }

        if (!key.startsWith(legacyPrefix)) {
          continue;
        }

        const value = localStorage.getItem(key);
        if (value === null) {
          continue;
        }

        legacyEntries.push({
          key: `${prefix}${key.slice(legacyPrefix.length)}`,
          value,
        });
      }

      if (hasScopedEntries || legacyEntries.length === 0) {
        return;
      }

      for (const entry of legacyEntries) {
        if (localStorage.getItem(entry.key) === null) {
          localStorage.setItem(entry.key, entry.value);
        }
      }
    } catch {
      // Ignore migration failures to keep storage resilient.
    }
  }

  private writeLocal<T>(key: string, value: T): boolean {
    if (!canUseLocalStorage()) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      const existing = localStorage.getItem(key);

      if (existing === serialized) {
        return false;
      }

      localStorage.setItem(key, serialized);
      return true;
    } catch {
      // Ignore storage write errors to avoid crashing the app.
      return false;
    }
  }

  private readLocal<T>(key: string): T | null {
    if (!canUseLocalStorage()) {
      return null;
    }

    try {
      const rawValue = localStorage.getItem(key);
      if (rawValue === null) {
        return null;
      }

      try {
        return JSON.parse(rawValue) as T;
      } catch {
        localStorage.removeItem(key);
        return null;
      }
    } catch {
      return null;
    }
  }

  private emitChange(event: BoardStorageChangeEvent): void {
    for (const listener of this.changeListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener failures to prevent storage operation regressions.
      }
    }
  }
}

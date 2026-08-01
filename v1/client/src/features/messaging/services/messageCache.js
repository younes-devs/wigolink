const DATABASE_NAME = 'wigolink-messaging';
const STORE_NAME = 'cache';
const DATABASE_VERSION = 1;

let databasePromise = null;

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return databasePromise;
}

async function read(key) {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    const request = database.transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

async function write(key, value) {
  const database = await openDatabase();
  if (!database) return;
  const safeValue = JSON.parse(JSON.stringify(value, (property, nestedValue) =>
    property === 'dataUrl' ? undefined : nestedValue
  ));
  await new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(safeValue, key);
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
    transaction.onabort = resolve;
  });
}

export function readInboxCache(userId) {
  return userId ? read(`inbox:${userId}`) : Promise.resolve(null);
}

export function writeInboxCache(userId, value) {
  if (userId) void write(`inbox:${userId}`, value);
}

export function readThreadCache(userId, conversationId) {
  return userId && conversationId
    ? read(`thread:${userId}:${conversationId}`)
    : Promise.resolve(null);
}

export function writeThreadCache(userId, conversationId, value) {
  if (userId && conversationId) {
    void write(`thread:${userId}:${conversationId}`, {
      ...value,
      messages: (value.messages || []).slice(-50),
    });
  }
}

import type { DataSource } from './data';
import { parseCSVSource } from './data';

const DB = 'signalhive-workbench-v2';
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sources');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Local dataset storage unavailable.'));
  });
}
export async function saveCSV(source: Extract<DataSource, { kind: 'csv' }>) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('sources', 'readwrite');
      tx.objectStore('sources').put(source, 'current-csv');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Dataset could not be saved.'));
      tx.onabort = () => reject(new Error('Dataset save was cancelled.'));
    });
  } finally {
    db.close();
  }
}
export async function restoreCSV(): Promise<Extract<DataSource, { kind: 'csv' }> | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('sources', 'readonly');
      const request = tx.objectStore('sources').get('current-csv');
      request.onsuccess = () => {
        try {
          const s = request.result;
          if (!s) return resolve(null);
          resolve(parseCSVSource(s));
        } catch {
          reject(new Error('Saved dataset is invalid; import it again.'));
        }
      };
      request.onerror = () => reject(new Error('Saved dataset unavailable.'));
    });
  } finally {
    db.close();
  }
}

// ============================================================================
// FIRESTORE MODULE
// CRUD operations for diary entries. Every entry document carries a userId
// field, and the security rules (see firestore.rules) enforce that a user
// can only ever read/write documents where userId == their own auth uid.
// ============================================================================
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const ENTRIES_COLLECTION = "entries";

/**
 * Saves a new diary entry for the given user.
 * @param {Firestore} db
 * @param {string} userId
 * @param {string} title  - may be an empty string; dashboard falls back to "Untitled entry"
 * @param {string} text
 */
export function saveEntry(db, userId, title, text) {
  return addDoc(collection(db, ENTRIES_COLLECTION), {
    userId,
    title,
    text,
    createdAt: serverTimestamp(), // set by the Firestore server, not the client clock
  });
}

/**
 * Deletes a diary entry by its document id.
 * Rules ensure this only succeeds if the entry belongs to the caller.
 */
export function deleteEntry(db, entryId) {
  return deleteDoc(doc(db, ENTRIES_COLLECTION, entryId));
}

/**
 * Subscribes to this user's entries in real time, newest first.
 * Calls onChange(entries[]) on the initial load and every subsequent update.
 * Calls onError(error) if the listener fails (e.g. permissions, offline).
 * Returns the unsubscribe function — call it when leaving the dashboard.
 *
 * NOTE: this query (where + orderBy on different fields) requires a
 * Firestore composite index. The first time you run it, Firestore will
 * log an error in the browser console containing a direct link that
 * creates the index for you with one click — just open that link once.
 */
export function watchEntries(db, userId, onChange, onError) {
  const entriesQuery = query(
    collection(db, ENTRIES_COLLECTION),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    entriesQuery,
    (snapshot) => {
      const entries = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      onChange(entries);
    },
    onError
  );
}

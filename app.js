// ============================================================================
// APP MODULE — the orchestrator.
// Initializes Firebase, wires up the DOM, and switches between the three
// view states: auth → dashboard → editor.
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

import { firebaseConfig } from "./firebaseConfig.js";
import { signUp, logIn, logOut, resetPassword, watchAuthState, friendlyAuthError } from "./auth.js";
import { saveEntry, deleteEntry, watchEntries } from "./firestore.js";
import { createDictation } from "./speech.js";

// ---------------------------------------------------------------------------
// Firebase init
// ---------------------------------------------------------------------------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const views = {
  splash: document.getElementById("view-splash"),
  loading: document.getElementById("view-loading"),
  auth: document.getElementById("view-auth"),
  dashboard: document.getElementById("view-dashboard"),
  editor: document.getElementById("view-editor"),
};

// Loading view's two sub-states: the normal spinner, and the "you forgot to
// configure Firebase" message that replaces it if the keys are still placeholders.
const loadingSpinner = document.getElementById("loading-spinner");
const loadingConfigWarning = document.getElementById("loading-config-warning");

// Auth view
const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");
const formAuth = document.getElementById("form-auth");
const labelNickname = document.getElementById("label-nickname");
const inputNickname = document.getElementById("input-nickname");
const inputEmail = document.getElementById("input-email");
const inputPassword = document.getElementById("input-password");
const authError = document.getElementById("auth-error");
const btnAuthSubmit = document.getElementById("btn-auth-submit");
const btnAuthLabel = document.getElementById("btn-auth-label");
const btnAuthSpinner = document.getElementById("btn-auth-spinner");
const btnForgotPassword = document.getElementById("btn-forgot-password");

// Password reset modal
const modalResetOverlay = document.getElementById("modal-reset-overlay");
const inputResetEmail = document.getElementById("input-reset-email");
const resetError = document.getElementById("reset-error");
const btnResetCancel = document.getElementById("btn-reset-cancel");
const btnResetSend = document.getElementById("btn-reset-send");
const btnResetSendLabel = document.getElementById("btn-reset-send-label");
const btnResetSendSpinner = document.getElementById("btn-reset-send-spinner");

// Toast notification
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toast-message");

// Dashboard view
const dashboardGreeting = document.getElementById("dashboard-greeting");
const entriesFeed = document.getElementById("entries-feed");
const dashboardEmpty = document.getElementById("dashboard-empty");
const dashboardLoading = document.getElementById("dashboard-loading");
const btnNewEntry = document.getElementById("btn-new-entry");
const btnSignout = document.getElementById("btn-signout");

// Editor view
const btnEditorBack = document.getElementById("btn-editor-back");
const editorDate = document.getElementById("editor-date");
const inputEntryTitle = document.getElementById("input-entry-title");
const inputEntryText = document.getElementById("input-entry-text");
const editorError = document.getElementById("editor-error");
const btnSaveEntry = document.getElementById("btn-save-entry");
const btnSaveLabel = document.getElementById("btn-save-label");
const btnSaveSpinner = document.getElementById("btn-save-spinner");
const btnMic = document.getElementById("btn-mic");
const micIcon = document.getElementById("mic-icon");
const micStatus = document.getElementById("mic-status");
const micRing1 = document.getElementById("mic-ring-1");
const micRing2 = document.getElementById("mic-ring-2");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let authMode = "login"; // "login" | "signup"
let currentUser = null;
let unsubscribeEntries = null; // Firestore listener teardown
let dictation = null; // active SpeechRecognition wrapper, if any
let isListening = false;

// ---------------------------------------------------------------------------
// View switching
// ---------------------------------------------------------------------------
function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    el.classList.toggle("hidden", key !== name);
  });
}

// ---------------------------------------------------------------------------
// Splash / intro screen
// ---------------------------------------------------------------------------
// Shows the "Kioku" wordmark for a beat on open, then hands off to the normal
// loading → auth-state flow. Dismissible early by tap, so it never feels
// like something the person is stuck waiting on.
let splashDismissed = false;

function dismissSplash() {
  if (splashDismissed) return;
  splashDismissed = true;
  views.splash.classList.add("animate-splash-out");
  window.setTimeout(beginAppFlow, 300); // let the fade-out finish before swapping views
}

views.splash.addEventListener("click", dismissSplash);
window.setTimeout(dismissSplash, 2200); // auto-advance even if nobody taps

/**
 * True once real Firebase project keys have been pasted into firebaseConfig.js.
 * Placeholder values would otherwise make the app hang silently on the
 * loading spinner forever, since onAuthStateChanged never gets a chance to
 * fire against a project that doesn't exist.
 */
function isFirebaseConfigured() {
  return (
    typeof firebaseConfig.apiKey === "string" &&
    firebaseConfig.apiKey.length > 0 &&
    !firebaseConfig.apiKey.startsWith("PASTE_YOUR")
  );
}

/**
 * Prefers the account's nickname (Firebase Auth displayName) for the
 * dashboard greeting; falls back to the email's local part for older
 * accounts created before the nickname field existed.
 */
function greetingName(user) {
  return user.displayName?.trim() || user.email?.split("@")[0] || "there";
}

function beginAppFlow() {
  showView("loading");

  if (!isFirebaseConfigured()) {
    loadingSpinner.classList.add("hidden");
    loadingConfigWarning.classList.remove("hidden");
    return; // don't attempt to talk to Firebase with placeholder keys
  }

  watchAuthState(auth, (user) => {
    currentUser = user;
    stopDashboardListener();
    stopListeningIfActive();

    if (user) {
      dashboardGreeting.textContent = `Hi, ${greetingName(user)}`;
      showView("dashboard");
      startDashboardListener(user.uid);
    } else {
      setAuthMode("login");
      formAuth.reset();
      showView("auth");
    }
  });
}

// ---------------------------------------------------------------------------
// Auth view logic
// ---------------------------------------------------------------------------
function setAuthMode(mode) {
  authMode = mode;
  const isLogin = mode === "login";
  tabLogin.classList.toggle("border-moss", isLogin);
  tabLogin.classList.toggle("text-parchment", isLogin);
  tabLogin.classList.toggle("border-transparent", !isLogin);
  tabLogin.classList.toggle("text-dim", !isLogin);

  tabSignup.classList.toggle("border-moss", !isLogin);
  tabSignup.classList.toggle("text-parchment", !isLogin);
  tabSignup.classList.toggle("border-transparent", isLogin);
  tabSignup.classList.toggle("text-dim", isLogin);

  btnAuthLabel.textContent = isLogin ? "Log in" : "Create account";
  inputPassword.autocomplete = isLogin ? "current-password" : "new-password";

  labelNickname.classList.toggle("hidden", isLogin);
  inputNickname.required = !isLogin;
  if (isLogin) inputNickname.value = "";

  btnForgotPassword.classList.toggle("hidden", !isLogin);

  hideAuthError();
}

function showAuthError(message) {
  authError.textContent = message;
  authError.classList.remove("hidden");
}
function hideAuthError() {
  authError.classList.add("hidden");
}

function setAuthSubmitting(isSubmitting) {
  btnAuthSubmit.disabled = isSubmitting;
  btnAuthLabel.classList.toggle("hidden", isSubmitting);
  btnAuthSpinner.classList.toggle("hidden", !isSubmitting);
}

tabLogin.addEventListener("click", () => setAuthMode("login"));
tabSignup.addEventListener("click", () => setAuthMode("signup"));

formAuth.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideAuthError();

  const nickname = inputNickname.value.trim();
  const email = inputEmail.value.trim();
  const password = inputPassword.value;

  if (!email || !password) {
    showAuthError("Please fill in both fields.");
    return;
  }
  if (authMode === "signup" && !nickname) {
    showAuthError("Let us know what to call you — add a nickname.");
    return;
  }

  setAuthSubmitting(true);
  try {
    if (authMode === "login") {
      await logIn(auth, email, password);
    } else {
      await signUp(auth, email, password, nickname);
      // watchAuthState's listener can fire before updateProfile's displayName
      // write finishes, so it may briefly show the email-based fallback —
      // correct it explicitly now that we know signUp() has fully resolved.
      dashboardGreeting.textContent = `Hi, ${nickname}`;
    }
    // onAuthStateChanged (below) takes it from here — no manual redirect needed.
  } catch (error) {
    showAuthError(friendlyAuthError(error));
  } finally {
    setAuthSubmitting(false);
  }
});

btnSignout.addEventListener("click", () => {
  logOut(auth).catch((error) => console.error("Sign-out failed:", error));
});

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------
let toastTimer = null;

function showToast(message, durationMs = 4000) {
  toastMessage.textContent = message;
  toast.classList.add("toast-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("toast-visible");
  }, durationMs);
}

// ---------------------------------------------------------------------------
// Forgot password / reset modal
// ---------------------------------------------------------------------------
function showResetError(message) {
  resetError.textContent = message;
  resetError.classList.remove("hidden");
}
function hideResetError() {
  resetError.classList.add("hidden");
}

function setResetSubmitting(isSubmitting) {
  btnResetSend.disabled = isSubmitting;
  btnResetSendLabel.classList.toggle("hidden", isSubmitting);
  btnResetSendSpinner.classList.toggle("hidden", !isSubmitting);
}

function openResetModal() {
  // Pre-fill with whatever's already in the login email field, if anything.
  inputResetEmail.value = inputEmail.value.trim();
  hideResetError();
  modalResetOverlay.classList.add("modal-visible");
  window.setTimeout(() => inputResetEmail.focus(), 50);
}

function closeResetModal() {
  modalResetOverlay.classList.remove("modal-visible");
}

btnForgotPassword.addEventListener("click", openResetModal);
btnResetCancel.addEventListener("click", closeResetModal);

// Clicking the dimmed backdrop (not the card itself) also dismisses it.
modalResetOverlay.addEventListener("click", (event) => {
  if (event.target === modalResetOverlay) closeResetModal();
});

// Escape key dismisses it too, for anyone on a physical keyboard.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modalResetOverlay.classList.contains("modal-visible")) {
    closeResetModal();
  }
});

btnResetSend.addEventListener("click", async () => {
  const email = inputResetEmail.value.trim();
  hideResetError();

  if (!email) {
    showResetError("Enter the email address for your account.");
    return;
  }

  setResetSubmitting(true);
  try {
    await resetPassword(auth, email);
    closeResetModal();
    showToast("Check your inbox — we've sent a password reset link.");
  } catch (error) {
    showResetError(friendlyAuthError(error));
  } finally {
    setResetSubmitting(false);
  }
});

// ---------------------------------------------------------------------------
// Dashboard view logic
// ---------------------------------------------------------------------------
function formatEntryDate(timestamp) {
  // timestamp may briefly be null right after saveEntry(), before the
  // server timestamp round-trips back — fall back to "just now" for that case.
  if (!timestamp?.toDate) return { day: "•", month: "now", full: "Just now" };
  const d = timestamp.toDate();
  return {
    day: d.getDate(),
    month: d.toLocaleString(undefined, { month: "short" }).toLowerCase(),
    full: d.toLocaleString(undefined, {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    }),
  };
}

function renderEntries(entries) {
  dashboardLoading.classList.add("hidden");
  entriesFeed.innerHTML = "";

  if (entries.length === 0) {
    dashboardEmpty.classList.remove("hidden");
    return;
  }
  dashboardEmpty.classList.add("hidden");

  for (const entry of entries) {
    const { full } = formatEntryDate(entry.createdAt);
    const displayTitle = entry.title?.trim() ? entry.title.trim() : "Untitled entry";

    const card = document.createElement("article");
    card.className =
      "torn-edge bg-ink2 rounded-b-2xl border border-hairline/70 border-t-0 overflow-hidden animate-fade-up hover:border-hairline transition-colors";
    card.innerHTML = `
      <div class="flex items-start gap-4 px-5 py-4">
        <div class="min-w-0 flex-1">
          <p class="text-[11px] uppercase tracking-wider text-dim mb-1.5 truncate">${full}</p>
          <h3 class="font-display text-lg text-parchment leading-snug truncate">${escapeHtml(displayTitle)}</h3>
        </div>
        <button type="button" data-entry-id="${entry.id}"
          class="btn-delete-entry shrink-0 mt-0.5 w-8 h-8 -mr-1.5 rounded-full flex items-center justify-center text-dim hover:text-rose hover:bg-ink3 transition-colors" title="Delete entry">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    `;
    entriesFeed.appendChild(card);
  }

  entriesFeed.querySelectorAll(".btn-delete-entry").forEach((btn) => {
    btn.addEventListener("click", () => handleDeleteEntry(btn.dataset.entryId));
  });
}

// Basic HTML-escaping since entry text is user-generated and inserted via innerHTML.
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function handleDeleteEntry(entryId) {
  const confirmed = window.confirm("Delete this page? This can't be undone.");
  if (!confirmed) return;
  try {
    await deleteEntry(db, entryId);
    // The onSnapshot listener below re-renders the feed automatically.
  } catch (error) {
    console.error("Failed to delete entry:", error);
    window.alert("Couldn't delete that entry — please try again.");
  }
}

function startDashboardListener(userId) {
  dashboardLoading.classList.remove("hidden");
  dashboardEmpty.classList.add("hidden");
  entriesFeed.innerHTML = "";

  unsubscribeEntries = watchEntries(
    db,
    userId,
    (entries) => renderEntries(entries),
    (error) => {
      console.error("Entries listener error:", error);
      dashboardLoading.classList.add("hidden");
      entriesFeed.innerHTML = `
        <p class="text-rose text-sm text-center mt-8">
          Couldn't load your entries. Check your connection, or your Firestore
          security rules / index setup, and try refreshing.
        </p>`;
    }
  );
}

function stopDashboardListener() {
  if (unsubscribeEntries) {
    unsubscribeEntries();
    unsubscribeEntries = null;
  }
}

btnNewEntry.addEventListener("click", () => openEditor());
btnEditorBack.addEventListener("click", () => closeEditor());

// ---------------------------------------------------------------------------
// Editor view logic
// ---------------------------------------------------------------------------
function openEditor() {
  inputEntryTitle.value = "";
  inputEntryText.value = "";
  hideEditorError();
  editorDate.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
  showView("editor");
  stopListeningIfActive();
  setTimeout(() => inputEntryTitle.focus(), 50);
}

function closeEditor() {
  stopListeningIfActive();
  showView("dashboard");
}

function showEditorError(message) {
  editorError.textContent = message;
  editorError.classList.remove("hidden");
}
function hideEditorError() {
  editorError.classList.add("hidden");
}

function setSaveSubmitting(isSubmitting) {
  btnSaveEntry.disabled = isSubmitting;
  btnSaveLabel.classList.toggle("hidden", isSubmitting);
  btnSaveSpinner.classList.toggle("hidden", !isSubmitting);
}

btnSaveEntry.addEventListener("click", async () => {
  const title = inputEntryTitle.value.trim();
  const text = inputEntryText.value.trim();
  hideEditorError();

  if (!text) {
    showEditorError("Write something first — even a line counts.");
    return;
  }
  if (!currentUser) {
    showEditorError("You've been signed out — please log back in.");
    return;
  }

  setSaveSubmitting(true);
  try {
    await saveEntry(db, currentUser.uid, title, text);
    closeEditor();
  } catch (error) {
    console.error("Failed to save entry:", error);
    showEditorError("Couldn't save that page. Check your connection and try again.");
  } finally {
    setSaveSubmitting(false);
  }
});

// ---------------------------------------------------------------------------
// Voice-to-text ("Talk to Write")
// ---------------------------------------------------------------------------
function setListeningUI(listening) {
  isListening = listening;
  micRing1.classList.toggle("hidden", !listening);
  micRing2.classList.toggle("hidden", !listening);
  btnMic.classList.toggle("border-amber", listening);
  btnMic.classList.toggle("text-amber", listening);
  micStatus.textContent = listening ? "listening… tap to stop" : "tap to talk to write";
}

function stopListeningIfActive() {
  if (isListening && dictation) {
    dictation.stop();
  }
}

btnMic.addEventListener("click", () => {
  hideEditorError();

  if (isListening) {
    dictation?.stop();
    return;
  }

  dictation = createDictation({
    onStart: () => setListeningUI(true),
    onEnd: () => setListeningUI(false),
    onResult: (finalChunk) => {
      const current = inputEntryText.value;
      const needsSpace = current.length > 0 && !current.endsWith(" ") && !current.endsWith("\n");
      inputEntryText.value = current + (needsSpace ? " " : "") + finalChunk;
    },
    onError: (message) => {
      setListeningUI(false);
      showEditorError(message);
    },
  });

  dictation?.start();
});

// Note: the auth-state watcher itself lives in beginAppFlow() above, since it
// must only start after the splash screen hands off (and only if Firebase is
// actually configured) — see the "Splash / intro screen" section.

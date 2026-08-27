import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { 
  getFirestore, 
  enableMultiTabIndexedDbPersistence,
  enableIndexedDbPersistence,
  collection, 
  deleteDoc, 
  doc, 
  getDoc, 
  addDoc, 
  onSnapshot, 
  query, 
  runTransaction, 
  serverTimestamp, 
  setDoc, 
  updateDoc, 
  where, 
  writeBatch 
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { firebaseConfig } from "./firebaseConfig.js";
import {
  signUp,
  logIn,
  logOut,
  resetPassword,
  watchAuthState,
  friendlyAuthError,
} from "./auth.js";
import {
  saveEntry,
  updateEntry,
  deleteEntry,
  watchEntries,
} from "./firestore.js";
import { createDictation } from "./speech.js";

/*
  Shared-entry security note:
  This client only writes the current user's own `halves.<uid>` field.
  Your Firestore rules must also enforce that restriction; client-side code
  alone cannot secure Firestore data against a malicious direct request.
*/

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Enable Firestore offline persistence for instant local reads and background cloud sync
enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    // Multiple tabs open simultaneously; fallback to single-tab persistence
    enableIndexedDbPersistence(db).catch((singleErr) => {
      console.warn("Firestore single-tab persistence failed:", singleErr);
    });
  } else if (err.code === "unimplemented") {
    console.warn("Firestore persistence is not supported in this browser:", err);
  } else {
    console.warn("Firestore persistence initialization failed:", err);
  }
});

// Register Service Worker for offline caching
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => {
        console.log("Service Worker registered with scope:", registration.scope);
      })
      .catch((error) => {
        console.warn("Service Worker registration failed:", error);
      });
  });
}

const FRIEND_INVITES_COLLECTION = "friend_invites";
const FRIENDSHIPS_COLLECTION = "friendships";
const SHARED_ENTRIES_COLLECTION = "shared_entries";

const views = {
  splash: document.getElementById("view-splash"),
  loading: document.getElementById("view-loading"),
  auth: document.getElementById("view-auth"),
  dashboard: document.getElementById("view-dashboard"),
  editor: document.getElementById("view-editor"),
};

const loadingSpinner = document.getElementById("loading-spinner");
const loadingConfigWarning = document.getElementById("loading-config-warning");

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

const modalResetOverlay = document.getElementById("modal-reset-overlay");
const inputResetEmail = document.getElementById("input-reset-email");
const resetError = document.getElementById("reset-error");
const btnResetCancel = document.getElementById("btn-reset-cancel");
const btnResetSend = document.getElementById("btn-reset-send");
const btnResetSendLabel = document.getElementById("btn-reset-send-label");
const btnResetSendSpinner = document.getElementById("btn-reset-send-spinner");

const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toast-message");

const dashboardGreeting = document.getElementById("dashboard-greeting");
const entriesFeed = document.getElementById("entries-feed");
const dashboardEmpty = document.getElementById("dashboard-empty");
const dashboardLoading = document.getElementById("dashboard-loading");
const btnNewEntry = document.getElementById("btn-new-entry");
const btnSignout = document.getElementById("btn-signout");
const btnThemeToggle = document.getElementById("btn-theme-toggle");
const themeMenu = document.getElementById("theme-menu");

const btnEditorBack = document.getElementById("btn-editor-back");
const editorDate = document.getElementById("editor-date");
const btnCancelEdit = document.getElementById("btn-cancel-edit");
const btnEditEntry = document.getElementById("btn-edit-entry");
const inputEntryTitle = document.getElementById("input-entry-title");
const inputEntryText = document.getElementById("input-entry-text");
const readerTitle = document.getElementById("reader-title");
const readerText = document.getElementById("reader-text");
const editorError = document.getElementById("editor-error");
const editorToolbar = document.getElementById("editor-toolbar");
const btnPunctuate = document.getElementById("btn-punctuate");
const editorMicSection = document.getElementById("editor-mic-section");
const btnSaveEntry = document.getElementById("btn-save-entry");
const btnSaveLabel = document.getElementById("btn-save-label");
const btnSaveSpinner = document.getElementById("btn-save-spinner");
const btnMic = document.getElementById("btn-mic");
const micStatus = document.getElementById("mic-status");
const micRing1 = document.getElementById("mic-ring-1");
const micRing2 = document.getElementById("mic-ring-2");

const formFriendInvite = document.getElementById("form-friend-invite");
const inputFriendEmail = document.getElementById("input-friend-email");
const btnSendFriendInvite = document.getElementById("btn-send-friend-invite");
const friendInviteStatus = document.getElementById("friend-invite-status");
const pendingInvitationsList = document.getElementById("pending-invitations-list");
const pendingInvitationsEmpty = document.getElementById("pending-invitations-empty");
const pendingInvitationsCount = document.getElementById("pending-invitations-count");
const pendingInvitationTemplate = document.getElementById("pending-invitation-template");
const friendsList = document.getElementById("friends-list");
const friendsEmpty = document.getElementById("friends-empty");
const friendsCount = document.getElementById("friends-count");
const friendListItemTemplate = document.getElementById("friend-list-item-template");
const btnOpenSharedEntry = document.getElementById("btn-open-shared-entry");

const sharedEntryOverlay = document.getElementById("modal-shared-entry-overlay");
const sharedEntryStatus = document.getElementById("shared-entry-status");
const sharedUserAHeading = document.getElementById("shared-user-a-heading");
const sharedUserBHeading = document.getElementById("shared-user-b-heading");
const inputSharedEntryUserA = document.getElementById("input-shared-entry-user-a");
const inputSharedEntryUserB = document.getElementById("input-shared-entry-user-b");
const btnSaveSharedEntry = document.getElementById("btn-save-shared-entry");

let authMode = "login";
let currentUser = null;
let unsubscribeEntries = null;
let unsubscribePendingInvites = null;
let unsubscribeFriendships = null;
let unsubscribeSharedEntry = null;
let dictation = null;
let isListening = false;
let editingEntryId = null;
let editorMode = "new";
let readModeEntry = null;
let toastTimer = null;

let activeFriends = [];
let selectedSharedFriend = null;
let activeSharedEntryId = null;
let activeSharedEntry = null;

const THEMES = ["spring", "summer", "fall", "winter"];
const THEME_STORAGE_KEY = "kioku-theme";
const THEME_STATUS_BAR_COLOR = {
  spring: "#141b17",
  summer: "#1c1410",
  fall: "#1a140d",
  winter: "#101620",
};

const metaThemeColor = document.querySelector('meta[name="theme-color"]');

function applyTheme(theme) {
  const safeTheme = THEMES.includes(theme) ? theme : "spring";
  document.documentElement.setAttribute("data-theme", safeTheme);
  metaThemeColor?.setAttribute("content", THEME_STATUS_BAR_COLOR[safeTheme]);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, safeTheme);
  } catch {
    // Storage may be unavailable in private browsing.
  }
}

(function loadSavedTheme() {
  try {
    applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || "spring");
  } catch {
    applyTheme("spring");
  }
})();

function toggleThemeMenu(show) {
  themeMenu.classList.toggle("menu-visible", show);
}

btnThemeToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleThemeMenu(!themeMenu.classList.contains("menu-visible"));
});

themeMenu.querySelectorAll(".theme-option").forEach((option) => {
  option.addEventListener("click", () => {
    applyTheme(option.dataset.themeValue);
    toggleThemeMenu(false);
  });
});

document.addEventListener("click", (event) => {
  if (!themeMenu.classList.contains("menu-visible")) return;
  if (btnThemeToggle.contains(event.target) || themeMenu.contains(event.target)) return;
  toggleThemeMenu(false);
});

function showView(name) {
  Object.entries(views).forEach(([key, element]) => {
    element.classList.toggle("hidden", key !== name);
  });
}

let splashDismissed = false;

function dismissSplash() {
  if (splashDismissed) return;
  splashDismissed = true;
  beginAppFlow();
}

views.splash.addEventListener("click", dismissSplash);
window.setTimeout(dismissSplash, 2200);

function isFirebaseConfigured() {
  return (
    typeof firebaseConfig.apiKey === "string" &&
    firebaseConfig.apiKey.length > 0 &&
    !firebaseConfig.apiKey.startsWith("PASTE_YOUR")
  );
}

function greetingName(user) {
  return user.displayName?.trim() || user.email?.split("@")[0] || "there";
}

function beginAppFlow() {
  showView("loading");

  if (!isFirebaseConfigured()) {
    loadingSpinner.classList.add("hidden");
    loadingConfigWarning.classList.remove("hidden");
    return;
  }

  watchAuthState(auth, (user) => {
    currentUser = user;
    stopDashboardListener();
    stopSocialListeners();
    stopSharedEntryListener();
    stopListeningIfActive();

    if (user) {
      dashboardGreeting.textContent = `Hi, ${greetingName(user)}`;
      showView("dashboard");
      startDashboardListener(user.uid);
      startSocialListeners(user);
    } else {
      activeFriends = [];
      selectedSharedFriend = null;
      activeSharedEntry = null;
      activeSharedEntryId = null;
      resetSharedEntryUI();
      setAuthMode("login");
      formAuth.reset();
      showView("auth");
    }
  });
}

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
      dashboardGreeting.textContent = `Hi, ${nickname}`;
    }
  } catch (error) {
    showAuthError(friendlyAuthError(error));
  } finally {
    setAuthSubmitting(false);
  }
});

btnSignout.addEventListener("click", () => {
  logOut(auth).catch((error) => console.error("Sign-out failed:", error));
});

function showToast(message, durationMs = 4000) {
  toastMessage.textContent = message;
  toast.classList.add("toast-visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("toast-visible"), durationMs);
}

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

modalResetOverlay.addEventListener("click", (event) => {
  if (event.target === modalResetOverlay) closeResetModal();
});

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

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function profileForCurrentUser() {
  return {
    userId: currentUser.uid,
    email: normalizeEmail(currentUser.email || ""),
    displayName: greetingName(currentUser),
  };
}

function setFriendInviteStatus(message, type = "neutral") {
  friendInviteStatus.textContent = message;
  friendInviteStatus.classList.remove("hidden", "text-rose", "text-moss", "text-dim");
  friendInviteStatus.classList.add(
    type === "error" ? "text-rose" : type === "success" ? "text-moss" : "text-dim"
  );
}

function friendInviteId(fromUserId, toEmail) {
  return `${encodeURIComponent(fromUserId)}__${encodeURIComponent(toEmail)}`;
}

function friendshipId(firstUserId, secondUserId) {
  return [firstUserId, secondUserId]
    .sort()
    .map((id) => encodeURIComponent(id).replaceAll("_", "%5F"))
    .join("__");
}

function startSocialListeners(user) {
  const userEmail = normalizeEmail(user.email || "");
  if (!userEmail) return;

  unsubscribePendingInvites = onSnapshot(
    query(
      collection(db, FRIEND_INVITES_COLLECTION),
      where("toEmail", "==", userEmail)
    ),
    (snapshot) => {
      const invitations = snapshot.docs
        .map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }))
        .filter((invite) => invite.status === "pending");

      renderPendingInvitations(invitations);
    },
    (error) => {
      console.error("Pending invitations listener failed:", error);
    }
  );

  unsubscribeFriendships = onSnapshot(
    query(
      collection(db, FRIENDSHIPS_COLLECTION),
      where("participantIds", "array-contains", user.uid)
    ),
    (snapshot) => {
      activeFriends = snapshot.docs
        .map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }))
        .map((friendship) => {
          const friendProfile = (friendship.memberProfiles || []).find(
            (profile) => profile.userId !== user.uid
          );

          return {
            friendshipId: friendship.id,
            userId: friendProfile?.userId || "",
            email: friendProfile?.email || "",
            displayName: friendProfile?.displayName || friendProfile?.email || "Friend",
          };
        })
        .filter((friend) => friend.userId);

      renderFriends(activeFriends);

      if (
        selectedSharedFriend &&
        !activeFriends.some((friend) => friend.userId === selectedSharedFriend.userId)
      ) {
        selectedSharedFriend = null;
        stopSharedEntryListener();
        resetSharedEntryUI();
      }
    },
    (error) => {
      console.error("Friends listener failed:", error);
    }
  );
}

function stopSocialListeners() {
  if (unsubscribePendingInvites) {
    unsubscribePendingInvites();
    unsubscribePendingInvites = null;
  }

  if (unsubscribeFriendships) {
    unsubscribeFriendships();
    unsubscribeFriendships = null;
  }
}

function renderPendingInvitations(invitations) {
  pendingInvitationsList.innerHTML = "";
  pendingInvitationsCount.textContent = invitations.length;

  if (!invitations.length) {
    pendingInvitationsList.appendChild(pendingInvitationsEmpty);
    return;
  }

  invitations.forEach((invite) => {
    const item = pendingInvitationTemplate.content.firstElementChild.cloneNode(true);
    item.dataset.invitationId = invite.id;

    const name = invite.fromDisplayName || invite.fromEmail || "Friend";
    item.querySelector("[data-invitation-name]").textContent = name;
    item.querySelector("[data-invitation-initial]").textContent = name.charAt(0).toUpperCase();

    item.querySelector(".btn-accept-invitation").addEventListener("click", () => {
      acceptFriendInvite(invite);
    });

    item.querySelector(".btn-decline-invitation").addEventListener("click", () => {
      declineFriendInvite(invite.id);
    });

    pendingInvitationsList.appendChild(item);
  });
}

function renderFriends(friends) {
  friendsList.innerHTML = "";
  friendsCount.textContent = friends.length;

  if (!friends.length) {
    friendsList.appendChild(friendsEmpty);
    return;
  }

  friends.forEach((friend) => {
    const item = friendListItemTemplate.content.firstElementChild.cloneNode(true);
    item.dataset.friendId = friend.userId;
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-label", `Open a shared entry with ${friend.displayName}`);

    item.querySelector("[data-friend-name]").textContent = friend.displayName;
    item.querySelector("[data-friend-email]").textContent = friend.email;
    item.querySelector("[data-friend-initial]").textContent = friend.displayName.charAt(0).toUpperCase();

    const openSharedEntry = () => {
      selectedSharedFriend = friend;
      window.location.hash = "modal-shared-entry-overlay";
      ensureSharedEntry(friend).catch((error) => {
        console.error("Could not prepare shared entry:", error);
        setSharedEntryStatus("Couldn't open this shared entry.", "error");
      });
    };

    item.addEventListener("click", openSharedEntry);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openSharedEntry();
      }
    });

    friendsList.appendChild(item);
  });
}

async function sendFriendInvite() {
  if (!currentUser) return;

  const toEmail = normalizeEmail(inputFriendEmail.value);

  if (!toEmail) {
    setFriendInviteStatus("Enter your friend's email address.", "error");
    return;
  }

  if (toEmail === normalizeEmail(currentUser.email || "")) {
    setFriendInviteStatus("You can't invite yourself.", "error");
    return;
  }

  if (activeFriends.some((friend) => friend.email === toEmail)) {
    setFriendInviteStatus("This person is already your friend.", "error");
    return;
  }

  btnSendFriendInvite.disabled = true;

  try {
    const inviteRef = doc(
      db,
      FRIEND_INVITES_COLLECTION,
      friendInviteId(currentUser.uid, toEmail)
    );

    await setDoc(
      inviteRef,
      {
        fromUserId: currentUser.uid,
        fromEmail: normalizeEmail(currentUser.email || ""),
        fromDisplayName: greetingName(currentUser),
        toEmail,
        status: "pending",
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    inputFriendEmail.value = "";
    setFriendInviteStatus("Invite sent.", "success");
  } catch (error) {
    console.error("Failed to send invitation:", error);
    setFriendInviteStatus("Couldn't send the invite. Please try again.", "error");
  } finally {
    btnSendFriendInvite.disabled = false;
  }
}

formFriendInvite.addEventListener("submit", (event) => {
  event.preventDefault();
  sendFriendInvite();
});

btnSendFriendInvite.addEventListener("click", sendFriendInvite);

async function acceptFriendInvite(invite) {
  if (!currentUser || !invite.fromUserId || invite.fromUserId === currentUser.uid) return;

  try {
    const currentProfile = profileForCurrentUser();
    const senderProfile = {
      userId: invite.fromUserId,
      email: normalizeEmail(invite.fromEmail || ""),
      displayName: invite.fromDisplayName || invite.fromEmail || "Friend",
    };

    const friendshipRef = doc(
      db,
      FRIENDSHIPS_COLLECTION,
      friendshipId(currentUser.uid, invite.fromUserId)
    );

    const inviteRef = doc(db, FRIEND_INVITES_COLLECTION, invite.id);
    const batch = writeBatch(db);

    batch.set(
      friendshipRef,
      {
        participantIds: [currentUser.uid, invite.fromUserId].sort(),
        memberProfiles: [currentProfile, senderProfile],
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    batch.delete(inviteRef);
    await batch.commit();
    showToast(`${senderProfile.displayName} is now your friend.`);
  } catch (error) {
    console.error("Failed to accept invitation:", error);
    showToast("Couldn't accept that invitation.");
  }
}

async function declineFriendInvite(inviteId) {
  try {
    await deleteDoc(doc(db, FRIEND_INVITES_COLLECTION, inviteId));
    showToast("Invitation declined.");
  } catch (error) {
    console.error("Failed to decline invitation:", error);
    showToast("Couldn't decline that invitation.");
  }
}

function setSharedEntryStatus(message, type = "neutral") {
  sharedEntryStatus.textContent = message;
  sharedEntryStatus.classList.remove("text-rose", "text-moss", "text-dim", "text-dim/70");
  sharedEntryStatus.classList.add(
    type === "error" ? "text-rose" : type === "success" ? "text-moss" : "text-dim/70"
  );
}

function resetSharedEntryUI() {
  inputSharedEntryUserA.value = "";
  inputSharedEntryUserB.value = "";
  inputSharedEntryUserA.readOnly = true;
  inputSharedEntryUserB.readOnly = true;
  inputSharedEntryUserA.classList.add("opacity-60");
  inputSharedEntryUserB.classList.add("opacity-60");
  sharedUserAHeading.textContent = "User A";
  sharedUserBHeading.textContent = "User B";
  btnSaveSharedEntry.disabled = true;
  setSharedEntryStatus("Select a friend to begin.");
}

function stopSharedEntryListener() {
  if (unsubscribeSharedEntry) {
    unsubscribeSharedEntry();
    unsubscribeSharedEntry = null;
  }
}

function sharedEntryDocumentId(friendUserId) {
  return friendshipId(currentUser.uid, friendUserId);
}

async function ensureSharedEntry(friend) {
  if (!currentUser || !friend?.userId) return;

  const sharedId = sharedEntryDocumentId(friend.userId);
  const sharedRef = doc(db, SHARED_ENTRIES_COLLECTION, sharedId);
  const currentProfile = profileForCurrentUser();

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(sharedRef);

    if (existing.exists()) return;

    transaction.set(sharedRef, {
      participantIds: [currentUser.uid, friend.userId].sort(),
      userAId: currentUser.uid,
      userBId: friend.userId,
      memberProfiles: [
        currentProfile,
        {
          userId: friend.userId,
          email: friend.email,
          displayName: friend.displayName,
        },
      ],
      halves: {
        [currentUser.uid]: {
          text: "",
          updatedAt: serverTimestamp(),
        },
        [friend.userId]: {
          text: "",
          updatedAt: serverTimestamp(),
        },
      },
      createdAt: serverTimestamp(),
    });
  });

  startSharedEntryListener(sharedId);
}

function startSharedEntryListener(sharedId) {
  stopSharedEntryListener();
  activeSharedEntryId = sharedId;

  unsubscribeSharedEntry = onSnapshot(
    doc(db, SHARED_ENTRIES_COLLECTION, sharedId),
    (snapshot) => {
      if (!snapshot.exists()) {
        activeSharedEntry = null;
        resetSharedEntryUI();
        setSharedEntryStatus("This shared entry is unavailable.", "error");
        return;
      }

      activeSharedEntry = { id: snapshot.id, ...snapshot.data() };
      renderSharedEntry(activeSharedEntry);
    },
    (error) => {
      console.error("Shared entry listener failed:", error);
      setSharedEntryStatus("Couldn't load this shared entry.", "error");
    }
  );
}

function memberName(sharedEntry, userId, fallback) {
  const profile = (sharedEntry.memberProfiles || []).find(
    (member) => member.userId === userId
  );

  return profile?.displayName || profile?.email || fallback;
}

function renderSharedEntry(sharedEntry) {
  if (!currentUser) return;

  const isUserA = sharedEntry.userAId === currentUser.uid;
  const isUserB = sharedEntry.userBId === currentUser.uid;

  if (!isUserA && !isUserB) {
    resetSharedEntryUI();
    setSharedEntryStatus("You don't have access to this shared entry.", "error");
    return;
  }

  const userAName = memberName(sharedEntry, sharedEntry.userAId, "User A");
  const userBName = memberName(sharedEntry, sharedEntry.userBId, "User B");

  sharedUserAHeading.textContent = userAName;
  sharedUserBHeading.textContent = userBName;

  inputSharedEntryUserA.value = sharedEntry.halves?.[sharedEntry.userAId]?.text || "";
  inputSharedEntryUserB.value = sharedEntry.halves?.[sharedEntry.userBId]?.text || "";

  inputSharedEntryUserA.readOnly = !isUserA;
  inputSharedEntryUserB.readOnly = !isUserB;

  inputSharedEntryUserA.classList.toggle("opacity-60", !isUserA);
  inputSharedEntryUserB.classList.toggle("opacity-60", !isUserB);

  btnSaveSharedEntry.disabled = false;
  setSharedEntryStatus(
    isUserA
      ? "You can edit only the left / top half."
      : "You can edit only the right / bottom half.",
    "success"
  );
}

btnOpenSharedEntry.addEventListener("click", () => {
  if (selectedSharedFriend) {
    window.setTimeout(() => {
      ensureSharedEntry(selectedSharedFriend).catch((error) => {
        console.error("Could not open shared entry:", error);
      });
    }, 0);
  } else {
    resetSharedEntryUI();
  }
});

btnSaveSharedEntry.addEventListener("click", async () => {
  if (!currentUser || !activeSharedEntry || !activeSharedEntryId) {
    setSharedEntryStatus("Select a friend before saving.", "error");
    return;
  }

  const isUserA = activeSharedEntry.userAId === currentUser.uid;
  const isUserB = activeSharedEntry.userBId === currentUser.uid;

  if (!isUserA && !isUserB) {
    setSharedEntryStatus("You don't have permission to save this entry.", "error");
    return;
  }

  const ownTextarea = isUserA ? inputSharedEntryUserA : inputSharedEntryUserB;
  const ownText = ownTextarea.value.trim();

  btnSaveSharedEntry.disabled = true;

  try {
    /*
      Only the currently authenticated participant's own nested half is sent
      to Firestore. The opposite half is never included in this update.
    */
    await updateDoc(doc(db, SHARED_ENTRIES_COLLECTION, activeSharedEntryId), {
      [`halves.${currentUser.uid}.text`]: ownText,
      [`halves.${currentUser.uid}.updatedAt`]: serverTimestamp(),
    });

    setSharedEntryStatus("Your half was saved.", "success");
    showToast("Your half of the shared entry was saved.");
  } catch (error) {
    console.error("Failed to save shared entry:", error);
    setSharedEntryStatus("Couldn't save your half. Please try again.", "error");
  } finally {
    btnSaveSharedEntry.disabled = false;
  }
});

function formatEntryDate(timestamp) {
  if (!timestamp?.toDate) {
    return { day: "•", month: "now", full: "Just now" };
  }

  const date = timestamp.toDate();

  return {
    day: date.getDate(),
    month: date.toLocaleString(undefined, { month: "short" }).toLowerCase(),
    full: date.toLocaleString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function renderEntries(entries) {
  dashboardLoading.classList.add("hidden");
  entriesFeed.innerHTML = "";

  if (!entries.length) {
    dashboardEmpty.classList.remove("hidden");
    return;
  }

  dashboardEmpty.classList.add("hidden");

  entries.forEach((entry) => {
    const { full } = formatEntryDate(entry.createdAt);
    const displayTitle = entry.title?.trim() || "Untitled entry";

    const card = document.createElement("article");
    card.className = "torn-edge bg-ink2 rounded-b-2xl border border-hairline/70 border-t-0 overflow-hidden animate-fade-up hover:border-hairline transition-colors cursor-pointer";

    card.innerHTML = `
      <div class="flex items-start gap-4 px-5 py-4">
        <div class="min-w-0 flex-1">
          <p class="text-[11px] uppercase tracking-wider text-dim mb-1.5 truncate">${full}</p>
          <h3 class="font-display text-lg text-parchment leading-snug truncate">${escapeHtml(displayTitle)}</h3>
        </div>
        <button type="button" data-entry-id="${entry.id}" class="btn-delete-entry shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center text-dim hover:text-rose hover:bg-ink3 transition-colors" title="Delete entry">×</button>
      </div>
    `;

    card.addEventListener("click", (event) => {
      if (event.target.closest(".btn-delete-entry")) return;
      openEditor(entry);
    });

    entriesFeed.appendChild(card);
  });

  entriesFeed.querySelectorAll(".btn-delete-entry").forEach((button) => {
    button.addEventListener("click", () => handleDeleteEntry(button.dataset.entryId));
  });
}

async function handleDeleteEntry(entryId) {
  if (!window.confirm("Delete this page? This can't be undone.")) return;

  try {
    await deleteEntry(db, entryId);
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
    renderEntries,
    (error) => {
      console.error("Entries listener error:", error);
      dashboardLoading.classList.add("hidden");
      entriesFeed.innerHTML = '<p class="text-rose text-sm text-center mt-8">Couldn’t load your entries. Please refresh and try again.</p>';
    }
  );
}

function stopDashboardListener() {
  if (unsubscribeEntries) {
    unsubscribeEntries();
    unsubscribeEntries = null;
  }
}

btnNewEntry.addEventListener("click", () => openEditor(null));
btnEditorBack.addEventListener("click", closeEditor);

function openEditor(entryToEdit = null) {
  hideEditorError();
  stopListeningIfActive();

  if (entryToEdit) {
    editingEntryId = entryToEdit.id;
    readModeEntry = entryToEdit;
    editorDate.textContent = formatEntryDate(entryToEdit.createdAt).full;
    enterReadMode();
  } else {
    editingEntryId = null;
    readModeEntry = null;
    editorDate.textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    enterWriteMode({ title: "", text: "" });
  }

  showView("editor");

  if (editorMode !== "read") {
    window.setTimeout(() => inputEntryTitle.focus(), 50);
  }
}

function enterReadMode() {
  editorMode = "read";

  readerTitle.textContent = readModeEntry.title?.trim() || "Untitled entry";
  readerText.textContent = readModeEntry.text || "";

  readerTitle.classList.remove("hidden");
  readerText.classList.remove("hidden");
  inputEntryTitle.classList.add("hidden");
  inputEntryText.classList.add("hidden");
  editorToolbar.classList.add("hidden");
  editorMicSection.classList.add("hidden");

  btnEditEntry.classList.remove("hidden");
  btnCancelEdit.classList.add("hidden");
  btnSaveEntry.classList.add("hidden");
}

function enterWriteMode({ title, text }) {
  editorMode = editingEntryId ? "edit" : "new";

  inputEntryTitle.value = title;
  inputEntryText.value = text;

  inputEntryTitle.classList.remove("hidden");
  inputEntryText.classList.remove("hidden");
  editorToolbar.classList.remove("hidden");
  editorMicSection.classList.remove("hidden");
  readerTitle.classList.add("hidden");
  readerText.classList.add("hidden");

  btnEditEntry.classList.add("hidden");
  btnCancelEdit.classList.toggle("hidden", editorMode !== "edit");
  btnSaveEntry.classList.remove("hidden");
  btnSaveLabel.textContent = editorMode === "edit" ? "Save Changes" : "Save";
}

btnEditEntry.addEventListener("click", () => {
  hideEditorError();
  enterWriteMode({
    title: readModeEntry.title || "",
    text: readModeEntry.text || "",
  });
  window.setTimeout(() => inputEntryTitle.focus(), 50);
});

btnCancelEdit.addEventListener("click", () => {
  hideEditorError();
  stopListeningIfActive();
  enterReadMode();
});

function closeEditor() {
  stopListeningIfActive();
  editingEntryId = null;
  readModeEntry = null;
  editorMode = "new";
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
    if (editingEntryId) {
      await updateEntry(db, editingEntryId, title, text);
      readModeEntry = { ...readModeEntry, title, text };
      stopListeningIfActive();
      enterReadMode();
    } else {
      await saveEntry(db, currentUser.uid, title, text);
      closeEditor();
    }
  } catch (error) {
    console.error("Failed to save entry:", error);
    showEditorError("Couldn't save that page. Check your connection and try again.");
  } finally {
    setSaveSubmitting(false);
  }
});

function activeWritingTextarea() {
  const focused = document.activeElement;

  if (
    focused instanceof HTMLTextAreaElement &&
    !focused.readOnly &&
    [inputEntryText, inputSharedEntryUserA, inputSharedEntryUserB].includes(focused)
  ) {
    return focused;
  }

  if (
    sharedEntryOverlay.matches(":target") &&
    activeSharedEntry &&
    currentUser
  ) {
    if (activeSharedEntry.userAId === currentUser.uid) {
      return inputSharedEntryUserA;
    }

    if (activeSharedEntry.userBId === currentUser.uid) {
      return inputSharedEntryUserB;
    }
  }

  return inputEntryText;
}

function formatAndPunctuate(rawText) {
  let text = rawText.trim();

  if (!text) return "";

  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/[ \t]+([,.;:!?])/g, "$1");
  text = text.replace(/^([a-z])/, (_, letter) => letter.toUpperCase());

  text = text.replace(
    /([.!?]["'”)\]]*\s+)([a-z])/g,
    (_, separator, letter) => separator + letter.toUpperCase()
  );

  text = text.replace(
    /(\n\s*)([a-z])/g,
    (_, separator, letter) => separator + letter.toUpperCase()
  );

  text = text.replace(/\bi\b/g, "I");

  const closingMatch = text.match(/(["'”)\]]+)$/);
  const closingCharacters = closingMatch ? closingMatch[0] : "";
  const sentenceBody = closingCharacters
    ? text.slice(0, -closingCharacters.length)
    : text;

  if (!/[.!?]$/.test(sentenceBody)) {
    text = `${sentenceBody}.${closingCharacters}`;
  }

  return text;
}

btnPunctuate.addEventListener("click", () => {
  hideEditorError();

  const targetTextarea = activeWritingTextarea();

  if (!targetTextarea.value.trim()) {
    showEditorError("Write something first — then format it.");
    return;
  }

  targetTextarea.value = formatAndPunctuate(targetTextarea.value);
  targetTextarea.dispatchEvent(new Event("input", { bubbles: true }));
  showToast("Formatted your text.");
});

function setListeningUI(listening) {
  isListening = listening;
  micRing1.classList.toggle("hidden", !listening);
  micRing2.classList.toggle("hidden", !listening);
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
      const needsSpace =
        current.length > 0 &&
        !current.endsWith(" ") &&
        !current.endsWith("\n");

      inputEntryText.value = current + (needsSpace ? " " : "") + finalChunk;
    },
    onError: (message) => {
      setListeningUI(false);
      showEditorError(message);
    },
  });

  dictation?.start();
});
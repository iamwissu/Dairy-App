# Kioku — a private, cloud-synced diary

A minimal, mobile-first diary web app for a small group of friends. Static
frontend (HTML/CSS/vanilla JS), Firebase for auth + storage, deployable to
GitHub Pages for free. Includes a "Talk to Write" voice-to-text button and a
handwritten-font splash intro on open.

## If the app is stuck on a loading spinner

This almost always means `js/firebaseConfig.js` still has the placeholder
`PASTE_YOUR_...` values from this template. The app now detects that case and
shows a "Firebase isn't set up yet" message instead of hanging silently —
follow step 1 below, then refresh.

## File structure

```
diary-app/
├── index.html            ← the whole app shell & seasonal background visuals
├── sw.js                 ← service worker for full offline PWA caching
├── firestore.rules       ← paste into Firebase Console → Firestore → Rules
├── firebaseConfig.js     ← paste YOUR Firebase project keys here
├── auth.js               ← signup / login / signout
├── firestore.js          ← save / fetch / delete diary entries
├── speech.js             ← Web Speech API wrapper
├── app.js                ← wires everything together & offline persistence
└── README.md
```

## 1. Create your Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com) → **Add project**.
2. Once created, click the **Web** icon (`</>`) to register a web app. You don't
   need Firebase Hosting — you're deploying to GitHub Pages instead.
3. Copy the `firebaseConfig` object it shows you.
4. Paste those values into `js/firebaseConfig.js`, replacing the placeholders.

> It's normal and safe for this config to be public in client-side code — it's
> not a secret key. What actually protects your friends' diary entries is the
> **security rules**, step 3 below.

## 2. Turn on Email/Password auth

In the console: **Build → Authentication → Get started → Sign-in method →
Email/Password → Enable → Save**.

Since this is invite-only for a small friend group, you don't need to build a
public sign-up flow beyond what's here — just share the URL and let each
friend create their own account from the **Sign up** tab.

## 3. Create Firestore and set the security rules

1. **Build → Firestore Database → Create database** → start in **production
   mode** → pick a region close to your group.
2. Go to the **Rules** tab, delete the default contents, and paste in the
   entire contents of `firestore.rules` from this repo. Click **Publish**.

These rules are what guarantee each person can only ever read or write their
*own* entries — not their friends'.

3. The first time the app runs a query, Firestore may need a composite index
   (for the "my entries, sorted by date" query). If you see an index error in
   the browser console, it comes with a direct link — click it, then click
   **Create index** in the console. Takes about a minute to build.

## 4. Deploy to GitHub Pages

1. Push this whole `diary-app/` folder's contents to a GitHub repo (the
   `index.html` should sit at the repo root, or in `/docs` — your choice).
2. Repo → **Settings → Pages** → under "Build and deployment", choose
   **Deploy from a branch**, pick your branch and folder, **Save**.
3. GitHub gives you a URL like `https://yourname.github.io/diary-app/` —
   share that with your friends.

That's it — no build step, no server, no npm install. It's plain static files.

## Notes on the voice-to-text feature

"Talk to Write" uses the browser's built-in `SpeechRecognition` API, not a
Firebase or third-party service — so there's nothing to configure for it, but
also nothing to fall back on if a browser doesn't support it. It works well in
Chrome and Edge (desktop and Android); support is limited or absent in Firefox
and some iOS browsers. The app detects this and shows a friendly message
rather than breaking, and typing always works as a fallback either way.

## Customizing

- **Colors/fonts**: all defined in the `tailwind.config` block at the top of
  `index.html`, under `theme.extend.colors` and `.fontFamily`.
- **Entry length limit**: adjust the `20000` character cap in
  `firestore.rules` (`text.size() <= 20000`) if you want longer entries.
- **Adding photos, moods, tags, etc.**: extend the document shape in
  `js/firestore.js` (`saveEntry`) and the corresponding rule in
  `firestore.rules`, and add UI for it in the editor view in `index.html`.

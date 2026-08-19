# iOS capture — Apple Shortcut

**Primary phone capture path** for Cracks (iOS + Chrome desktop are the design
priorities; Android PWA share is optional secondary support).

iOS doesn't let an installed PWA register as a share target, so on iPhone/iPad you
capture with a one-time Apple Shortcut that POSTs to `/api/capture`. It then shows
up in the Share Sheet everywhere (Safari, News, Mail, etc.).

## Build it (2 minutes)

1. Open the **Shortcuts** app → **+** to create a new shortcut.
2. Tap the shortcut's settings (ⓘ) → enable **Show in Share Sheet**. Under
   *Share Sheet Types*, keep **URLs** and **Text** enabled.
3. Add these actions in order:

   1. **Receive** *URLs* and *Text* from the Share Sheet.
   2. **Get Contents of URL**
      - **URL**: `https://YOUR-APP.vercel.app/api/capture`
      - **Method**: `POST`
      - **Headers**:
        - `Authorization` → `Bearer YOUR_CAPTURE_TOKEN`
        - `Content-Type` → `application/json`
      - **Request Body**: `JSON`
        - `url` → *Shortcut Input* (the shared item)
   3. *(optional)* **Show Notification** → "Saved to Cracks"

4. Name it **"Save to Cracks"**. Done.

Now, in any app, tap **Share → Save to Cracks** and the link is captured and analyzed.

## Notes

- Replace `YOUR-APP.vercel.app` with your deployed URL (or your dev tunnel).
- `YOUR_CAPTURE_TOKEN` is the `CAPTURE_TOKEN` from your environment.
- If you share plain text (a note) instead of a link, map **Shortcut Input** to the
  `text` JSON field instead of `url` — the API accepts either.
- The token lives only in your Shortcut on your device; treat it like a password.

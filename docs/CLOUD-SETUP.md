# Setting up cloud backup (Google sign-in + Supabase)

Cloud backup is optional. Without it, parents' own packs simply stay on each phone. The app never
contacts Supabase or Google unless a parent taps "Sign in with Google" in My packs.

You'll need about 20 minutes, a Google account, and a free Supabase account.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), sign up (free), and create a project named
   `kids-sound-match`. Choose the region closest to your families (e.g. Frankfurt) and save the
   database password somewhere safe.
2. Open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](../supabase/schema.sql),
   and press **Run**. This creates the tables, the private file storage, and the rules that let
   each account see only its own packs.

## 2. Create the Google sign-in client

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project named
   `Kids Sound Match`.
2. **APIs & Services → OAuth consent screen**: choose **External**, enter the app name and your email,
   and keep the default scopes (email, profile, openid). While the app is in "Testing", add your
   own Gmail (and any testers) under **Test users**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
   Under **Authorized redirect URIs** add:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
   (Supabase shows this exact address on its Google provider page.)
4. Copy the **Client ID** and **Client secret**.

## 3. Turn on Google in Supabase

1. Supabase → **Authentication → Sign In / Providers → Google**: switch it on, paste the Client ID
   and Client secret, and save.
2. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `https://kids-sound-match.pages.dev` (or `http://localhost:5173` until the site is online)
   - **Redirect URLs**: add both `http://localhost:5173` and `https://kids-sound-match.pages.dev`

## 4. Connect the app

1. Supabase → **Project Settings → API**: copy the **Project URL** and the **anon / publishable key**.
2. In the `kids-app` folder, create a file named `.env.local` (copy `.env.example`) containing:

   ```
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<the anon / publishable key>
   ```

   This key is meant to be inside apps: the rules from step 1 protect the data. **Never** put the
   `service_role` / secret key here. `.env.local` is not uploaded to GitHub.
3. Restart the app (`npm run dev`, or `npm run deploy` for the online version).
4. Open **My packs → Sign in with Google**.

## Notes

- Sign-in works on `http://localhost:5173` on this PC and on the HTTPS site, but not on the home
  Wi-Fi address (`http://192.168.x.x`): Google and browsers require a secure page.
- The online build locks the page to talk only to your own Supabase project (Content-Security-Policy).
- Parents can remove everything with **My packs → Delete my cloud data**. Deleting a Supabase user
  also deletes their rows (`on delete cascade`); their files can be removed from Storage.

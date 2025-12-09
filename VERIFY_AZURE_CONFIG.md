# ✅ Verify Azure Configuration

## I can see your environment variables are set in Azure!

But let's verify they're correct and the app can read them.

---

## Issue 1: Supabase URL May Be Incomplete

In your screenshot, I see:
```
VITE_SUPABASE_URL = https://ijkhvcahxzpauvfyqvxp.supab
```

**This looks truncated!** It should be:
```
VITE_SUPABASE_URL = https://ijkhvcahxzpauvfyqvxp.supabase.co
```

### Fix:
1. In Azure Portal → Configuration
2. Click on `VITE_SUPABASE_URL`
3. Make sure the value is: `https://ijkhvcahxzpauvfyqvxp.supabase.co` (complete with `.supabase.co`)
4. Save

---

## Issue 2: App Needs Restart

After setting/changing environment variables, the app MUST restart.

### Fix:
```bash
az webapp restart --name YOUR-APP-NAME --resource-group YOUR-RG
```

Or in Azure Portal:
- Your App Service → Overview → Click "Restart"

---

## Issue 3: Browser Cache

Your browser might have cached the old version.

### Fix:
1. **Hard refresh:** `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
2. **Or clear cache:** Settings → Clear browsing data → Cached images and files
3. **Or try incognito/private window**

---

## Verification Steps

### Step 1: Check Config Endpoint

Open this URL in your browser (replace YOUR-APP-NAME):
```
https://YOUR-APP-NAME.azurewebsites.net/config.js
```

You should see something like:
```javascript
// Azure Environment Configuration
// Generated: 2024-12-09...
// URL configured: true
// Key configured: true

window.__APP_CONFIG__ = {
  VITE_SUPABASE_URL: "https://ijkhvcahxzpauvfyqvxp.supabase.co",
  VITE_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
};
```

**If you see empty strings** → App hasn't restarted or can't read env vars
**If URL is incomplete** → Fix the URL value in Azure Portal

### Step 2: Check Browser Console

1. Open your app
2. Press F12 (open DevTools)
3. Look at Console tab
4. If config is missing, you'll see detailed error messages explaining what's wrong

### Step 3: Check Server Logs

```bash
az webapp log tail --name YOUR-APP-NAME --resource-group YOUR-RG
```

Should show:
```
Server is running on port 8080
Supabase URL configured: true
Supabase Key configured: true
```

If it shows `false`, the server can't read the environment variables.

---

## Quick Commands to Run

### 1. Verify URL is complete:
```bash
az webapp config appsettings list \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RG \
  --query "[?name=='VITE_SUPABASE_URL'].value" \
  --output tsv
```

Should output: `https://ijkhvcahxzpauvfyqvxp.supabase.co`

### 2. Fix URL if needed:
```bash
az webapp config appsettings set \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RG \
  --settings VITE_SUPABASE_URL="https://ijkhvcahxzpauvfyqvxp.supabase.co"
```

### 3. Restart app:
```bash
az webapp restart --name YOUR-APP-NAME --resource-group YOUR-RG
```

### 4. Wait 2 minutes, then test:
```bash
curl https://YOUR-APP-NAME.azurewebsites.net/config.js
```

---

## Most Likely Issues

Based on your screenshot:

### 1. ⚠️ URL is truncated
The URL shows `.supab` but should be `.supabase.co`
**Fix:** Edit the setting in Azure Portal to include full URL

### 2. ⚠️ App not restarted
Environment variables were just added/changed
**Fix:** Restart the app and wait 2 minutes

### 3. ⚠️ Browser cache
Old version cached in browser
**Fix:** Hard refresh (Ctrl+Shift+R) or use incognito

---

## Try This Right Now:

1. **Fix the URL** (if truncated):
   - Azure Portal → Your App Service → Configuration
   - Click `VITE_SUPABASE_URL`
   - Change to: `https://ijkhvcahxzpauvfyqvxp.supabase.co` (complete)
   - Save

2. **Restart**:
   - Overview → Restart
   - Wait 2 minutes

3. **Test config endpoint**:
   - Browser: `https://YOUR-APP.azurewebsites.net/config.js`
   - Should show complete URL with `.supabase.co`

4. **Clear browser cache and test**:
   - Hard refresh: Ctrl+Shift+R
   - Or try incognito window
   - App should work now

---

## Still Not Working?

If after these steps it still doesn't work:

1. **Check the complete URL value in Azure Portal**
   - Click on the setting to see the full value
   - Make absolutely sure it ends with `.supabase.co`

2. **Stop and Start (not just restart)**
   ```bash
   az webapp stop --name YOUR-APP --resource-group YOUR-RG
   # Wait 30 seconds
   az webapp start --name YOUR-APP --resource-group YOUR-RG
   ```

3. **Check deployment**
   - Azure Portal → Deployment Center → Logs
   - Make sure latest deployment succeeded

4. **Re-deploy**
   - If config endpoint returns 404, the new server.js might not be deployed
   - Trigger a new deployment

---

## Debug Output

When you open the app now, the browser console will show:
- Whether runtime config is available
- Whether URL and Key are set
- Exact instructions on what to do

Open your app, press F12, and look at the Console tab for detailed debug info.

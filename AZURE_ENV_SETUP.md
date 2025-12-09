# ⚙️ Azure Environment Variables Setup

## THE PROBLEM

You're seeing: **"Missing Supabase environment variables"**

This happens because **environment variables are NOT configured in Azure App Service**.

---

## THE SOLUTION (3 Simple Steps)

### Step 1: Get Your Supabase Credentials

1. Go to: **https://app.supabase.com**
2. Select your project
3. Click **Settings** (gear icon) → **API**
4. Copy these two values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (looks like: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)

### Step 2: Set Variables in Azure

#### Option A: Azure Portal (Easiest - 5 minutes)

1. **Open Azure Portal**
   - Visit: https://portal.azure.com
   - Sign in with your Azure account

2. **Find Your App Service**
   - Search for your app name in the top search bar
   - Click on your App Service from results

3. **Open Configuration**
   - In left sidebar, scroll to **Settings** section
   - Click **Configuration**
   - You'll see the "Application settings" tab

4. **Add Environment Variables**

   Click **"+ New application setting"** and add:

   **First Setting:**
   ```
   Name:  VITE_SUPABASE_URL
   Value: https://your-project-id.supabase.co
   ```
   (Paste the Project URL from Step 1)

   Click **OK**

   **Second Setting:**
   ```
   Name:  VITE_SUPABASE_ANON_KEY
   Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
   (Paste the anon public key from Step 1)

   Click **OK**

   **Third Setting:**
   ```
   Name:  NODE_ENV
   Value: production
   ```

   Click **OK**

5. **Save Configuration**
   - Click **Save** button at the top of the page
   - Click **Continue** on the confirmation dialog
   - Azure will restart your app automatically (takes ~60 seconds)

#### Option B: Azure CLI (For Advanced Users)

```bash
az webapp config appsettings set \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RESOURCE-GROUP \
  --settings \
    VITE_SUPABASE_URL="https://your-project-id.supabase.co" \
    VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
    NODE_ENV="production"

az webapp restart \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RESOURCE-GROUP
```

### Step 3: Verify It Works

1. **Wait 2 minutes** for the restart to complete

2. **Check the config endpoint:**
   - Open in browser: `https://YOUR-APP-NAME.azurewebsites.net/config.js`
   - You should see your Supabase URL (NOT empty strings)

3. **Test your app:**
   - Open: `https://YOUR-APP-NAME.azurewebsites.net`
   - **Hard refresh:** Press `Ctrl + Shift + R` (Windows/Linux) or `Cmd + Shift + R` (Mac)
   - Open browser console (F12) - check for errors
   - If you see configuration errors, they'll tell you what's missing

4. **Try to login:**
   - You should be able to login without errors
   - Data should load from Supabase

---

## Verification Checklist

Run through this checklist:

- [ ] I got my Supabase URL and anon key from app.supabase.com
- [ ] I opened Azure Portal and found my App Service
- [ ] I went to Configuration → Application settings
- [ ] I added VITE_SUPABASE_URL setting
- [ ] I added VITE_SUPABASE_ANON_KEY setting
- [ ] I added NODE_ENV=production setting
- [ ] I clicked Save at the top
- [ ] I waited 2+ minutes for restart
- [ ] I checked /config.js shows my actual URL (not empty)
- [ ] I hard refreshed my app (Ctrl+Shift+R)
- [ ] The app loads without "Missing Supabase" error

---

## Common Issues

### Issue: Config endpoint shows empty strings

**Problem:** Environment variables not set correctly

**Fix:**
1. Go back to Azure Portal → Configuration
2. Verify the setting names are EXACTLY:
   - `VITE_SUPABASE_URL` (not `SUPABASE_URL`)
   - `VITE_SUPABASE_ANON_KEY` (not `SUPABASE_ANON_KEY`)
3. Check for typos in the values
4. Save again and wait 2 minutes

### Issue: Still getting error after setting variables

**Problem:** Browser cache or app not restarted

**Fix:**
1. Manually restart app:
   ```bash
   az webapp restart --name YOUR-APP --resource-group YOUR-RG
   ```
2. Clear browser cache completely
3. Try in incognito/private window
4. Wait 3-5 minutes and try again

### Issue: Can't find App Service in Azure Portal

**Problem:** Might not be deployed yet or wrong subscription

**Fix:**
1. Check you're in the right Azure subscription (top right)
2. Use search bar at top of portal
3. Go to "App Services" from left menu to see all apps
4. If no app exists, you need to deploy first

### Issue: Environment variables keep disappearing

**Problem:** Deployment might be overwriting settings

**Fix:**
1. Don't include .env file in deployment
2. Set variables through Azure Portal, not in code
3. Check deployment configuration in Deployment Center

---

## Testing Commands

### Check if variables are set:
```bash
az webapp config appsettings list \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RG \
  --query "[?name=='VITE_SUPABASE_URL' || name=='VITE_SUPABASE_ANON_KEY']"
```

### View app logs:
```bash
az webapp log tail \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RG
```

Should show:
```
Server is running on port 8080
Supabase URL configured: true
Supabase Key configured: true
```

### Test config endpoint:
```bash
curl https://YOUR-APP-NAME.azurewebsites.net/config.js
```

Should return (with actual values, not empty):
```javascript
window.__APP_CONFIG__ = {
  VITE_SUPABASE_URL: "https://xxxxx.supabase.co",
  VITE_SUPABASE_ANON_KEY: "eyJhbGc..."
};
```

---

## Security Notes

- **NEVER commit .env file to Git** - environment variables should only be in Azure
- The anon key is safe to expose (it's public by design)
- Don't use the service_role key - only use anon key
- Keys are served by your backend, not in the client bundle

---

## Need More Help?

If you're still stuck:

1. **Check the browser console** (F12) - it will show detailed error messages
2. **Check /config.js** - verify your values are there
3. **Check Azure logs** - see if the server is reading the variables
4. **Read CHECK_CONFIG.md** - comprehensive troubleshooting guide
5. **Read AZURE_TROUBLESHOOTING.md** - all common issues and fixes

---

## Quick Reference

**Azure Portal Configuration Path:**
```
portal.azure.com → Your App Service → Configuration → Application settings
```

**Required Settings:**
```
VITE_SUPABASE_URL = https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY = eyJhbGc...
NODE_ENV = production
```

**Verification URL:**
```
https://YOUR-APP-NAME.azurewebsites.net/config.js
```

---

**Remember:** The app code is correct. You just need to set the environment variables in Azure!

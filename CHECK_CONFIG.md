# 🔍 Configuration Check Guide

## You're Getting "Missing Supabase environment variables"?

This means **environment variables are NOT set in Azure**.

---

## Quick Check - Is Config Working?

### Option 1: Browser Check (Easiest)

1. Open your Azure app: `https://YOUR-APP-NAME.azurewebsites.net`
2. Open browser console (F12)
3. Look for red error messages about configuration
4. Go to: `https://YOUR-APP-NAME.azurewebsites.net/config.js`
5. Check if URL and KEY are present (not empty strings)

**If you see empty strings** → Environment variables NOT set in Azure

---

## How to Set Environment Variables in Azure

### Method 1: Azure Portal (Recommended)

1. **Login to Azure Portal**
   - Go to: https://portal.azure.com
   - Find your App Service in the list

2. **Open Configuration**
   - Click on your App Service
   - Left sidebar → **Configuration**
   - Tab: **Application settings**

3. **Add Variables** (Click "+ New application setting" for each)

   **Variable 1:**
   ```
   Name:  VITE_SUPABASE_URL
   Value: https://your-project-id.supabase.co
   ```
   *(Get from: https://app.supabase.com → Your Project → Settings → API)*

   **Variable 2:**
   ```
   Name:  VITE_SUPABASE_ANON_KEY
   Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
   *(Get from: https://app.supabase.com → Your Project → Settings → API → anon public)*

   **Variable 3:**
   ```
   Name:  NODE_ENV
   Value: production
   ```

4. **Save and Restart**
   - Click **Save** button at top
   - Click **Continue** on confirmation
   - Wait for app to restart (30-60 seconds)

5. **Verify It Worked**
   - Wait 1-2 minutes
   - Open: `https://YOUR-APP-NAME.azurewebsites.net/config.js`
   - Should show your actual Supabase URL (not empty)
   - Hard refresh your app: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

### Method 2: Azure CLI (For Developers)

```bash
# Replace these values:
# YOUR-APP-NAME = Your Azure App Service name
# YOUR-RG = Your Azure Resource Group name
# your-project-id = Your Supabase project ID

az webapp config appsettings set \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RG \
  --settings \
    VITE_SUPABASE_URL="https://your-project-id.supabase.co" \
    VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
    NODE_ENV="production"

# Restart the app
az webapp restart \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RG

# Check if settings were applied
az webapp config appsettings list \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RG \
  --query "[?name=='VITE_SUPABASE_URL' || name=='VITE_SUPABASE_ANON_KEY']"
```

---

## Get Your Supabase Credentials

Don't have your Supabase URL and Key? Here's how to get them:

1. **Go to Supabase Dashboard**
   - Visit: https://app.supabase.com
   - Login to your account

2. **Select Your Project**
   - Click on your project

3. **Get API Credentials**
   - Left sidebar → **Settings** (gear icon)
   - Click **API**
   - Copy these values:
     - **Project URL** → This is your `VITE_SUPABASE_URL`
     - **anon public** key → This is your `VITE_SUPABASE_ANON_KEY`

---

## Verification Steps

After setting environment variables:

### Step 1: Check Azure Configuration
```bash
az webapp config appsettings list \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RG
```

Look for your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the output.

### Step 2: Check Config Endpoint
```bash
curl https://YOUR-APP-NAME.azurewebsites.net/config.js
```

Should return:
```javascript
window.__APP_CONFIG__ = {
  VITE_SUPABASE_URL: "https://xxxxx.supabase.co",
  VITE_SUPABASE_ANON_KEY: "eyJhbG..."
};
```

NOT this:
```javascript
window.__APP_CONFIG__ = {
  VITE_SUPABASE_URL: "",
  VITE_SUPABASE_ANON_KEY: ""
};
```

### Step 3: Check Server Logs
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

NOT this:
```
Supabase URL configured: false
Supabase Key configured: false
```

### Step 4: Test the App
1. Open: `https://YOUR-APP-NAME.azurewebsites.net`
2. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
3. Open console (F12)
4. Should NOT see "Missing Supabase environment variables" error
5. Should be able to login

---

## Still Not Working?

### Checklist:

- [ ] Environment variables added in Azure Portal
- [ ] All three variables set (URL, KEY, NODE_ENV)
- [ ] Clicked "Save" in Azure Portal
- [ ] App restarted after saving (automatic, wait 60 seconds)
- [ ] Waited 2-3 minutes after restart
- [ ] Hard refreshed browser (Ctrl+Shift+R)
- [ ] Checked /config.js shows values (not empty)
- [ ] Checked server logs show "configured: true"

### Try These:

1. **Manual Restart**
   ```bash
   az webapp restart --name YOUR-APP --resource-group YOUR-RG
   ```

2. **Clear Browser Cache**
   - Chrome: Ctrl+Shift+Delete → Clear cached images and files
   - Try incognito/private window

3. **Stop and Start App**
   ```bash
   az webapp stop --name YOUR-APP --resource-group YOUR-RG
   # Wait 30 seconds
   az webapp start --name YOUR-APP --resource-group YOUR-RG
   ```

4. **Check Deployment Logs**
   - Azure Portal → Your App Service → Deployment Center → Logs
   - Look for any errors during deployment

5. **Verify App Service Plan**
   - Make sure it's not in "Free" tier
   - Recommended: B1 (Basic) or higher

---

## Common Mistakes

❌ **Setting variables AFTER deployment**
✅ Set variables, THEN restart

❌ **Forgetting to restart app**
✅ App must restart to pick up new variables

❌ **Using wrong key (secret role key instead of anon key)**
✅ Use the "anon public" key from Supabase dashboard

❌ **Typo in variable names**
✅ Must be exactly: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

❌ **Using localhost URL**
✅ Use your actual Supabase project URL (https://xxx.supabase.co)

❌ **Not waiting for restart to complete**
✅ Wait 1-2 minutes after clicking Save

---

## Need More Help?

📖 **DEPLOY_AZURE_NOW.md** - Complete deployment guide
📖 **AZURE_TROUBLESHOOTING.md** - All common issues
📖 **AZURE_FIX.md** - Technical explanation

---

## Quick Command Reference

```bash
# Check current settings
az webapp config appsettings list --name YOUR-APP --resource-group YOUR-RG

# Set environment variables
az webapp config appsettings set --name YOUR-APP --resource-group YOUR-RG \
  --settings VITE_SUPABASE_URL="https://xxx.supabase.co" \
             VITE_SUPABASE_ANON_KEY="ey..."

# Restart app
az webapp restart --name YOUR-APP --resource-group YOUR-RG

# View logs
az webapp log tail --name YOUR-APP --resource-group YOUR-RG

# Test config
curl https://YOUR-APP.azurewebsites.net/config.js
```

---

**Remember:** Environment variables MUST be set in Azure for the app to work!

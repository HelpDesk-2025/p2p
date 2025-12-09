# 🚀 Deploy to Azure RIGHT NOW

## Step 1: Set Up Environment Variables (CRITICAL)

**Option A: Azure Portal (Easiest)**

1. Go to [portal.azure.com](https://portal.azure.com)
2. Find your App Service (or create one)
3. Left menu → **Configuration**
4. Click **"+ New application setting"**
5. Add these THREE settings:

   **Setting 1:**
   - Name: `VITE_SUPABASE_URL`
   - Value: `https://YOUR-PROJECT.supabase.co` (get from Supabase Dashboard)

   **Setting 2:**
   - Name: `VITE_SUPABASE_ANON_KEY`  
   - Value: `eyJhbGc...` (get from Supabase Dashboard → Settings → API)

   **Setting 3:**
   - Name: `NODE_ENV`
   - Value: `production`

6. Click **Save** at top
7. App will restart automatically

**Option B: Azure CLI (Fastest)**

```bash
# Replace YOUR-APP-NAME, YOUR-RG, YOUR-URL, YOUR-KEY
az webapp config appsettings set \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RG \
  --settings \
    VITE_SUPABASE_URL="https://xxxxx.supabase.co" \
    VITE_SUPABASE_ANON_KEY="eyJhbGc..." \
    NODE_ENV="production"
```

---

## Step 2: Deploy Your App

**If app doesn't exist yet:**

```bash
az login

az webapp up \
  --name YOUR-UNIQUE-APP-NAME \
  --runtime "NODE:18-lts" \
  --sku B1
```

**If app already exists:**

```bash
# Just restart after setting env vars
az webapp restart \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RG
```

---

## Step 3: Verify It Works

1. **Check config endpoint:**
   ```bash
   curl https://YOUR-APP-NAME.azurewebsites.net/config.js
   ```
   
   Should return (not empty strings):
   ```javascript
   window.__APP_CONFIG__ = {
     VITE_SUPABASE_URL: "https://xxxxx.supabase.co",
     VITE_SUPABASE_ANON_KEY: "eyJhbGc..."
   };
   ```

2. **Open your app:**
   ```
   https://YOUR-APP-NAME.azurewebsites.net
   ```

3. **Test login:**
   - Should be able to log in
   - No "Missing Supabase environment variables" error

---

## ⚠️ IMPORTANT: Order Matters!

1. **FIRST:** Set environment variables
2. **THEN:** Deploy or restart
3. **FINALLY:** Test

**DON'T:**
- Deploy before setting env vars (app will crash)
- Forget to restart after setting env vars

---

## 🔍 Still Getting Errors?

### "Missing Supabase environment variables"

**Fix:**
1. Set env vars in Azure Portal (see Step 1)
2. Restart app:
   ```bash
   az webapp restart --name YOUR-APP --resource-group YOUR-RG
   ```
3. Clear browser cache (Ctrl+Shift+R)

**Check:**
```bash
# Verify vars are set
az webapp config appsettings list \
  --name YOUR-APP \
  --resource-group YOUR-RG \
  --query "[?name=='VITE_SUPABASE_URL']"
```

### Blank Page

**Fix:**
1. Check browser console (F12)
2. Look for specific error
3. Check logs:
   ```bash
   az webapp log tail --name YOUR-APP --resource-group YOUR-RG
   ```

### Build Failed

**Fix:**
1. Make sure Node 18.x is set:
   ```bash
   az webapp config set \
     --name YOUR-APP \
     --resource-group YOUR-RG \
     --linux-fx-version "NODE|18-lts"
   ```

---

## 📚 More Help

- **Environment var issues:** `AZURE_FIX.md`
- **All problems:** `AZURE_TROUBLESHOOTING.md`
- **Full guide:** `AZURE_DEPLOYMENT.md`

---

## ✅ Success Checklist

- [x] Built locally successfully
- [ ] Environment variables set in Azure
- [ ] App deployed to Azure
- [ ] App restarted after env vars set
- [ ] Config endpoint shows correct values
- [ ] App loads without errors
- [ ] Login works
- [ ] Data loads from Supabase

**Done? Your app is live! 🎉**

# Azure Environment Variables Fix

## Problem
Vite environment variables (`VITE_*`) are build-time only and don't work at runtime on Azure unless set during build.

## Solution
Implemented a hybrid configuration system that supports both:
- **Build-time**: Local development with Vite
- **Runtime**: Production on Azure with server-injected config

## How It Works

### 1. Server Configuration Injection
The `server.js` file now:
- Serves a `/config.js` endpoint with environment variables
- Injects the config script into HTML head
- Exposes config via `window.__APP_CONFIG__`

### 2. Supabase Client Update
The `supabase.ts` file now:
- Checks for runtime config first (`window.__APP_CONFIG__`)
- Falls back to build-time config (`import.meta.env`)
- Works in both development and production

## Environment Variables in Azure

Set these in Azure Portal → Your App Service → Configuration → Application settings:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Or via Azure CLI:

```bash
az webapp config appsettings set \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RG \
  --settings \
    VITE_SUPABASE_URL="https://your-project.supabase.co" \
    VITE_SUPABASE_ANON_KEY="your-anon-key-here" \
    NODE_ENV="production"
```

## Verification

After setting environment variables:

1. **Restart the app:**
   ```bash
   az webapp restart --name YOUR-APP-NAME --resource-group YOUR-RG
   ```

2. **Check logs:**
   ```bash
   az webapp log tail --name YOUR-APP-NAME --resource-group YOUR-RG
   ```

   Should show:
   ```
   Server is running on port 8080
   Supabase URL configured: true
   Supabase Key configured: true
   ```

3. **Test config endpoint:**
   ```bash
   curl https://YOUR-APP-NAME.azurewebsites.net/config.js
   ```

   Should return:
   ```javascript
   window.__APP_CONFIG__ = {
     VITE_SUPABASE_URL: "https://your-project.supabase.co",
     VITE_SUPABASE_ANON_KEY: "ey..."
   };
   ```

4. **Open the app:**
   - Visit `https://YOUR-APP-NAME.azurewebsites.net`
   - Open browser console
   - Type: `window.__APP_CONFIG__`
   - Should show your Supabase config

## Troubleshooting

### Still getting "Missing Supabase environment variables"?

1. **Verify variables are set:**
   ```bash
   az webapp config appsettings list \
     --name YOUR-APP-NAME \
     --resource-group YOUR-RG \
     --query "[?name=='VITE_SUPABASE_URL' || name=='VITE_SUPABASE_ANON_KEY']"
   ```

2. **Restart the app:**
   ```bash
   az webapp restart --name YOUR-APP-NAME --resource-group YOUR-RG
   ```

3. **Check the config endpoint:**
   - Open: `https://YOUR-APP-NAME.azurewebsites.net/config.js`
   - Verify values are present (not empty strings)

4. **Clear browser cache:**
   - Hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)

5. **Check deployment logs:**
   - Azure Portal → Your App Service → Deployment Center → Logs

### Config values showing as empty strings?

Environment variables not set correctly. Double-check:
```bash
az webapp config appsettings set \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RG \
  --settings \
    VITE_SUPABASE_URL="YOUR_ACTUAL_URL" \
    VITE_SUPABASE_ANON_KEY="YOUR_ACTUAL_KEY"
```

## Benefits

✅ Works in development (Vite)
✅ Works in production (Azure)
✅ No rebuild needed to change config
✅ Secure (keys not in client bundle)
✅ Easy to update via Azure Portal

## Changes Made

- ✅ `server.js` - Added config endpoint and injection
- ✅ `src/lib/supabase.ts` - Added runtime config support
- ✅ Documentation updated

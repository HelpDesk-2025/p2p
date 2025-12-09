# Azure App Service Troubleshooting Guide

## Error: Missing Supabase environment variables

### Symptoms
- App loads but shows error: "Uncaught Error: Missing Supabase environment variables"
- Error occurs at runtime in browser console

### Root Cause
Environment variables are not configured in Azure App Service.

### Solution

#### Option 1: Azure Portal (Recommended)

1. **Go to Azure Portal**
   - Navigate to [portal.azure.com](https://portal.azure.com)
   - Select your App Service

2. **Open Configuration**
   - Left menu → Configuration
   - Click "Application settings" tab

3. **Add Environment Variables**
   Click "+ New application setting" for each:

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6...` |
   | `NODE_ENV` | `production` |

4. **Save and Restart**
   - Click "Save" at the top
   - Click "Continue" to confirm
   - Wait for restart (automatic)

#### Option 2: Azure CLI

```bash
az webapp config appsettings set \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RESOURCE-GROUP \
  --settings \
    VITE_SUPABASE_URL="https://your-project.supabase.co" \
    VITE_SUPABASE_ANON_KEY="your-anon-key" \
    NODE_ENV="production"
```

### Verification

1. **Check if variables are set:**
   ```bash
   az webapp config appsettings list \
     --name YOUR-APP-NAME \
     --resource-group YOUR-RG \
     --query "[?name=='VITE_SUPABASE_URL' || name=='VITE_SUPABASE_ANON_KEY']"
   ```

2. **Check config endpoint:**
   - Open: `https://YOUR-APP-NAME.azurewebsites.net/config.js`
   - Should show your Supabase URL and key (not empty strings)

3. **Check browser console:**
   - Open your app
   - Press F12 to open DevTools
   - Type: `window.__APP_CONFIG__`
   - Should show your configuration

4. **Check server logs:**
   ```bash
   az webapp log tail --name YOUR-APP-NAME --resource-group YOUR-RG
   ```

   Should show:
   ```
   Server is running on port 8080
   Supabase URL configured: true
   Supabase Key configured: true
   ```

---

## Error: App shows blank page

### Symptoms
- App loads but shows blank white page
- No errors in browser console

### Solution

1. **Check deployment status:**
   ```bash
   az webapp deployment list-publishing-credentials \
     --name YOUR-APP-NAME \
     --resource-group YOUR-RG
   ```

2. **Verify dist folder was built:**
   - Azure Portal → Your App Service → Advanced Tools → Go
   - Click "Debug console" → CMD
   - Navigate to `site/wwwroot`
   - Check if `dist` folder exists with files

3. **Restart the app:**
   ```bash
   az webapp restart --name YOUR-APP-NAME --resource-group YOUR-RG
   ```

---

## Error: Build fails during deployment

### Symptoms
- Deployment fails with build errors
- Logs show npm or node errors

### Solution

1. **Check Node.js version:**
   ```bash
   az webapp config show \
     --name YOUR-APP-NAME \
     --resource-group YOUR-RG \
     --query linuxFxVersion
   ```

   Should be: `NODE|18-lts`

2. **Set correct Node version:**
   ```bash
   az webapp config set \
     --name YOUR-APP-NAME \
     --resource-group YOUR-RG \
     --linux-fx-version "NODE|18-lts"
   ```

3. **Enable build automation:**
   ```bash
   az webapp config appsettings set \
     --name YOUR-APP-NAME \
     --resource-group YOUR-RG \
     --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true
   ```

4. **Redeploy:**
   ```bash
   az webapp deployment source sync \
     --name YOUR-APP-NAME \
     --resource-group YOUR-RG
   ```

---

## Error: Cannot find module 'serve'

### Symptoms
- App crashes on startup
- Logs show: "Cannot find module 'serve'"

### Solution

This error occurs if using `serve` package. Our solution uses a custom `server.js` instead.

1. **Verify package.json start script:**
   ```json
   "scripts": {
     "start": "node server.js"
   }
   ```

2. **Ensure server.js exists in root:**
   ```bash
   # Local check
   ls -la server.js
   ```

3. **Redeploy if needed**

---

## Error: App crashes after deployment

### Symptoms
- App deployed successfully but crashes
- HTTP 500 or service unavailable

### Solution

1. **Check application logs:**
   ```bash
   az webapp log tail --name YOUR-APP-NAME --resource-group YOUR-RG
   ```

2. **Enable detailed logging:**
   - Azure Portal → Your App Service → App Service logs
   - Turn on "Application Logging (Filesystem)"
   - Set level to "Verbose"
   - Save

3. **Check for common issues:**
   - Missing dependencies in package.json
   - Incorrect start command
   - Missing environment variables

4. **Restart the app:**
   ```bash
   az webapp restart --name YOUR-APP-NAME --resource-group YOUR-RG
   ```

---

## Slow performance

### Symptoms
- App loads very slowly
- Timeouts occur frequently

### Solution

1. **Check App Service Plan tier:**
   ```bash
   az appservice plan show \
     --name YOUR-PLAN-NAME \
     --resource-group YOUR-RG \
     --query sku.name
   ```

2. **Upgrade to higher tier:**
   ```bash
   az appservice plan update \
     --name YOUR-PLAN-NAME \
     --resource-group YOUR-RG \
     --sku B2
   ```

3. **Enable caching:**
   - Files already have cache headers in `server.js`
   - Static assets cached for 1 year
   - HTML not cached

4. **Consider Azure CDN:**
   - For better global performance
   - Reduces load on App Service

---

## Database connection issues

### Symptoms
- Authentication fails
- Data doesn't load
- Supabase errors in console

### Solution

1. **Verify Supabase credentials:**
   - Go to Supabase Dashboard
   - Settings → API
   - Copy Project URL and anon key
   - Update in Azure (see top of this guide)

2. **Check Supabase project status:**
   - Ensure project is not paused
   - Check if API is accessible

3. **Test connection:**
   - Open: `https://YOUR-APP-NAME.azurewebsites.net/config.js`
   - Verify URL and key are correct

4. **Check browser console for specific errors**

---

## Quick Commands Reference

### Restart app
```bash
az webapp restart --name YOUR-APP-NAME --resource-group YOUR-RG
```

### View logs
```bash
az webapp log tail --name YOUR-APP-NAME --resource-group YOUR-RG
```

### Check status
```bash
az webapp show \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RG \
  --query state
```

### Update settings
```bash
az webapp config appsettings set \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RG \
  --settings KEY=VALUE
```

### Redeploy
```bash
az webapp deployment source sync \
  --name YOUR-APP-NAME \
  --resource-group YOUR-RG
```

---

## Getting Help

1. **Check Azure Activity Log:**
   - Azure Portal → Your App Service → Activity log
   - Look for failed operations

2. **Review Deployment Logs:**
   - Azure Portal → Your App Service → Deployment Center → Logs

3. **Check Application Insights:**
   - If enabled, shows detailed telemetry

4. **Azure Support:**
   - [Azure App Service Documentation](https://docs.microsoft.com/azure/app-service/)
   - [Azure Support Portal](https://portal.azure.com/#blade/Microsoft_Azure_Support/HelpAndSupportBlade)

---

## Common Issues Checklist

- [ ] Environment variables set in Azure
- [ ] Node.js version is 18.x
- [ ] App restarted after config changes
- [ ] dist folder contains built files
- [ ] server.js exists in root
- [ ] package.json has correct start script
- [ ] Supabase credentials are valid
- [ ] App Service Plan has sufficient resources

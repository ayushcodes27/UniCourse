# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/051a65a5-77dc-4eda-83f0-08a45dba75d6

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/051a65a5-77dc-4eda-83f0-08a45dba75d6) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Create a .env file with required environment variables
# VITE_AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=YOUR_ACCOUNT_NAME;AccountKey=YOUR_ACCOUNT_KEY;EndpointSuffix=core.windows.net
# VITE_AZURE_STORAGE_CONTAINER_NAME=learn-admin-files
# Add your Firebase configuration variables as well

# Step 5: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Azure Blob Storage (for file storage)
- Firebase (for database and authentication)

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/051a65a5-77dc-4eda-83f0-08a45dba75d6) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Azure Blob Storage Setup

This project uses Azure Blob Storage for storing assignment files and resources. To set up Azure Blob Storage:

1. Create an Azure Storage Account in the Azure Portal
2. Get your account name from the Storage Account overview page
3. Generate a SAS (Shared Access Signature) token:
   - Go to your Storage Account in Azure Portal
   - Navigate to "Shared access signature" under "Security + networking"
   - Configure:
     - **Allowed services**: Check "Blob"
     - **Allowed resource types**: Check "Container" and "Object"
     - **Allowed permissions**: Check "Read", "Write", "Create", "Delete", "Add"
     - **Expiry**: Set an appropriate expiration date (or use start/end date)
   - Click "Generate SAS and connection string"
   - Copy the **SAS token** (the query string after the `?` in the SAS URL)

4. Add the following environment variables to your `.env` file:
   - `VITE_AZURE_STORAGE_ACCOUNT_NAME`: Your Azure Storage account name (e.g., "mystorageaccount")
   - `VITE_AZURE_STORAGE_SAS_TOKEN`: The SAS token you generated (without the leading `?`)
   - `VITE_AZURE_STORAGE_CONTAINER_NAME`: The container name for storing files (default: "learn-admin-files")

**Example `.env` file:**
```env
VITE_AZURE_STORAGE_ACCOUNT_NAME=yourstorageaccount
VITE_AZURE_STORAGE_SAS_TOKEN=sv=2022-11-02&ss=b&srt=c&sp=rwdlac&se=2024-12-31T23:59:59Z&st=2024-01-01T00:00:00Z&spr=https&sig=...
VITE_AZURE_STORAGE_CONTAINER_NAME=learn-admin-files
```

**IMPORTANT:** You need to create the container manually before uploading files:

1. In Azure Portal, go to your Storage Account
2. Navigate to "Containers" in the left sidebar
3. Click "+ Container"
4. Enter the container name: `learn-admin-files` (or your custom name from the env variable)
5. Set the public access level to "Blob" (for public access to uploaded files)
6. Click "Create"

## Enable CORS for Azure Blob Storage

**IMPORTANT:** You must enable CORS on your Azure Storage Account for browser uploads to work:

1. Go to your Azure Storage Account in the Azure Portal
2. Navigate to "CORS" under "Settings"
3. Add the following CORS rule for Blob service:
   - **Allowed origins**: `*` (or your specific domain for production)
   - **Allowed methods**: GET, HEAD, PUT, POST, DELETE, OPTIONS
   - **Allowed headers**: `*`
   - **Exposed headers**: `*`
   - **Max age**: 3600

4. Click "Save"

**Note:** Make sure to restart your dev server after adding the environment variables and configuring CORS.

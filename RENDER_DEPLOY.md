# Render Deployment

This project can run on Render as a Next.js App Router web service with PostgreSQL.

## Recommended Setup

Use:

- Render Web Service
- Render PostgreSQL, or an external PostgreSQL service such as Aiven/Neon
- Cloudinary for uploads on Render free instances

Render free web services have an ephemeral filesystem. Uploaded files can disappear after redeploys or restarts. For real video generation, uploaded reference files must be reachable by the video provider, so Cloudinary is the safest free-friendly option on Render.

## Deploy With Blueprint

1. Push this project to GitHub.
2. Open Render.
3. Click **New +** -> **Blueprint**.
4. Select this repository.
5. Render reads `render.yaml` and creates:
   - one web service
   - one PostgreSQL database
6. Fill the required secret environment variables.
7. Click **Apply** / **Deploy**.

## Required Environment Variables

When using `render.yaml`, `DATABASE_URL` is created automatically from the Render PostgreSQL database.

Fill these manually in Render:

```env
SETUP_SECRET=use-a-private-setup-secret
KEY_ENCRYPTION_SECRET=use-a-long-random-encryption-secret
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

These are already defined by `render.yaml`:

```env
NODE_VERSION=22
AUTH_COOKIE_SECURE=true
VIDEO_PROVIDER_MOCK=false
VIDEO_PROVIDER_BASE_URL=https://api.loova.ai/api
STORAGE_PROVIDER=cloudinary
CLOUDINARY_UPLOAD_FOLDER=video-generator
```

`AUTH_SECRET` is generated automatically by Render.

Important: do not change `KEY_ENCRYPTION_SECRET` after adding API Keys in the admin Key pool. Existing saved Keys cannot be decrypted if this value changes.

## If Using Existing Aiven/Neon Database

If you do not want Render to create PostgreSQL:

1. Create a normal **Web Service** instead of Blueprint.
2. Set `DATABASE_URL` manually to your existing PostgreSQL URL.
3. Set the same `KEY_ENCRYPTION_SECRET` used when the existing Key pool records were created.

Build command:

```bash
npm ci && npm run db:deploy && npm run build
```

Start command:

```bash
npx next start -p $PORT
```

## Initialize Users

After the first successful deploy, open:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/setup/seed?secret=YOUR_SETUP_SECRET
```

It creates:

```text
admin / admin123456
user1 / 123456
user2 / 123456
user3 / 123456
user4 / 123456
user5 / 123456
```

Then open:

```text
https://YOUR-RENDER-SERVICE.onrender.com/login
```

## Add Video API Key

1. Login as `admin`.
2. Open the admin page.
3. Go to **Key 账号池**.
4. Add an API Key.
5. Leave Base URL empty, or use:

```text
https://api.loova.ai/api
```

## Without Cloudinary

For local uploads on Render, use a paid Render persistent disk:

```env
STORAGE_PROVIDER=local
UPLOAD_DIR=/var/data/uploads
PUBLIC_UPLOAD_BASE_URL=https://YOUR-RENDER-SERVICE.onrender.com
```

Mount the disk at:

```text
/var/data
```

Do not use local uploads on a free Render web service for real generation, because uploaded files are not reliably persisted.

## Notes

- Free web services sleep after inactivity, so the first request can be slow.
- `npm run db:deploy` runs `prisma db push` during build.
- The seed endpoint is protected by `SETUP_SECRET`.
- The seed endpoint refuses to run if users already exist.

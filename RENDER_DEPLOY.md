# Render Deployment

This project can run on Render as a Next.js web service with PostgreSQL.

Recommended storage for image uploads on Render: Cloudinary. Render web service disks are not a good fit for uploaded files, especially on free instances.

## 1. Prepare accounts

Create accounts for:

- Render
- Cloudinary

## 2. Deploy with Blueprint

1. Push this project to GitHub.
2. In Render, choose **New +** -> **Blueprint**.
3. Select this repository.
4. Render will read `render.yaml` and create:
   - a web service
   - a PostgreSQL database
5. Add the Cloudinary environment variables listed below.
6. Click deploy.

## 3. Required environment variables

Render sets `DATABASE_URL` automatically when using `render.yaml`.

Add these manually in the Render web service Environment tab:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_UPLOAD_FOLDER=video-generator
STORAGE_PROVIDER=cloudinary
```

These are generated or prefilled by `render.yaml`, but you can also set them manually:

```env
AUTH_SECRET=use-a-long-random-secret
SETUP_SECRET=use-a-private-setup-secret
AUTH_COOKIE_SECURE=true
LOOVA_API_MOCK=true
```

When connecting the real video API:

```env
LOOVA_API_MOCK=false
LOOVA_API_KEY=your_provider_key
LOOVA_API_BASE_URL=https://provider.example.com/api
```

## 4. Initialize default users from the browser

After the first deploy succeeds, open:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/setup/seed?secret=YOUR_SETUP_SECRET
```

This runs only if the database has no users. It creates:

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

## 5. Notes

- Render free web services sleep after inactivity, so the first request can be slow.
- Do not store uploads on the Render filesystem. Use Cloudinary or another object storage provider.
- `npm run db:deploy` runs during build to create/update database tables.
- The seed endpoint is protected by `SETUP_SECRET` and refuses to run if users already exist.

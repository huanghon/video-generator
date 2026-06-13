# Vercel Deployment

This project is configured for Vercel with:

- Next.js App Router
- Prisma ORM
- PostgreSQL database, recommended free providers: Neon or Supabase
- Vercel Blob for uploaded image storage

## 1. Create cloud resources

1. Create a Vercel project from this repository.
2. Create a free PostgreSQL database with Neon or Supabase.
3. Create a Vercel Blob store in the same Vercel account.

## 2. Configure Vercel environment variables

Set these in Vercel Project Settings -> Environment Variables:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
AUTH_SECRET="use-a-long-random-secret"
AUTH_COOKIE_SECURE=true
BLOB_READ_WRITE_TOKEN="vercel-blob-token"
VIDEO_PROVIDER_MOCK=true
VIDEO_PROVIDER_BASE_URL=
KEY_ENCRYPTION_SECRET="use-a-long-random-encryption-secret"
```

Use `VIDEO_PROVIDER_MOCK=true` until the real video provider is connected. When switching to real calls, set:

```env
VIDEO_PROVIDER_MOCK=false
VIDEO_PROVIDER_BASE_URL="https://provider.example.com/api"
KEY_ENCRYPTION_SECRET="use-a-long-random-encryption-secret"
```

## 3. Initialize the database

After setting `DATABASE_URL`, initialize tables and default users from your local machine:

```bash
npm install
npm run db:init
```

Default accounts:

```text
admin / admin123456
user1 / 123456
user2 / 123456
user3 / 123456
user4 / 123456
user5 / 123456
```

If you use `vercel env pull`, pull the production env into `.env` first because Prisma CLI reads `.env`:

```bash
vercel env pull .env
npm run db:init
```

## 4. Deploy

With Vercel CLI:

```bash
npm install -g vercel
vercel login
vercel
vercel --prod
```

Or use the Vercel dashboard:

1. Import the Git repository.
2. Confirm framework preset is `Next.js`.
3. Keep build command as `npm run build`.
4. Deploy.

## Notes

- Do not use SQLite on Vercel for production. Serverless file storage is not persistent.
- Do not write uploaded files into `public/uploads` on Vercel. This project uploads image files to Vercel Blob.
- Do not seed the database in the Vercel build command. Run `npm run db:init` manually once for a new database.

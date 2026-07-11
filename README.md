This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Security

Firestore access is governed by `firestore.rules` (with composite indexes in
`firestore.indexes.json`). Deploy them with the Firebase CLI whenever they
change:

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

Notes on the current security posture:

- Group documents can only be fetched by ID; list queries are denied, and
  invite codes resolve through the `invites/{code}` lookup collection, so
  groups and codes can't be enumerated.
- `/api/notify` requires a Firebase ID token and looks up the recipient's FCM
  tokens server-side, so clients never see other users' push tokens.
- The rules enforce membership and identity (who can read/write what), but
  gameplay-value validation (point amounts, daily limits, streaks) still
  happens client-side. Fully trustless enforcement of those would require
  Cloud Functions.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

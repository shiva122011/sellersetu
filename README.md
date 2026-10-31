# SellerSetu

A full-stack service request → quotation → vendor-managed delivery platform for e-commerce seller services.

SellerSetu connects sellers with a managed service team and vetted vendor partners. It includes customer, vendor, staff, and admin portals; quotation-based workflows; projects, milestones, tasks, documents, payments, chat, notifications, and a configurable service catalog.

## Stack

- Next.js 16 App Router + React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui
- Prisma ORM
- SQLite locally; PostgreSQL recommended for deployment
- Socket.io for chat and notifications

## Local development

```bash
npm install
cp .env.example .env
npx prisma db push
npm run dev
```

Set a strong `AUTH_SECRET` before production deployment. Never commit `.env`, databases, uploads, or credentials.

## Deployment

The production build is:

```bash
npm run build
npm start
```

The repository is being prepared for deployment at https://sellersetu.co.in.

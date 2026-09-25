# Publish the shop with GitHub, Vercel and Supabase

This folder is the deployable project root: it contains the storefront, `/api` Vercel Functions, and Supabase migrations. Orders and availability inquiries are saved in Supabase. Flutterwave checkout uses the server-calculated total; a signed webhook and transaction verification mark orders paid.

## 1. Rotate the Flutterwave secret

The secret key pasted into chat should be revoked. Create a replacement in Flutterwave and keep it private. Do not put it in `index.html`, `script.js`, GitHub, or a message.

In Flutterwave, also create a separate random **webhook secret hash** under Settings → Webhooks. It is a different value from the API secret key.

## 2. Create the Supabase database

1. Create a Supabase project and choose a region close to your customers.
2. In the Supabase SQL Editor, run all files in `supabase/migrations/`, in order: `202609250001_orders.sql`, `202609250002_booking_inquiries.sql`, `202609250003_order_email_status.sql`, and `202609250004_sheen_ticket_orders.sql`. If you already ran earlier migrations, run only the ones you have not applied yet.
3. In Project Settings → API, copy the Project URL and create/copy a server-only secret key (the key beginning `sb_secret_`).

The `orders` table has Row Level Security enabled and denies browser roles. Only the server-only Supabase secret can insert and update order rows. Never add that secret to browser JavaScript.

The `booking_inquiries` and `event_ticket_orders` tables are also restricted to the server. Review meet-and-greet or Zoom requests in `booking_inquiries`, and Sheen Awards purchases in `event_ticket_orders`.

## 3. Put the project in GitHub

1. Install GitHub Desktop and sign in to your GitHub account.
2. Choose File → Add Local Repository and select this `outputs` folder. Its Git repository is already initialized.
3. In Changes, commit the project files to `main`, then choose **Publish repository**. Keep the repository private if you prefer.
4. Do not add `.env` or any real API key. `.gitignore` excludes local environment files; `.env.example` contains placeholders only.

## 4. Import it into Vercel

1. In Vercel, choose **Add New → Project**, then import the GitHub repository.
2. Use the repository root as the Root Directory and choose **Other** as the framework preset. Leave the build command blank; this is a static site with serverless functions in `api/`.
3. Add these Project Environment Variables for Production, Preview and Development:

   | Name | Value |
   | --- | --- |
   | `FLW_SECRET_KEY` | The newly rotated Flutterwave secret key |
   | `FLW_WEBHOOK_SECRET_HASH` | The random webhook secret hash created in Flutterwave |
   | `SUPABASE_URL` | Your Supabase project URL |
   | `SUPABASE_SECRET_KEY` | Your Supabase `sb_secret_` key |
   | `INQUIRY_NOTIFICATION_EMAIL` | `jonathanroumie.officialchosen02@gmail.com` (receives inquiry and paid-order alerts) |
   | `RESEND_API_KEY` | The API key from your Resend account |
   | `RESEND_FROM_EMAIL` | A sender address on a domain verified in Resend |
   | `SHOP_CURRENCY` | `USD` |
   | `SHIPPING_FEE` | `0` |

4. Deploy the project. Vercel automatically publishes files in `/api` as Node.js Functions.

### Email alerts for availability requests

Create a Resend account, verify a sending domain, create an API key, and add that key plus the verified sender address in Vercel. The recipient is already set to `jonathanroumie.officialchosen02@gmail.com`. The same setup sends availability inquiry alerts and paid-order notices to you, and sends a receipt to the customer after Flutterwave verifies payment. Until Resend is fully configured, orders and inquiries are still saved in Supabase; configure Flutterwave webhook retries so a paid order's email can be retried after a temporary Resend issue. [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction)

## 5. Point Flutterwave webhooks at the site

After Vercel gives you a domain, open Flutterwave Settings → Webhooks and set the webhook URL to:

`https://YOUR-VERCEL-DOMAIN/api/flutterwave-webhook`

Use the same webhook secret hash you added to Vercel. Enable the `charge.completed` event and webhook retries, then save. The existing webhook endpoint confirms both merchandise and Sheen Awards ticket payments, then sends the buyer and owner emails. If you change Vercel environment variables, redeploy so the new values are applied.

## 6. Verify before sharing the shop

Place a test merchandise order and a test ticket order, and submit one meet-and-greet request and one Zoom request. Confirm ticket totals use $250 General Admission and $1,000 VIP prices, the ticket purchase is saved to `event_ticket_orders`, successful payment changes its status to `paid`, the buyer gets a ticket order receipt, and the owner inbox gets a ticket order notice. Confirm the merchandise receipt, shipping details, and availability inquiry notification also arrive. Then switch Vercel to the rotated live Flutterwave key and make a small live transaction before sharing the shop.

The newsletter form remains a visual demo. Availability requests are inquiries only; Jonathan's team still needs to reply and confirm dates manually.

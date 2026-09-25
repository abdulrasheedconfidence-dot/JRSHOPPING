# Jonathan Roumie Shop

A responsive shop with product checkout, booking inquiries and Vercel/Supabase integration.

## What's included

- A product catalog with cart, quantity editing, and an order total.
- A persistent, high-contrast checkout bar with a live total and large tap target, including on mobile screens.
- Shipping details collected before payment. Shipping is free.
- Flutterwave Standard checkout created server-side with the exact server-calculated USD total.
- Supabase storage for orders and booking inquiries. Direct browser access is blocked by Row Level Security.
- A Flutterwave webhook that verifies completed payments before changing an order to `paid`.
- Resend sends the customer a payment-confirmed receipt and sends the shop owner an order and shipping notification.
- Meet-and-greet and Zoom availability forms. Inquiries are saved in the `booking_inquiries` table and can trigger an email notification.
- A Personalized Gifts category with a $499 Custom Photo Frame with Jonathan.
- A Sheen Awards landing-page feature with a Peoria-time countdown and a separate event ticket information page.
- Ticket checkout uses the existing Flutterwave server integration, stores paid ticket orders in Supabase, and emails the buyer and shop owner after payment is verified.
- The $499 Jonathan Care Package has separate CSS artwork so it no longer shares the small care box image. Replace that illustration with your new package photo when you have it.

## Prices

USD prices are $50 tee, $20 mug, $25 cap, $149 Little Care Box, $499 Jonathan Care Package, $99 Moments Print, $25 Sunday Plate, $25 Good Things Tote, and $499 Custom Photo Frame. The Jonathan note is a free add-on for orders over $200. Shipping is free.

The server price list in `api/checkout.js` is authoritative. If a price changes, update both that list and the displayed amount in `index.html`.

## Deploy

Follow [DEPLOYMENT.md](DEPLOYMENT.md) to publish through GitHub and Vercel, create the Supabase tables, configure Flutterwave webhooks, and set private environment variables.

New booking requests and paid-order alerts are emailed to `jonathanroumie.officialchosen02@gmail.com`; customers receive their receipt after Flutterwave verifies payment. Configure `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL` in Vercel. If email is unavailable, orders and inquiries are still saved in Supabase. Resend requires a verified sending domain for production mail.

The newsletter form is still a visual demo and does not save subscriptions. Booking availability and dates are not automatically confirmed; requests are sent to the team for follow-up.

The Sheen Awards ticket page uses the existing Flutterwave integration. It accepts General Admission at $250 and VIP Experience at $1,000, with no total inventory caps set. Apply the `202609250004_sheen_ticket_orders.sql` migration before enabling ticket checkout.

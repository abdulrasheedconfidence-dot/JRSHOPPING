# Jonathan Roumie Shop

A responsive shop with product checkout, booking inquiries and Vercel/Supabase integration.

## What's included

- A product catalog with cart, quantity editing, and an order total.
- Shipping details collected before payment. Shipping is free.
- Flutterwave Standard checkout created server-side with the exact server-calculated USD total.
- Supabase storage for orders and booking inquiries. Direct browser access is blocked by Row Level Security.
- A Flutterwave webhook that verifies completed payments before changing an order to `paid`.
- Meet-and-greet and Zoom availability forms. Inquiries are saved in the `booking_inquiries` table and can trigger an email notification.
- A Personalized Gifts category with a $499 Custom Photo Frame with Jonathan.
- The $499 Jonathan Care Package has separate CSS artwork so it no longer shares the small care box image. Replace that illustration with your new package photo when you have it.

## Prices

USD prices are $50 tee, $20 mug, $25 cap, $149 Little Care Box, $499 Jonathan Care Package, $99 Moments Print, $25 Sunday Plate, $25 Good Things Tote, and $499 Custom Photo Frame. The Jonathan note is a free add-on for orders over $200. Shipping is free.

The server price list in `api/checkout.js` is authoritative. If a price changes, update both that list and the displayed amount in `index.html`.

## Deploy

Follow [DEPLOYMENT.md](DEPLOYMENT.md) to publish through GitHub and Vercel, create the Supabase tables, configure Flutterwave webhooks, and set private environment variables.

New booking requests are emailed to `jonathanroumie.officialchosen02@gmail.com` after `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL` are configured. If email is not configured, the request is still saved in Supabase and the form says email notifications are pending setup. Resend requires a verified sending domain for production mail.

The newsletter form is still a visual demo and does not save subscriptions. Booking availability and dates are not automatically confirmed; requests are sent to the team for follow-up.

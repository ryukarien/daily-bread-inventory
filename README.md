# Daily Bread

A responsive bakery counter app built with React, Vite, Tailwind CSS, and IndexedDB. Shop data is stored in the current browser on the current device. It does not use Supabase or Firebase.

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, run `npm install`.
3. Run `npm run dev`, then open the local URL shown in the terminal.
4. Create your own backup of important sales data; clearing browser storage removes this device's database.

Starter accounts are seeded in the browser database with hashed passwords. Get the local demo credentials from the project owner and change them before relying on this app in a real shop. Since this is a static, local-only app, role checks and browser-stored data are not a security boundary: anyone with access to the device/browser developer tools can inspect or change local data. Use a server-backed authentication/database service for shared or sensitive business data.

## Build and GitHub Pages

Run `npm run build`; the production site is written to `dist/`. Vite uses relative asset paths with hash-based routing, so this build can be hosted from a GitHub Pages project subpath. The included GitHub Actions workflow builds and deploys `dist/` whenever you push to `main`. In the repository's **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**; serving the repository root instead will show the unbuilt source and the app will not load.

## Folders

```text
daily-bread/
├── index.html
├── public/
│   └── logo.svg
├── src/
│   ├── components/
│   │   ├── Layout.jsx
│   │   └── ProtectedRoute.jsx
│   ├── hooks/
│   │   └── useAuth.jsx
│   ├── pages/
│   │   ├── AdminPage.jsx
│   │   ├── DayPage.jsx
│   │   ├── InventoryPage.jsx
│   │   ├── LoginPage.jsx
│   │   ├── ReportPage.jsx
│   │   └── SalePage.jsx
│   ├── services/
│   │   └── localDb.js
│   ├── utils/
│   │   └── format.js
│   ├── App.jsx
│   ├── main.jsx
│   └── styles.css
├── tailwind.config.js
├── postcss.config.js
└── vite.config.js
```

## Included

- Regular, promotional, and receivable transactions
- B1T1 and percentage discounts, cash/GCash split, and change calculation
- Tracked daily stock, stock validation, and sale correction/deletion with stock adjustments and an audit record
- Day-opening checklist for starting cash and opening bread counts, plus end-of-day cash reconciliation and live leftover counts
- Daily summaries and PDF export
- Admin overview board; staff and admins can manage menu items and correct or delete saved sales
- Promotional and receivable transactions have ₱0.00 due while retaining their item value in reports

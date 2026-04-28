# My Books

Web app (Next.js + Vercel) na spravu precitanych knih, citatov a statistik
nad Google Sheets.

## Features

- Prihlasenie cez Google a povoleny iba 1 email (`ALLOWED_EMAIL`)
- Knihy citane zo sheetu `Zoznam` (`A:D`, od riadku 4)
- Citaty v samostatnom sheete `Quotes`
- Dodatocne metadata knih v sheete `BookMeta`
- Statistiky (pocet knih, citatov, priemerne hodnotenie, autori, roky)
- Volitelne dotiahnutie metadata z `cbdb.cz`

## Local setup

1. Nainstaluj dependencies:

```bash
npm install
```

2. Vytvor `.env.local` podla `.env.example`.

3. Spusti appku:

```bash
npm run dev
```

## Google Cloud setup (Service Account)

1. V Google Cloud vytvor projekt.
2. Zapni API: **Google Sheets API**.
3. Vytvor Service Account + JSON key.
4. Do env premennych nastav:
   - `GOOGLE_CLIENT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
5. V Google Sheets dokumente zdielaj subor na email service accountu
   (rola Editor).

## Google OAuth setup (login)

1. V Google Cloud -> APIs & Services -> Credentials vytvor **OAuth Client ID**
   (Web application).
2. Authorized redirect URI nastav:
   - `http://localhost:3000/api/auth/callback/google` (local)
   - `https://<tvoj-vercel-domain>/api/auth/callback/google` (prod)
3. Do env nastav:
   - `AUTH_GOOGLE_ID`
   - `AUTH_GOOGLE_SECRET`
   - `AUTH_SECRET` (dlhy random string)
   - `ALLOWED_EMAIL` (`jtomana@gmail.com`)

## Vercel konfiguracia

1. Pushni repo na GitHub (`jurot8/my-books`).
2. Vo Vercel klikni **Add New Project** a importni repo.
3. V **Environment Variables** nastav vsetky hodnoty z `.env.example`.
4. Deploy.
5. V Google OAuth credentials dopln finalnu Vercel URL do Authorized redirect
   URI.
6. Redeploy.

## Scripts

```bash
npm run dev
npm run lint
npm run build
```

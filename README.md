# pos-system


### Pray UI and branch lookup configuration

The frontend uses a local Vite proxy to `http://localhost:5000` in development and the existing hosted API in production. Set `VITE_API_BASE_URL` (including `/api`) to override either. See `frontend/.env.example`.

Set `VITE_SITE_URL` to the public frontend origin before building so Open Graph and Twitter banner URLs are absolute. Without it, image paths remain relative. The social banner source is `frontend/public/social-banner.svg`; the shareable PNG is 1200 × 630.

Branch lookup retries temporary failures only, shares concurrent requests, and exposes a manual branch-code fallback on both sign-in screens. The backend still validates branch access at login. Database error details are logged server-side; the endpoint returns a generic failure message. Run `node --test backend/tests/branchDirectory.test.js` for the directory regression tests.

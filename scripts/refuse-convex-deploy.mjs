console.error(`Convex production deploys run from hackuta-2026-profile, not this repo.

Arcade tables and convex/arcade/* now live in the profile backend. A deploy
from arcade-site src/ would replace the whole deployment and drop profile
functions.

  cd ../hackuta-2026-profile
  $env:CONVEX_DEPLOYMENT = $null
  $env:CONVEX_DEPLOY_KEY = "<production deploy key>"
  npm run convex:deploy
  Remove-Item Env:CONVEX_DEPLOY_KEY -ErrorAction SilentlyContinue

Sandbox peccary assemble+push is still npm run convex:push-dev (no deploy key).
`);
process.exit(1);

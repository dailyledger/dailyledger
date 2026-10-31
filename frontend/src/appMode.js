// One codebase, two deployments: the stall site (default) and the admin site,
// built with VITE_APP_MODE=admin. The backend also enforces this per account.
export const IS_ADMIN_SITE = import.meta.env.VITE_APP_MODE === 'admin';

// Lets admin.css style the page background without touching the stall site.
if (IS_ADMIN_SITE) {
  document.documentElement.classList.add('adm');
}

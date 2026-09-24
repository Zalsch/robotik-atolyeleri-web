-- Defense in depth for the preserved external identity mapping.
-- Existing grants still deny anon and authenticated, while service_role can
-- read the historical mapping without a browser-accessible policy.
alter table app_private.legacy_identity_links enable row level security;

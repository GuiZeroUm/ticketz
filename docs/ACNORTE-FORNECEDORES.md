# ACNorte Fornecedores

The dedicated runtime serves `acnortefornecedores.espacowhats.com.br` from
`docker-compose.acnorte-fornecedores.yml`. It owns its PostgreSQL, Redis and
upload volumes. Its only company is `acnortefornecedores` (ID 1), with a plan
of six users and 20 WhatsApp connections in `normal`/Baileys mode. The first
user is the ACNorte platform super administrator; five regular user slots are
reserved. No Meta Cloud API connection can be created there.
The ACNorte emblem is installed as the light/dark logo and favicon, and the
interface primary color is `#007A25`. The short address
`fornecedores.espacowhats.com.br` redirects to the dedicated hostname.

The ACNorte source runtime issues a one minute JWT only for an authenticated
admin in company 9. The Fornecedores entry is under Administration and is
visible only to those admins. The target verifies its issuer, audience and signature,
consumes its nonce once in its own Redis, then syncs name and profile into the
target company. The token travels in a URL fragment; the target removes it
from browser history before exchanging it. Both backends read the same
`ACNORTE_SUPPLIER_SSO_SECRET` from a root-only secret file. The source enables
the sidebar link only when `ACNORTE_SUPPLIER_LINK=true` is set on its frontend.

The supplier backend rejects all writes except authentication and the admin
connection/QR endpoints. The frontend contains only Atendimentos and, for an
admin, Conexões. All supplier users may read every ticket, regardless of the
source profile; write authorization remains blocked at the API boundary.
Atendimentos provides a connection selector that filters tickets, groups and
their counters for the selected WhatsApp connection.

For the direct Compose deployment, supply `SUPPLIER_DB_PASSWORD`,
`SUPPLIER_REDIS_PASSWORD`, `SUPPLIER_ADMIN_EMAIL` and
`SUPPLIER_ADMIN_PASSWORD` in a protected `--env-file`, and mount
`/etc/dokploy/secrets/acnorte_supplier_sso.env` for the shared signing key.
The startup command migrates, seeds and reconciles the tenant before starting
the backend. Existing secrets and volumes must be retained across releases.

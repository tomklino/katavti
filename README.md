# Katavti

A filesystem-backed daily notes app rewritten from `workspace-notes` with a Hono Node API, Vue 3 and Vite client, and Vuex state management. See [PDD.md](PDD.md) for behavior and design decisions.

## Requirements

- Node.js 22+
- npm

## Setup

```bash
npm install
npm --prefix client install
# Optionally create a Git-ignored config-local.yaml override.
```

## Configuration

Every server setting is loaded and validated before the listener starts. `environmentType` must be `dev` or `prod`. In `prod`, values from `config-defaults.yaml` are deliberately excluded; all operational values must come from another source. Missing-value errors explicitly remind operators of this behavior.

Sources are merged in this precedence order:

1. committed `config-defaults.yaml`;
2. config files, then secret files;
3. `KATAVTI_*` environment variables;
4. `--section.key=value` command-line arguments.

Configure additional files with `KATAVTI_CONFIG_FILES=config-local.yaml` and `KATAVTI_CONFIG_SECRET_FILES=secrets/local.yaml` (comma-separated), or their `--config.files=...` and `--config.secretFiles=...` equivalents. These local YAML files are ignored by Git. Every property can be supplied by YAML, environment, or CLI:

| Property | Environment variable | CLI example |
| --- | --- | --- |
| `environmentType` | `KATAVTI_ENVIRONMENT_TYPE` | `--environmentType=prod` |
| `server.host` | `KATAVTI_SERVER_HOST` | `--server.host=0.0.0.0` |
| `server.port` | `KATAVTI_SERVER_PORT` | `--server.port=3030` |
| `storage.dataDir` | `KATAVTI_STORAGE_DATA_DIR` | `--storage.dataDir=/srv/notes` |
| `http.cors.origins` | `KATAVTI_HTTP_CORS_ORIGINS` | `--http.cors.origins=http://localhost:8080` |
| `http.cors.allowLoopbackInDevelopment` | `KATAVTI_HTTP_CORS_ALLOW_LOOPBACK_IN_DEVELOPMENT` | `--http.cors.allowLoopbackInDevelopment=true` |
| `http.identity.headerName` | `KATAVTI_HTTP_IDENTITY_HEADER_NAME` | `--http.identity.headerName=x-user-id` |
| `api.basePath` | `KATAVTI_API_BASE_PATH` | `--api.basePath=/api/v1beta` |
| `config.files` | `KATAVTI_CONFIG_FILES` | `--config.files=config-local.yaml` |
| `config.secretFiles` | `KATAVTI_CONFIG_SECRET_FILES` | `--config.secretFiles=secrets/local.yaml` |

List values supplied through environment or CLI are comma-separated. Invalid configuration is reported as a complete list of validation errors and startup fails.

## Develop

```bash
KATAVTI_STORAGE_DATA_DIR="$HOME/notes" npm run dev
```

The committed configuration uses API port 3030 and Vite uses 8080 internally. The client uses relative `/api/v1beta` URLs by default. Kubernetes Ingress routes those URLs to the server and all other URLs to the client, so browsers see both on the single `http://katavti.local` origin. This follows farmers-market's path-based routing while using the current `networking.k8s.io/v1` Ingress API.

### Local Kubernetes with K3s

K3s is a small Kubernetes distribution and includes the Traefik Ingress controller. On Linux, install it and create a user-readable kubectl configuration:

```bash
curl -sfL https://get.k3s.io -o /tmp/install-k3s.sh
sudo sh /tmp/install-k3s.sh
mkdir -p "$HOME/.kube"
sudo cp /etc/rancher/k3s/k3s.yaml "$HOME/.kube/config"
sudo chown "$USER:$USER" "$HOME/.kube/config"
chmod 600 "$HOME/.kube/config"
kubectl get nodes
```

Build the images, import them into K3s's containerd image store, and deploy them:

```bash
sudo docker build -f client/Dockerfile -t katavti-client:latest client
sudo docker build -f server/Dockerfile -t katavti-server:latest .
sudo docker save katavti-client:latest katavti-server:latest | sudo k3s ctr images import -
kubectl apply -f kubernetes/base.yaml -f kubernetes/ingress.yaml
kubectl rollout status deployment/katavti-client --timeout=120s
kubectl rollout status deployment/katavti-server --timeout=120s
```

Map the Ingress hostname locally and open `http://katavti.local`:

```bash
echo '127.0.0.1 katavti.local' | sudo tee -a /etc/hosts
```

Verify that the client and API use that one public host and port:

```bash
curl -I http://katavti.local/
curl http://katavti.local/api/v1beta/health
```

For local development, install dependencies on the host and apply the development Deployments after the base resources:

```bash
npm install
npm --prefix client install
kubectl apply -f kubernetes/base.yaml -f kubernetes/ingress.yaml
kubectl apply -f kubernetes/dev-deployments.yaml
kubectl rollout status deployment/katavti-client --timeout=120s
kubectl rollout status deployment/katavti-server --timeout=120s
```

`dev-deployments.yaml` mounts this checkout (`/home/tom/workspace/katavti`) into both containers. The Vue 3 client runs `npm run dev` with Vite HMR and polling-based file watching; the server runs `tsx watch`. Neither process serves the prebuilt application, and source edits are picked up without restarting a container. Services and Ingress stay unchanged, so development and production use the same public paths. If the checkout moves, update both `hostPath.path` values in that file.

For plain local development, run the API and Vite separately; Vite proxies `/api` to port 3030:

```bash
npm run dev:server
npm --prefix client run dev
```

When developing through Kubernetes, the Ingress supplies the shared origin instead. Anonymous notes remain only in browser `localStorage`. Once authenticated, every edit is written locally and to the API under the authenticated email's date-based server directory.

Authentication supports email magic links and Google Identity Services. Without SMTP configuration, a development-only link is returned to the login panel and printed by the server. For real email and Google login, configure:

```bash
export KATAVTI_AUTH_MAGIC_LINK_BASE_URL=http://katavti.local
export KATAVTI_AUTH_SMTP_URL=smtps://user:password@smtp.example.com
export KATAVTI_AUTH_MAIL_FROM='Katavti <no-reply@example.com>'
export KATAVTI_AUTH_GOOGLE_CLIENT_ID='your-client-id.apps.googleusercontent.com'
# Use the same public client ID in the browser build:
export VITE_GOOGLE_CLIENT_ID="$KATAVTI_AUTH_GOOGLE_CLIENT_ID"
```

Google's OAuth client must list the application origin (for example `http://katavti.local`) as an authorized JavaScript origin. Production session cookies are Secure and HttpOnly.

## Test and build

```bash
npm test
npm run build
KATAVTI_STORAGE_DATA_DIR="$HOME/notes" KATAVTI_SERVER_PORT=3030 npm start
```

Unit tests use mocked boundaries. API E2E tests start a real ephemeral HTTP server and use a real temporary filesystem without mocks.

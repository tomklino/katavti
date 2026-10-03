# Katavti Ansible automation

This directory builds immutable release images and performs a blue-green deployment beside applications already served by Bifrost's shared Caddy instance. See `DEPLOYMENT_CHECKLIST.md` for the completed pre-deployment review and optional SMTP follow-up.

## Safety model

- The target host must be explicit; cloud discovery and provisioning are intentionally absent.
- `site.yml` never builds, pushes, removes an old release, restarts Caddy, or changes Docker.
- DNS management is explicit and limited to Katavti's hostname in the configured Google Cloud DNS zone.
- The inactive blue/green slot is started and checked before traffic changes.
- Only `katavti.caddy` is managed. Its hostname-scoped catch-all cannot match Bifrost or another hostname.
- The complete Caddy configuration is validated before a graceful reload.
- The old slot remains running. Failed public checks restore the prior route and gracefully reload it.
- Cleanup is deliberately manual and is not provided until deployment behavior has been confirmed.

Caddy's existing persistent `/data` and `/config` continue to own certificate issuance and renewal. This automation does not replace those volumes.

## Test locally

```bash
.venv-ansible/bin/ansible-galaxy collection install -r ansible/requirements.yml
.venv-ansible/bin/python -m unittest discover -s ansible/tests -v
cd ansible
../.venv-ansible/bin/ansible-playbook --syntax-check playbooks/build-images.yml
../.venv-ansible/bin/ansible-playbook --syntax-check playbooks/site.yml
../.venv-ansible/bin/ansible-playbook playbooks/test-local.yml
../.venv-ansible/bin/ansible-lint playbooks roles
../.venv-ansible/bin/yamllint .
```

`test-local.yml` only renders files under `ansible/.test-output` and runs `docker compose config`; it does not start containers or contact a server. `site.yml` uses the Google Cloud collection to manage DNS without invoking a cloud CLI.

## Release and deployment

Create a release tag, then explicitly run `build-images.yml` to publish missing images. Copy the example inventory outside the repository and review it before running `site.yml`. On the target Azure VM, Katavti uses its managed identity to fetch runtime secrets directly from Azure Key Vault; secret values do not pass through Ansible. SMTP is disabled by default, so production email sign-in is rejected rather than exposing a development link.

Azure notes storage is enabled by default with container name `katavti-notes`. Configure `katavti_azure_subscription_id`, `katavti_azure_resource_group`, `katavti_azure_location`, `katavti_azure_vm_name`, `katavti_azure_managed_identity_principal_id`, and a globally unique `katavti_azure_storage_account_name`. The deployment creates the storage account and container, grants the VM identity the **Storage Blob Data Contributor** role, and configures Katavti to authenticate using its managed identity. Set `katavti_azure_storage_enabled: false` to retain filesystem storage.

For Gmail OAuth2 delivery, set `katavti_smtp_mode: gmail_oauth2` and store the mailbox, OAuth client ID, OAuth client secret, and refresh token in `katavti-smtp-oauth-user`, `katavti-smtp-oauth-client-id`, `katavti-smtp-oauth-client-secret`, and `katavti-smtp-oauth-refresh-token`. The legacy SMTP URL mode remains available as `katavti_smtp_mode: url`. Running deployment is intentionally outside local validation.

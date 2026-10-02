# Katavti pre-deployment checklist

Local validation only. Do not deploy while completing this checklist.

- [x] Tie image builds to the selected Git release tag
  - [x] Require `HEAD` to exactly match the latest release tag
  - [x] Require a clean working tree before building
- [x] Use one Google client ID consistently
  - [x] Fetch the server runtime ID directly from Azure Key Vault on the target
  - [x] Fetch the client build ID from the same Azure Key Vault secret
- [x] Validate secrets and deployment inputs
  - [x] Store migrated credentials in Azure Key Vault without printing their values
  - [x] Grant the target VM managed identity read access to the vault
  - [x] Require a real target IP address and TLS email
  - [x] Define and validate SMTP behavior for production
    - [x] Keep SMTP explicitly disabled by default
    - [x] Reject email sign-in in production when SMTP is disabled
    - [ ] (optional) Add `katavti-smtp-url` to Key Vault and enable SMTP
  - [x] Verify Google Cloud DNS credentials locally without changing DNS (`klino-me` was read successfully)
- [x] Ensure the DNS A-record target is an IP address
- [x] Handle former Workspace Notes data
  - [x] Determine whether the old and new note formats are compatible
  - [x] Add a one-time, non-merging migration that leaves the source intact
- [x] Clean up candidates after failures before activation
- [x] Pass local Compose validation
  - [x] Make Docker Compose available locally
  - [x] Run `playbooks/test-local.yml` successfully
- [x] Make the legacy takeover operationally safe
  - [x] Leave the Workspace Notes container running during takeover
  - [x] Remove its Caddy route only during activation
  - [x] Restore its route on rollback
  - [x] Prevent the former playbook from recreating the retired route

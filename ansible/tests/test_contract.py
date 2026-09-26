import json
import unittest
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined
import yaml

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / "roles" / "katavti" / "templates"

VARS = {
    "katavti_domain_name": "katavti.example.test",
    "katavti_api_base_path": "/api/v1beta",
    "katavti_active_slot": "green",
    "katavti_candidate_slot": "blue",
    "katavti_client_container_name": "katavti-blue-client",
    "katavti_server_container_name": "katavti-blue-server",
    "katavti_client_image": "example/katavti-client:v0.2.0",
    "katavti_server_image": "example/katavti-server:v0.2.0",
    "katavti_server_port": 3030,
    "katavti_client_port": 8080,
    "katavti_system_uid": 991,
    "katavti_system_gid": 991,
    "katavti_data_dir": "/var/lib/katavti/notes",
    "katavti_container_data_dir": "/data",
    "katavti_config_dir": "/opt/katavti/config",
    "katavti_shared_network_name": "bifrost-stack_default",
    "katavti_environment_type": "prod",
    "katavti_cors_origins": ["https://katavti.example.test"],
    "katavti_identity_header_name": "x-user-id",
    "katavti_magic_link_base_url": "https://katavti.example.test",
    "katavti_mail_from": "Katavti <no-reply@example.test>",
    "katavti_google_client_id": "client-id",
    "katavti_smtp_url": "smtps://user:secret@example.test",
}

class DeploymentContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.jinja = Environment(loader=FileSystemLoader(TEMPLATES), undefined=StrictUndefined)
        cls.jinja.filters["to_json"] = json.dumps

    def render(self, name, **overrides):
        return self.jinja.get_template(name).render(**(VARS | overrides))

    def test_generated_python_files_are_absent(self):
        self.assertEqual([], list(ROOT.rglob("__pycache__")) + list(ROOT.rglob("*.pyc")))

    def test_required_files_exist(self):
        required = [
            "ansible.cfg", "requirements.yml", "README.md",
            "inventories/example/hosts.yml", "inventories/example/group_vars/all.yml",
            "playbooks/build-images.yml", "playbooks/site.yml", "playbooks/test-local.yml",
            "roles/katavti/tasks/main.yml", "roles/katavti/tasks/activate.yml",
            "roles/katavti/templates/docker-compose.yml.j2",
            "roles/katavti/templates/katavti.caddy.j2",
            "roles/katavti/templates/production.yaml.j2",
            "roles/katavti/templates/secrets.yaml.j2",
        ]
        self.assertEqual([], [path for path in required if not (ROOT / path).is_file()])

    def test_caddy_route_is_hostname_scoped_and_api_precedes_client(self):
        rendered = self.render("katavti.caddy.j2")
        self.assertTrue(rendered.lstrip().startswith("katavti.example.test {"))
        self.assertNotIn(":80 {", rendered)
        self.assertNotIn(":443 {", rendered)
        self.assertLess(rendered.index("@api"), rendered.index("handle {"))
        self.assertIn("path /api/v1beta /api/v1beta/*", rendered)
        self.assertIn("reverse_proxy katavti-blue-server:3030", rendered)
        self.assertIn("reverse_proxy katavti-blue-client:8080", rendered)

    def test_compose_is_slot_scoped_and_does_not_manage_caddy(self):
        rendered = self.render("docker-compose.yml.j2")
        compose = yaml.safe_load(rendered)
        self.assertEqual({"client", "server"}, set(compose["services"]))
        self.assertEqual("katavti-blue-client", compose["services"]["client"]["container_name"])
        self.assertEqual("katavti-blue-server", compose["services"]["server"]["container_name"])
        self.assertEqual("bifrost-stack_default", compose["networks"]["proxy"]["name"])
        self.assertIn("/var/lib/katavti/notes:/data", compose["services"]["server"]["volumes"])

    def test_production_config_is_complete_and_secrets_are_separate(self):
        config_text = self.render("production.yaml.j2")
        secret_text = self.render("secrets.yaml.j2")
        config = yaml.safe_load(config_text)
        secrets = yaml.safe_load(secret_text)
        self.assertEqual("prod", config["environmentType"])
        self.assertEqual("0.0.0.0", config["server"]["host"])
        self.assertEqual("/data", config["storage"]["dataDir"])
        self.assertFalse(config["http"]["cors"]["allowLoopbackInDevelopment"])
        self.assertNotIn("smtps://user:secret", config_text)
        self.assertEqual("smtps://user:secret@example.test", secrets["auth"]["smtpUrl"])

    def test_activation_is_guarded_and_rollback_capable(self):
        tasks = (ROOT / "roles/katavti/tasks/activate.yml").read_text()
        for marker in ["caddy validate", "ansible.builtin.stat", "block:", "rescue:",
                       "katavti_previous_route", "katavti_candidate_route", "verify",
                       "Detect another Caddy route claiming the Katavti hostname"]:
            self.assertIn(marker, tasks)
        self.assertNotIn("state: restarted", tasks)
        self.assertNotIn("docker compose down", tasks)

    def test_client_image_accepts_google_client_id_build_argument(self):
        dockerfile = (ROOT.parent / "client/Dockerfile").read_text()
        self.assertIn("ARG VITE_GOOGLE_CLIENT_ID", dockerfile)
        self.assertIn("ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID", dockerfile)

    def test_site_does_not_build_images_or_clean_old_slot(self):
        site = (ROOT / "playbooks/site.yml").read_text()
        self.assertNotIn("buildx", site)
        self.assertNotIn("cleanup", site.lower())
        self.assertIn("katavti", site)

if __name__ == "__main__":
    unittest.main()

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAllDocuments } from 'yaml'

const root = path.resolve(import.meta.dirname, '../../..')

async function resources(file: string) {
  const source = await readFile(path.join(root, file), 'utf8')
  return parseAllDocuments(source).map(document => document.toJS())
}

describe('Kubernetes same-origin routing', () => {
  it('routes the API and client paths through one host', async () => {
    const [ingress] = await resources('kubernetes/ingress.yaml')
    expect(ingress.apiVersion).toBe('networking.k8s.io/v1')
    const rule = ingress.spec.rules.find((candidate: any) => candidate.host === 'katavti.local')
    expect(rule.http.paths).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: '/api/v1beta',
        pathType: 'Prefix',
        backend: { service: { name: 'katavti-server', port: { name: 'http' } } },
      }),
      expect.objectContaining({
        path: '/',
        pathType: 'Prefix',
        backend: { service: { name: 'katavti-client', port: { name: 'http' } } },
      }),
    ]))
  })

  it('connects each ingress backend to its deployment container port', async () => {
    const manifests = await resources('kubernetes/base.yaml')
    for (const name of ['katavti-client', 'katavti-server']) {
      const service = manifests.find(resource => resource.kind === 'Service' && resource.metadata.name === name)
      const deployment = manifests.find(resource => resource.kind === 'Deployment' && resource.metadata.name === name)
      const servicePort = service.spec.ports.find((port: any) => port.name === 'http')
      const containerPort = deployment.spec.template.spec.containers[0].ports
        .find((port: any) => port.name === servicePort.targetPort)
      expect(servicePort.port).toBe(80)
      expect(containerPort.containerPort).toBe(name === 'katavti-client' ? 8080 : 3030)
    }
  })
})

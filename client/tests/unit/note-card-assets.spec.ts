import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NoteCard from '@/components/NoteCard.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import { createStore } from '@/store'
import { noteAssetImageUrl, uploadNoteAsset, type AssetUploadProgress } from '@/api/assets'

vi.mock('@/api/assets', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/assets')>(),
  uploadNoteAsset: vi.fn(),
  noteAssetImageUrl: vi.fn(),
}))

const api = {
  list: async () => [],
  read: async () => ({ content: '', ISODateString: '', tags: [] as Array<[string, string]> }),
  update: async () => '',
  createDaily: async () => [],
  importNote: async () => ({ id: '', note: { content: '', ISODateString: '', tags: [] as Array<[string, string]> } }),
}
const filename = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-file.bin'
const result = { filename, markdown: `[file.bin](../assets/${filename})`, warning: '' }
const wrappers: VueWrapper[] = []
function card(raw = true) {
  const store = createStore(api, api)
  store.commit('setNote', { id: 'note-1', note: { content: 'Original note', ISODateString: '', tags: [] } })
  const wrapper = mount(NoteCard, { props: { id: 'note-1', editable: true, startRaw: raw }, global: { plugins: [store] } })
  wrappers.push(wrapper)
  return wrapper
}
function delayedUpload() {
  let resolve!: (value: typeof result) => void
  const promise = new Promise<typeof result>(done => { resolve = done })
  vi.mocked(uploadNoteAsset).mockReturnValueOnce(promise)
  return resolve
}
async function selectFiles(wrapper: VueWrapper, names = ['file.bin']) {
  const input = wrapper.get('input[type=file]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: names.map(name => new File(['bytes'], name)) })
  await input.trigger('change')
}
function changeNote(wrapper: VueWrapper, content: string) {
  wrapper.findComponent(MarkdownEditor).vm.$emit('update:modelValue', content)
}

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('URL', { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() }) })
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.unstubAllGlobals() })

describe('note attachment feedback and safe insertion', () => {
  it('shows immediate file status, byte progress, and server processing without locking the editor', async () => {
    const resolve = delayedUpload()
    const wrapper = card()
    await selectFiles(wrapper)
    expect(wrapper.get('.asset-progress').text()).toContain('file.bin')
    expect(wrapper.get('.asset-progress').text()).toContain('1 of 1 files')
    expect(wrapper.get('progress').attributes('value')).toBeUndefined()
    expect(wrapper.get('.cm-content').attributes('contenteditable')).toBe('true')
    expect(wrapper.vm.$store.state.notes['note-1'].content).toBe('Original note')
    const progress = vi.mocked(uploadNoteAsset).mock.calls[0][3]!
    progress({ stage: 'uploading', percent: 42 } satisfies AssetUploadProgress)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('progress').attributes('value')).toBe('42')
    expect(wrapper.get('.asset-progress').text()).toContain('42%')
    progress({ stage: 'processing', percent: 100 })
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.asset-progress').text()).toContain('Finishing upload')
    resolve(result)
    await flushPromises()
    expect(wrapper.find('.asset-progress').exists()).toBe(false)
    expect(wrapper.find('.pending-attachments').exists()).toBe(false)
    expect(wrapper.vm.$store.state.notes['note-1'].content).toContain(result.markdown)
  })

  it('defers when the user types and inserts only on click at the new cursor', async () => {
    const resolve = delayedUpload()
    const wrapper = card()
    await selectFiles(wrapper)
    changeNote(wrapper, 'New draft')
    await wrapper.vm.$nextTick()
    resolve(result)
    await flushPromises()
    expect(wrapper.vm.$store.state.notes['note-1'].content).toBe('New draft')
    expect(wrapper.get('.pending-attachments').text()).toContain('note changed during upload')
    const editor = wrapper.findComponent(MarkdownEditor).vm as any
    editor.view.dispatch({ selection: { anchor: 3 } })
    await wrapper.get('.pending-attachments button').trigger('click')
    expect(wrapper.vm.$store.state.notes['note-1'].content).toBe(`New\n${result.markdown}\n draft`)
    expect(wrapper.find('.pending-attachments').exists()).toBe(false)
    expect(wrapper.emitted('activate')).toBeUndefined()
  })

  it('remembers edits even if the user undoes back to the original content in the same tick', async () => {
    const resolve = delayedUpload()
    const wrapper = card()
    await selectFiles(wrapper)
    changeNote(wrapper, 'Temporary edit')
    changeNote(wrapper, 'Original note')
    resolve(result)
    await flushPromises()
    expect(wrapper.vm.$store.state.notes['note-1'].content).toBe('Original note')
    expect(wrapper.find('.pending-attachments button').exists()).toBe(true)
  })

  it('defers external note changes, including in Preview, and appends on explicit click', async () => {
    const resolve = delayedUpload()
    const wrapper = card(false)
    await selectFiles(wrapper)
    wrapper.vm.$store.commit('setNoteContent', { id: 'note-1', content: 'Reloaded content' })
    resolve(result)
    await flushPromises()
    expect(wrapper.vm.$store.state.notes['note-1'].content).toBe('Reloaded content')
    await wrapper.get('.pending-attachments button').trigger('click')
    expect(wrapper.vm.$store.state.notes['note-1'].content).toBe(`Reloaded content\n${result.markdown}\n`)
  })

  it('automatically inserts multiple files without treating its own inserts as user edits', async () => {
    vi.mocked(uploadNoteAsset).mockResolvedValueOnce(result).mockResolvedValueOnce({ ...result, filename: 'second', markdown: '[second](../assets/second)' })
    const wrapper = card()
    await selectFiles(wrapper, ['file.bin', 'second.bin'])
    await flushPromises()
    expect(wrapper.vm.$store.state.notes['note-1'].content).toContain(result.markdown)
    expect(wrapper.vm.$store.state.notes['note-1'].content).toContain('[second](../assets/second)')
    expect(wrapper.find('.pending-attachments').exists()).toBe(false)
  })

  it('keeps the rest of a batch deferred after an edit and preserves pending files across later uploads', async () => {
    const resolveFirst = delayedUpload()
    const resolveSecond = delayedUpload()
    const wrapper = card()
    await selectFiles(wrapper, ['file.bin', 'second.bin'])
    changeNote(wrapper, 'Working draft')
    resolveFirst(result)
    await flushPromises()
    expect(wrapper.get('.asset-progress').text()).toContain('2 of 2 files')
    resolveSecond({ ...result, filename: 'second', markdown: '[second](../assets/second)' })
    await flushPromises()
    expect(wrapper.findAll('.pending-attachments button')).toHaveLength(2)
    expect(wrapper.vm.$store.state.notes['note-1'].content).toBe('Working draft')
    vi.mocked(uploadNoteAsset).mockResolvedValueOnce({ ...result, filename: 'third' })
    await selectFiles(wrapper, ['third.bin'])
    await flushPromises()
    expect(wrapper.findAll('.pending-attachments button')).toHaveLength(2)
  })

  it('clears progress on storage failure without inserting broken links', async () => {
    vi.mocked(uploadNoteAsset).mockRejectedValueOnce(new Error('Browser quota exceeded'))
    const wrapper = card()
    await selectFiles(wrapper)
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('Browser quota exceeded')
    expect(wrapper.find('.asset-progress').exists()).toBe(false)
    expect(wrapper.vm.$store.state.notes['note-1'].content).toBe('Original note')
  })

  it('preserves backup warnings alongside the deferred attach button', async () => {
    const resolve = delayedUpload()
    const wrapper = card()
    await selectFiles(wrapper)
    changeNote(wrapper, 'New draft')
    resolve({ ...result, warning: 'Asset saved in this browser only.' })
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('browser only')
    expect(wrapper.find('.pending-attachments button').exists()).toBe(true)
  })

  it('does not insert or save when the component unmounts before completion', async () => {
    const resolve = delayedUpload()
    const wrapper = card()
    await selectFiles(wrapper)
    wrapper.unmount()
    resolve(result)
    await flushPromises()
    expect(wrapper.vm.$store.state.notes['note-1'].content).toBe('Original note')
  })

  it('resolves image Markdown to cached blob URLs and revokes them on removal', async () => {
    const wrapper = card(false)
    vi.mocked(noteAssetImageUrl).mockResolvedValueOnce('blob:cached-image')
    wrapper.vm.$store.commit('setNoteContent', { id: 'note-1', content: `![Picture](../assets/${filename})` })
    await flushPromises()
    expect(noteAssetImageUrl).toHaveBeenCalledWith('note-1', filename, '')
    expect(wrapper.get('.rendered img').attributes('src')).toBe('blob:cached-image')
    expect(wrapper.get('.rendered img').attributes('alt')).toBe('Picture')
    wrapper.vm.$store.commit('setNoteContent', { id: 'note-1', content: 'No image' })
    await flushPromises()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cached-image')
  })

  it('revokes image URLs resolved after unmount', async () => {
    let resolve!: (url: string) => void
    vi.mocked(noteAssetImageUrl).mockReturnValueOnce(new Promise(done => { resolve = done }))
    const wrapper = card(false)
    wrapper.vm.$store.commit('setNoteContent', { id: 'note-1', content: `![Picture](../assets/${filename})` })
    await wrapper.vm.$nextTick()
    wrapper.unmount()
    resolve('blob:late')
    await flushPromises()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late')
  })
})

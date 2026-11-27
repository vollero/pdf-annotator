const editor = chrome.runtime.getURL('index.html')
const sourceKey = tabId => 'pdf-source-' + tabId

function toolbarSource(address) {
  if (!address) return
  const url = new URL(address)
  if (!['https:', 'http:', 'file:'].includes(url.protocol) ||
      url.username || url.password || !/\.pdf$/i.test(url.pathname)) return
  url.hash = ''
  return url.href
}

chrome.action.onClicked.addListener(async tab => {
  const source = toolbarSource(tab.url)
  if (!source) {
    await chrome.tabs.create({windowId:tab.windowId,url: editor})
    return
  }
  // Register the clicked address before loading the editor. Session storage survives
  // service-worker suspension and is cleared when Chromium exits.
  const target = await chrome.tabs.create({windowId:tab.windowId,url: 'about:blank'})
  const key = sourceKey(target.id)
  try {
    await chrome.storage.session.set({[key]: {source, expires: Date.now() + 60_000}})
    await chrome.tabs.update(target.id, {url: editor + '#open'})
  } catch {
    await chrome.storage.session.remove(key)
    await chrome.tabs.update(target.id, {url: editor + '#open'}).catch(() => {})
  }
})

const consuming = new Set()
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message !== 'open-clicked-pdf' || sender.id !== chrome.runtime.id ||
      sender.frameId !== 0 || sender.url !== editor + '#open' || !Number.isInteger(sender.tab?.id)) return
  const key = sourceKey(sender.tab.id)
  if (consuming.has(key)) { reply(null); return }
  consuming.add(key)
  chrome.storage.session.get(key).then(async values => {
    await chrome.storage.session.remove(key)
    const entry = values[key]
    reply(entry?.expires > Date.now() ? entry.source : null)
  }).catch(() => reply(null)).finally(() => consuming.delete(key))
  return true
})

chrome.tabs.onRemoved.addListener(id => chrome.storage.session.remove(sourceKey(id)))

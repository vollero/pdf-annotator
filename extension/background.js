chrome.action.onClicked.addListener(tab => {
  const editor = new URL(chrome.runtime.getURL('index.html'))
  if (tab.url) {
    const source = new URL(tab.url)
    if (['https:', 'http:', 'file:'].includes(source.protocol) && /\.pdf$/i.test(source.pathname)) {
      source.hash = ''
      editor.hash = new URLSearchParams({ source: source.href }).toString()
    }
  }
  chrome.tabs.create({ url: editor.href })
})

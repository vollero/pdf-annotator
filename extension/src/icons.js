const paths = {
  open: '<path d="M3 18V6a1 1 0 0 1 1-1h6l2 3h7a1 1 0 0 1 1 1v2"/><path d="M4 19h14l3-8H7z"/>',
  export: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  saved: '<path d="M8 18H6a4 4 0 0 1-1-7.9 7 7 0 0 1 13.4-1.5A4.7 4.7 0 0 1 20 17"/><path d="m10 16 2.5 2.5 5-5"/>',
  select: '<path d="m5 3 14 10-7 1-3.5 6z"/>',
  highlight: '<path d="m9 12 8-9 4 4-8 9zm0 0-2 3 3 3 3-2M7 16l-3 4h5l1-2"/>',
  draw: '<path d="m14 5 5 5M4 20l1-6L16 3a1.5 1.5 0 0 1 2 0l3 3a1.5 1.5 0 0 1 0 2L10 19z"/>',
  palette: '<path d="M21 11a9 9 0 1 0-9 10c2 0 3-1 3-2.5 0-1.1-1.1-1.8-1.1-2.8 0-.9.8-1.7 1.9-1.7H18c2 0 3-1.3 3-3z"/><circle cx="7.5" cy="9" r=".9"/><circle cx="12" cy="6.8" r=".9"/><circle cx="16.5" cy="9" r=".9"/>',
  note: '<path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5M8 9h8M8 12h5"/>',
  undo: '<path d="M9 5 4 10l5 5M5 10h8c4 0 6 2 6 6v2"/>',
  redo: '<path d="m15 5 5 5-5 5m4-5h-8c-4 0-6 2-6 6v2"/>',
  leftpanel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  rightpanel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  list: '<path d="M7 6h14M7 12h14M7 18h14"/><circle cx="3" cy="6" r=".6"/><circle cx="3" cy="12" r=".6"/><circle cx="3" cy="18" r=".6"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  fit: '<path d="M3 5v14m18-14v14M6 12h12m-9-3-3 3 3 3m6-6 3 3-3 3"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  prev: '<path d="m14 6-6 6 6 6"/>',
  next: '<path d="m10 6 6 6-6 6"/>',
  page: '<path d="M5 3h9l5 5v13H5zM14 3v6h5"/>',
  more: '<circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>',
  close: '<path d="m6 6 12 12m0-12L6 18"/>',
  keys: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.3m3.5 0h.3m3.5 0h.3m3.5 0h.3M6 12h.3m3.5 0h.3m3.5 0h.3m3.5 0h.3M8 15h8"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
}

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', 'icon')
  svg.innerHTML = paths[name] || ''
  return svg
}

export function decorate(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => el.prepend(icon(el.dataset.icon)))
}

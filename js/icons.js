// One stroke icon set (24px grid, 1.9 stroke) plus the transit-sign arrow.
const P = {
  back: "<path d='M15 5l-7 7 7 7'/>",
  chev: "<path d='M9 5l7 7-7 7'/>",
  x: "<path d='M6 6l12 12M18 6L6 18'/>",
  plus: "<path d='M12 5v14M5 12h14'/>",
  more: "<circle cx='5' cy='12' r='1.6' fill='currentColor'/><circle cx='12' cy='12' r='1.6' fill='currentColor'/><circle cx='19' cy='12' r='1.6' fill='currentColor'/>",
  sliders: "<path d='M4 7h9M17 7h3M4 17h3M11 17h9'/><circle cx='15' cy='7' r='2'/><circle cx='9' cy='17' r='2'/>",
  home: "<path d='M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8z'/>",
  eye: "<path d='M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'/><circle cx='12' cy='12' r='3'/>",
  eyeoff: "<path d='M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1'/><path d='M9.9 9.9a3 3 0 0 0 4.2 4.2'/>",
  shield: "<path d='M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z'/><path d='M8.5 12l2.5 2.5 4.5-5'/>",
  check: "<path d='M5 12.5l4.5 4.5L19 7'/>",
  cam: "<path d='M4 8h3l2-3h6l2 3h3v11H4z'/><circle cx='12' cy='13' r='3.5'/>",
  refresh: "<path d='M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7'/>",
  upload: "<path d='M12 16V4M7 9l5-5 5 5M5 20h14'/>",
  download: "<path d='M12 4v12M7 11l5 5 5-5M5 20h14'/>",
  pin: "<path d='M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7'/>",
  trash: "<path d='M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6'/>",
  edit: "<path d='M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3'/>",
  copy: "<rect x='8' y='8' width='12' height='12' rx='2'/><path d='M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3'/>",
  speaker: "<path d='M4 10v4h4l5 4V6L8 10H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11'/>",
  spark: "<path d='M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z'/>",
  image: "<rect x='3' y='5' width='18' height='14' rx='3'/><circle cx='9' cy='10' r='1.6'/><path d='M4 17l5-5 4 4 3-3 4 4'/>",
  user: "<circle cx='12' cy='8' r='4'/><path d='M4 20c1-4 4-6 8-6s7 2 8 6'/>",
  link: "<path d='M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'/>",
  file: "<path d='M6 3h8l5 5v13H6zM14 3v5h5M9 13h7M9 17h7'/>",
  layers: "<path d='M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5'/>",
  box: "<path d='M4 8l8-4 8 4v8l-8 4-8-4V8zM4 8l8 4 8-4M12 12v8'/>",
  stop: "<rect x='7' y='7' width='10' height='10' rx='2' fill='currentColor'/>",
  asterisk: "<path d='M12 5v14M6 8.5l12 7M18 8.5l-12 7'/>",
  restart: "<path d='M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5'/>",
  card: "<rect x='4' y='3' width='16' height='18' rx='3'/><circle cx='12' cy='10' r='3'/><path d='M8 17c1-2 2.4-3 4-3s3 1 4 3'/>",
  bell: "<path d='M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0'/>",
};

export function icon(name, size = 20, cls = '') {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

// Chunky transit-sign arrow. rot 0 = up-right, 135 = down, -45 = up, 45 = right.
export function arrow(size, color = 'currentColor', rot = 0, cls = '') {
  // Rotation lives on the inner group so CSS can still move the whole svg (hover nudges).
  const g = rot ? ` transform="rotate(${rot} 50 50)"` : '';
  return `<svg class="arrow ${cls}" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><path${g} d="M20 80 L72 28 M36 24 H76 V64" fill="none" stroke="${color}" stroke-width="16"/></svg>`;
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Single-pass tokenizer: each capture group maps to a token class.
const TOKEN_RE =
  /(^[ \t]*[A-Za-z_][\w.-]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|((?<=\s)--?[A-Za-z][\w-]*)|((?<=^|\s)#.*$)|(\b\d+(?:\.\d+)*(?::\d+)?\b)|([|&;=<>{}()[\]]+)/gm

const CLASSES = [
  'text-violet-300 font-semibold', // command / keyword at line start
  'text-emerald-300', // strings
  'text-cyan-300', // flags
  'text-zinc-500 italic', // comments
  'text-amber-300', // numbers / IPs / ports
  'text-pink-300', // operators
]

export function highlight(code) {
  let out = ''
  let last = 0
  TOKEN_RE.lastIndex = 0
  for (let m = TOKEN_RE.exec(code); m; m = TOKEN_RE.exec(code)) {
    if (m[0] === '') {
      TOKEN_RE.lastIndex++
      continue
    }
    out += escapeHtml(code.slice(last, m.index))
    const group = m.slice(1).findIndex((g) => g !== undefined)
    out += `<span class="${CLASSES[group]}">${escapeHtml(m[0])}</span>`
    last = m.index + m[0].length
  }
  return out + escapeHtml(code.slice(last))
}

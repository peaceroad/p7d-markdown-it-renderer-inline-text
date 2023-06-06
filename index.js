const convertRuby = (cont, tokens, idx, options) => {
  const rubyRegCont = '(<ruby>)?([\\p{sc=Han}0-9A-Za-z.\\-_]+)《([^》]+?)》(<\/ruby>)?'
  const rubyReg = new RegExp(rubyRegCont, 'ug')
  const rubys = [...cont.matchAll(rubyReg)]
  if (!rubys) return cont
  let i = 0
  while (i < rubys.length) {
    let ruby = rubys[i]
    //console.log(ruby)
    if (!ruby[2] || !ruby[3]) {
      i++
      continue
    }
    const rubyCont = ruby[2] + '<rp>《</rp><rt>' + ruby[3] + '</rt><rp>》</rp>'
    let hasRubyTag = false
    if (options.html && tokens[idx - 1] && tokens[idx + 1]) {
      if ( tokens[idx - 1].type === 'html_inline'
        && tokens[idx - 1].content === '<ruby>'
        && tokens[idx + 1].type === 'html_inline'
        && tokens[idx + 1].content === '</ruby>' ) {
        hasRubyTag = true
      }
    }
    if (hasRubyTag) {
      cont = cont.replace(rubyReg, rubyCont)
    } else {
      cont = cont.replace(rubyReg, '<ruby>' + rubyCont + '</ruby>')
    }
    i++
  }
  return cont
}

const convertStartComment = (cont, tokens, idx, options) => {
  cont = cont.replace(/(?:^|(?<![^\\]\\))★(.*?)(?<![^\\]\\)★/g, '<span class="star-comment">$1</span>')
  if (!cont.includes('★')) return cont
  let n = idx + 1
  while (n < tokens.length) {
    if (!tokens[n].type !== 'text' && !tokens[n].content.includes('★')) {
      n++
      continue
    }
    cont = cont.replace('★', '<span class="star-comment">')
    tokens[n].content = tokens[n].content.replace('★', '</span>')
    break
  }
  return cont
}

const convertInlineText = (tokens, idx, options, env, slf, opt) => {
  let cont = tokens[idx].content
  if (opt.ruby)  cont = convertRuby(cont, tokens, idx, options)
  if (opt.starComment) cont = convertStartComment(cont, tokens, idx, options)
  return cont
}

const rendererInlineText　= (md, option) => {
  const opt = {
    ruby: false,
    starComment: false,
  }
  if (option !== undefined) {
    for (let o in option) {
        opt[o] = option[o]
    }
  }
  md.renderer.rules['text'] = (tokens, idx, options, env, slf) => {
    return convertInlineText(tokens, idx, options, env, slf, opt)
  }
}

export default rendererInlineText

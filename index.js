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
      cont = cont.replace(ruby[0], rubyCont)
    } else {
      cont = cont.replace(ruby[0], '<ruby>' + rubyCont + '</ruby>')
    }
    i++
  }
  return cont
}

const convertStartComment = (cont, tokens, idx, opt) => {
  //console.log('---\nbefore:' + cont)
  const starReg = /(?:^|(?<![^\\]\\))★(?!<\/span star-comment>).*?(?<![^\\]\\)★/g
  const contStarComments = [...cont.matchAll(starReg)]
  const contNoStarComments = cont.split(starReg)
  let hasOneStar = false
  //console.log(contStarComments)
  cont = ''
  let n = 0
  while (n < contNoStarComments.length) {
    cont += contNoStarComments[n]
    if (n === contNoStarComments.length - 1) {
      if (/(?<![^\\]\\)★(?!<\/span star-comment>)[^★]*?$/.test(contNoStarComments[n])) {
        hasOneStar = true
      }
      break
    }
    if (opt.starCommentDelete) {
      cont += ''
    } else {
      cont += '<span class="star-comment">' + contStarComments[n][0] + '</span>'
    }
    n++
  }

  //console.log('hasOneStar: ' + hasOneStar)
  if (hasOneStar) {
    let i = idx + 1
    while (i < tokens.length) {
      if (!tokens[i].type !== 'text' && !/(?<![^\\]\\)★(?!<\/span star-comment>)/.test(tokens[i].content)) {
        i++
        continue
      }
      if (opt.starCommentDelete) {
        cont = cont.replace(/(?<![^\\]\\)★(?!<\/span star-comment>).*$/, '')
        tokens[i].content = tokens[i].content.replace(/.*?(?:^|(?<![^\\]\\))★(.*)$/, '$1')
        let j = idx + 1
        while (j < i) {
          tokens[j].content = ''
          tokens[j].hidden = true
          j++
        }
      } else {
        cont = cont.replace(/(?<![^\\]\\)★(?!<\/span star-comment>)/, '<span class="star-comment">★')
        tokens[i].content = tokens[i].content.replace(/(?:^|(?<![^\\]\\))★/, '★</span star-comment>')
      }
      //console.log('tokens[i].content: ' + tokens[i].content)
      break
    }
  }
  cont = cont.replace(/<\/span star-comment>/g, '</span>')
  cont = cont.replace(/(?<![\\])\\★/g, '★')
  //console.log('after: ' + cont)
  return cont
}

const convertInlineText = (tokens, idx, options, env, slf, opt) => {
  let cont = tokens[idx].content
  if (opt.ruby)  cont = convertRuby(cont, tokens, idx, options)
  if (opt.starComment) cont = convertStartComment(cont, tokens, idx, opt)
  return cont
}

const rendererInlineText = (md, option) => {
  const opt = {
    ruby: false,
    starComment: false,
    starCommentDelete: false,
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

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

const convertStarComment = (cont, tokens, idx, options, opt) => {
 //console.log('---\nidx: ' + idx + ', before cont:' + cont) 
 //console.log('tokens[' + idx + ']: ' + JSON.stringify(tokens[idx]))

  if (opt.starCommentLine) {
    let hasStarCommentLine = false
    if (/^★/.test(tokens[0].content)) {
      hasStarCommentLine = true
    }
    if (hasStarCommentLine) {
      if(idx === 0) {
        if (opt.starCommentDelete) {
          cont = '<span class="star-comment-line">'
        } else {
          cont = '<span class="star-comment">' + cont
        }
        if (tokens.length === 1) {
          cont += '</span>'
        }
        if (opt.starCommentDelete) {
          let jj = 1
          while (idx + jj < tokens.length) {
            if (tokens[idx + jj].type === 'html_inline') {
              tokens[idx + jj].content = ''
              tokens[idx + jj].hidden = true
            }
            if (tokens[idx + jj].type !== 'html_inline') break
            jj++
          }
        }
        return cont
      }
      if (opt.starCommentDelete) {
        let jj = 1
        while (idx + jj < tokens.length) {
          if (tokens[idx + jj].type === 'html_inline') {
            tokens[idx + jj].content = ''
            tokens[idx + jj].hidden = true
          }
          if (tokens[idx + jj].type !== 'html_inline') break
          jj++
        }
      }

      if(idx !== 0 && idx === tokens.length -1) {
        if (opt.starCommentDelete) {
          cont = '</span>'
        } else {
          cont += '</span>'
        }
        return cont
      }
      if (opt.starCommentDelete) {
        cont = ''
      }
      return cont
    }
  }

  const starReg = /(?<!(?:^|[^\\])\\)★(?!<\/span star-comment>).*?(?<![^\\]\\)★/g
  const contStarComments = [...cont.matchAll(starReg)]
  const contNoStarComments = cont.split(starReg)
  let lastStar = []
  let hasNextStarPos = 0
  //console.log(contStarComments)
  //console.log('contNoStarComments: ' + contNoStarComments)
  //console.log('contNoStarComments.length: ' + contNoStarComments.length)
  cont = ''
  let n = 0
  while (n < contNoStarComments.length) {
    //console.log(n)
    lastStar = contNoStarComments[n].match(/(?<!(?:^|[^\\])\\)★(?!<\/span star-comment>)/)
    //console.log('lastStar:')
    //console.log(lastStar)
    if (lastStar) {
      hasNextStarPos = hasNextStar(tokens, idx, n, opt)
      //console.log('hasNextStarPos: ' + hasNextStarPos)
      if (hasNextStarPos !== -1) {
        const starBeforeCont = contNoStarComments[n].slice(0, lastStar.index)
        const starAfterCont = contNoStarComments[n].slice(lastStar.index + 1, contNoStarComments[n].length)
        //console.log('starBeforeCont: ' + starBeforeCont + ', starAfterCont: ' + starAfterCont )
        if (opt.starCommentDelete) {
          cont += starBeforeCont
        } else {
          cont += starBeforeCont + '<span class="star-comment">★' + starAfterCont
        }
      } else {
        //console.log('hasNextStarPos === -1:: ' +  contNoStarComments[n])
        cont += contNoStarComments[n]
      }
    } else {
      //console.log('No lastStar:: ' + contNoStarComments[n])
      cont += contNoStarComments[n]
    }
    if (!opt.starCommentDelete && n !== contNoStarComments.length - 1) {
      //console.log('star comment: ' + contStarComments[n][0])
      cont += '<span class="star-comment">' + contStarComments[n][0] + '</span star-comment>'
    }
    n++
  }
  cont = cont.replace(/<\/span star-comment>/g, '</span>')
             .replace(/(?<![\\])\\★/g, '★')
  //console.log('after cont: ' + cont)
  //console.log('after tokens[idx].content: ' + tokens[idx].content)
  return cont
}

const hasNextStar = (tokens, idx, n, opt) => {
  let hasNextStarPos = -1
  //hasNextStar = true
  let i = idx + 1
  while (i < tokens.length) {
    if (tokens[i].type !== 'text' || !/(?<!(?:^|[^\\])\\)★/.test(tokens[i].content)) {
      if (opt.starCommentDelete) tokens[i].hidden = true
      i++
      continue
    }
    //console.log('tokens[i].content: ' + tokens[i].content)
    if (opt.starCommentDelete) {
      tokens[i].content = tokens[i].content.replace(/^.*?★/, '')
    } else {
      tokens[i].content = tokens[i].content.replace(/★/, '★</span star-comment>')
    }
    //console.log('hasNextStar. i: ' +  i + ', tokens[i].content: ' + tokens[i].content)
    hasNextStarPos = i
    break
  }

  //console.log('hasNextStarPos: ' + hasNextStarPos)
  if(hasNextStarPos !== -1 && opt.starCommentDelete) {
    let j = idx + 1
    while (j < hasNextStarPos) {
      tokens[j].content = ''
      tokens[j].hidden = true
      j++
    }
  }
  return hasNextStarPos
}

const convertInlineText = (tokens, idx, options, opt) => {
  //md.utils.escapeHtml()
  let cont = tokens[idx].content
  if (opt.ruby)  cont = convertRuby(cont, tokens, idx, options)
  //console.log('idx : ' + idx + ', cont: ' + cont + ', tokens.length: ' + tokens.length)
  if (opt.starComment) cont = convertStarComment(cont, tokens, idx, options, opt)
  //hotfix
  cont = cont.replace(/&/g, '&amp;').replace(/<(?!\/?[\w\s="/.':;#-\/\?]+>)/g, '&lt;').replace(/(?<!<\/?[\w\s="/.':;#-\/\?]+)>(?![^<]*>)/g, '&gt;')
  return cont
}

function rendererInlineText (md, option) {
  const opt = {
    ruby: false,
    starComment: false,
    starCommentDelete: false,
    starCommentLine: false,
  }
  if (option !== undefined) {
    for (let o in option) {
        opt[o] = option[o]
    }
  }
  md.renderer.rules['text'] = (tokens, idx, options, env, slf) => {
    return convertInlineText(tokens, idx, options, opt)
  }
}

module.exports = rendererInlineText

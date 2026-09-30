/* Post enhancements: video embeds, image captions, citation links. */
(function(){
  var prose = document.querySelector('.prose');
  if(!prose) return;

  function onlyChild(p){
    // The paragraph's single meaningful node (ignoring whitespace), or null
    var nodes = Array.prototype.filter.call(p.childNodes, function(n){
      return !(n.nodeType === 3 && !n.textContent.trim()) && n.nodeName !== 'BR';
    });
    return nodes.length === 1 ? nodes[0] : null;
  }

  /* ---------- Videos: a paragraph that is just a YouTube / Vimeo / video-file URL ---------- */
  function videoEmbed(url){
    var m;
    if((m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url))){
      return iframe('https://www.youtube-nocookie.com/embed/' + m[1]);
    }
    if((m = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url))){
      return iframe('https://player.vimeo.com/video/' + m[1]);
    }
    if(/\.(mp4|webm)(\?.*)?$/i.test(url)){
      var v = document.createElement('video');
      v.controls = true;
      v.preload = 'metadata';
      v.playsInline = true;
      v.src = url;
      var wrap = document.createElement('div');
      wrap.className = 'video-file';
      wrap.appendChild(v);
      return wrap;
    }
    return null;
  }
  function iframe(src){
    var wrap = document.createElement('div');
    wrap.className = 'embed';
    var f = document.createElement('iframe');
    f.src = src;
    f.loading = 'lazy';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.title = 'Video';
    wrap.appendChild(f);
    return wrap;
  }

  prose.querySelectorAll('p').forEach(function(p){
    var node = onlyChild(p);
    if(!node) return;
    var url = '';
    if(node.nodeType === 3){ url = node.textContent.trim(); }
    else if(node.nodeName === 'A'){ url = node.getAttribute('href') || ''; }
    else if(node.nodeName === 'IMG' && /\.(mp4|webm)(\?.*)?$/i.test(node.getAttribute('src') || '')){ url = node.getAttribute('src'); }
    if(!/^(https?:\/\/|\/)\S+$/.test(url)) return;
    var el = videoEmbed(url);
    if(el){ p.replaceWith(el); }
  });

  /* ---------- Images: turn "image + italic line" into a figure with caption ---------- */
  prose.querySelectorAll('p').forEach(function(p){
    var imgs = p.querySelectorAll('img');
    if(imgs.length !== 1) return;
    var img = imgs[0];
    var others = Array.prototype.filter.call(p.childNodes, function(n){
      return n !== img && !(n.nodeType === 3 && !n.textContent.trim()) && n.nodeName !== 'BR';
    });
    var caption = null;
    if(others.length === 1 && others[0].nodeName === 'EM'){
      caption = others[0].innerHTML;
    } else if(others.length === 0){
      var next = p.nextElementSibling;
      var cap = next && next.nodeName === 'P' && onlyChild(next);
      if(cap && cap.nodeName === 'EM'){ caption = cap.innerHTML; next.remove(); }
    } else {
      return;
    }
    var fig = document.createElement('figure');
    fig.appendChild(img);
    if(caption){
      var fc = document.createElement('figcaption');
      fc.innerHTML = caption;
      fig.appendChild(fc);
    }
    p.replaceWith(fig);
  });
  prose.querySelectorAll('img').forEach(function(img){
    img.loading = 'lazy';
    img.decoding = 'async';
  });

  /* ---------- Table of contents (when the post enables it) ---------- */
  var toc = document.getElementById('toc');
  if(toc){
    var heads = prose.querySelectorAll('h2, h3');
    var used = {};
    var items = Array.prototype.map.call(heads, function(h, i){
      var id = h.id && !used[h.id] ? h.id : 'sec-' + (i + 1);
      used[id] = true;
      h.id = id;
      return '<li class="lvl-' + h.tagName.charAt(1) + '"><a href="#' + id + '">' + h.textContent.replace(/[<>&]/g, '') + '</a></li>';
    });
    if(items.length){ toc.querySelector('ol').innerHTML = items.join(''); }
    else { toc.remove(); }
    toc.addEventListener('click', function(e){
      var a = e.target.closest('a[href^="#"]');
      if(!a) return;
      var target = document.getElementById(a.getAttribute('href').slice(1));
      if(target){ e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  }

  /* ---------- Share buttons ---------- */
  var share = document.querySelector('.share');
  if(share){
    var url = share.getAttribute('data-url');
    var title = share.getAttribute('data-title');
    var u = encodeURIComponent(url), t = encodeURIComponent(title);
    var links = {
      x: 'https://twitter.com/intent/tweet?url=' + u + '&text=' + t,
      facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + u,
      linkedin: 'https://www.linkedin.com/sharing/share-offsite/?url=' + u,
      line: 'https://social-plugins.line.me/lineit/share?url=' + u
    };
    share.querySelectorAll('a[data-share]').forEach(function(a){ a.href = links[a.getAttribute('data-share')]; });
    var copyBtn = share.querySelector('[data-share="copy"]');
    copyBtn.addEventListener('click', function(){
      copyToClipboard(url, function(){
        copyBtn.classList.add('copied');
        setTimeout(function(){ copyBtn.classList.remove('copied'); }, 1600);
      });
    });
  }

  /* ---------- References: autolink URLs / DOIs, link [1] citations ---------- */
  var refs = document.querySelectorAll('.refs li');
  refs.forEach(function(li){
    var html = li.innerHTML;
    html = html.replace(/(https?:\/\/[^\s<]+[^\s<.,;)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/(^|[\s(])(?:doi:\s*)?(10\.\d{4,9}\/[^\s<]+[^\s<.,;)])/gi, function(all, pre, doi){
      return pre + '<a href="https://doi.org/' + doi + '" target="_blank" rel="noopener">doi:' + doi + '</a>';
    });
    li.innerHTML = html;
  });

  if(refs.length){
    var walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT, {
      acceptNode: function(n){
        return n.parentNode.closest('a, code, pre') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    var targets = [];
    while(walker.nextNode()){
      if(/\[\d+(?:\s*[,–-]\s*\d+)*\]/.test(walker.currentNode.nodeValue)){ targets.push(walker.currentNode); }
    }
    targets.forEach(function(node){
      var frag = document.createDocumentFragment();
      var text = node.nodeValue;
      var re = /\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g;
      var last = 0, m;
      while((m = re.exec(text))){
        var first = parseInt(m[1], 10);
        if(first < 1 || first > refs.length) continue;
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var a = document.createElement('a');
        a.className = 'cite';
        a.href = '#ref-' + first;
        a.textContent = m[0];
        frag.appendChild(a);
        last = m.index + m[0].length;
      }
      if(last === 0) return;
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }
})();

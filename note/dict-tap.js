/* rourou /note/ 学习讲义 · 点词词典适配层 v1 (2026-11-13)
   复用 /english/dict-boot.js 的词典数据、词性卡片与 Samantha 朗读，不改动 /english/ 任何文件。
   模板只需一行：<script src="/rourou/note/dict-tap.js"></script>

   与 RAZ 点读页的区别：RAZ 把课文包成 <span class="dw"> 再点；
   本层用 caretRangeFromPoint 在点击处取词，DOM 一个字节都不改，
   因此不会干扰讲义里的动画、拖拽、闯关游戏等已有交互。
*/
(function () {
  'use strict';

  var LS_ON = 'rrDictTapOn', LS_HINT = 'rrDictHintShown';
  var W = null, mask = null, pop = null, box = null, input = null;
  var on = true;

  try { on = localStorage.getItem(LS_ON) !== '0'; } catch (e) { }

  /* ---------- 1. 样式：作用域全部带 id 前缀，不污染讲义页 ---------- */
  var CSS = [
    '#wbDictMask{z-index:10000}',
    '#wbDictPop{z-index:10001}',
    '#wbDictPop .wbd-card{',
    '  --panel:#fbf8f0;--shade:#f3eddf;--soft:#e7f0ec;--ink:#37332c;--ink2:#726a5c;',
    '  --ink3:#9a9384;--line:#ded5c2;--accent:#2c6e5b;--accent2:#3d8a72;',
    '  background:#fbf8f0;color:#37332c;',
    '  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;',
    '  text-align:left;line-height:1.6;letter-spacing:normal;text-transform:none;',
    '  font-size:15px;font-weight:400;font-style:normal',
    '}',
    '#wbDictPop .wbd-card *{box-sizing:border-box}',
    '#rrDictBar{position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));',
    '  z-index:10002;display:flex;gap:6px;align-items:center}',
    '#rrDictBar button,#rrDictBox button{',
    '  display:inline-block;margin:0;padding:8px 14px;border-radius:999px;',
    '  border:1px solid rgba(0,0,0,.10);background:rgba(255,255,255,.94);color:#2d3436;',
    '  font:600 13px/1.3 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;',
    '  box-shadow:0 3px 12px rgba(0,0,0,.16);cursor:pointer;',
    '  -webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)',
    '}',
    '#rrDictBar button.off{background:rgba(230,226,216,.94);color:#8a857a}',
    '#rrDictBox{position:fixed;right:14px;bottom:calc(62px + env(safe-area-inset-bottom,0px));',
    '  z-index:10002;display:none;gap:6px;align-items:center;padding:8px;',
    '  border-radius:14px;background:rgba(255,255,255,.96);border:1px solid rgba(0,0,0,.10);',
    '  box-shadow:0 6px 20px rgba(0,0,0,.18)}',
    '#rrDictBox.on{display:flex}',
    '#rrDictBox input{',
    '  width:150px;padding:7px 11px;border:1px solid #d8d2c4;border-radius:9px;',
    '  font:15px/1.3 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;',
    '  color:#37332c;background:#fff;outline:none',
    '}',
    '#rrDictBox input:focus{border-color:#3d8a72}',
    '#rrDictHint{position:fixed;right:14px;bottom:calc(62px + env(safe-area-inset-bottom,0px));',
    '  z-index:10003;max-width:250px;padding:9px 14px;border-radius:10px;',
    '  background:rgba(44,110,91,.94);color:#fff;font:13px/1.5 -apple-system,"PingFang SC",sans-serif;',
    '  box-shadow:0 4px 16px rgba(0,0,0,.2)}',
    '@media(max-width:520px){#rrDictBar button{padding:7px 11px;font-size:12px}}'
  ].join('\n');
  var st = document.createElement('style'); st.id = 'rrDictStyle'; st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);

  /* ---------- 2. 加载 /english/ 站点级词典（复用，不复制数据） ---------- */
  function loadBoot(cb) {
    if (window.WBDICT) { W = window.WBDICT; cb(); return; }
    var s = document.createElement('script');
    s.src = '/english/dict-boot.js';
    s.onload = function () { W = window.WBDICT || null; cb(); };
    s.onerror = function () { W = null; cb(); };
    document.head.appendChild(s);
  }

  /* ---------- 3. 浮层与工具栏 ---------- */
  function build() {
    mask = document.createElement('div'); mask.id = 'wbDictMask';
    pop = document.createElement('div'); pop.id = 'wbDictPop';
    document.body.appendChild(mask); document.body.appendChild(pop);

    box = document.createElement('div'); box.id = 'rrDictBox';
    box.innerHTML = '<input id="rrDictInput" type="text" placeholder="输入英文单词" '
      + 'autocomplete="off" autocapitalize="off" spellcheck="false">'
      + '<button id="rrDictGo" type="button">查</button>';
    document.body.appendChild(box);

    var bar = document.createElement('div'); bar.id = 'rrDictBar';
    bar.innerHTML = '<button id="rrDictSearch" type="button" title="输入任意单词查词典">查词</button>'
      + '<button id="rrDictToggle" type="button" title="开启/关闭点词">点词 开</button>';
    document.body.appendChild(bar);

    input = document.getElementById('rrDictInput');
    var toggle = document.getElementById('rrDictToggle');
    function paint() {
      toggle.textContent = on ? '点词 开' : '点词 关';
      toggle.className = on ? '' : 'off';
    }
    paint();
    toggle.onclick = function () {
      on = !on;
      try { localStorage.setItem(LS_ON, on ? '1' : '0'); } catch (e) { }
      paint();
      if (!on) close();
    };
    document.getElementById('rrDictSearch').onclick = function () {
      box.classList.toggle('on');
      if (box.classList.contains('on')) { input.value = ''; input.focus(); }
    };
    document.getElementById('rrDictGo').onclick = function () {
      var v = input.value.trim();
      if (v) { box.classList.remove('on'); show(v); }
    };
    input.onkeydown = function (e) {
      if (e.key === 'Enter') {
        var v = input.value.trim();
        if (v) { box.classList.remove('on'); show(v); }
      } else if (e.key === 'Escape') { box.classList.remove('on'); }
    };
    mask.onclick = close;
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      close(); box.classList.remove('on');
      if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (x) { }
    });
  }

  function openShell(html) {
    pop.innerHTML = html;
    pop.classList.add('on'); mask.classList.add('on');
  }
  function close() {
    if (pop) pop.classList.remove('on');
    if (mask) mask.classList.remove('on');
  }

  /* ---------- 4. 查词：核心词即时出卡，再按需补全量与词性分片 ---------- */
  function render(raw) {
    if (!W) return;
    var d = W.info(raw);
    openShell(W.cardHTML(d, null, true));
    var x = pop.querySelector('[data-wbd-close]');
    if (x) x.onclick = close;
    W.bind(pop);                 // 内含 ensureRaw：异步补词性分组 / 英文释义 / 标签
  }
  function renderOffline() {
    openShell('<div class="wbd-card"><div class="wbd-one">词典暂时没连上（/english/dict-boot.js）</div></div>');
  }
  function show(raw) {
    raw = String(raw || '').trim().replace(/\u2019/g, "'");
    if (!/^[A-Za-z][A-Za-z'\-]*$/.test(raw) || raw.length > 40) return;
    if (!W) {
      openShell('<div class="wbd-card"><div class="wbd-one" style="color:#9a9384">正在连上词典…</div></div>');
      loadBoot(function () { if (W) show(raw); else renderOffline(); });
      return;
    }
    openShell('<div class="wbd-card"><div class="wbd-one" style="color:#9a9384">正在查词典…</div></div>');
    W.ensureCore(function () {
      if (W.find(W.candidates(raw))) { render(raw); return; }
      W.ensureFull(function () { render(raw); });
    });
  }

  /* ---------- 5. 点击取词：caretRangeFromPoint，零 DOM 改动 ---------- */
  function wordAt(x, y) {
    var r = null;
    try {
      if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(x, y);
      else if (document.caretPositionFromPoint) {
        var p = document.caretPositionFromPoint(x, y);
        if (p) { r = document.createRange(); r.setStart(p.offsetNode, p.offset); r.collapse(true); }
      }
    } catch (e) { return null; }
    if (!r) return null;
    var n = r.startContainer, off = r.startOffset;
    if (n && n.nodeType === 1 && r.startOffset < n.childNodes.length) n = n.childNodes[r.startOffset] || n;
    if (!n || n.nodeType !== 3) return null;
    var s = n.nodeValue, re = /[A-Za-z]+(?:['\u2019-][A-Za-z]+)*/g, m, hit = null;
    while ((m = re.exec(s))) {
      if (off >= m.index && off <= m.index + m[0].length) { hit = m[0]; break; }
    }
    return hit;
  }

  /* 交互控件上不弹词典，避免干扰讲义里的按钮 / 拖拽 / 闯关选项 */
  var NO_TAG = /^(A|BUTTON|INPUT|TEXTAREA|SELECT|OPTION|LABEL|SUMMARY|IFRAME|VIDEO|AUDIO|CANVAS|SVG|SCRIPT|STYLE|CODE|PRE|KBD)$/;
  var NO_CLS = /\b(btn|button|opt|option|choice|answer|quiz|q-|tab|toggle|switch|chip|clickable|nav|menu|slider|no-dict)\b/i;
  function blocked(t) {
    while (t && t.nodeType === 1 && t !== document.body) {
      if (NO_TAG.test(t.tagName)) return true;
      if (t.hasAttribute('onclick') || t.hasAttribute('data-i') ||
        t.hasAttribute('data-action') || t.hasAttribute('contenteditable') ||
        t.getAttribute('role') === 'button') return true;
      if (typeof t.className === 'string' && NO_CLS.test(t.className)) return true;
      t = t.parentNode;
    }
    return false;
  }

  function bindTap() {
    document.addEventListener('click', function (e) {
      if (!on || !W || e.button > 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.target === mask || (pop && pop.contains(e.target)) ||
        (box && box.contains(e.target)) || (e.target.closest && e.target.closest('#rrDictBar'))) return;
      if (blocked(e.target)) return;
      var sel = window.getSelection ? String(window.getSelection()) : '';
      if (sel && sel.trim()) return;              // 划选交给 mouseup 处理
      var w = wordAt(e.clientX, e.clientY);
      if (w) show(w);
    }, true);

    document.addEventListener('mouseup', function (e) {
      if (!on || !W || blocked(e.target)) return;
      var s = (window.getSelection ? String(window.getSelection()) : '').trim();
      if (!/^[A-Za-z][A-Za-z'\u2019\-]*$/.test(s) || s.length > 40) return;
      setTimeout(function () {
        var now = (window.getSelection ? String(window.getSelection()) : '').trim();
        if (now === s) show(s);
      }, 160);
    });
  }

  function hint() {
    var seen = false;
    try { seen = localStorage.getItem(LS_HINT) === '1'; localStorage.setItem(LS_HINT, '1'); } catch (e) { }
    if (seen || !on) return;
    var h = document.createElement('div'); h.id = 'rrDictHint';
    h.textContent = '点任意英文单词查词典，右下角可关闭';
    document.body.appendChild(h);
    setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 3500);
  }

  /* ---------- 6. 启动 ---------- */
  function init() {
    build();
    loadBoot(function () { bindTap(); hint(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

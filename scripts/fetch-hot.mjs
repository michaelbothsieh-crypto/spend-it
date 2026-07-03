// 每日爬論壇熱門好物文 → data/hot.json
// 來源:PTT 省錢板(穩)、Dcard 好物研究室(Cloudflare 心情好才給)
import { writeFileSync, mkdirSync } from 'fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36';

// ptt.cc 會擋雲端 IP:先直連重試,不行走 r.jina.ai 代理
async function getHtml(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { cookie: 'over18=1', 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
      if (res.ok) return await res.text();
    } catch {}
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  const res = await fetch('https://r.jina.ai/' + url, {
    headers: { 'x-return-format': 'html', 'x-set-cookie': 'over18=1' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error('proxy HTTP ' + res.status);
  return await res.text();
}

const PTT_BOARDS = [
  { board: 'Lifeismoney', label: 'PTT 省錢板', pages: 4 },
  { board: 'e-shopping', label: 'PTT 網購板', pages: 3 },
  { board: 'MobileComm', label: 'PTT 3C板', pages: 3 },
];

async function pttBoard({ board, label, pages }) {
  const items = [];
  let url = `https://www.ptt.cc/bbs/${board}/index.html`;
  for (let page = 0; page < pages; page++) {
    const html = await getHtml(url);
    for (const m of html.matchAll(/<div class="r-ent">[\s\S]*?<div class="nrec">(?:<span class="[^"]*">([^<]*)<\/span>)?<\/div>[\s\S]*?<div class="title">\s*<a href="([^"]+)">([^<]+)<\/a>/g)) {
      const [, rec, href, title] = m;
      if (/公告|水桶|檢舉|^\s*\[集中\]|置底|^\s*\[閒聊\]\s*$/.test(title)) continue;
      const heat = rec === '爆' ? 100 : (parseInt(rec) || 0);
      items.push({ src: label, title: title.trim(), url: 'https://www.ptt.cc' + href, heat });
    }
    const prev = html.match(/href="([^"]+)"[^>]*>&lsaquo; 上頁/);
    if (!prev) break;
    url = 'https://www.ptt.cc' + prev[1];
  }
  return items;
}

async function ptt() {
  const all = await Promise.allSettled(PTT_BOARDS.map(pttBoard));
  return all.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

async function dcard() {
  try {
    const res = await fetch('https://www.dcard.tw/service/api/v2/forums/goodsbuy/posts?popular=true&limit=30', {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const posts = await res.json();
    return posts.map(p => ({
      src: 'Dcard 好物研究室',
      title: p.title,
      url: 'https://www.dcard.tw/f/goodsbuy/p/' + p.id,
      heat: (p.likeCount || 0) + (p.commentCount || 0),
    }));
  } catch (e) {
    console.error('dcard 掛了(正常發揮):', e.message);
    return [];
  }
}

const results = await Promise.allSettled([ptt(), dcard()]);
const p = results[0].status === 'fulfilled' ? results[0].value : [];
const d = results[1].status === 'fulfilled' ? results[1].value : [];
if (results[0].status === 'rejected') console.error('ptt 全掛:', results[0].reason.message);

// 各來源先取自己的前 10,避免小板被大板熱度洗掉
const bySrc = {};
for (const it of [...p, ...d]) (bySrc[it.src] ??= []).push(it);
const top = Object.values(bySrc)
  .flatMap(list => list.sort((a, b) => b.heat - a.heat).slice(0, 10))
  .sort((a, b) => b.heat - a.heat);

if (!top.length) {
  // 兩邊都掛就保留舊榜單,workflow 不炸
  console.error('今天什麼都沒爬到,保留舊資料');
  process.exit(0);
}

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/hot.json', import.meta.url), JSON.stringify({
  updated: new Date().toISOString(),
  items: top,
}, null, 1));
console.log(`PTT ${p.length} 篇、Dcard ${d.length} 篇 → 取熱度前 ${top.length}`);

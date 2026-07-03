// 每日爬論壇熱門好物文 → data/hot.json
// 來源:PTT 省錢板(穩)、Dcard 好物研究室(Cloudflare 心情好才給)
import { writeFileSync, mkdirSync } from 'fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36';

async function ptt() {
  const items = [];
  let url = 'https://www.ptt.cc/bbs/Lifeismoney/index.html';
  for (let page = 0; page < 4; page++) {
    const res = await fetch(url, { headers: { cookie: 'over18=1', 'user-agent': UA } });
    const html = await res.text();
    for (const m of html.matchAll(/<div class="r-ent">[\s\S]*?<div class="nrec">(?:<span class="[^"]*">([^<]*)<\/span>)?<\/div>[\s\S]*?<div class="title">\s*<a href="([^"]+)">([^<]+)<\/a>/g)) {
      const [, rec, href, title] = m;
      if (/公告|水桶|檢舉|^\s*\[集中\]|置底/.test(title)) continue;
      const heat = rec === '爆' ? 100 : (parseInt(rec) || 0);
      items.push({ src: 'PTT 省錢板', title: title.trim(), url: 'https://www.ptt.cc' + href, heat });
    }
    const prev = html.match(/href="([^"]+)"[^>]*>&lsaquo; 上頁/);
    if (!prev) break;
    url = 'https://www.ptt.cc' + prev[1];
  }
  return items;
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

const [p, d] = await Promise.all([ptt(), dcard()]);
const top = [...p, ...d]
  .sort((a, b) => b.heat - a.heat)
  .slice(0, 30);

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/hot.json', import.meta.url), JSON.stringify({
  updated: new Date().toISOString(),
  items: top,
}, null, 1));
console.log(`PTT ${p.length} 篇、Dcard ${d.length} 篇 → 取熱度前 ${top.length}`);

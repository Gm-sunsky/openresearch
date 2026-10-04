import { createRoot } from "react-dom/client";
import { ResearchCard } from "../../src/components/ResearchCard";
import { I18nProvider } from "../../src/i18n";
import type { Card } from "../../src/shared/contracts";
import "../../src/styles.css";

const dimensions = [[1600,900], [800,1200], [800,800], [2400,300], [300,2400], [100,80]];
const labels = ["横图 · 16:9", "竖图 · 2:3", "方图 · 1:1", "超宽 · 8:1", "超长 · 1:8", "最小卡片 · 小图"];
const noop = () => undefined;
function imageUrl(width: number, height: number) {
  const f = Math.min(width,height) * .14;
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#dae9e3"/><rect x="2" y="2" width="${width-4}" height="${height-4}" stroke="#285749" stroke-width="4" fill="none"/><g font-family="sans-serif" font-size="${f}" fill="#285749"><text x="6" y="${f}">1</text><text x="${width-6}" y="${f}" text-anchor="end">2</text><text x="6" y="${height-6}">3</text><text x="${width-6}" y="${height-6}" text-anchor="end">4</text><text x="${width/2}" y="${height/2}" text-anchor="middle">${width} × ${height}</text></g></svg>`);
}
const now = new Date().toISOString();
createRoot(document.getElementById("root")!).render(<I18nProvider><main style={{ padding: 24 }}><h1 style={{ fontSize: 22 }}>图片完整显示验收</h1><p>每张原图四角数字和边框均应完整可见；图片保持原始宽高比。</p><div style={{ position: "relative", marginTop: 24, height: 980 }}>
{dimensions.map(([width,height],index) => {
  const card: Card = { id: 'image-'+index, projectId: 'qa', type: 'news', title: labels[index], content: '活动时间：10 月 18 日 19:00。\n官方已确认，保留完整图片与来源。', imageUrl: imageUrl(width,height), sourceUrl: 'https://example.com/evidence', sourceName: '验收参考图', sourceLinks: [], focusCategory: '活动时间', occurredAt: now, importance: 2, locked: false, updateBatchId: null, updateBatchAt: null, changeKind: 'none', packId: null, packOrder: 0, position: {x: (index%3)*400+10, y: Math.floor(index/3)*430+10}, size: index===5 ? {width:240,height:170} : {width:360,height:390}, createdAt: now, updatedAt: now };
  return <ResearchCard key={card.id} card={card} cardsInPack={[card]} activeIndex={0} selected={false} highlighted={false} dropTarget={false} onDragMove={noop} onDragEnd={noop} onResize={noop} onSelect={noop} onNavigate={noop} onUnpack={noop} onUnpackAll={noop} onDelete={noop} onSetLocked={noop}/>;
})}</div></main></I18nProvider>);

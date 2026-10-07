# OpenResearch 1.5.5

## 简体中文

本次改进图片整理、卡片阅读和文字输入稳定性。

- **核心配图**：采集图片自身的 alt、figcaption、媒体说明和社交图片说明；按说明与核心结论的匹配程度排序。没有说明、只有文章标题或无法确认相关性的图片不进入卡片预览。安全候选及原图说明仍保留在资料窗口中，并标注“相关性待确认”。旧卡没有图注的图片也会移入资料窗口。
- **独立概述与完整资料**：AI 在同一次整理请求中额外生成独立概述；无可用概述时，按对象、结论和证据状态提炼。卡片根据尺寸显示短概述；详情保留完整的有效整理正文、长图注和全部保存图片，不再为了卡片预算截掉已生成的正文。
- **阅读窗口**：双击卡片，或点击卡片上的“完整查看资料”按钮。支持滚轮、↑/↓ 滚动，卡包按钮及 ←/→ 翻页，Esc 关闭；关闭后恢复原焦点。
- **输入修补**：同一卡片、项目设置及 API 设置的对象刷新不再覆盖编辑草稿；旧请求返回不再重置重开的窗口。模态窗口和中文输入法组合期间，项目搜索快捷键不会抢焦点。删除确认改为应用内窗口；失焦时清理拖动、缩放、指针捕获与监听，取消拖动不会触发落点或打包。

### 输入问题的排查结论

已确认：原表单初始化依赖整个 Card/Project/Settings 对象，新对象到达时会用已保存内容覆盖当前草稿。模拟事件还证明，窗口失焦后残留的缩放监听会继续阻止指针事件；现已清理。真实 Electron 验证覆盖中文输入、对象刷新、关闭资料窗口及取消删除后的继续输入。

原生确认框是否是用户遇到的偶发焦点故障根因，尚未复现；替换为应用内确认属于预防性修补，不能据此保证所有系统/输入法组合场景都已消除。

### 数据与限制

数据库升级至结构版本 11，保留旧目录、完整已存正文和旧原图。旧版本在保存前已截掉的文字无法凭空恢复；重新更新后会按新规则保存。图片判断基于实际文字说明而非视觉识别，采用保守策略。源网页采集和模型输入仍有原有容量预算；详情展示已保存的有效整理材料，不代表缓存整个原网页。安装包仍未签名或 Apple 公证。

## English

This release improves image selection, reading, and text-input stability.

- **Core images:** collect image-specific alt text, figure captions, media descriptions, and social-image descriptions. Rank them against core conclusions. Images lacking real captions or confirmed relevance stay out of the card face, while all saved safe candidates and their full descriptions remain available in the reader with an unverified label. Legacy images without captions also move to the reader.
- **Independent overview and complete material:** request a separate concise overview in the same AI call, with entity/conclusion/evidence-state extraction as a fallback. Cards adapt the overview to their size. The reader retains complete validated research text, long captions, and all saved images; card display budgets no longer discard already-generated text.
- **Reader:** double-click a card or use its full-reader button. Use the wheel or ↑/↓ to scroll, pack buttons or ←/→ to turn pages, and Esc to close. Prior focus is restored.
- **Input fixes:** refreshing card, project, or API settings objects preserves drafts. Late requests cannot reset reopened editors. Search shortcuts yield to modal windows and IME composition. In-app deletion confirmation restores focus. Blur clears drag/resize capture and listeners; cancellation does not commit a drop or pack.

### Diagnosis and limitations

The confirmed defect was draft initialization tied to entire objects: refreshed objects replaced unsaved input. Simulated events also showed stale resize listeners preventing pointer events after blur; those listeners are now removed. Real Electron checks cover Chinese input, object refresh, closing the reader, and canceling deletion.

The exact native-dialog focus failure reported by the user was not reproduced. Replacing native confirmation is preventive; this does not establish that every OS/IME-specific intermittent issue has been eliminated.

Schema version 11 preserves existing profiles, stored full text, and legacy images. Text discarded before storage by an older version cannot be recovered without refreshing the research. Relevance is assessed conservatively from actual image captions, not visual image recognition. Existing collection/model-input budgets remain; the reader displays saved validated research material rather than a complete cache of each source webpage. Builds remain unsigned and not notarized.

### Additional core-image guard / 核心图片判定补充

仅主体名称相同不再视为核心配图证据；图注还需包含与核心事实相符的事件或事实维度。图注明确年份未出现在核心结论中时，保留为待确认资料。长标题在卡片上限制显示行数，资料窗口保留完整标题。

An entity or publisher name alone is not core-image evidence. Captions must also match the event or factual dimension. Explicit caption years absent from the core conclusion remain unverified. Long card titles are line-clamped, with the complete saved title retained in the reader.
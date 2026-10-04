export type ResizeEdge = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";

export interface CardFrame {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export const CARD_SIZE_LIMITS = {
  minimumWidth: 240,
  minimumHeight: 170,
  maximumWidth: 640,
  maximumHeight: 620,
  boardInset: 24,
} as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function resizeCardFrame(
  originPosition: CardFrame["position"],
  originSize: CardFrame["size"],
  edge: ResizeEdge,
  delta: { x: number; y: number },
): CardFrame {
  const changesLeft = edge.includes("w");
  const changesRight = edge.includes("e");
  const changesTop = edge.includes("n");
  const changesBottom = edge.includes("s");
  const widthLimit = changesLeft
    ? Math.min(CARD_SIZE_LIMITS.maximumWidth, originPosition.x + originSize.width - CARD_SIZE_LIMITS.boardInset)
    : CARD_SIZE_LIMITS.maximumWidth;
  const heightLimit = changesTop
    ? Math.min(CARD_SIZE_LIMITS.maximumHeight, originPosition.y + originSize.height - CARD_SIZE_LIMITS.boardInset)
    : CARD_SIZE_LIMITS.maximumHeight;
  const width = clamp(
    originSize.width + (changesRight ? delta.x : changesLeft ? -delta.x : 0),
    CARD_SIZE_LIMITS.minimumWidth,
    widthLimit,
  );
  const height = clamp(
    originSize.height + (changesBottom ? delta.y : changesTop ? -delta.y : 0),
    CARD_SIZE_LIMITS.minimumHeight,
    heightLimit,
  );
  return {
    position: {
      x: changesLeft ? Math.max(CARD_SIZE_LIMITS.boardInset, originPosition.x + originSize.width - width) : originPosition.x,
      y: changesTop ? Math.max(CARD_SIZE_LIMITS.boardInset, originPosition.y + originSize.height - height) : originPosition.y,
    },
    size: { width, height },
  };
}

export function cardContentLayout(
  size: CardFrame["size"],
  hasImage: boolean,
  naturalSize?: CardFrame["size"] | null,
) {
  const compact = size.width < 290 || size.height < 215 || (hasImage && size.height < 280);
  const imageWidth = Math.max(1, size.width - (compact ? 32 : 40));
  const validSize = naturalSize && Number.isFinite(naturalSize.width) && Number.isFinite(naturalSize.height)
    && naturalSize.width > 0 && naturalSize.height > 0;
  const imageRatio = validSize ? naturalSize.width / naturalSize.height : 16 / 9;
  // Reserve the header, title and source footer even at the minimum card size.
  const imageBudget = Math.max(24, size.height - (compact ? 118 : 190));
  const imageHeight = hasImage ? Math.min(imageWidth / imageRatio, imageBudget, size.height * 0.52) : 0;
  return {
    showImage: hasImage,
    imageHeight,
    contentLines: hasImage
      ? size.height < 280 ? 0 : clamp(Math.floor((size.height - imageHeight - 190) / 20), 1, 14)
      : clamp(Math.floor((size.height - 142) / 20), 2, 14),
    compact,
  };
}

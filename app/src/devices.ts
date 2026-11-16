// 预览模式的设备预设（书籍、电脑桌面、手机外框）及窗口和屏幕的几何摆放计算。
// 纯数据计算，不碰网页和文件系统，预览界面和命令行测试共用。

export type DeviceId = "book" | "desktop" | "phone";

export const DEVICE_IDS: readonly DeviceId[] = ["book", "desktop", "phone"];

export const DEVICE_LABELS: Record<DeviceId, string> = {
  book: "书籍",
  desktop: "电脑",
  phone: "手机",
};

/** 判断一个值是不是合法的预览设备代号。 */
export function isDeviceId(v: unknown): v is DeviceId {
  return typeof v === "string" && (DEVICE_IDS as readonly string[]).includes(v);
}

/** 根据设计类型给出默认的预览设备：平面设计默认看书，界面设计默认看电脑桌面。 */
export function defaultDevice(kind: "ui" | "graphic"): DeviceId {
  return kind === "graphic" ? "book" : "desktop";
}

/** 预览的看法：三种设备，或者不套外框（plain） */
export type PreviewChoice = DeviceId | "plain";

/** 没在 project.json 里限定时，预览栏和播放条上列出的看法和顺序 */
export const PREVIEW_CHOICES: readonly PreviewChoice[] = ["book", "desktop", "phone", "plain"];

/**
 * 不套外框的那种看法叫什么：平面设计是按纸张一页页看，和导出的 PDF 一样，叫“PDF”；界面设计的窗口不是纸，叫“原样”。
 */
export function plainLabel(kind: "ui" | "graphic"): string {
  return kind === "graphic" ? "PDF" : "原样";
}

/** 每种看法的名字 */
export function previewChoiceLabel(choice: PreviewChoice, kind: "ui" | "graphic"): string {
  return choice === "plain" ? plainLabel(kind) : DEVICE_LABELS[choice];
}

/**
 * 读 project.json 的 preview.devices：这个项目能用哪几种看法。按写的顺序列在预览栏和播放条上，第一个是默认。
 * 名字是 "book"、"desktop"、"phone"、"plain"；"pdf" 和 "plain" 是同一种（不套外框）。
 * 没写时 devices 是 null（四种都有）；写错的地方放进 problems（认不出的名字跳过；一个都没认出来就当没写）。
 */
export function parsePreviewDevices(preview: unknown): { devices: PreviewChoice[] | null; problems: string[] } {
  if (preview === undefined) return { devices: null, problems: [] };
  const example = '例如 "preview": { "devices": ["book", "pdf"] }';
  if (!preview || typeof preview !== "object" || Array.isArray(preview)) {
    return { devices: null, problems: [`project.json 的 preview 要写成一个对象，${example}`] };
  }
  const list = (preview as { devices?: unknown }).devices;
  if (list === undefined) return { devices: null, problems: [] };
  if (!Array.isArray(list)) return { devices: null, problems: [`project.json 的 preview.devices 要写成看法名字的数组，${example}`] };
  const devices: PreviewChoice[] = [];
  const problems: string[] = [];
  for (const raw of list) {
    const name = typeof raw === "string" ? raw.trim().toLowerCase() : raw;
    const choice = name === "pdf" ? "plain" : name;
    if (choice === "plain" || isDeviceId(choice)) {
      if (!devices.includes(choice)) devices.push(choice);
    } else {
      problems.push(`project.json 的 preview.devices 里有不认识的看法 ${JSON.stringify(raw)}，只能是 "book"（书籍）、"desktop"（电脑）、"phone"（手机）、"pdf" 或 "plain"（不套外框）`);
    }
  }
  if (devices.length === 0) {
    problems.push(`project.json 的 preview.devices 里没有能用的看法，先按默认的四种列出，${example}`);
    return { devices: null, problems };
  }
  return { devices, problems };
}

/** 预览栏和播放条上列哪几种看法、按什么顺序：项目写了就按它写的，没写就是全部四种 */
export function previewChoices(allowed: readonly PreviewChoice[] | null | undefined): PreviewChoice[] {
  return allowed && allowed.length > 0 ? [...allowed] : [...PREVIEW_CHOICES];
}

/** 没选过（或选的这个项目不让用）时用哪种：项目写了就是写的第一个，没写平面设计是书、界面设计是电脑 */
export function defaultPreviewChoice(kind: "ui" | "graphic", allowed: readonly PreviewChoice[] | null | undefined): PreviewChoice {
  return allowed && allowed.length > 0 ? allowed[0] : defaultDevice(kind);
}

/** 选的看法这个项目能不能用；不能用（或者不是看法的名字）就换成默认的 */
export function resolvePreviewChoice(chosen: unknown, kind: "ui" | "graphic", allowed: readonly PreviewChoice[] | null | undefined): PreviewChoice {
  const ok = (chosen === "plain" || isDeviceId(chosen)) && previewChoices(allowed).includes(chosen);
  return ok ? (chosen as PreviewChoice) : defaultPreviewChoice(kind, allowed);
}

export interface PhoneModel {
  id: string;
  label: string;
  width: number;
  height: number;
  /** 屏幕圆角（CSS 像素） */
  radius: number;
  /** 屏幕外一圈机身的宽度（CSS 像素） */
  bezel: number;
  /** 状态栏高度（CSS 像素） */
  safeTop: number;
  /** 底部横条区域高度（CSS 像素） */
  safeBottom: number;
  cutout: "island" | "notch" | "punch";
}

export const PHONE_MODELS: readonly PhoneModel[] = [
  { id: "iphone-15", label: "iPhone 15", width: 393, height: 852, radius: 55, bezel: 12, safeTop: 54, safeBottom: 34, cutout: "island" },
  { id: "pixel-8", label: "Pixel 8", width: 412, height: 915, radius: 48, bezel: 11, safeTop: 40, safeBottom: 24, cutout: "punch" },
  { id: "galaxy-s24", label: "Galaxy S24", width: 360, height: 780, radius: 44, bezel: 10, safeTop: 36, safeBottom: 24, cutout: "punch" },
  { id: "iphone-se", label: "iPhone SE", width: 375, height: 667, radius: 0, bezel: 0, safeTop: 20, safeBottom: 0, cutout: "notch" },
];

/** 按代号查找手机型号；找不到或没传时返回第一个默认型号（iPhone 15）。 */
export function phoneModel(id: string | undefined): PhoneModel {
  return PHONE_MODELS.find((m) => m.id === id) ?? PHONE_MODELS[0];
}

/** 16:9 电脑桌面尺寸，底部任务栏高 48px。 */
export const DESKTOP_SCREEN = { width: 1920, height: 1080, taskbar: 48 } as const;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

function round2(value: number): number {
  const r = Number((Math.round(value * 100) / 100).toFixed(2));
  return r === 0 ? 0 : r;
}

/** 把 content 等比放进 box（四边各留 padding）的缩放倍数，不超过 max；内容或可用区域尺寸为 0 时返回 1。 */
export function fitScale(content: Size, box: Size, options?: { padding?: number; max?: number }): number {
  const padding = options?.padding ?? 0;
  const max = options?.max ?? Infinity;
  const availWidth = box.width - padding * 2;
  const availHeight = box.height - padding * 2;
  if (!(content.width > 0) || !(content.height > 0) || !(availWidth > 0) || !(availHeight > 0)) {
    return 1;
  }
  const scale = Math.min(availWidth / content.width, availHeight / content.height);
  return Math.min(scale, max);
}

/** 算出软件窗口在电脑桌面可用区域里的外框位置、内容区位置和缩放倍数。 */
export function desktopWindowPlacement(
  app: Size,
  options?: { titleBar?: number; maximized?: boolean; screen?: { width: number; height: number; taskbar: number } },
): { frame: Rect; content: Rect; scale: number } {
  const titleBar = options?.titleBar ?? 32;
  const screen = options?.screen ?? DESKTOP_SCREEN;
  const workWidth = screen.width;
  const workHeight = screen.height - screen.taskbar;

  if (options?.maximized) {
    const bodyWidth = workWidth;
    const bodyHeight = Math.max(0, workHeight - titleBar);
    const scale = fitScale(app, { width: bodyWidth, height: bodyHeight });
    const contentWidth = app.width * scale;
    const contentHeight = app.height * scale;
    const contentX = (bodyWidth - contentWidth) / 2;
    const contentY = titleBar + (bodyHeight - contentHeight) / 2;
    return {
      frame: { x: 0, y: 0, width: round2(workWidth), height: round2(workHeight) },
      content: {
        x: round2(contentX),
        y: round2(contentY),
        width: round2(contentWidth),
        height: round2(contentHeight),
      },
      scale,
    };
  }

  const scale = fitScale(app, { width: workWidth, height: workHeight - titleBar }, { padding: 24, max: 1 });
  const contentWidth = app.width * scale;
  const contentHeight = app.height * scale;
  const frameWidth = contentWidth;
  const frameHeight = contentHeight + titleBar;
  const frameX = (workWidth - frameWidth) / 2;
  const frameY = (workHeight - frameHeight) / 2;
  return {
    frame: {
      x: round2(frameX),
      y: round2(frameY),
      width: round2(frameWidth),
      height: round2(frameHeight),
    },
    content: {
      x: round2(frameX),
      y: round2(frameY + titleBar),
      width: round2(contentWidth),
      height: round2(contentHeight),
    },
    scale,
  };
}

/** 电脑桌面上能放窗口的地方：去掉底部任务栏 */
export function desktopWorkArea(screen: { width: number; height: number; taskbar: number } = DESKTOP_SCREEN): Rect {
  return { x: 0, y: 0, width: screen.width, height: screen.height - screen.taskbar };
}

/** 窗口外框 → 窗口的内容区（去掉标题栏） */
export function desktopClient(frame: Rect, titleBar = 32): Size {
  return { width: round2(Math.max(0, frame.width)), height: round2(Math.max(0, frame.height - titleBar)) };
}

/** 拖窗口改大小时内容区最小多大 */
export const DESKTOP_MIN_CLIENT: Size = { width: 240, height: 160 };

/** 拖的是窗口的哪几条边（角是两条边） */
export interface ResizeEdges {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
}

/**
 * 拖窗口的边、角改大小：从外框 start（桌面坐标）开始，拖的那几条边跟着鼠标挪 (dx, dy)（桌面像素），对边不动。
 * 外框不出桌面的工作区（任务栏上面），内容区不小于 DESKTOP_MIN_CLIENT。
 */
export function resizeDesktopFrame(
  start: Rect,
  edges: ResizeEdges,
  dx: number,
  dy: number,
  options?: { titleBar?: number; screen?: { width: number; height: number; taskbar: number }; min?: Size },
): Rect {
  const titleBar = options?.titleBar ?? 32;
  const work = desktopWorkArea(options?.screen);
  const min = options?.min ?? DESKTOP_MIN_CLIENT;
  const minW = min.width;
  const minH = min.height + titleBar;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (edges.left) left = clamp(left + dx, work.x, right - minW);
  if (edges.right) right = clamp(right + dx, left + minW, work.x + work.width);
  if (edges.top) top = clamp(top + dy, work.y, bottom - minH);
  if (edges.bottom) bottom = clamp(bottom + dy, top + minH, work.y + work.height);
  return { x: round2(left), y: round2(top), width: round2(right - left), height: round2(bottom - top) };
}

/**
 * 窗口外框已经定了（用户拖过大小，或者最大化）时内容怎么放：在内容区里按比例缩放、居中（平面设计的纸）。
 * 跟着窗口重新排版的界面设计，content 就是内容区的大小，缩放是 1、正好铺满。
 */
export function desktopWindowPlacementIn(frame: Rect, content: Size, options?: { titleBar?: number }): { frame: Rect; content: Rect; scale: number } {
  const titleBar = options?.titleBar ?? 32;
  const client = desktopClient(frame, titleBar);
  const scale = fitScale(content, client);
  const width = content.width * scale;
  const height = content.height * scale;
  return {
    frame: { x: round2(frame.x), y: round2(frame.y), width: round2(frame.width), height: round2(frame.height) },
    content: { x: round2(frame.x + (client.width - width) / 2), y: round2(frame.y + titleBar + (client.height - height) / 2), width: round2(width), height: round2(height) },
    scale,
  };
}

/** 算出软件界面在手机屏幕安全区域里的位置、等宽缩放倍数以及是否需要竖向滚动。 */
export function phoneScreenPlacement(
  app: Size,
  model: PhoneModel,
  options?: { landscape?: boolean },
): { screen: Size; content: Rect; scale: number; scroll: boolean } {
  const landscape = Boolean(options?.landscape);
  const screen: Size = landscape
    ? { width: round2(model.height), height: round2(model.width) }
    : { width: round2(model.width), height: round2(model.height) };

  const areaX = landscape ? model.safeTop : 0;
  const areaY = landscape ? 0 : model.safeTop;
  const areaWidth = landscape ? screen.width - model.safeTop - model.safeBottom : screen.width;
  const areaHeight = landscape ? screen.height : screen.height - model.safeTop - model.safeBottom;

  const scale = app.width > 0 && areaWidth > 0 ? areaWidth / app.width : 1;
  const contentWidth = round2(app.width * scale);
  const contentHeight = round2(app.height * scale);
  const scroll = contentHeight > round2(areaHeight);

  return {
    screen,
    content: {
      x: round2(areaX),
      y: round2(areaY),
      width: contentWidth,
      height: contentHeight,
    },
    scale,
    scroll,
  };
}

/** 算出整个预览设备放进编辑器中间视口时的缩放倍数（最大为 1）和居中左上角坐标。 */
export function viewFit(device: Size, viewport: Size, padding = 32): { scale: number; x: number; y: number } {
  const scale = fitScale(device, viewport, { padding, max: 1 });
  const x = round2((viewport.width - device.width * scale) / 2);
  const y = round2((viewport.height - device.height * scale) / 2);
  return { scale, x, y };
}

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

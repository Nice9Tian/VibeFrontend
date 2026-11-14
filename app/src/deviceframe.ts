// 预览时的设备外框：书（翻开的书，一屏两页，翻页时纸从书脊翻过去）、电脑（16:9 桌面、底部任务栏、软件窗口）、
// 手机（机身、刘海或挖孔、状态栏、底部横条）。只画外框和“屏幕”在哪，屏幕里的东西由调用方放（编辑器放设计窗口里的画板，
// 播放页——独立预览和导出的网页——放它画好的页面）。外框画在放页面的那个文档里（编辑器是设计窗口自己的文档），
// 所以翻页时拍的快照、任务栏上的缩略图和项目的样式表是同一个文档里的东西。
//
// 尺寸都是 CSS 像素。几何（多大、放哪、缩放多少）在 devices.ts，这里只管画。
import { DESKTOP_SCREEN, desktopWindowPlacement, phoneScreenPlacement, type PhoneModel, type Size } from "./devices.ts";

/** 书的一屏里的一面纸：它属于哪个画板、是画板从左数第几张纸、纸多大 */
export interface SheetPiece {
  board: string;
  sheet: number;
  width: number;
  height: number;
}

/** 软件的图标：项目里的图片，没有就用名字的第一个字做一个方块 */
export interface AppIcon {
  src?: string;
  letter: string;
  color: string;
}

export interface DeviceStage {
  /** 外框的根元素，放进设计窗口的画布 */
  root: HTMLElement;
  /** 外框整体多大（CSS 像素），设计窗口按这个尺寸摆 */
  size: Size;
  /** 画板放在哪：书里每个画板一块（跨页的两面纸是同一块），电脑和手机是一块“屏幕”（key 为 "screen"） */
  slots: Map<string, HTMLElement>;
  /** 每一面纸的元素（翻书动画按左右两面拍快照） */
  faces: { left: HTMLElement | null; right: HTMLElement | null };
  /** 拆掉时停掉时钟之类的定时器 */
  destroy(): void;
}

const NS = "vf-dev";

function el(doc: Document, tag: string, className: string, parent?: HTMLElement): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  parent?.append(node);
  return node;
}

function svg(doc: Document, markup: string, className: string): HTMLElement {
  const holder = doc.createElement("span");
  holder.className = className;
  holder.innerHTML = markup;
  holder.setAttribute("aria-hidden", "true");
  return holder;
}

/** 名字 → 图标底色：同一个名字总是同一个颜色，颜色都偏沉稳 */
export function iconColorFor(name: string): string {
  const palette = ["#3b6fd8", "#2f8f6b", "#b4543a", "#7a55c7", "#c2862b", "#3a8fb0", "#c04a76", "#5b6b7e"];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return palette[h % palette.length];
}

function appIcon(doc: Document, icon: AppIcon, size: number, className: string): HTMLElement {
  if (icon.src) {
    const img = doc.createElement("img");
    img.className = className;
    img.src = icon.src;
    img.alt = "";
    img.width = size;
    img.height = size;
    return img;
  }
  const tile = el(doc, "span", `${className} ${NS}-monogram`);
  tile.textContent = icon.letter;
  tile.style.background = icon.color;
  tile.style.width = tile.style.height = `${size}px`;
  tile.style.fontSize = `${Math.round(size * 0.58)}px`;
  return tile;
}

// ---------- 书 ----------

/**
 * 翻开的书：左右两面纸，中间是书脊的阴影，两边是纸的厚度（读过的在左边，没读的在右边）。
 * closed 为 "front"（第一屏只有封面）或 "back"（最后一屏只有封底）时书是合着的，挪到正中，像放在桌上。
 * 别的时候少了一面（例如最后单独一个右手页）就是翻开的书、那一面是空白的纸。
 * 同一个画板的相邻两面（跨页）放进同一块，跨过中缝的东西是连着的。
 */
export function mountBook(
  doc: Document,
  view: { left: SheetPiece | null; right: SheetPiece | null },
  progress: { before: number; after: number },
  closed: "front" | "back" | null = null,
): DeviceStage {
  ensureStyles(doc);
  const leftW = view.left?.width ?? view.right?.width ?? 0;
  const rightW = view.right?.width ?? view.left?.width ?? 0;
  const height = Math.max(view.left?.height ?? 0, view.right?.height ?? 0);
  const pad = Math.round(Math.max(height * 0.08, 28));
  const size = { width: leftW + rightW + pad * 2, height: height + pad * 2 };
  const root = el(doc, "div", `${NS} ${NS}-book-desk`);
  root.style.width = `${size.width}px`;
  root.style.height = `${size.height}px`;
  const book = el(doc, "div", `${NS}-book${closed ? ` closed ${closed}` : ""}`, root);
  book.style.left = `${pad}px`;
  book.style.top = `${pad}px`;
  book.style.width = `${leftW + rightW}px`;
  book.style.height = `${height}px`;
  // 合着的书挪到正中（封面在右半、封底在左半，挪半本书宽）
  if (closed === "front") book.style.transform = `translateX(${-leftW / 2}px)`;
  if (closed === "back") book.style.transform = `translateX(${rightW / 2}px)`;

  // 纸的厚度：读过的页数堆在左边，没读的堆在右边，最多 6 层
  const stack = (side: "left" | "right", count: number) => {
    const layers = Math.min(6, Math.ceil(count / 4));
    for (let i = 1; i <= layers; i++) {
      const edge = el(doc, "div", `${NS}-book-edge ${side}`, book);
      edge.style.setProperty("--i", String(i));
      if (side === "left") {
        edge.style.left = "0";
        edge.style.width = `${leftW}px`;
      } else {
        edge.style.left = `${leftW}px`;
        edge.style.width = `${rightW}px`;
      }
    }
  };
  if (closed !== "front") stack("left", progress.before);
  if (closed !== "back") stack("right", progress.after);

  const faces = { left: null as HTMLElement | null, right: null as HTMLElement | null };
  // 每一面纸；翻开的书少了的那一面是空白的纸
  const face = (side: "left" | "right", piece: SheetPiece | null) => {
    if (!piece && closed) return;
    const f = el(doc, "div", `${NS}-page ${side}${piece ? "" : " blank"}`, book);
    f.style.left = side === "left" ? "0" : `${leftW}px`;
    f.style.width = `${side === "left" ? leftW : rightW}px`;
    f.style.height = `${piece?.height ?? height}px`;
    faces[side] = f;
  };
  face("left", view.left);
  face("right", view.right);

  // 画板放进哪一块：同一个画板的两面合成一块，横跨左右
  const slots = new Map<string, HTMLElement>();
  const sameBoard = view.left && view.right && view.left.board === view.right.board && view.right.sheet === view.left.sheet + 1;
  const slotFor = (piece: SheetPiece, x: number, width: number, firstSheet: number) => {
    const clip = el(doc, "div", `${NS}-clip`, book);
    clip.style.left = `${x}px`;
    clip.style.width = `${width}px`;
    clip.style.height = `${piece.height}px`;
    // 画板里这几张纸前面的纸挪到左边看不见的地方
    const slot = el(doc, "div", `${NS}-slot`, clip);
    slot.style.left = `${-firstSheet * piece.width}px`;
    slots.set(piece.board, slot);
  };
  if (sameBoard) slotFor(view.left!, 0, leftW + rightW, view.left!.sheet);
  else {
    if (view.left) slotFor(view.left, 0, leftW, view.left.sheet);
    if (view.right) slotFor(view.right, leftW, rightW, view.right.sheet);
  }
  // 书脊的阴影盖在纸上面（不挡鼠标）
  if (!closed) {
    const gutter = el(doc, "div", `${NS}-gutter`, book);
    gutter.style.left = `${leftW}px`;
  }
  return { root, size, slots, faces, destroy() {} };
}

/**
 * 翻页：before 是翻页前两面纸的快照（turnSnapshot 拍的），新的一屏已经画好。
 * 往后翻：右边那面纸从书脊翻到左边，翻过去的背面是新一屏的左页；往前翻反过来。
 * 翻的过程中，被翻起的那面纸下面已经是新的一页，另一边先盖着旧的，纸落下来才露出新的。
 */
export function playTurn(doc: Document, stage: DeviceStage, before: TurnSnapshot, forward: boolean): void {
  const book = stage.root.querySelector<HTMLElement>(`.${NS}-book`);
  if (!book || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // 书合上、打开时整本书在正中和左右之间挪：和翻页一起慢慢挪过去
  const shift = book.style.transform || "";
  if (before.shift !== shift) {
    book.animate([{ transform: before.shift || "translateX(0px)" }, { transform: shift || "translateX(0px)" }], { duration: 640, easing: "cubic-bezier(0.32, 0.08, 0.24, 1)" });
  }
  const turning = forward ? before.right : before.left; // 翻起来的那面（旧的）
  const covered = forward ? before.left : before.right; // 另一边先盖着旧的
  const landing = forward ? stage.faces.left : stage.faces.right; // 翻过去落下的那面（新的）
  if (!turning || !landing) {
    // 合上的封面翻开、翻到封底：没有对面可翻，书挪过去就好
    book.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 320, easing: "ease-out" });
    return;
  }
  // 快照还没放进文档，量不出大小：用拍的时候写在它身上的尺寸
  const sizeOf = (snap: HTMLElement) => ({ width: parseFloat(snap.style.width) || 0, height: parseFloat(snap.style.height) || 0 });
  const { width, height } = sizeOf(turning);
  const leftW = forward ? landing.offsetWidth : width;
  // 原来空着（合上的书打开）：落下的那一面等纸翻过去（立起来以后）才露出来
  if (!covered) landing.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 0.5001 }, { opacity: 1 }], { duration: 640 });
  if (covered) {
    const cover = el(doc, "div", `${NS}-turn-cover ${forward ? "left" : "right"}`, book);
    cover.style.left = forward ? "0" : `${leftW}px`;
    cover.style.width = `${sizeOf(covered).width}px`;
    cover.style.height = `${sizeOf(covered).height}px`;
    cover.append(covered);
    // 纸翻过一半（立起来）以前盖着旧的这一页，翻过去以后露出新的：和翻页用同一条时间线，暂停、慢放也对得上
    const hold = cover.animate([{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.5001 }, { opacity: 0 }], { duration: 640, fill: "forwards" });
    hold.onfinish = () => cover.remove();
  }
  const leaf = el(doc, "div", `${NS}-leaf ${forward ? "forward" : "backward"}`, book);
  leaf.style.left = forward ? `${leftW}px` : "0";
  leaf.style.width = `${width}px`;
  leaf.style.height = `${height}px`;
  const front = el(doc, "div", `${NS}-leaf-face front`, leaf);
  front.append(turning);
  const back = el(doc, "div", `${NS}-leaf-face back`, leaf);
  back.append(cloneFace(landing));
  const shade = el(doc, "div", `${NS}-leaf-shade`, leaf);
  const angle = forward ? -180 : 180;
  const anim = leaf.animate([{ transform: "rotateY(0deg)" }, { transform: `rotateY(${angle}deg)` }], { duration: 640, easing: "cubic-bezier(0.32, 0.08, 0.24, 1)" });
  shade.animate([{ opacity: 0 }, { opacity: 0.35, offset: 0.5 }, { opacity: 0 }], { duration: 640 });
  anim.onfinish = () => leaf.remove();
}

/** 翻页前给两面纸各拍一张快照（复制一份元素；画布里画的内容一起复制） */
export function turnSnapshot(stage: DeviceStage | null): TurnSnapshot {
  const book = stage?.root.querySelector<HTMLElement>(`.${NS}-book`);
  return {
    left: stage?.faces.left ? cloneFace(stage.faces.left) : null,
    right: stage?.faces.right ? cloneFace(stage.faces.right) : null,
    shift: book?.style.transform ?? "",
  };
}

/** 翻页前拍的：两面纸的样子，和书当时挪到了哪里（合着的书挪到正中） */
export interface TurnSnapshot {
  left: HTMLElement | null;
  right: HTMLElement | null;
  shift: string;
}

/** 一面纸的样子：这面纸的位置上能看到的东西（画板的那一段）复制下来，放进一个同样大的框 */
function cloneFace(face: HTMLElement): HTMLElement {
  const doc = face.ownerDocument;
  const book = face.parentElement!;
  const box = doc.createElement("div");
  box.className = `${NS}-snap`;
  box.style.width = `${face.offsetWidth}px`;
  box.style.height = `${face.offsetHeight}px`;
  box.style.background = getComputedStyle(face).background;
  const faceLeft = face.offsetLeft;
  for (const clip of book.querySelectorAll<HTMLElement>(`:scope > .${NS}-clip`)) {
    const copy = deepClone(clip);
    copy.style.left = `${clip.offsetLeft - faceLeft}px`;
    box.append(copy);
  }
  return box;
}

/** 复制元素，连同 canvas 里已经画好的内容（cloneNode 不带这个） */
export function deepClone(node: HTMLElement): HTMLElement {
  const copy = node.cloneNode(true) as HTMLElement;
  const from = node.querySelectorAll("canvas");
  const to = copy.querySelectorAll("canvas");
  from.forEach((canvas, i) => {
    try {
      to[i].getContext("2d")?.drawImage(canvas, 0, 0);
    } catch {
      // 跨域的图画不出来，留空
    }
  });
  copy.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  copy.removeAttribute("id");
  return copy;
}

// ---------- 电脑 ----------

export interface DesktopOptions {
  app: { title: string; icon: AppIcon };
  content: Size;
  maximized: boolean;
  minimized: boolean;
  onMinimize(): void;
  onMaximize(): void;
  onRestore(): void;
}

/**
 * 16:9 的桌面：壁纸、底部任务栏（开始、搜索、几个固定的图标、正在运行的这个软件、右边的托盘和时钟）、
 * 中间是软件的窗口（标题栏：图标、名字、最小化、最大化、关闭）。窗口太大时按比例缩小放进桌面。
 * 鼠标停在任务栏的软件图标上，弹出窗口的缩略图（就是任务栏上的预想样子）。
 */
export function mountDesktop(doc: Document, options: DesktopOptions): DeviceStage {
  ensureStyles(doc);
  const screen = DESKTOP_SCREEN;
  // 外面一圈留出显示器的边框和阴影（阴影往下拖到将近 90px），不被设计窗口的边裁掉
  const margin = 104;
  const root = el(doc, "div", `${NS} ${NS}-desk`);
  root.style.width = `${screen.width + margin * 2}px`;
  root.style.height = `${screen.height + margin * 2}px`;
  const desktop = el(doc, "div", `${NS}-desktop`, root);
  Object.assign(desktop.style, { left: `${margin}px`, top: `${margin}px`, width: `${screen.width}px`, height: `${screen.height}px` });
  el(doc, "div", `${NS}-wallpaper`, desktop);

  const place = desktopWindowPlacement(options.content, { maximized: options.maximized });
  const win = el(doc, "div", `${NS}-window${options.maximized ? " maximized" : ""}${options.minimized ? " minimized" : ""}`, desktop);
  Object.assign(win.style, { left: `${place.frame.x}px`, top: `${place.frame.y}px`, width: `${place.frame.width}px`, height: `${place.frame.height}px` });
  const bar = el(doc, "div", `${NS}-titlebar`, win);
  bar.append(appIcon(doc, options.app.icon, 16, `${NS}-title-icon`));
  const title = el(doc, "span", `${NS}-title`, bar);
  title.textContent = options.app.title;
  const controls = el(doc, "div", `${NS}-controls`, bar);
  const control = (kind: string, label: string, glyph: string, onClick: () => void) => {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = `${NS}-control ${kind}`;
    b.title = label;
    b.setAttribute("aria-label", label);
    b.append(svg(doc, glyph, `${NS}-glyph`));
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    controls.append(b);
  };
  control("min", "最小化", `<svg viewBox="0 0 10 10" width="10" height="10"><path d="M0 5h10" stroke="currentColor" stroke-width="1"/></svg>`, options.onMinimize);
  control(
    "max",
    options.maximized ? "还原" : "最大化",
    options.maximized
      ? `<svg viewBox="0 0 10 10" width="10" height="10"><path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" fill="none" stroke="currentColor"/></svg>`
      : `<svg viewBox="0 0 10 10" width="10" height="10"><rect x=".5" y=".5" width="9" height="9" fill="none" stroke="currentColor"/></svg>`,
    options.onMaximize,
  );
  control("close", "关闭（预览里不关）", `<svg viewBox="0 0 10 10" width="10" height="10"><path d="M.5.5l9 9M9.5.5l-9 9" stroke="currentColor"/></svg>`, () => {
    win.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }], { duration: 260 });
  });
  bar.addEventListener("dblclick", options.onMaximize);

  const body = el(doc, "div", `${NS}-window-body`, win);
  const screenSlot = el(doc, "div", `${NS}-screen-slot`, body);
  Object.assign(screenSlot.style, {
    left: `${place.content.x - place.frame.x}px`,
    top: `${place.content.y - place.frame.y - 32}px`,
    width: `${options.content.width}px`,
    height: `${options.content.height}px`,
    transform: place.scale === 1 ? "" : `scale(${place.scale})`,
  });

  // 任务栏
  const taskbar = el(doc, "div", `${NS}-taskbar`, desktop);
  taskbar.style.height = `${screen.taskbar}px`;
  const center = el(doc, "div", `${NS}-tb-center`, taskbar);
  const tbButton = (className: string, label: string, child: HTMLElement) => {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = `${NS}-tb-btn ${className}`;
    b.title = label;
    b.setAttribute("aria-label", label);
    b.append(child);
    center.append(b);
    return b;
  };
  tbButton("start", "开始", svg(doc, ICON_START, `${NS}-tb-icon`));
  const search = el(doc, "div", `${NS}-tb-search`, center);
  search.append(svg(doc, ICON_SEARCH, `${NS}-tb-search-icon`));
  el(doc, "span", "", search).textContent = "搜索";
  tbButton("pinned", "任务视图", svg(doc, ICON_TASKVIEW, `${NS}-tb-icon`));
  tbButton("pinned", "文件", svg(doc, ICON_FOLDER, `${NS}-tb-icon`));
  tbButton("pinned", "浏览器", svg(doc, ICON_GLOBE, `${NS}-tb-icon`));
  const appBtn = tbButton(`app running${options.minimized ? "" : " active"}`, options.app.title, appIcon(doc, options.app.icon, 24, `${NS}-tb-app-icon`));
  appBtn.addEventListener("click", () => (options.minimized ? options.onRestore() : options.onMinimize()));

  // 鼠标停在软件图标上：窗口的缩略图（实时画面复制一份缩小）
  let peekTimer = 0;
  let peek: HTMLElement | null = null;
  const hidePeek = () => {
    clearTimeout(peekTimer);
    peek?.remove();
    peek = null;
  };
  appBtn.addEventListener("mouseenter", () => {
    clearTimeout(peekTimer);
    peekTimer = window.setTimeout(() => {
      hidePeek();
      peek = el(doc, "div", `${NS}-peek`, desktop);
      const head = el(doc, "div", `${NS}-peek-head`, peek);
      head.append(appIcon(doc, options.app.icon, 14, `${NS}-title-icon`));
      el(doc, "span", "", head).textContent = options.app.title;
      const thumbW = 236;
      const scale = thumbW / Math.max(1, options.content.width);
      const thumb = el(doc, "div", `${NS}-peek-thumb`, peek);
      thumb.style.width = `${thumbW}px`;
      thumb.style.height = `${Math.round(options.content.height * scale)}px`;
      const copy = deepClone(screenSlot);
      Object.assign(copy.style, { left: "0", top: "0", transform: `scale(${scale})`, transformOrigin: "0 0" });
      thumb.append(copy);
      // 缩略图对着软件图标，横着的位置按桌面里的坐标算（桌面整体可能被缩放）
      const center = appBtn.offsetLeft + appBtn.offsetWidth / 2 + (appBtn.offsetParent as HTMLElement | null)!.offsetLeft;
      peek.style.left = `${Math.max(8, center - (thumbW + 16) / 2)}px`;
      peek.addEventListener("click", () => {
        hidePeek();
        if (options.minimized) options.onRestore();
      });
    }, 280);
  });
  appBtn.addEventListener("mouseleave", () => {
    clearTimeout(peekTimer);
    peekTimer = window.setTimeout(hidePeek, 220);
  });

  const tray = el(doc, "div", `${NS}-tb-tray`, taskbar);
  tray.append(svg(doc, ICON_CHEVRON, `${NS}-tray-icon`));
  const sys = el(doc, "div", `${NS}-tray-sys`, tray);
  sys.append(svg(doc, ICON_WIFI, `${NS}-tray-icon`), svg(doc, ICON_SPEAKER, `${NS}-tray-icon`), svg(doc, ICON_BATTERY, `${NS}-tray-icon`));
  const clock = el(doc, "div", `${NS}-tray-clock`, tray);
  const tick = () => {
    const now = new Date();
    clock.innerHTML = `<span>${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}</span><span>${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}</span>`;
  };
  tick();
  const timer = window.setInterval(tick, 20_000);

  return {
    root,
    size: { width: screen.width + margin * 2, height: screen.height + margin * 2 },
    slots: new Map([["screen", screenSlot]]),
    faces: { left: null, right: null },
    destroy() {
      clearInterval(timer);
      hidePeek();
    },
  };
}

// ---------- 手机 ----------

/**
 * 手机：机身、屏幕圆角、灵动岛（或刘海、挖孔）、状态栏（时间、信号、Wi-Fi、电池）、底部横条。
 * 软件放在屏幕里状态栏和横条之间，按屏幕宽度等比缩放，比屏幕长就在屏幕里上下滚动。
 * iPhone SE 这种老机型（屏幕没有圆角）画成上下有宽边框、下面有圆形 Home 键的样子。
 */
export function mountPhone(doc: Document, model: PhoneModel, options: { content: Size; landscape: boolean }): DeviceStage {
  ensureStyles(doc);
  const place = phoneScreenPlacement(options.content, model, { landscape: options.landscape });
  const classic = model.radius === 0;
  const side = classic ? 18 : model.bezel;
  const chin = classic ? 84 : model.bezel; // 老机型上下的宽边框
  const screenW = place.screen.width;
  const screenH = place.screen.height;
  const bodyW = options.landscape ? screenW + chin * 2 : screenW + side * 2;
  const bodyH = options.landscape ? screenH + side * 2 : screenH + chin * 2;
  // 外面一圈留出机身的阴影（往下拖到将近 90px），不被设计窗口的边裁掉
  const margin = 100;
  const root = el(doc, "div", `${NS} ${NS}-phone-desk`);
  const size = { width: bodyW + margin * 2, height: bodyH + margin * 2 };
  root.style.width = `${size.width}px`;
  root.style.height = `${size.height}px`;
  const body = el(doc, "div", `${NS}-phone${classic ? " classic" : ""}${options.landscape ? " landscape" : ""}`, root);
  Object.assign(body.style, {
    left: `${margin}px`,
    top: `${margin}px`,
    width: `${bodyW}px`,
    height: `${bodyH}px`,
    borderRadius: classic ? "54px" : `${model.radius + model.bezel}px`,
  });
  // 侧面的按键
  for (const key of options.landscape ? ["top-a", "top-b", "top-c"] : ["left-a", "left-b", "left-c", "right-a"]) el(doc, "span", `${NS}-phone-key ${key}`, body);

  const screen = el(doc, "div", `${NS}-phone-screen`, body);
  Object.assign(screen.style, {
    left: `${options.landscape ? chin : side}px`,
    top: `${options.landscape ? side : chin}px`,
    width: `${screenW}px`,
    height: `${screenH}px`,
    borderRadius: `${model.radius}px`,
  });
  // 屏幕里能放软件的地方（状态栏和横条之间），太长就滚动
  const viewport = el(doc, "div", `${NS}-phone-viewport${place.scroll ? " scroll" : ""}`, screen);
  Object.assign(viewport.style, options.landscape
    ? { left: `${place.content.x}px`, top: "0", width: `${screenW - model.safeTop - model.safeBottom}px`, height: `${screenH}px` }
    : { left: "0", top: `${place.content.y}px`, width: `${screenW}px`, height: `${screenH - model.safeTop - model.safeBottom}px` });
  const sizer = el(doc, "div", `${NS}-phone-sizer`, viewport);
  sizer.style.width = `${place.content.width}px`;
  sizer.style.height = `${place.content.height}px`;
  const slot = el(doc, "div", `${NS}-screen-slot`, sizer);
  Object.assign(slot.style, { width: `${options.content.width}px`, height: `${options.content.height}px`, transform: `scale(${place.scale})` });

  if (!options.landscape) {
    const status = el(doc, "div", `${NS}-status`, screen);
    status.style.height = `${model.safeTop}px`;
    const time = el(doc, "span", `${NS}-status-time`, status);
    time.textContent = "9:41";
    const icons = el(doc, "span", `${NS}-status-icons`, status);
    icons.append(svg(doc, ICON_SIGNAL, `${NS}-status-icon`), svg(doc, ICON_WIFI, `${NS}-status-icon`), svg(doc, ICON_BATTERY, `${NS}-status-icon battery`));
  }
  if (model.cutout === "island" && !classic) el(doc, "div", `${NS}-island${options.landscape ? " landscape" : ""}`, screen);
  if (model.cutout === "punch" && !classic) el(doc, "div", `${NS}-punch${options.landscape ? " landscape" : ""}`, screen);
  if (model.safeBottom > 0) el(doc, "div", `${NS}-home-bar`, screen);
  if (classic) {
    el(doc, "span", `${NS}-classic-speaker`, body);
    el(doc, "span", `${NS}-classic-camera`, body);
    el(doc, "span", `${NS}-classic-home`, body);
  }
  return { root, size, slots: new Map([["screen", slot]]), faces: { left: null, right: null }, destroy() {} };
}

/**
 * 电脑的窗口、手机的屏幕里放一屏的几面纸：并排摆，同一个画板的相邻两面合成一块（跨过中缝的东西连着）。
 * boardFor 给出画板的元素（左上角对齐画板的左上角），这里只把它挪到这一面纸露出来的位置。
 */
export function placeSheets(doc: Document, parent: HTMLElement, view: { left: SheetPiece | null; right: SheetPiece | null }, boardFor: (board: string) => HTMLElement): void {
  const leftW = view.left?.width ?? 0;
  const pieces: Array<{ piece: SheetPiece; x: number; width: number }> = [];
  if (view.left && view.right && view.left.board === view.right.board && view.right.sheet === view.left.sheet + 1) {
    pieces.push({ piece: view.left, x: 0, width: view.left.width + view.right.width });
  } else {
    if (view.left) pieces.push({ piece: view.left, x: 0, width: view.left.width });
    if (view.right) pieces.push({ piece: view.right, x: leftW, width: view.right.width });
  }
  for (const { piece, x, width } of pieces) {
    const clip = doc.createElement("div");
    clip.style.cssText = `position:absolute;left:${x}px;top:0;width:${width}px;height:${piece.height}px;overflow:hidden;`;
    const board = boardFor(piece.board);
    board.style.left = `${-piece.sheet * piece.width}px`;
    clip.append(board);
    parent.append(clip);
  }
}

/** 电脑、手机换一屏：新的一屏从翻页方向滑进来 */
export function playSlide(stage: DeviceStage, forward: boolean): void {
  const slot = stage.slots.get("screen");
  if (!slot || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const base = slot.style.transform || "";
  slot.animate([{ transform: `${base} translateX(${forward ? 6 : -6}%)`, opacity: 0.2 }, { transform: base || "none", opacity: 1 }], { duration: 260, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
}

// ---------- 图标（简单的几何线稿，不照抄哪家的商标） ----------

const ICON_START = `<svg viewBox="0 0 24 24" width="22" height="22"><rect x="3" y="3" width="18" height="18" rx="5" fill="#3d7be0"/><g fill="#fff"><circle cx="8.5" cy="8.5" r="1.6"/><circle cx="12" cy="8.5" r="1.6"/><circle cx="15.5" cy="8.5" r="1.6"/><circle cx="8.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="15.5" cy="12" r="1.6"/><circle cx="8.5" cy="15.5" r="1.6"/><circle cx="12" cy="15.5" r="1.6"/><circle cx="15.5" cy="15.5" r="1.6"/></g></svg>`;
const ICON_SEARCH = `<svg viewBox="0 0 16 16" width="15" height="15"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.3 10.3l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const ICON_TASKVIEW = `<svg viewBox="0 0 24 24" width="22" height="22"><rect x="3" y="6" width="11" height="12" rx="2.2" fill="#e8ebf0" stroke="#5b6472" stroke-width="1.2"/><rect x="10" y="4" width="11" height="12" rx="2.2" fill="#fff" stroke="#5b6472" stroke-width="1.2"/></svg>`;
const ICON_FOLDER = `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2h7A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" fill="#f2c14e"/><path d="M3 10h18v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" fill="#f7d36b"/></svg>`;
const ICON_GLOBE = `<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="9" fill="#2d9bd8"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke="#fff" stroke-width="1.2" opacity=".85"/></svg>`;
const ICON_CHEVRON = `<svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_WIFI = `<svg viewBox="0 0 18 14" width="16" height="13"><path d="M1.5 4.8a11 11 0 0 1 15 0M4 7.6a7.2 7.2 0 0 1 10 0M6.6 10.3a3.4 3.4 0 0 1 4.8 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="9" cy="12.4" r="1.2" fill="currentColor"/></svg>`;
const ICON_SPEAKER = `<svg viewBox="0 0 18 14" width="16" height="13"><path d="M2 5h3l4-3.2v10.4L5 9H2z" fill="currentColor"/><path d="M12 4.2a4 4 0 0 1 0 5.6M14.3 2a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
const ICON_BATTERY = `<svg viewBox="0 0 26 13" width="25" height="12"><rect x=".7" y=".7" width="21.6" height="11.6" rx="3.2" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.2"/><rect x="2.6" y="2.6" width="15.5" height="7.8" rx="1.6" fill="currentColor"/><path d="M23.8 4.4v4.2a2.1 2.1 0 0 0 0-4.2z" fill="currentColor" fill-opacity=".45"/></svg>`;
const ICON_SIGNAL = `<svg viewBox="0 0 18 12" width="17" height="11"><rect x="0" y="8" width="3" height="4" rx=".8" fill="currentColor"/><rect x="5" y="5.5" width="3" height="6.5" rx=".8" fill="currentColor"/><rect x="10" y="3" width="3" height="9" rx=".8" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx=".8" fill="currentColor"/></svg>`;

// ---------- 样式 ----------

function ensureStyles(doc: Document): void {
  if (doc.getElementById("vf-device-styles")) return;
  const style = doc.createElement("style");
  style.id = "vf-device-styles";
  style.textContent = DEVICE_CSS;
  doc.head.append(style);
}

export const DEVICE_CSS = `
/* 外框里的页面和软件不能被外框的样式影响：字体只给外框自己的字（标题栏、任务栏、状态栏、缩略图的标题），
   box-sizing 用 :where 不占优先级，项目和控件自己写的照样算数 */
.${NS} { position: relative; box-sizing: border-box; }
:where(.${NS}) *, :where(.${NS}) *::before, :where(.${NS}) *::after { box-sizing: border-box; }
.${NS}-titlebar, .${NS}-taskbar, .${NS}-peek-head, .${NS}-status, .${NS}-monogram { font-family: "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif; }
.${NS}-slot, .${NS}-screen-slot { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.${NS}-monogram { display: inline-flex; align-items: center; justify-content: center; border-radius: 22%; color: #fff; font-weight: 650; line-height: 1; flex: none; }

/* ---- 书 ---- */
.${NS}-book-desk { overflow: hidden; }
.${NS}-book { position: absolute; perspective: 2400px; transition: transform 0.42s cubic-bezier(0.3, 0.1, 0.2, 1); }
.${NS}-page { position: absolute; top: 0; background: #fff; }
.${NS}-page.left { box-shadow: -1px 0 0 rgba(0, 0, 0, 0.05), 0 18px 34px -12px rgba(30, 24, 16, 0.28), 0 3px 8px rgba(30, 24, 16, 0.12); }
.${NS}-page.right { box-shadow: 1px 0 0 rgba(0, 0, 0, 0.05), 0 18px 34px -12px rgba(30, 24, 16, 0.28), 0 3px 8px rgba(30, 24, 16, 0.12); }
.${NS}-book.closed.front .${NS}-page.right { border-radius: 0 3px 3px 0; box-shadow: inset 3px 0 4px -2px rgba(0, 0, 0, 0.25), 0 22px 40px -14px rgba(30, 24, 16, 0.36), 0 4px 10px rgba(30, 24, 16, 0.16); }
.${NS}-book.closed.back .${NS}-page.left { border-radius: 3px 0 0 3px; box-shadow: inset -3px 0 4px -2px rgba(0, 0, 0, 0.25), 0 22px 40px -14px rgba(30, 24, 16, 0.36), 0 4px 10px rgba(30, 24, 16, 0.16); }
.${NS}-clip { position: absolute; top: 0; overflow: hidden; }
.${NS}-gutter { position: absolute; top: 0; bottom: 0; width: 0; pointer-events: none; z-index: 3; }
.${NS}-gutter::before, .${NS}-gutter::after { content: ""; position: absolute; top: 0; bottom: 0; width: 46px; }
.${NS}-gutter::before { right: 0; background: linear-gradient(to left, rgba(40, 30, 20, 0.22), rgba(40, 30, 20, 0.07) 22%, rgba(40, 30, 20, 0) 100%); }
.${NS}-gutter::after { left: 0; background: linear-gradient(to right, rgba(40, 30, 20, 0.18), rgba(40, 30, 20, 0.06) 20%, rgba(40, 30, 20, 0) 100%); }
/* 纸的厚度：一层层错开一点的纸边 */
.${NS}-book-edge { position: absolute; top: calc(var(--i) * 0.6px); bottom: calc(var(--i) * -1.2px); background: #f6f3ec; border: 1px solid rgba(0, 0, 0, 0.07); pointer-events: none; }
.${NS}-book-edge.left { transform: translateX(calc(var(--i) * -1.2px)); border-right: 0; }
.${NS}-book-edge.right { transform: translateX(calc(var(--i) * 1.2px)); border-left: 0; }
/* 翻页：翻起来的那面纸绕书脊转半圈 */
.${NS}-leaf { position: absolute; top: 0; z-index: 6; transform-style: preserve-3d; pointer-events: none; }
.${NS}-leaf.forward { transform-origin: 0 50%; }
.${NS}-leaf.backward { transform-origin: 100% 50%; }
.${NS}-leaf-face { position: absolute; inset: 0; backface-visibility: hidden; overflow: hidden; background: #fff; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18); }
.${NS}-leaf-face.back { transform: rotateY(180deg); }
.${NS}-leaf-shade { position: absolute; inset: 0; background: linear-gradient(to right, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0)); opacity: 0; pointer-events: none; backface-visibility: hidden; }
.${NS}-turn-cover { position: absolute; top: 0; z-index: 5; overflow: hidden; pointer-events: none; }
.${NS}-snap { position: relative; overflow: hidden; }
.${NS}-snap > .${NS}-clip { top: 0; }

/* ---- 电脑 ---- */
.${NS}-desk { overflow: hidden; }
.${NS}-desktop { position: absolute; overflow: hidden; border-radius: 6px; box-shadow: 0 0 0 12px #1c1e23, 0 0 0 13px #3b3e46, 0 34px 60px -10px rgba(0, 0, 0, 0.42); }
.${NS}-wallpaper { position: absolute; inset: 0;
  background:
    radial-gradient(1200px 700px at 72% 112%, rgba(110, 72, 200, 0.55), transparent 62%),
    radial-gradient(900px 600px at 18% 104%, rgba(40, 120, 210, 0.55), transparent 60%),
    radial-gradient(1400px 900px at 50% -10%, #e9eef8, transparent 70%),
    linear-gradient(180deg, #dfe6f3 0%, #b9c8e6 55%, #8fa5d8 100%); }
.${NS}-window { position: absolute; display: flex; flex-direction: column; overflow: hidden; border-radius: 8px; background: #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08), 0 26px 64px rgba(10, 20, 40, 0.32), 0 6px 16px rgba(10, 20, 40, 0.16); transition: opacity 0.18s ease, transform 0.22s ease; }
.${NS}-window.maximized { border-radius: 0; }
.${NS}-window.minimized { opacity: 0; transform: translateY(380px) scale(0.2); pointer-events: none; }
.${NS}-titlebar { display: flex; flex: none; align-items: center; height: 32px; padding-left: 10px; background: #f3f3f3; color: #1b1b1b; font-size: 12px; user-select: none; }
.${NS}-title-icon { flex: none; border-radius: 3px; }
.${NS}-title { flex: 1; min-width: 0; margin-left: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${NS}-controls { display: flex; height: 100%; }
.${NS}-control { display: flex; align-items: center; justify-content: center; width: 46px; height: 100%; padding: 0; border: 0; background: transparent; color: #1b1b1b; cursor: default; }
.${NS}-control:hover { background: rgba(0, 0, 0, 0.06); }
.${NS}-control.close:hover { background: #c42b1c; color: #fff; }
.${NS}-glyph { display: flex; }
.${NS}-window-body { position: relative; flex: 1; overflow: hidden; background: #fff; }
.${NS}-taskbar { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; background: rgba(243, 243, 243, 0.86); backdrop-filter: blur(24px) saturate(1.4); border-top: 1px solid rgba(0, 0, 0, 0.08); }
.${NS}-tb-center { display: flex; align-items: center; gap: 4px; }
.${NS}-tb-btn { position: relative; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; padding: 0; border: 0; border-radius: 6px; background: transparent; cursor: default; }
.${NS}-tb-btn:hover { background: rgba(255, 255, 255, 0.7); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.04); }
.${NS}-tb-btn.app.running::after { content: ""; position: absolute; bottom: 2px; left: 50%; width: 6px; height: 3px; margin-left: -3px; border-radius: 2px; background: #8a8f98; transition: width 0.2s ease, margin 0.2s ease, background 0.2s ease; }
.${NS}-tb-btn.app.active { background: rgba(255, 255, 255, 0.62); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.04); }
.${NS}-tb-btn.app.active::after { width: 16px; margin-left: -8px; background: #1f6fd1; }
.${NS}-tb-icon, .${NS}-tray-icon, .${NS}-status-icon { display: flex; }
.${NS}-tb-app-icon { border-radius: 5px; }
.${NS}-tb-search { display: flex; align-items: center; gap: 8px; width: 210px; height: 32px; margin: 0 4px; padding: 0 12px; border-radius: 16px; background: rgba(255, 255, 255, 0.82); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.07); color: #5d5d5d; font-size: 13px; }
.${NS}-tb-search-icon { display: flex; color: #3c3c3c; }
.${NS}-tb-tray { position: absolute; right: 10px; top: 0; bottom: 0; display: flex; align-items: center; gap: 6px; color: #1b1b1b; }
.${NS}-tray-sys { display: flex; align-items: center; gap: 9px; height: 36px; padding: 0 10px; border-radius: 6px; }
.${NS}-tray-sys:hover { background: rgba(255, 255, 255, 0.7); }
.${NS}-tray-clock { display: flex; flex-direction: column; align-items: flex-end; justify-content: center; height: 40px; padding: 0 8px; font-size: 12px; line-height: 1.35; }
.${NS}-peek { position: absolute; bottom: 58px; z-index: 50; padding: 8px; border-radius: 8px; background: rgba(248, 248, 248, 0.94); backdrop-filter: blur(20px); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08), 0 14px 34px rgba(0, 0, 0, 0.22); cursor: default; animation: ${NS}-pop 0.16s ease-out; }
.${NS}-peek-head { display: flex; align-items: center; gap: 7px; margin: 0 2px 7px; font-size: 12px; color: #1b1b1b; }
.${NS}-peek-thumb { position: relative; overflow: hidden; border-radius: 4px; background: #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06); pointer-events: none; }
.${NS}-peek-thumb > * { position: absolute; }
@keyframes ${NS}-pop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* ---- 手机 ---- */
.${NS}-phone-desk { overflow: visible; }
.${NS}-phone { position: absolute; background: linear-gradient(145deg, #2a2a2e, #121214 38%, #0b0b0c); box-shadow: inset 0 0 0 1.5px #4a4a50, inset 0 0 0 3px #17171a, 0 30px 60px rgba(0, 0, 0, 0.32), 0 8px 18px rgba(0, 0, 0, 0.2); }
.${NS}-phone-key { position: absolute; background: #2c2c30; border-radius: 2px; }
.${NS}-phone-key.left-a { left: -3px; top: 132px; width: 3px; height: 30px; }
.${NS}-phone-key.left-b { left: -3px; top: 190px; width: 3px; height: 58px; }
.${NS}-phone-key.left-c { left: -3px; top: 258px; width: 3px; height: 58px; }
.${NS}-phone-key.right-a { right: -3px; top: 210px; width: 3px; height: 92px; }
.${NS}-phone-key.top-a { top: -3px; left: 132px; height: 3px; width: 30px; }
.${NS}-phone-key.top-b { top: -3px; left: 190px; height: 3px; width: 58px; }
.${NS}-phone-key.top-c { top: -3px; left: 258px; height: 3px; width: 58px; }
.${NS}-phone-screen { position: absolute; overflow: hidden; background: #fff; }
.${NS}-phone-viewport { position: absolute; overflow: hidden; }
.${NS}-phone-viewport.scroll { overflow-y: auto; scrollbar-width: none; }
.${NS}-phone-viewport.scroll::-webkit-scrollbar { display: none; }
.${NS}-phone-sizer { position: relative; }
.${NS}-status { position: absolute; left: 0; right: 0; top: 0; z-index: 4; display: flex; align-items: center; justify-content: space-between; padding: 0 30px 0 34px; color: #111; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; pointer-events: none; }
.${NS}-status-icons { display: flex; align-items: center; gap: 6px; }
.${NS}-island { position: absolute; top: 11px; left: 50%; z-index: 5; width: 122px; height: 35px; margin-left: -61px; border-radius: 18px; background: #050506; }
.${NS}-island.landscape { top: 50%; left: 11px; width: 35px; height: 122px; margin: -61px 0 0; }
.${NS}-punch { position: absolute; top: 12px; left: 50%; z-index: 5; width: 13px; height: 13px; margin-left: -6.5px; border-radius: 50%; background: #050506; box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.06); }
.${NS}-punch.landscape { top: 50%; left: 12px; margin: -6.5px 0 0; }
.${NS}-home-bar { position: absolute; bottom: 8px; left: 50%; z-index: 4; width: 134px; height: 5px; margin-left: -67px; border-radius: 3px; background: rgba(0, 0, 0, 0.82); pointer-events: none; }
.${NS}-phone.classic { background: linear-gradient(145deg, #f2f2f4, #d9dade); box-shadow: inset 0 0 0 1.5px #c2c3c8, 0 30px 60px rgba(0, 0, 0, 0.26), 0 8px 18px rgba(0, 0, 0, 0.16); }
.${NS}-phone.classic .${NS}-phone-key { background: #c9cad0; }
.${NS}-classic-speaker { position: absolute; top: 40px; left: 50%; width: 56px; height: 6px; margin-left: -28px; border-radius: 3px; background: #2b2b2f; }
.${NS}-classic-camera { position: absolute; top: 38px; left: 50%; width: 10px; height: 10px; margin-left: -62px; border-radius: 50%; background: #2b2b2f; }
.${NS}-classic-home { position: absolute; bottom: 14px; left: 50%; width: 56px; height: 56px; margin-left: -28px; border-radius: 50%; box-shadow: inset 0 0 0 2px #b7b8be; background: linear-gradient(145deg, #eceef1, #dcdde2); }
/* 老式手机横放：宽边框在左右，听筒、摄像头在左边，Home 键在右边 */
.${NS}-phone.classic.landscape .${NS}-classic-speaker { top: 50%; left: 40px; width: 6px; height: 56px; margin: -28px 0 0; }
.${NS}-phone.classic.landscape .${NS}-classic-camera { top: 50%; left: 38px; margin: -62px 0 0; }
.${NS}-phone.classic.landscape .${NS}-classic-home { top: 50%; bottom: auto; left: auto; right: 14px; margin: -28px 0 0; }
`;
